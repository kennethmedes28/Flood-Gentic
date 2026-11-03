"""Add the new evacuation centers and emergency contacts from their CSV files to Supabase. Append only.

Run from backend/ (or anywhere, with the Supabase settings in the environment):

    uv run python ../scripts/sync_datasets_to_supabase.py

The CSV rows are copied into a temporary staging table, then inserted with ``ON CONFLICT DO NOTHING``. A row that is
already in Supabase (for evacuation centers the row is (city, barangay, name)) is left exactly as it is, and nothing is
ever updated or deleted, so running it twice in a row changes nothing.

Tables (created if missing) and their CSV files:

    evacuation_centers         datasets/ncr_evacuation_centers.csv
    emergency_contacts         corpus/ph_emergency_contacts.csv (table: backend/sql/004_emergency_contacts.sql)

The daily weather tables (ncr_locations, ncr_weather_daily, ncr_flood_features_daily) are NOT synced here. The nightly
"Update datasets" workflow fills and revises them straight from Open-Meteo (scripts/update_supabase_from_open_meteo.py),
and the CSV files are older than Supabase, so copying them back could only add stale values.

Connection settings: see backend/.env.example (SUPABASE_DB_URL, or project ref + password + pooler host).
"""

import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_DIR = Path(__file__).resolve().parent.parent
DATASETS_DIR = REPO_DIR / "datasets"
CONTACTS_CSV = REPO_DIR / "corpus" / "ph_emergency_contacts.csv"
CONTACTS_TABLE_SQL = REPO_DIR / "backend" / "sql" / "004_emergency_contacts.sql"

sys.path.insert(0, str(REPO_DIR / "backend"))  # so `checkpointer` and `src` can be imported
sys.path.insert(0, str(REPO_DIR / "scripts"))  # so the table definitions can be shared and the contacts built
load_dotenv()

from export_frontend_data import build_centers, build_contacts, read_csv  # noqa: E402
from load_to_supabase import DATASET_SCHEMA_SQL, read_csv_header  # noqa: E402

# The tables this script syncs, with the CSV file of each in datasets/ and the columns that identify a row.
SYNCED_TABLES = {
    "evacuation_centers": ("ncr_evacuation_centers.csv", "city, barangay, name"),
}


def append_new_rows(conn, table: str, csv_path: Path) -> int:
    """Insert the CSV rows that are not in ``table`` yet. Returns how many were added."""
    columns = ", ".join(read_csv_header(csv_path))

    # Everything below runs in one transaction, so the staging table lives on one connection.
    with conn.transaction():
        conn.execute(f"CREATE TEMP TABLE staging (LIKE {table} INCLUDING DEFAULTS) ON COMMIT DROP")
        copy_sql = f"COPY staging ({columns}) FROM STDIN WITH (FORMAT csv, HEADER true)"
        with conn.cursor() as cursor, cursor.copy(copy_sql) as copy:
            with open(csv_path, encoding="utf-8-sig") as file:
                while block := file.read(1 << 20):
                    copy.write(block)

        result = conn.execute(
            f"INSERT INTO {table} ({columns}) SELECT {columns} FROM staging "
            f"ON CONFLICT ({SYNCED_TABLES[table][1]}) DO NOTHING"
        )
        return result.rowcount


def append_new_contacts(conn) -> int:
    """Insert the hotlines of the contacts list that are not in ``emergency_contacts`` yet. Returns how many were added.

    The numbers are copied exactly as written. A hotline already stored (same agency, type and number) is left alone.
    """
    conn.execute(CONTACTS_TABLE_SQL.read_text(encoding="utf-8"))  # CREATE TABLE IF NOT EXISTS, safe to repeat
    _, cities = build_centers(read_csv(DATASETS_DIR / "ncr_evacuation_centers.csv"))
    contacts = build_contacts(read_csv(CONTACTS_CSV), cities)

    added = 0
    with conn.transaction():
        for position, contact in enumerate(contacts):
            result = conn.execute(
                "INSERT INTO emergency_contacts (position, agency, category, contact_type, number, notes, cities) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (agency, contact_type, number) DO NOTHING",
                [position, contact["agency"], contact["category"], contact["type"], contact["number"], contact["notes"], contact["cities"]],
            )
            added += result.rowcount
    return added


def main() -> None:
    from src.services.fetch_postgre_database import get_connection

    with get_connection() as conn:
        conn.execute(DATASET_SCHEMA_SQL)  # CREATE TABLE IF NOT EXISTS, safe to repeat
        for table, (file_name, _) in SYNCED_TABLES.items():
            added = append_new_rows(conn, table, DATASETS_DIR / file_name)
            print(f"{table}: {added} new rows added")
        print(f"emergency_contacts: {append_new_contacts(conn)} new rows added")


if __name__ == "__main__":
    main()
