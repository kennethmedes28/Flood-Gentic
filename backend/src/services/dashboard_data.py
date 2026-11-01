"""Numbers for the dashboard, read from the project's recorded daily datasets.

For now the dashboard does not call any weather service. It reads two files in ``datasets/``:

    * ``ncr_weather_daily_2020-2026.csv``  - temperature, rain, wind and river flow per day
    * ``ncr_flood_features_daily.csv``     - rain over 1 hour / 3 days and how high the river is for its history

"Today" on the dashboard is therefore the LAST RECORDED DAY (``data_date``), which can be some days behind.
The response always says which day it is, so the page can show it.

The risk level uses the same thresholds as ``agents.flood_risk_agent`` (low, watch, high, critical), applied to
that last recorded day. There is no forecast in these files, so it describes what already happened.

Rows are matched to cities with ``ncr_locations.csv`` (its ``location_id`` order is alphabetical), not with
the order of ``NCR_LOCATIONS``.

Example:
    data = build_dashboard(["manila", "marikina"])
    data["cities"][0]["risk_level"]   # "low", "watch", "high" or "critical"
"""

import csv
import os
from datetime import date
from functools import lru_cache
from pathlib import Path

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

DEFAULT_DATASETS = Path(__file__).resolve().parents[3] / "datasets"
WEATHER_FILE = "ncr_weather_daily_2020-2026.csv"
FEATURES_FILE = "ncr_flood_features_daily.csv"
LOCATIONS_FILE = "ncr_locations.csv"
RECENT_DAYS = 14  # days of history sent for the charts
MAX_CITIES = 20


def city_key(name: str) -> str:
    """The key used by ``NCR_LOCATIONS`` for a name written in the dataset ("Las Piñas", "Pateros (municipality)")."""
    plain = name.split("(")[0].strip().lower().replace("ñ", "n")
    return plain


def number(text: str | None) -> float | None:
    """A CSV cell as a number, or None when it is empty."""
    return float(text) if text not in (None, "") else None


def read_rows(path: Path) -> list[dict]:
    """All rows of a CSV file (a leading byte-order mark is ignored)."""
    with open(path, newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


@lru_cache(maxsize=4)
def load_records(folder: str, version: tuple) -> dict[str, dict]:
    """Per city key: ``{"days": [...oldest first...], "rain_3d_sorted": [...]}``.

    ``version`` is the files' modification times: when a file is replaced by the data loader, the next call
    reads it again instead of serving old numbers.
    """
    base = Path(folder)
    keys = {row["location_id"]: city_key(row["city"]) for row in read_rows(base / LOCATIONS_FILE)}
    features = {(row["location_id"], row["date"]): row for row in read_rows(base / FEATURES_FILE)}

    records: dict[str, dict] = {}
    for row in read_rows(base / WEATHER_FILE):
        key = keys.get(row["location_id"])
        if key is None:
            continue
        extra = features.get((row["location_id"], row["date"]), {})
        records.setdefault(key, {"days": [], "rain_3d_sorted": [], "flow_sorted": []})["days"].append(
            {
                "date": row["date"],
                "rain_mm": number(row["precipitation_sum_mm"]),
                "high_c": number(row["temperature_2m_max_c"]),
                "low_c": number(row["temperature_2m_min_c"]),
                "wind_kmh": number(row["wind_speed_10m_max_kmh"]),
                "gust_kmh": number(row["wind_gusts_10m_max_kmh"]),
                "river_flow_m3s": number(row["river_discharge_m3s"]),
                "rain_max_1h_mm": number(extra.get("rain_max_1h_mm")),
                "rain_3d_mm": number(extra.get("rain_3d_mm")),
                "discharge_percentile": number(extra.get("discharge_pctile")),
            }
        )

    for record in records.values():
        record["days"].sort(key=lambda day: day["date"])
        record["rain_3d_sorted"] = sorted(day["rain_3d_mm"] for day in record["days"] if day["rain_3d_mm"] is not None)
        record["flow_sorted"] = sorted(day["river_flow_m3s"] for day in record["days"] if day["river_flow_m3s"] is not None)
    return records


def risk_from_day(day: dict, rain_3d_sorted: list[float]) -> tuple[str, list[str]]:
    """The risk level and the reasons for one recorded day, using the thresholds of the chat assistant's rules."""
    level, reasons = RISK_LOW, []

    peak = day["rain_max_1h_mm"]
    for limit, found in ((HOURLY_RAIN_CRITICAL_MM, RISK_CRITICAL), (HOURLY_RAIN_HIGH_MM, RISK_HIGH), (HOURLY_RAIN_WATCH_MM, RISK_WATCH)):
        if peak is not None and peak >= limit:
            level = higher_of(level, found)
            reasons.append(f"Peak rain was {peak:.1f} mm in one hour.")
            break

    total = day["rain_mm"]
    for limit, found in ((DAILY_RAIN_CRITICAL_MM, RISK_CRITICAL), (DAILY_RAIN_HIGH_MM, RISK_HIGH), (DAILY_RAIN_WATCH_MM, RISK_WATCH)):
        if total is not None and total >= limit:
            level = higher_of(level, found)
            reasons.append(f"{total:.0f} mm of rain fell in the day.")
            break

    soaked_from = percentile_value(rain_3d_sorted, SATURATION_PERCENTILE)
    if day["rain_3d_mm"] is not None and soaked_from is not None and day["rain_3d_mm"] >= soaked_from:
        reasons.append(f"The ground is soaked ({day['rain_3d_mm']:.0f} mm in the last 3 days).")
        level = raise_level(level) if level != RISK_LOW else RISK_WATCH

    if day["discharge_percentile"] is not None and day["discharge_percentile"] >= RIVER_PERCENTILE:
        reasons.append(f"River flow of {day['river_flow_m3s']:.1f} m3/s is high for this area.")
        level = higher_of(level, RISK_HIGH)

    if not reasons:
        reasons.append("No heavy rain, soaked ground or high river flow on this day.")
    return level, reasons


def build_city(key: str, record: dict | None) -> dict:
    """What the dashboard shows for one city. With no records the numbers are empty and ``missing`` says so."""
    lat, lng = NCR_LOCATIONS[key]
    entry = {
        "city": key, "lat": lat, "lng": lng, "data_date": None,
        "high_c": None, "low_c": None, "rain_mm": None, "wind_kmh": None, "gust_kmh": None,
        "river_flow_m3s": None, "river_percentile": None, "river_high_flow_m3s": None, "risk_level": None, "risk_reasons": [], "missing": [], "recent": [],
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
    entry["risk_level"], entry["risk_reasons"] = risk_from_day(latest, record["rain_3d_sorted"])
    entry["recent"] = [
        {name: day[name] for name in ("date", "rain_mm", "high_c", "low_c", "river_flow_m3s")}
        for day in record["days"][-RECENT_DAYS:]
    ]
    return entry


def build_dashboard(cities: list[str], datasets_dir: str | Path | None = None) -> dict:
    """The dashboard data for the given city keys (keys of ``NCR_LOCATIONS``), from the recorded datasets.

    The folder defaults to ``datasets/`` in the repository, or the ``DATASETS_DIR`` environment variable.
    """
    folder = Path(datasets_dir or os.getenv("DATASETS_DIR") or DEFAULT_DATASETS)
    version = tuple((folder / name).stat().st_mtime_ns for name in (WEATHER_FILE, FEATURES_FILE, LOCATIONS_FILE))
    records = load_records(str(folder), version)

    entries = [build_city(key, records.get(key)) for key in cities]
    dates = [entry["data_date"] for entry in entries if entry["data_date"]]
    return {
        "data_date": date.fromisoformat(max(dates)) if dates else None,
        "cities": entries,
    }
