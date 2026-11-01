"""Weather forecast from Tomorrow.io, fetched at most once per city per day and kept in Supabase.

How it works:

    1. ``refresh_if_needed`` asks the database which cities already have a forecast for today (Manila day).
    2. Only the missing cities are fetched from Tomorrow.io, one request each, and stored with
       ``INSERT ... ON CONFLICT DO NOTHING``. A stored forecast is never replaced and never fetched again that day.
    3. Everything else (the API, the live stream) reads the stored rows. The forecast has an entry for every hour
       of the next 5 days, so "the weather right now" is just the stored entry for the current hour. No further
       Tomorrow.io request is needed to keep it live.

Only the first request of a day does any fetching. Tomorrow.io's free plan allows 25 requests per hour and
500 per day, and one refresh uses one request per city (see ``DASHBOARD_CITIES``: 17 requests on the first request of a day).
If a fetch fails (wrong key, limit reached, service down) nothing is stored, and the same city is not tried again
for ``RETRY_AFTER_FAILURE_SECONDS``, so a broken key cannot turn into a request on every page load.

The key is read from ``TOMMORROW_IO_API`` in backend/.env (``TOMORROW_IO_API`` and the older ``TOMMORROW-IO_API`` also work).

Example:
    result = refresh_if_needed(get_connection)       # fetches only what is missing
    forecasts = latest_forecasts(get_connection())   # [{"city": ..., "hourly": [...], "daily": [...]}, ...]
    now = conditions_at(forecasts[0]["hourly"])      # the entry for the current hour
"""

import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

import httpx

from agents.fetch_supabase_open_meteo_datasets import NCR_LOCATIONS
from src.rag.models import PHILIPPINE_TZ

logger = logging.getLogger(__name__)

FORECAST_URL = "https://api.tomorrow.io/v4/weather/forecast"
API_KEY_NAMES = ("TOMMORROW_IO_API", "TOMORROW_IO_API", "TOMMORROW-IO_API")  # the first is the spelling used in backend/.env
REQUEST_TIMEOUT_SECONDS = 20.0
PAUSE_BETWEEN_REQUESTS_SECONDS = 0.5  # the free plan allows 3 requests per second
RETRY_AFTER_FAILURE_SECONDS = 30 * 60

# The cities the dashboard shows: all 17 of Metro Manila, so one refresh is 17 requests a day.
DASHBOARD_CITIES = tuple(NCR_LOCATIONS)

# Only what the app shows is kept, which keeps each stored row small.
HOURLY_FIELDS = (
    "temperature", "temperatureApparent", "humidity", "precipitationProbability", "rainIntensity",
    "rainAccumulation", "windSpeed", "windGust", "weatherCode", "cloudCover", "uvIndex", "visibility",
)
DAILY_FIELDS = (
    "temperatureMax", "temperatureMin", "temperatureAvg", "precipitationProbabilityMax", "rainAccumulationSum",
    "rainIntensityMax", "windSpeedMax", "windGustMax", "humidityAvg", "weatherCodeMax", "uvIndexMax",
)

_refresh_lock = threading.Lock()  # one refresh at a time inside this server
_failed_at: dict[str, float] = {}  # city -> when its last fetch failed (monotonic seconds)


@dataclass
class RefreshResult:
    """What a call to ``refresh_if_needed`` did, by city key."""

    already_stored: list[str] = field(default_factory=list)
    fetched: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)  # could not be fetched (or is waiting after a failure)


def today_in_manila(now: datetime | None = None) -> date:
    """The calendar day in Manila, which is what "once per day" is counted in."""
    return (now or datetime.now(PHILIPPINE_TZ)).astimezone(PHILIPPINE_TZ).date()


def read_api_key() -> str | None:
    """The Tomorrow.io key from the environment, or None when it is not set."""
    for name in API_KEY_NAMES:
        value = os.getenv(name)
        if value:
            return value.strip()
    return None


def keep_fields(entries: list[dict], fields: tuple[str, ...]) -> list[dict]:
    """Shorten each timeline entry to its time and the wanted values."""
    return [{"time": entry["time"], "values": {name: entry["values"].get(name) for name in fields}} for entry in entries]


def download_forecast(client: httpx.Client, api_key: str, lat: float, lng: float) -> dict:
    """One Tomorrow.io request: ``{"hourly": [...], "daily": [...]}``. Raises on any problem."""
    response = client.get(
        FORECAST_URL,
        params={"location": f"{lat},{lng}", "timesteps": "1h,1d", "units": "metric", "apikey": api_key},
    )
    response.raise_for_status()
    timelines = response.json()["timelines"]
    return {
        "hourly": keep_fields(timelines["hourly"], HOURLY_FIELDS),
        "daily": keep_fields(timelines["daily"], DAILY_FIELDS),
    }


# ---------------------------------------------------------------- database


def cities_stored_on(conn, day: date) -> set[str]:
    """The cities that already have a forecast for this day."""
    rows = conn.execute("SELECT city FROM tomorrow_forecast WHERE fetched_on = %s", [day]).fetchall()
    return {row["city"] for row in rows}


def save_forecast(conn, city: str, day: date, forecast: dict) -> bool:
    """Store a forecast unless the city already has one for the day. True when a row was written.

    An existing row is never replaced: the primary key (city, day) makes the insert do nothing.
    """
    cursor = conn.execute(
        "INSERT INTO tomorrow_forecast (city, fetched_on, hourly, daily) VALUES (%s, %s, %s::jsonb, %s::jsonb) "
        "ON CONFLICT (city, fetched_on) DO NOTHING",
        [city, day, json.dumps(forecast["hourly"]), json.dumps(forecast["daily"])],
    )
    return cursor.rowcount == 1


def latest_forecasts(conn, cities: tuple[str, ...] = DASHBOARD_CITIES) -> list[dict]:
    """The newest stored forecast of each city, in the order of ``cities``. Cities with none are left out."""
    rows = conn.execute(
        "SELECT DISTINCT ON (city) city, fetched_on, fetched_at, hourly, daily "
        "FROM tomorrow_forecast WHERE city = ANY(%s) ORDER BY city, fetched_on DESC",
        [list(cities)],
    ).fetchall()
    by_city = {row["city"]: row for row in rows}
    return [by_city[city] for city in cities if city in by_city]


# ---------------------------------------------------------------- refreshing


def city_position(city: str) -> tuple[float, float]:
    """Latitude and longitude of a city key."""
    return NCR_LOCATIONS[city]


def recently_failed(city: str) -> bool:
    failed_at = _failed_at.get(city)
    return failed_at is not None and time.monotonic() - failed_at < RETRY_AFTER_FAILURE_SECONDS


def refresh_if_needed(get_connection, cities: tuple[str, ...] = DASHBOARD_CITIES, now: datetime | None = None) -> RefreshResult:
    """Make sure each city has today's forecast stored, fetching only the ones that are missing.

    Safe to call as often as you like: when everything is stored it makes one small database query and no request.
    """
    day = today_in_manila(now)
    result = RefreshResult()

    # Quick check without the lock: the usual case is that everything is already stored.
    stored = cities_stored_on(get_connection(), day)
    missing = [city for city in cities if city not in stored]
    result.already_stored = [city for city in cities if city not in missing]
    if not missing:
        return result

    with _refresh_lock:
        # Look again inside the lock: another request may have just stored them.
        stored = cities_stored_on(get_connection(), day)
        missing = [city for city in missing if city not in stored]
        result.already_stored = [city for city in cities if city not in missing]
        if not missing:
            return result

        api_key = read_api_key()
        if api_key is None:
            logger.warning("Tomorrow.io key is not set (%s); no forecast was fetched.", API_KEY_NAMES[0])
            result.failed = missing
            return result

        with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            for index, city in enumerate(missing):
                if recently_failed(city):
                    result.failed.append(city)
                    continue
                if index:
                    time.sleep(PAUSE_BETWEEN_REQUESTS_SECONDS)
                try:
                    forecast = download_forecast(client, api_key, *city_position(city))
                    save_forecast(get_connection(), city, day, forecast)
                    result.fetched.append(city)
                except httpx.HTTPStatusError as error:
                    # The key is left out of the log: the address of the failed request contains it.
                    logger.warning("Tomorrow.io answered %s for %s.", error.response.status_code, city)
                    _failed_at[city] = time.monotonic()
                    result.failed.append(city)
                    if error.response.status_code == 429:
                        result.failed += [other for other in missing[index + 1:] if other not in result.failed]
                        break  # the limit is reached: do not send the rest
                except Exception as error:
                    logger.warning("Tomorrow.io fetch failed for %s: %s", city, type(error).__name__)
                    _failed_at[city] = time.monotonic()
                    result.failed.append(city)
    return result


# ---------------------------------------------------------------- reading the stored forecast


def parse_time(text: str) -> datetime:
    """Tomorrow.io times look like "2026-11-01T08:00:00Z"."""
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def conditions_at(hourly: list[dict], now: datetime | None = None) -> dict | None:
    """The stored entry for the hour that contains ``now``: ``{"time": ..., "values": {...}}``.

    Returns None when the stored forecast does not cover this moment (for example it is more than 5 days old).
    """
    moment = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    current = None
    for entry in hourly:
        if parse_time(entry["time"]) <= moment:
            current = entry
        else:
            break
    if current is None:
        return None
    if (moment - parse_time(current["time"])).total_seconds() >= 3600:
        return None  # the forecast has run out
    return current
