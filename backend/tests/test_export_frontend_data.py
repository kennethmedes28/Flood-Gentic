"""Tests for scripts/export_frontend_data.py: the frontend's hotline and evacuation data must match the CSV files.

They fail when someone changes a CSV but forgets to run the script, so the pages never show stale numbers.
"""

import csv
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "export_frontend_data.py"
spec = importlib.util.spec_from_file_location("export_frontend_data", SCRIPT)
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


class ExportFrontendDataTests(unittest.TestCase):
    def test_the_frontend_files_are_up_to_date(self):
        stale = [path.name for path, text in export.build_files().items() if not path.exists() or path.read_text(encoding="utf-8") != text]
        self.assertEqual(stale, [], "Run: cd backend && uv run python ../scripts/export_frontend_data.py")

    def test_phone_numbers_are_copied_exactly(self):
        with open(export.CONTACTS_CSV, newline="", encoding="utf-8-sig") as file:
            original = [row["Number"] for row in csv.DictReader(file)]
        centers, cities = export.build_centers(export.read_csv(export.CENTERS_CSV))
        contacts = export.build_contacts(export.read_csv(export.CONTACTS_CSV), cities)
        self.assertEqual([contact["number"] for contact in contacts], original)

    def test_every_local_hotline_has_a_city_and_hospitals_have_none(self):
        _, cities = export.build_centers(export.read_csv(export.CENTERS_CSV))
        contacts = export.build_contacts(export.read_csv(export.CONTACTS_CSV), cities)
        for contact in contacts:
            if contact["category"] in export.LOCAL_CATEGORIES:
                self.assertTrue(contact["cities"], contact["agency"])
            else:
                self.assertEqual(contact["cities"], [], contact["agency"])

    def test_one_fire_district_serves_several_cities(self):
        _, cities = export.build_centers(export.read_csv(export.CENTERS_CSV))
        contacts = export.build_contacts(export.read_csv(export.CONTACTS_CSV), cities)
        district = next(contact for contact in contacts if "District III" in contact["agency"])
        self.assertEqual(len(district["cities"]), 5)

    def test_center_ids_are_unique(self):
        centers, _ = export.build_centers(export.read_csv(export.CENTERS_CSV))
        self.assertEqual(len({center["id"] for center in centers}), len(centers))


if __name__ == "__main__":
    unittest.main()
