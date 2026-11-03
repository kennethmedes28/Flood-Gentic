"""Tests for GET /dashboard. The recorded days come from a fake database connection made here.

Run from the backend folder:  python -m unittest tests.test_dashboard -v
"""

import sys
import types
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from src.cache import configure_cache
from src.services import dashboard_data
from tests.test_api import make_client

LAST_DAY = date(2026, 10, 30)


class RecordsConnection:
    """Answers the recorded-days query with the given rows."""

    def __init__(self, rows):
        self.rows = rows

    def execute(self, sql, params=None):
        return self

    def fetchall(self):
        return self.rows


class BrokenConnection:
    """A database that is down."""

    def execute(self, sql, params=None):
        raise ConnectionError("down")


def recorded_row(city: str, day: date, rain: float, peak: float, wet_3d: float, flow: float, percentile: float) -> dict:
    """One row as ``RECORDS_SQL`` returns it."""
    return {
        "city": city, "date": str(day), "precipitation_sum_mm": rain, "temperature_2m_max_c": 33.5,
        "temperature_2m_min_c": 25.4, "wind_speed_10m_max_kmh": 18.5, "wind_gusts_10m_max_kmh": 47.9,
        "river_discharge_m3s": flow, "rain_max_1h_mm": peak, "rain_3d_mm": wet_3d, "discharge_pctile": percentile,
    }


def recorded_rows(last_day_rain: float, last_day_peak: float, percentile: float = 0.5) -> list[dict]:
    """Three cities, 30 calm days and a chosen last day."""
    rows = []
    for city, location_id in (("Caloocan", 0), ("Manila", 5), ("Marikina", 6)):
        for back in range(29, -1, -1):
            day = LAST_DAY - timedelta(days=back)
            is_last = back == 0
            rain = last_day_rain if is_last else 1.0
            peak = last_day_peak if is_last else 0.5
            wet_3d = 1.0 if is_last else 2.0 + back * 0.1  # earlier days were wetter, so the last day is not "soaked" by chance
            flow = 5.0 + location_id  # a different flow for each place, so mixed-up rows would show
            rows.append(recorded_row(city, day, rain, peak, wet_3d, flow, percentile if is_last else 0.5))
    return rows


def forget_kept_answers() -> None:
    """Start each test without the recorded days or cached answers of another one."""
    dashboard_data._db_cache.update(at=0.0, records=None)
    configure_cache(None)


class DashboardTests(unittest.TestCase):
    def setUp(self):
        forget_kept_answers()
        self.addCleanup(forget_kept_answers)

    def ask(self, query: str = "", last_day_rain: float = 1.0, last_day_peak: float = 0.5, percentile: float = 0.5):
        connection = RecordsConnection(recorded_rows(last_day_rain, last_day_peak, percentile))
        with make_client(connection=connection) as client:
            return client.get(f"/dashboard{query}")

    def test_calm_day_is_low_and_reports_the_last_recorded_day(self):
        body = self.ask("?cities=manila").json()
        city = body["cities"][0]
        self.assertEqual(body["data_date"], "2026-10-30")
        self.assertEqual((city["data_date"], city["high_c"], city["low_c"], city["rain_mm"]), ("2026-10-30", 33.5, 25.4, 1.0))
        self.assertEqual(city["risk_level"], "low")

    def test_says_how_high_the_river_is_for_the_city(self):
        city = self.ask("?cities=manila", percentile=0.97).json()["cities"][0]
        self.assertEqual(city["river_percentile"], 0.97)
        self.assertEqual(city["river_high_flow_m3s"], 10.0)  # the city's flow is the same every day in the fixture

    def test_each_city_gets_its_own_rows(self):
        body = self.ask("?cities=manila,marikina").json()
        self.assertEqual([c["river_flow_m3s"] for c in body["cities"]], [10.0, 11.0])  # ids 5 and 6, by name not by position

    def test_recent_days_are_the_last_14_oldest_first(self):
        recent = self.ask("?cities=manila").json()["cities"][0]["recent"]
        self.assertEqual(len(recent), 14)
        self.assertEqual((recent[0]["date"], recent[-1]["date"]), ("2026-10-17", "2026-10-30"))

    def test_heavy_rain_raises_the_level_and_gives_a_reason(self):
        city = self.ask("?cities=manila", last_day_rain=80.0, last_day_peak=20.0).json()["cities"][0]
        self.assertEqual(city["risk_level"], "high")
        self.assertTrue(any("one hour" in reason for reason in city["risk_reasons"]))
        # The same reasons as codes with a number, so the app can write them in the chosen language.
        self.assertIn({"code": "peak_rain", "value": 20.0}, city["risk_reason_codes"])
        self.assertEqual(len(city["risk_reason_codes"]), len(city["risk_reasons"]))

    def test_a_river_high_for_its_history_is_at_least_high(self):
        city = self.ask("?cities=manila", percentile=0.99).json()["cities"][0]
        self.assertEqual(city["risk_level"], "high")

    def test_a_city_missing_from_the_data_says_so(self):
        city = self.ask("?cities=pasig").json()["cities"][0]
        self.assertIsNone(city["high_c"])
        self.assertIsNone(city["risk_level"])
        self.assertTrue(city["missing"])

    def test_cities_come_back_in_the_order_asked(self):
        body = self.ask("?cities=marikina,manila").json()
        self.assertEqual([city["city"] for city in body["cities"]], ["marikina", "manila"])

    def test_database_down_gives_503(self):
        with make_client(connection=BrokenConnection()) as client:
            self.assertEqual(client.get("/dashboard?cities=manila").status_code, 503)

    def test_unknown_city_is_rejected(self):
        self.assertEqual(self.ask("?cities=tokyo").status_code, 422)


if __name__ == "__main__":
    unittest.main()
