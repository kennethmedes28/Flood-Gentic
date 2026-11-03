"""Numbers for the dashboard, read from the recorded daily weather in Supabase.

The tables are ``ncr_locations``, ``ncr_weather_daily`` and ``ncr_flood_features_daily``. The "Update datasets" GitHub
workflow keeps them current every night and replaces the last 7 days with Open-Meteo's revised values. There is no
fallback to files: if the database cannot be read, the error is raised and the API answers 503.

    * ``ncr_weather_daily``         - temperature, rain, wind and river flow per day
    * ``ncr_flood_features_daily``  - rain over 1 hour / 3 days and how high the river is for its history

"Today" on the dashboard is therefore the LAST RECORDED DAY (``data_date``), which can be some days behind.
The response always says which day it is, so the page can show it.

The risk level uses the same thresholds as ``agents.flood_risk_agent`` (low, watch, high, critical), applied to
that last recorded day. There is no forecast in these tables, so it describes what already happened.

Rows are matched to cities by the city name in ``ncr_locations``, not with the order of ``NCR_LOCATIONS``.

Example:
    data = build_dashboard(["manila", "marikina"], get_connection)
    data["cities"][0]["risk_level"]   # "low", "watch", "high" or "critical"
"""

import time
from datetime import date

from agents.fetch_supabase_open_meteo_datasets import NCR_LOCATIONS
from agents.flood_risk_agent import (
    DAILY_RAIN_CRITICAL_MM,
    DAILY_RAIN_HIGH_MM,
    DAILY_RAIN_WATCH_MM,
    HOURLY_RAIN_CRITICAL_MM,
    HOURLY_RAIN_HIGH_MM,
    HOURLY_RAIN_WATCH_MM,
    RIVER_PERCENTILE,
    SATURATION_PERCENTILE,
    higher_of,
    percentile_value,
    raise_level,
)
from agents.flood_types import RISK_CRITICAL, RISK_HIGH, RISK_LOW, RISK_WATCH

DB_CACHE_SECONDS = 5 * 60  # the tables change at most once a day, so reading them again every 5 minutes is plenty
RECORDS_SQL = """
    SELECT l.city, w.date::text AS date,
           w.precipitation_sum_mm, w.temperature_2m_max_c, w.temperature_2m_min_c,
           w.wind_speed_10m_max_kmh, w.wind_gusts_10m_max_kmh, w.river_discharge_m3s,
           f.rain_max_1h_mm, f.rain_3d_mm, f.discharge_pctile
    FROM ncr_weather_daily w
    JOIN ncr_locations l ON l.location_id = w.location_id
    LEFT JOIN ncr_flood_features_daily f ON f.location_id = w.location_id AND f.date = w.date
"""
RECENT_DAYS = 14  # days of history sent for the charts
MAX_CITIES = 20


def city_key(name: str) -> str:
    """The key used by ``NCR_LOCATIONS`` for a name written in the dataset ("Las Piñas", "Pateros (municipality)")."""
    plain = name.split("(")[0].strip().lower().replace("ñ", "n")
    return plain


def number(value) -> float | None:
    """A database value as a number, or None when it is empty."""
    return float(value) if value not in (None, "") else None


def day_from_row(row: dict) -> dict:
    """One recorded day, in the shape the rest of this module uses, from a row of ``RECORDS_SQL``."""
    return {
        "date": str(row["date"]),
        "rain_mm": number(row["precipitation_sum_mm"]),
        "high_c": number(row["temperature_2m_max_c"]),
        "low_c": number(row["temperature_2m_min_c"]),
        "wind_kmh": number(row["wind_speed_10m_max_kmh"]),
        "gust_kmh": number(row["wind_gusts_10m_max_kmh"]),
        "river_flow_m3s": number(row["river_discharge_m3s"]),
        "rain_max_1h_mm": number(row["rain_max_1h_mm"]),
        "rain_3d_mm": number(row["rain_3d_mm"]),
        "discharge_percentile": number(row["discharge_pctile"]),
    }


def group_by_city(rows: list[tuple[str, dict]]) -> dict[str, dict]:
    """Per city key: ``{"days": [...oldest first...], "rain_3d_sorted": [...], "flow_sorted": [...]}``.

    ``rows`` is a list of (city key, day) pairs.
    """
    records: dict[str, dict] = {}
    for key, day in rows:
        records.setdefault(key, {"days": [], "rain_3d_sorted": [], "flow_sorted": []})["days"].append(day)

    for record in records.values():
        record["days"].sort(key=lambda day: day["date"])
        record["rain_3d_sorted"] = sorted(day["rain_3d_mm"] for day in record["days"] if day["rain_3d_mm"] is not None)
        record["flow_sorted"] = sorted(day["river_flow_m3s"] for day in record["days"] if day["river_flow_m3s"] is not None)
    return records


_db_cache: dict = {"at": 0.0, "records": None}


def load_records_from_db(get_connection) -> dict[str, dict]:
    """Per city key, the recorded days read from Supabase, kept in this process for ``DB_CACHE_SECONDS``. Raises when the read fails."""
    cached = _db_cache["records"]
    if cached is not None and time.monotonic() - _db_cache["at"] < DB_CACHE_SECONDS:
        return cached

    result = get_connection().execute(RECORDS_SQL).fetchall()
    rows = [(city_key(row["city"]), day_from_row(row)) for row in result]
    if not rows:
        raise RuntimeError("The weather tables in Supabase are empty.")
    records = group_by_city(rows)
    _db_cache.update(at=time.monotonic(), records=records)
    return records


def get_records(get_connection) -> dict[str, dict]:
    """The recorded days per city key, read from Supabase (kept for ``DB_CACHE_SECONDS``). Raises when that fails."""
    return load_records_from_db(get_connection)


# The English sentence of each reason code. The code and its number are also sent to the app (``risk_reason_codes``), which
# writes the sentence in the language the person chose; the English text stays for clients that only show text.
REASON_TEXT = {
    "peak_rain": "Peak rain was {value:.1f} mm in one hour.",
    "day_rain": "{value:.0f} mm of rain fell in the day.",
    "soaked_ground": "The ground is soaked ({value:.0f} mm in the last 3 days).",
    "high_river": "River flow of {value:.1f} m3/s is high for this area.",
    "calm": "No heavy rain, soaked ground or high river flow on this day.",
}


def reason_text(code: str, value: float | None) -> str:
    """The English sentence for a reason code and its number."""
    return REASON_TEXT[code].format(value=value if value is not None else 0)


def risk_from_day(day: dict, rain_3d_sorted: list[float]) -> tuple[str, list[tuple[str, float | None]]]:
    """The risk level and the reasons for one recorded day, using the thresholds of the chat assistant's rules.

    Each reason is a ``(code, number)`` pair; ``reason_text`` turns it into the English sentence.
    """
    level, reasons = RISK_LOW, []

    peak = day["rain_max_1h_mm"]
    for limit, found in ((HOURLY_RAIN_CRITICAL_MM, RISK_CRITICAL), (HOURLY_RAIN_HIGH_MM, RISK_HIGH), (HOURLY_RAIN_WATCH_MM, RISK_WATCH)):
        if peak is not None and peak >= limit:
            level = higher_of(level, found)
            reasons.append(("peak_rain", peak))
            break

    total = day["rain_mm"]
    for limit, found in ((DAILY_RAIN_CRITICAL_MM, RISK_CRITICAL), (DAILY_RAIN_HIGH_MM, RISK_HIGH), (DAILY_RAIN_WATCH_MM, RISK_WATCH)):
        if total is not None and total >= limit:
            level = higher_of(level, found)
            reasons.append(("day_rain", total))
            break

    soaked_from = percentile_value(rain_3d_sorted, SATURATION_PERCENTILE)
    if day["rain_3d_mm"] is not None and soaked_from is not None and day["rain_3d_mm"] >= soaked_from:
        reasons.append(("soaked_ground", day["rain_3d_mm"]))
        level = raise_level(level) if level != RISK_LOW else RISK_WATCH

    if day["discharge_percentile"] is not None and day["discharge_percentile"] >= RIVER_PERCENTILE:
        reasons.append(("high_river", day["river_flow_m3s"]))
        level = higher_of(level, RISK_HIGH)

    if not reasons:
        reasons.append(("calm", None))
    return level, reasons


def build_city(key: str, record: dict | None) -> dict:
    """What the dashboard shows for one city. With no records the numbers are empty and ``missing`` says so."""
    lat, lng = NCR_LOCATIONS[key]
    entry = {
        "city": key, "lat": lat, "lng": lng, "data_date": None,
        "high_c": None, "low_c": None, "rain_mm": None, "wind_kmh": None, "gust_kmh": None,
        "river_flow_m3s": None, "river_percentile": None, "river_high_flow_m3s": None, "risk_level": None, "risk_reasons": [], "risk_reason_codes": [], "missing": [], "recent": [],
    }
    if not record or not record["days"]:
        entry["missing"].append("recorded weather for this city")
        return entry

    latest = record["days"][-1]
    for field in ("high_c", "low_c", "rain_mm", "wind_kmh", "gust_kmh", "river_flow_m3s"):
        entry[field] = latest[field]
    entry["data_date"] = latest["date"]
    # How high the river is for this city: its place among all days since 2020, and the flow where "high" starts.
    entry["river_percentile"] = latest["discharge_percentile"]
    entry["river_high_flow_m3s"] = percentile_value(record["flow_sorted"], RIVER_PERCENTILE)
    entry["risk_level"], reasons = risk_from_day(latest, record["rain_3d_sorted"])
    entry["risk_reasons"] = [reason_text(code, value) for code, value in reasons]
    entry["risk_reason_codes"] = [{"code": code, "value": value} for code, value in reasons]
    entry["recent"] = [
        {name: day[name] for name in ("date", "rain_mm", "high_c", "low_c", "river_flow_m3s")}
        for day in record["days"][-RECENT_DAYS:]
    ]
    return entry


def build_dashboard(cities: list[str], get_connection) -> dict:
    """The dashboard data for the given city keys (keys of ``NCR_LOCATIONS``), from the recorded days in Supabase."""
    records = get_records(get_connection)

    entries = [build_city(key, records.get(key)) for key in cities]
    dates = [entry["data_date"] for entry in entries if entry["data_date"]]
    return {
        "data_date": date.fromisoformat(max(dates)) if dates else None,
        "cities": entries,
    }
