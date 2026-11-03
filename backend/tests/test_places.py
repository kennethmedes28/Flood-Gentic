"""Tests for the Supabase readers of the dashboard days, evacuation centers and contacts (no real database).

Run from the backend folder:  python -m unittest tests.test_places -v
"""

import sys
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from src.services import dashboard_data
from src.services.places import read_emergency_contacts, read_evacuation_centers


class FakeConnection:
    """Answers every query with the given rows."""

    def __init__(self, rows):
        self.rows = rows

    def execute(self, sql, params=None):
        return self

    def fetchall(self):
        return self.rows


def weather_row(day: str, rain: float) -> dict:
    return {
        "city": "Manila", "date": day, "precipitation_sum_mm": rain, "temperature_2m_max_c": 33.0,
        "temperature_2m_min_c": 25.0, "wind_speed_10m_max_kmh": 10.0, "wind_gusts_10m_max_kmh": 20.0,
        "river_discharge_m3s": 5.0, "rain_max_1h_mm": 0.5, "rain_3d_mm": 2.0, "discharge_pctile": 0.4,
    }


class DashboardFromDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.clear_cache()
        self.addCleanup(self.clear_cache)  # the kept answer must not leak into other tests

    @staticmethod
    def clear_cache():
        dashboard_data._db_cache.update(at=0.0, records=None)

    def test_reads_the_last_day_from_the_database(self):
        connection = FakeConnection([weather_row("2026-11-01", 1.0), weather_row("2026-11-02", 2.8)])
        data = dashboard_data.build_dashboard(["manila"], get_connection=lambda: connection)
        self.assertEqual(str(data["data_date"]), "2026-11-02")
        self.assertEqual(data["cities"][0]["rain_mm"], 2.8)

    def test_falls_back_to_the_files_when_the_database_fails(self):
        def broken():
            raise RuntimeError("down")

        data = dashboard_data.build_dashboard(["manila"], get_connection=broken)
        self.assertIsNotNone(data["data_date"])  # came from datasets/

    def test_empty_tables_fall_back_to_the_files(self):
        data = dashboard_data.build_dashboard(["manila"], get_connection=lambda: FakeConnection([]))
        self.assertIsNotNone(data["data_date"])


class PlacesTests(unittest.TestCase):
    def test_centers_get_an_id_and_no_empty_fields(self):
        rows = [{"city": "Pasig City", "barangay": "Kapitolyo", "name": "School", "type": None, "status": None,
                 "source": None, "lat": 14.5, "lng": 121.0, "notes": None}]
        center = read_evacuation_centers(FakeConnection(rows))[0]
        self.assertEqual(center["id"], "Pasig City|Kapitolyo|School")
        self.assertEqual((center["type"], center["notes"]), ("", ""))

    def test_contacts_keep_the_number_exactly(self):
        rows = [{"agency": "A", "category": "Local - Fire", "type": "Landline", "number": "(02) 8882-4151 to 77",
                 "notes": None, "cities": ["Pasig City"]}]
        contact = read_emergency_contacts(FakeConnection(rows))[0]
        self.assertEqual(contact["number"], "(02) 8882-4151 to 77")
        self.assertEqual(contact["cities"], ["Pasig City"])


if __name__ == "__main__":
    unittest.main()
