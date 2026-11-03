"""Tests for GET /analytics/weather. The recorded days come from a fake database connection made here.

Run from the backend folder:  python -m unittest tests.test_weather_analytics -v
"""

import sys
import types
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from tests.test_api import make_client
from tests.test_dashboard import BrokenConnection, RecordsConnection, forget_kept_answers, recorded_row

FIRST_DAY = date(2023, 12, 30)
LAST_DAY = date(2024, 2, 2)


def write_datasets(folder: Path) -> None:
    """Two cities (Manila = 5, Marikina = 6) for 2023-12-30 to 2024-02-02.

    Manila gets 10 mm every day; Marikina 20 mm, except 2024-01-15 which has 100 mm. Marikina is 1 degree hotter.
    """
    (folder / "ncr_locations.csv").write_text(
        "location_id,latitude,longitude,elevation_m,coord_group,city\n5,14.6,120.98,5,1,Manila\n6,14.65,121.1,20,2,Marikina\n",
        encoding="utf-8",
    )
    weather, features = [WEATHER_HEADER], [FEATURES_HEADER]
    day = FIRST_DAY
    while day <= LAST_DAY:
        for location_id, rain, high in (("5", 10.0, 32.0), ("6", 100.0 if day == date(2024, 1, 15) else 20.0, 33.0)):
            weather.append(f"{location_id},{day},{rain},{high},25.0,16,18.5,47.9,{high},25.0,{location_id}")
            features.append(f"{location_id},{day},{rain},18.5,47.9,{location_id},0.5,1,1,7,2,{rain},{rain},1,,{location_id},0.5")
        day += timedelta(days=1)
    (folder / "ncr_weather_daily_2020-2026.csv").write_text("\n".join(weather) + "\n", encoding="utf-8")
    (folder / "ncr_flood_features_daily.csv").write_text("\n".join(features) + "\n", encoding="utf-8")


FIRST_DAY = date(2023, 12, 30)
LAST_DAY = date(2024, 2, 2)


def recorded_rows() -> list[dict]:
    """Two cities (Manila, Marikina) for 2023-12-30 to 2024-02-02.

    Manila gets 10 mm every day; Marikina 20 mm, except 2024-01-15 which has 100 mm. Marikina is 1 degree hotter.
    """
    rows = []
    day = FIRST_DAY
    while day <= LAST_DAY:
        for city, flow, rain, high in (("Manila", 5.0, 10.0, 32.0), ("Marikina", 6.0, 100.0 if day == date(2024, 1, 15) else 20.0, 33.0)):
            row = recorded_row(city, day, rain, 0.5, 2.0, flow, 0.5)
            row["temperature_2m_max_c"] = high
            row["temperature_2m_min_c"] = 25.0
            rows.append(row)
        day += timedelta(days=1)
    return rows


class WeatherAnalyticsTests(unittest.TestCase):
    def setUp(self):
        forget_kept_answers()
        self.addCleanup(forget_kept_answers)

    def ask(self, query: str = ""):
        with make_client(connection=RecordsConnection(recorded_rows())) as client:
            return client.get(f"/analytics/weather{query}")

    def test_no_year_gives_one_point_per_year(self):
        body = self.ask().json()
        self.assertEqual(body["level"], "year")
        self.assertEqual([point["period"] for point in body["points"]], ["2023", "2024"])
        self.assertEqual(body["years_available"], ["2023", "2024"])
        self.assertEqual((body["data_first_date"], body["data_last_date"]), ("2023-12-30", "2024-02-02"))

    def test_a_year_gives_one_point_per_month_with_short_labels(self):
        body = self.ask("?year=2024").json()
        self.assertEqual(body["level"], "month")
        self.assertEqual([point["label"] for point in body["points"]], ["Jan", "Feb"])

    def test_a_month_gives_one_point_per_day(self):
        body = self.ask("?year=2024&month=1").json()
        self.assertEqual(body["level"], "day")
        self.assertEqual(len(body["points"]), 31)
        self.assertEqual(body["points"][0]["label"], "1")

    def test_one_city_uses_only_its_own_rows(self):
        manila = self.ask("?city=manila&year=2024&month=1").json()
        self.assertEqual(manila["summary"]["rain_total_mm"], 310.0)  # 31 days x 10 mm
        marikina = self.ask("?city=marikina&year=2024&month=1").json()
        self.assertEqual(marikina["summary"]["rain_total_mm"], 30 * 20 + 100)

    def test_all_cities_average_rain_and_take_the_highest_gust(self):
        body = self.ask("?year=2024&month=1").json()
        self.assertEqual(body["city"], None)
        self.assertEqual(body["summary"]["rain_total_mm"], round(31 * 15.0 + 40.0, 1))  # mean of 10 and 20, plus half of the extra 80
        self.assertEqual(body["summary"]["high_avg_c"], 32.5)

    def test_extremes_name_the_day(self):
        body = self.ask("?city=marikina").json()
        self.assertEqual(body["wettest_day"], {"date": "2024-01-15", "value": 100.0})
        self.assertEqual(body["rainiest_days"][0]["date"], "2024-01-15")
        self.assertEqual(body["peak_river_day"]["value"], 6.0)

    def test_a_chosen_day_comes_back_in_detail(self):
        body = self.ask("?city=marikina&year=2024&month=1&day=15").json()
        self.assertEqual(body["day_detail"]["rain_mm"], 100.0)
        self.assertEqual(body["day_detail"]["date"], "2024-01-15")

    def test_city_ranking_puts_the_wettest_city_first(self):
        body = self.ask("?year=2024&month=1").json()
        self.assertEqual([row["city"] for row in body["city_ranking"]], ["marikina", "manila"])

    def test_counts_rain_days_and_heavy_rain_days(self):
        body = self.ask("?city=marikina&year=2024&month=1").json()
        self.assertEqual(body["summary"]["rain_days"], 31)
        self.assertGreaterEqual(body["summary"]["heavy_rain_days"], 1)

    def test_a_month_without_a_year_is_rejected(self):
        self.assertEqual(self.ask("?month=3").status_code, 422)

    def test_a_day_without_a_month_is_rejected(self):
        self.assertEqual(self.ask("?year=2024&day=3").status_code, 422)

    def test_a_day_that_does_not_exist_is_rejected(self):
        self.assertEqual(self.ask("?year=2023&month=2&day=30").status_code, 422)

    def test_unknown_city_is_rejected(self):
        self.assertEqual(self.ask("?city=atlantis").status_code, 422)


if __name__ == "__main__":
    unittest.main()
