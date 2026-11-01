"""GET /weather/forecast and GET /weather/stream: the Tomorrow.io forecast, stored in Supabase once a day.

Neither endpoint lets the browser reach Tomorrow.io (the key stays on the server). The first request of the day
fetches what is missing and stores it (see ``src/services/tomorrow_forecast.py``); every later request just reads
the stored rows, so these endpoints can be called as often as the rate limit allows without using Tomorrow.io's quota.

The stream sends server-sent events:

    event: snapshot   the whole stored forecast of each city (once at the start, and again when a new day starts)
    event: tick       every minute: only the entry for the current hour of each city, so the page stays "live"
    event: end        the stream is closing (after ``MAX_STREAM_SECONDS``); the browser reconnects by itself
    event: problem    the forecast could not be read
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

from agents.location_agent import find_city
from src.api.deps import DATABASE_UNAVAILABLE, get_db, limit_requests
from src.api.schemas import CityForecastOut, ForecastOut
from src.services.tomorrow_forecast import DASHBOARD_CITIES, conditions_at, latest_forecasts, refresh_if_needed, today_in_manila

logger = logging.getLogger(__name__)

router = APIRouter(tags=["weather"], dependencies=[Depends(limit_requests("weather"))])

TICK_SECONDS = 60
MAX_STREAM_SECONDS = 10 * 60  # then the browser reconnects and gets a fresh snapshot
STREAM_HOURS = 24  # the snapshot carries this many hours per city; the stored forecast has 120
PROBLEM_RETRY_SECONDS = 30  # after a problem the browser waits this long before it reconnects
MAX_OPEN_STREAMS = 100  # each one holds a connection open
UNKNOWN_FORECAST_CITY = "Unknown city. Forecasts are kept for the cities of Metro Manila (NCR), for example Manila, Quezon City or Marikina."

open_streams = 0


def parse_cities(text: str | None) -> tuple[str, ...]:
    """The city keys asked for (comma separated), in order. Leaving it out means all the dashboard cities."""
    if not text:
        return DASHBOARD_CITIES
    keys: list[str] = []
    for name in text.split(","):
        if not name.strip():
            continue
        key = find_city(name)
        if key not in DASHBOARD_CITIES:
            raise HTTPException(status_code=422, detail=UNKNOWN_FORECAST_CITY)
        if key not in keys:
            keys.append(key)
    if not keys:
        raise HTTPException(status_code=422, detail=UNKNOWN_FORECAST_CITY)
    return tuple(keys)


def load_forecasts(get_connection, cities: tuple[str, ...]) -> list[dict]:
    """Fetch what is missing for today (at most once a day), then read what is stored."""
    refresh_if_needed(get_connection, cities)
    return latest_forecasts(get_connection(), cities)


def to_city_forecast(row: dict, now: datetime | None = None, max_hours: int | None = None) -> CityForecastOut:
    """A stored row as the API's answer, with the entry for the current hour.

    ``max_hours`` keeps only the current hour and the ones after it, up to that many (the stream uses this to keep its
    first message small with 17 cities).
    """
    hourly = row["hourly"]
    if max_hours is not None:
        current = conditions_at(hourly, now)
        start = hourly.index(current) if current in hourly else 0
        hourly = hourly[start : start + max_hours]
    return CityForecastOut(
        city=row["city"],
        fetched_on=row["fetched_on"],
        fetched_at=row["fetched_at"],
        now=conditions_at(row["hourly"], now),
        hourly=hourly,
        daily=row["daily"],
    )


def server_event(name: str, data: dict, retry_after_seconds: int | None = None) -> str:
    """One server-sent event. ``retry_after_seconds`` tells the browser how long to wait before it reconnects."""
    retry = f"retry: {retry_after_seconds * 1000}\n" if retry_after_seconds else ""
    return f"{retry}event: {name}\ndata: {json.dumps(jsonable_encoder(data))}\n\n"


@router.get("/weather/forecast", response_model=ForecastOut)
def forecast(
    cities: str | None = Query(default=None, max_length=300, description="Dashboard cities, separated by commas."),
    get_connection=Depends(get_db),
) -> ForecastOut:
    """The stored forecast (hourly for 5 days, daily for 6) of each city, with the entry for the current hour."""
    keys = parse_cities(cities)
    try:
        rows = load_forecasts(get_connection, keys)
    except Exception:
        logger.exception("Forecast could not be read")
        raise HTTPException(status_code=503, detail=DATABASE_UNAVAILABLE)
    return ForecastOut(cities=[to_city_forecast(row) for row in rows])


@router.get("/weather/stream")
async def stream(
    request: Request,
    cities: str | None = Query(default=None, max_length=300, description="Dashboard cities, separated by commas."),
    get_connection=Depends(get_db),
) -> StreamingResponse:
    """Live weather as server-sent events (see the top of this file for the events)."""
    global open_streams
    keys = parse_cities(cities)
    if open_streams >= MAX_OPEN_STREAMS:
        raise HTTPException(status_code=503, detail="Too many people are watching the live weather. Please try again in a moment.")

    async def events():
        global open_streams
        open_streams += 1
        try:
            started = time.monotonic()
            snapshot_day = None
            rows: list[dict] = []
            while time.monotonic() - started < MAX_STREAM_SECONDS:
                if await request.is_disconnected():
                    return
                now = datetime.now(timezone.utc)
                if snapshot_day != today_in_manila(now):
                    # The first loop, and the first loop after midnight in Manila: read (and if needed fetch) the forecast.
                    try:
                        rows = await run_in_threadpool(load_forecasts, get_connection, keys)
                    except Exception:
                        logger.exception("Forecast could not be read")
                        yield server_event("problem", {"message": DATABASE_UNAVAILABLE}, retry_after_seconds=PROBLEM_RETRY_SECONDS)
                        return
                    snapshot_day = today_in_manila(now)
                    yield server_event("snapshot", ForecastOut(cities=[to_city_forecast(row, now, STREAM_HOURS) for row in rows]).model_dump())
                else:
                    ticks = [{"city": row["city"], "now": conditions_at(row["hourly"], now)} for row in rows]
                    yield server_event("tick", {"at": now.isoformat(), "cities": ticks})
                await asyncio.sleep(TICK_SECONDS)
            yield server_event("end", {})
        finally:
            open_streams -= 1

    # no-transform and X-Accel-Buffering stop proxies from holding the events back.
    return StreamingResponse(
        events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}
    )
