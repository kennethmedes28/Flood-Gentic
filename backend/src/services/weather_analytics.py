"""Long-run weather statistics for the "Macro Weather Analytics" page, from the recorded daily dataset.

The data is ``datasets/ncr_weather_daily_2020-2026.csv`` (one row per city per day). This module groups it by
year, month or day so the page can drill down: all years, then the months of one year, then the days of one month.

Filters (all optional):

    city    one city key from ``NCR_LOCATIONS`` ("manila"), or ``None`` for all of Metro Manila.
            For all of Metro Manila the cities are combined day by day: rain, temperature and river flow are the
            AVERAGE of the cities; wind and gusts are the HIGHEST of the cities.
    year    keep one year. Gives one point per month.
    month   keep one month (needs ``year``). Gives one point per day.
    day     look at one day (needs ``year`` and ``month``). Adds ``day_detail`` to the answer.

With no year the answer has one point per year.

Example:
    data = build_analytics(city="manila", year=2024)
    data["level"]            # "month"
    data["points"][6]        # the numbers for July 2024
"""

import calendar
import os
from datetime import date
from pathlib import Path

from agents.fetch_supabase_open_meteo_datasets import NCR_LOCATIONS
from agents.flood_risk_agent import DAILY_RAIN_WATCH_MM
from src.services.dashboard_data import DEFAULT_DATASETS, FEATURES_FILE, LOCATIONS_FILE, WEATHER_FILE, load_records

RAIN_DAY_MM = 1.0  # a day with at least this much rain counts as a "rain day"
HOT_DAY_C = 35.0  # a day with a high of at least this counts as a "hot day"
TOP_DAYS = 5  # how many of the rainiest days are listed

LEVEL_YEAR = "year"
LEVEL_MONTH = "month"
LEVEL_DAY = "day"


class InvalidFilter(ValueError):
    """The year/month/day combination makes no sense (for example a day without a month)."""


# --- small helpers ------------------------------------------------------------------------------


def present(values: list) -> list[float]:
    """The values that are not missing."""
    return [value for value in values if value is not None]


def average(values: list) -> float | None:
    """The mean of the values that are present, rounded to 2 decimals, or None when there are none."""
    found = present(values)
    return round(sum(found) / len(found), 2) if found else None


def highest(values: list) -> float | None:
    found = present(values)
    return max(found) if found else None


def lowest(values: list) -> float | None:
    found = present(values)
    return min(found) if found else None


def total(values: list) -> float | None:
    found = present(values)
    return round(sum(found), 1) if found else None


# --- loading and combining the days -------------------------------------------------------------


def load_all_records(datasets_dir: str | Path | None = None) -> dict[str, dict]:
    """Per city key, the recorded days (see ``dashboard_data.load_records``), cached until the files change."""
    folder = Path(datasets_dir or os.getenv("DATASETS_DIR") or DEFAULT_DATASETS)
    version = tuple((folder / name).stat().st_mtime_ns for name in (WEATHER_FILE, FEATURES_FILE, LOCATIONS_FILE))
    return load_records(str(folder), version)


def combine_cities(records: dict[str, dict]) -> list[dict]:
    """One row per date for all cities together: mean rain, temperature and river flow, highest wind and gust."""
    by_date: dict[str, list[dict]] = {}
    for record in records.values():
        for day in record["days"]:
            by_date.setdefault(day["date"], []).append(day)

    combined = []
    for day_date in sorted(by_date):
        rows = by_date[day_date]
        combined.append(
            {
                "date": day_date,
                "rain_mm": average([row["rain_mm"] for row in rows]),
                "high_c": average([row["high_c"] for row in rows]),
                "low_c": average([row["low_c"] for row in rows]),
                "wind_kmh": highest([row["wind_kmh"] for row in rows]),
                "gust_kmh": highest([row["gust_kmh"] for row in rows]),
                "river_flow_m3s": average([row["river_flow_m3s"] for row in rows]),
            }
        )
    return combined


def days_for(records: dict[str, dict], city: str | None) -> list[dict]:
    """The daily rows of one city, or of all cities combined when ``city`` is None."""
    if city is None:
        return combine_cities(records)
    return records.get(city, {"days": []})["days"]


def keep_prefix(days: list[dict], year: int | None, month: int | None) -> list[dict]:
    """The days of the chosen year (and month). Dates are text like ``2024-07-15``, so a prefix match is enough."""
    if year is None:
        return days
    prefix = f"{year:04d}-{month:02d}" if month else f"{year:04d}"
    return [day for day in days if day["date"].startswith(prefix)]


# --- statistics for a group of days -------------------------------------------------------------


def stats_for(days: list[dict]) -> dict:
    """Totals, averages and extremes for a group of days (a year, a month, a day or a whole range)."""
    rain = [day["rain_mm"] for day in days]
    highs = [day["high_c"] for day in days]
    return {
        "days": len(days),
        "rain_total_mm": total(rain),
        "rain_max_day_mm": highest(rain),
        "rain_days": sum(1 for value in present(rain) if value >= RAIN_DAY_MM),
        "heavy_rain_days": sum(1 for value in present(rain) if value >= DAILY_RAIN_WATCH_MM),
        "high_avg_c": average(highs),
        "high_max_c": highest(highs),
        "hot_days": sum(1 for value in present(highs) if value >= HOT_DAY_C),
        "low_avg_c": average([day["low_c"] for day in days]),
        "low_min_c": lowest([day["low_c"] for day in days]),
        "wind_max_kmh": highest([day["wind_kmh"] for day in days]),
        "gust_max_kmh": highest([day["gust_kmh"] for day in days]),
        "river_avg_m3s": average([day["river_flow_m3s"] for day in days]),
        "river_max_m3s": highest([day["river_flow_m3s"] for day in days]),
    }


def group_points(days: list[dict], level: str) -> list[dict]:
    """One set of statistics per year, month or day, in time order. The label is the text for the chart axis."""
    size = {LEVEL_YEAR: 4, LEVEL_MONTH: 7, LEVEL_DAY: 10}[level]
    groups: dict[str, list[dict]] = {}
    for day in days:
        groups.setdefault(day["date"][:size], []).append(day)

    points = []
    for period in sorted(groups):
        if level == LEVEL_MONTH:
            label = calendar.month_abbr[int(period[5:7])]
        elif level == LEVEL_DAY:
            label = str(int(period[8:10]))
        else:
            label = period
        points.append({"period": period, "label": label, **stats_for(groups[period])})
    return points


def extreme_day(days: list[dict], field: str, pick_highest: bool = True) -> dict | None:
    """The day with the highest (or lowest) value of ``field``, as ``{"date", "value"}``; None if nothing is recorded."""
    found = [day for day in days if day[field] is not None]
    if not found:
        return None
    best = max(found, key=lambda day: day[field]) if pick_highest else min(found, key=lambda day: day[field])
    return {"date": best["date"], "value": best[field]}


def rainiest_days(days: list[dict]) -> list[dict]:
    """The days with the most rain, most first."""
    wet = sorted((day for day in days if day["rain_mm"]), key=lambda day: day["rain_mm"], reverse=True)
    return [{"date": day["date"], "value": day["rain_mm"]} for day in wet[:TOP_DAYS]]


def city_ranking(records: dict[str, dict], year: int | None, month: int | None) -> list[dict]:
    """Every city's rain, heat and river flow for the same period, wettest city first."""
    rows = []
    for key, record in records.items():
        if key not in NCR_LOCATIONS:
            continue
        stats = stats_for(keep_prefix(record["days"], year, month))
        rows.append(
            {
                "city": key,
                "rain_total_mm": stats["rain_total_mm"],
                "high_avg_c": stats["high_avg_c"],
                "river_max_m3s": stats["river_max_m3s"],
                "gust_max_kmh": stats["gust_max_kmh"],
            }
        )
    return sorted(rows, key=lambda row: row["rain_total_mm"] or 0, reverse=True)


# --- the answer ---------------------------------------------------------------------------------


def check_filters(city: str | None, year: int | None, month: int | None, day: int | None) -> None:
    """Raise InvalidFilter for a combination that cannot be answered."""
    if city is not None and city not in NCR_LOCATIONS:
        raise InvalidFilter("Unknown city.")
    if month is not None and year is None:
        raise InvalidFilter("A month needs a year.")
    if day is not None and month is None:
        raise InvalidFilter("A day needs a month and a year.")
    if month is not None and not 1 <= month <= 12:
        raise InvalidFilter("The month must be from 1 to 12.")
    if day is not None and year is not None and month is not None and not 1 <= day <= calendar.monthrange(year, month)[1]:
        raise InvalidFilter("That day does not exist in that month.")


def build_analytics(
    city: str | None = None,
    year: int | None = None,
    month: int | None = None,
    day: int | None = None,
    datasets_dir: str | Path | None = None,
) -> dict:
    """Everything the analytics page needs for one choice of filters (see the module docstring)."""
    check_filters(city, year, month, day)
    records = load_all_records(datasets_dir)
    all_days = days_for(records, city)

    in_range = keep_prefix(all_days, year, month)
    level = LEVEL_DAY if month else LEVEL_MONTH if year else LEVEL_YEAR

    day_detail = None
    if day is not None and year is not None and month is not None:
        wanted = date(year, month, day).isoformat()
        day_detail = next((row for row in in_range if row["date"] == wanted), None)

    return {
        "city": city,
        "level": level,
        "year": year,
        "month": month,
        "day": day,
        "years_available": sorted({row["date"][:4] for row in all_days}),
        "data_first_date": all_days[0]["date"] if all_days else None,
        "data_last_date": all_days[-1]["date"] if all_days else None,
        "summary": stats_for(in_range),
        "wettest_day": extreme_day(in_range, "rain_mm"),
        "hottest_day": extreme_day(in_range, "high_c"),
        "coolest_night": extreme_day(in_range, "low_c", pick_highest=False),
        "strongest_gust": extreme_day(in_range, "gust_kmh"),
        "peak_river_day": extreme_day(in_range, "river_flow_m3s"),
        "rainiest_days": rainiest_days(in_range),
        "points": group_points(in_range, level),
        "day_detail": day_detail,
        "city_ranking": city_ranking(records, year, month),
    }
