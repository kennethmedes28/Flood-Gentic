"""Tests for GET /dashboard. It reads small CSV files made here, not the real datasets.

Run from the backend folder:  python -m unittest tests.test_dashboard -v
"""

import sys
import tempfile
import types
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from tests.test_api import make_client

LAST_DAY = date(2026, 10, 30)
WEATHER_HEADER = "location_id,date,precipitation_sum_mm,temperature_2m_max_c,temperature_2m_min_c,shortwave_radiation_sum_mjm2,wind_speed_10m_max_kmh,wind_gusts_10m_max_kmh,temperature_2m_max_from_hourly_c,temperature_2m_min_from_hourly_c,river_discharge_m3s"
FEATURES_HEADER = "location_id,date,precipitation_sum_mm,wind_speed_10m_max_kmh,wind_gusts_10m_max_kmh,river_discharge_m3s,rain_max_1h_mm,rain_max_3h_mm,rain_max_6h_mm,elevation_m,rain_3d_mm,rain_7d_mm,rain_14d_mm,wet_streak_days,discharge_change_1d_pct,discharge_max_3d_m3s,discharge_pctile"


def write_datasets(folder: Path, last_day_rain: float, last_day_peak: float, percentile: float = 0.5) -> None:
    """Three locations (ids in alphabetical order, as in the real file), 30 calm days and a chosen last day."""
    (folder / "ncr_locations.csv").write_text(
        "﻿location_id,latitude,longitude,elevation_m,coord_group,city\n"
        "0,14.65,120.97,7,4,Caloocan\n5,14.6,120.98,5,1,Manila\n6,14.65,121.1,20,2,Marikina\n",
        encoding="utf-8",
    )
    weather, features = [WEATHER_HEADER], [FEATURES_HEADER]
    for location_id in ("0", "5", "6"):
        for back in range(29, -1, -1):
            day = LAST_DAY - timedelta(days=back)
            is_last = back == 0
            rain = last_day_rain if is_last else 1.0
            peak = last_day_peak if is_last else 0.5
            wet_3d = 1.0 if is_last else 2.0 + back * 0.1  # earlier days were wetter, so the last day is not "soaked" by chance
            flow = 5.0 + int(location_id)  # a different flow for each place, so mixed-up rows would show
            weather.append(f"{location_id},{day},{rain},33.5,25.4,16,18.5,47.9,33.5,25.8,{flow}")
            features.append(f"{location_id},{day},{rain},18.5,47.9,{flow},{peak},1,1,7,{wet_3d},{rain},{rain},1,,{flow},{percentile if is_last else 0.5}")
    (folder / "ncr_weather_daily_2020-2026.csv").write_text("\n".join(weather) + "\n", encoding="utf-8")
    (folder / "ncr_flood_features_daily.csv").write_text("\n".join(features) + "\n", encoding="utf-8")


class DashboardTests(unittest.TestCase):
    def ask(self, query: str = "", last_day_rain: float = 1.0, last_day_peak: float = 0.5, percentile: float = 0.5):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        write_datasets(Path(folder.name), last_day_rain, last_day_peak, percentile)
        with mock.patch.dict("os.environ", {"DATASETS_DIR": folder.name}), make_client() as client:
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

    def test_unknown_city_is_rejected(self):
        self.assertEqual(self.ask("?cities=tokyo").status_code, 422)


if __name__ == "__main__":
    unittest.main()
