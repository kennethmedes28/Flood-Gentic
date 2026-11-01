"""Fetch the Tomorrow.io forecast for the 17 Metro Manila cities and store it in Supabase, at most once per city per day.

    python scripts/fetch_tomorrow_forecast.py --dry-run   # show which cities are missing today, fetch nothing
    python scripts/fetch_tomorrow_forecast.py             # fetch the missing ones and store them

This runs the same code the API runs on its first request of the day (``backend/src/services/tomorrow_forecast.py``),
so the two never disagree: a city that already has today's row (Manila date) is skipped, a stored row is never
replaced, and a day with everything stored makes no Tomorrow.io request at all. Running it more than once a day is safe.

It needs the Supabase settings and the key in the environment (or in backend/.env):

    SUPABASE_PROJECT_REF, SUPABASE_PASSWORD, SUPABASE_POOLER_HOST     (or SUPABASE_DB_URL)
    TOMMORROW_IO_API                                                   the Tomorrow.io key

It creates the ``tomorrow_forecast`` table first if it is not there (backend/sql/003_tomorrow_forecast.sql).
The exit code is 1 when a city could not be fetched, so a scheduled run shows up as failed (see
.github/workflows/fetch-tomorrow-forecast.yml).
"""

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_DIR / "backend"))  # so `src`, `agents` and `checkpointer` can be imported
load_dotenv(REPO_DIR / "backend" / ".env")  # a missing file is fine: in GitHub Actions the settings are secrets

from src.services.fetch_postgre_database import get_connection  # noqa: E402
from src.services.tomorrow_forecast import (  # noqa: E402
    DASHBOARD_CITIES,
    cities_stored_on,
    read_api_key,
    refresh_if_needed,
    today_in_manila,
)

TABLE_SQL = REPO_DIR / "backend" / "sql" / "003_tomorrow_forecast.sql"


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch today's Tomorrow.io forecast into Supabase (once per city per day).")
    parser.add_argument("--dry-run", action="store_true", help="only show which cities are missing today")
    arguments = parser.parse_args()

    connection = get_connection()
    connection.execute(TABLE_SQL.read_text(encoding="utf-8"))  # CREATE TABLE IF NOT EXISTS: safe to repeat

    today = today_in_manila()
    missing = [city for city in DASHBOARD_CITIES if city not in cities_stored_on(connection, today)]
    print(f"{today}: {len(DASHBOARD_CITIES) - len(missing)} of {len(DASHBOARD_CITIES)} cities already stored.")

    if arguments.dry_run:
        print("Missing (would be fetched):", ", ".join(missing) if missing else "none")
        return 0
    if not missing:
        print("Nothing to fetch.")
        return 0
    if read_api_key() is None:
        print("The Tomorrow.io key is not set (TOMMORROW_IO_API).")
        return 1

    result = refresh_if_needed(lambda: connection)
    print(f"Fetched {len(result.fetched)}: {', '.join(result.fetched) or 'none'}")
    if result.failed:
        print(f"Could not fetch {len(result.failed)}: {', '.join(result.failed)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
