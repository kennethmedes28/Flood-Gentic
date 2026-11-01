"""Tests for the Tomorrow.io forecast: fetched at most once per city per day, never replaced, streamed from the stored rows.

Tomorrow.io and the database are replaced by fakes: no network and no real database.

Run from the backend folder:  python -m unittest tests.test_weather -v
"""

import json
import sys
import types
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from src.api.routers import weather as weather_router
from src.rag.models import PHILIPPINE_TZ
from src.services import tomorrow_forecast as service
from tests.test_api import make_client

NOON = datetime(2026, 11, 1, 12, 0, tzinfo=PHILIPPINE_TZ)  # a Sunday in Manila; 04:00 UTC
CITIES = ("manila", "marikina")


def forecast_starting(hour_utc: datetime) -> dict:
    """A small stored forecast: 6 hourly entries from ``hour_utc`` and one daily entry."""
    hourly = [
        {"time": (hour_utc + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M:%SZ"), "values": {"temperature": 30.0 + i}}
        for i in range(6)
    ]
    return {"hourly": hourly, "daily": [{"time": hour_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), "values": {"temperatureMax": 33.0}}]}


class FakeForecastDatabase:
    """Stands in for the connection: keeps the rows of ``tomorrow_forecast`` and answers the service's three queries."""

    def __init__(self):
        self.rows: dict[tuple[str, date], dict] = {}

    def execute(self, sql: str, params=None):
        params = params or []
        if sql.startswith("SELECT city FROM tomorrow_forecast"):
            return Result([{"city": city} for (city, day) in self.rows if day == params[0]])
        if sql.startswith("INSERT INTO tomorrow_forecast"):
            city, day, hourly, daily = params
            if (city, day) in self.rows:
                return Result([], rowcount=0)  # ON CONFLICT DO NOTHING
            self.rows[(city, day)] = {
                "city": city, "fetched_on": day, "fetched_at": datetime.now(timezone.utc),
                "hourly": json.loads(hourly), "daily": json.loads(daily),
            }
            return Result([], rowcount=1)
        if sql.startswith("SELECT DISTINCT ON (city)"):
            newest: dict[str, dict] = {}
            for (city, day), row in self.rows.items():
                if city in params[0] and (city not in newest or day > newest[city]["fetched_on"]):
                    newest[city] = row
            return Result(list(newest.values()))
        raise AssertionError(f"unexpected query: {sql}")


class Result:
    def __init__(self, rows, rowcount=-1):
        self._rows, self.rowcount = rows, rowcount

    def fetchall(self):
        return self._rows


class RefreshTests(unittest.TestCase):
    def setUp(self):
        service._failed_at.clear()
        self.database = FakeForecastDatabase()
        self.connection = lambda: self.database
        self.requests: list[str] = []

        def fake_download(client, api_key, lat, lng):
            self.requests.append(f"{lat},{lng}")
            return forecast_starting(NOON.astimezone(timezone.utc))

        patches = [
            mock.patch.object(service, "download_forecast", side_effect=fake_download),
            mock.patch.object(service, "read_api_key", return_value="test-key"),
            mock.patch.object(service.time, "sleep"),  # no real pauses
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def refresh(self, now=NOON, cities=CITIES):
        return service.refresh_if_needed(self.connection, cities, now=now)

    def test_fetches_each_missing_city_once_and_stores_it(self):
        result = self.refresh()
        self.assertEqual(sorted(result.fetched), ["manila", "marikina"])
        self.assertEqual(len(self.requests), 2)
        self.assertEqual({city for city, _ in self.database.rows}, {"manila", "marikina"})

    def test_a_second_call_the_same_day_makes_no_request(self):
        self.refresh()
        self.requests.clear()
        result = self.refresh(now=NOON + timedelta(hours=5))
        self.assertEqual(self.requests, [])
        self.assertEqual(sorted(result.already_stored), ["manila", "marikina"])

    def test_only_the_missing_cities_are_fetched_and_the_stored_one_is_kept(self):
        old = forecast_starting(NOON.astimezone(timezone.utc) - timedelta(hours=3))
        service.save_forecast(self.database, "manila", date(2026, 11, 1), old)
        self.refresh()
        self.assertEqual(len(self.requests), 1)  # only marikina
        self.assertEqual(self.database.rows[("manila", date(2026, 11, 1))]["hourly"], old["hourly"])

    def test_saving_over_an_existing_row_does_nothing(self):
        first = forecast_starting(NOON.astimezone(timezone.utc))
        second = forecast_starting(NOON.astimezone(timezone.utc) + timedelta(hours=9))
        self.assertTrue(service.save_forecast(self.database, "manila", date(2026, 11, 1), first))
        self.assertFalse(service.save_forecast(self.database, "manila", date(2026, 11, 1), second))
        self.assertEqual(self.database.rows[("manila", date(2026, 11, 1))]["hourly"], first["hourly"])

    def test_the_next_day_fetches_again(self):
        self.refresh()
        self.requests.clear()
        self.refresh(now=NOON + timedelta(days=1))
        self.assertEqual(len(self.requests), 2)
        self.assertEqual(len(self.database.rows), 4)  # yesterday's rows are kept

    def test_a_day_is_counted_in_manila_time(self):
        late = datetime(2026, 11, 1, 23, 30, tzinfo=PHILIPPINE_TZ)  # still Nov 1 in Manila, already Nov 1 15:30 UTC
        just_after = late + timedelta(hours=1)  # Nov 2 in Manila
        self.assertEqual(service.today_in_manila(late), date(2026, 11, 1))
        self.assertEqual(service.today_in_manila(just_after), date(2026, 11, 2))

    def test_a_failed_city_is_not_stored_and_not_retried_right_away(self):
        error = httpx.HTTPStatusError("bad", request=httpx.Request("GET", "https://x"), response=httpx.Response(500))
        with mock.patch.object(service, "download_forecast", side_effect=error) as download:
            first = self.refresh(cities=("manila",))
            second = self.refresh(cities=("manila",))
        self.assertEqual(first.failed, ["manila"])
        self.assertEqual(second.failed, ["manila"])
        self.assertEqual(download.call_count, 1)  # the second call waited instead of asking again
        self.assertEqual(self.database.rows, {})

    def test_hitting_the_limit_stops_the_remaining_requests(self):
        limit = httpx.HTTPStatusError("limit", request=httpx.Request("GET", "https://x"), response=httpx.Response(429))
        with mock.patch.object(service, "download_forecast", side_effect=limit) as download:
            result = self.refresh()
        self.assertEqual(download.call_count, 1)
        self.assertEqual(sorted(result.failed), ["manila", "marikina"])

    def test_without_a_key_nothing_is_requested(self):
        with mock.patch.object(service, "read_api_key", return_value=None):
            result = self.refresh()
        self.assertEqual(self.requests, [])
        self.assertEqual(sorted(result.failed), ["manila", "marikina"])

    def test_the_error_log_never_contains_the_key(self):
        error = httpx.HTTPStatusError("failed for https://api?apikey=SECRET", request=httpx.Request("GET", "https://x"), response=httpx.Response(401))
        with mock.patch.object(service, "download_forecast", side_effect=error), self.assertLogs(service.logger, "WARNING") as logs:
            self.refresh(cities=("manila",))
        self.assertNotIn("SECRET", "\n".join(logs.output))


class ApiKeyTests(unittest.TestCase):
    def test_the_key_is_read_from_the_name_used_in_the_env_file(self):
        with mock.patch.dict("os.environ", {"TOMMORROW_IO_API": " abc "}, clear=True):
            self.assertEqual(service.read_api_key(), "abc")

    def test_the_other_spellings_still_work_and_no_key_gives_none(self):
        with mock.patch.dict("os.environ", {"TOMMORROW-IO_API": "old"}, clear=True):
            self.assertEqual(service.read_api_key(), "old")
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertIsNone(service.read_api_key())


class ReadingTests(unittest.TestCase):
    def test_conditions_at_picks_the_current_hour(self):
        start = datetime(2026, 11, 1, 4, 0, tzinfo=timezone.utc)
        hourly = forecast_starting(start)["hourly"]
        entry = service.conditions_at(hourly, start + timedelta(hours=2, minutes=20))
        self.assertEqual(entry["values"]["temperature"], 32.0)

    def test_conditions_at_is_none_before_the_forecast_and_after_it_runs_out(self):
        start = datetime(2026, 11, 1, 4, 0, tzinfo=timezone.utc)
        hourly = forecast_starting(start)["hourly"]
        self.assertIsNone(service.conditions_at(hourly, start - timedelta(minutes=1)))
        self.assertIsNone(service.conditions_at(hourly, start + timedelta(hours=7)))

    def test_latest_forecasts_follow_the_order_asked_and_skip_cities_without_one(self):
        database = FakeForecastDatabase()
        service.save_forecast(database, "marikina", date(2026, 11, 1), forecast_starting(NOON.astimezone(timezone.utc)))
        service.save_forecast(database, "manila", date(2026, 11, 1), forecast_starting(NOON.astimezone(timezone.utc)))
        rows = service.latest_forecasts(database, ("manila", "pasig", "marikina"))
        self.assertEqual([row["city"] for row in rows], ["manila", "marikina"])


class EndpointTests(unittest.TestCase):
    def setUp(self):
        service._failed_at.clear()
        self.database = FakeForecastDatabase()
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        self.requests = 0

        def fake_download(client, api_key, lat, lng):
            self.requests += 1
            return forecast_starting(now - timedelta(hours=1))  # covers the current hour

        for patch in (
            mock.patch.object(service, "download_forecast", side_effect=fake_download),
            mock.patch.object(service, "read_api_key", return_value="test-key"),
            mock.patch.object(service.time, "sleep"),
        ):
            patch.start()
            self.addCleanup(patch.stop)

    def client(self):
        return make_client(connection=self.database)

    def test_forecast_returns_the_stored_data_with_the_current_hour(self):
        with self.client() as client:
            body = client.get("/weather/forecast?cities=manila").json()
        city = body["cities"][0]
        self.assertEqual(city["city"], "manila")
        self.assertIsNotNone(city["now"])
        self.assertEqual(len(city["hourly"]), 6)

    def test_asking_again_does_not_fetch_again(self):
        with self.client() as client:
            client.get("/weather/forecast?cities=manila")
            client.get("/weather/forecast?cities=manila")
        self.assertEqual(self.requests, 1)

    def test_an_unknown_city_is_rejected_without_a_request(self):
        with self.client() as client:
            response = client.get("/weather/forecast?cities=tokyo")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.requests, 0)

    def test_the_stream_sends_a_snapshot_then_ticks_then_ends(self):
        with mock.patch.object(weather_router, "TICK_SECONDS", 0.05), mock.patch.object(weather_router, "MAX_STREAM_SECONDS", 0.2):
            with self.client() as client:
                text = client.get("/weather/stream?cities=manila").text
        names = [line.removeprefix("event: ") for line in text.splitlines() if line.startswith("event: ")]
        self.assertEqual(names[0], "snapshot")
        self.assertIn("tick", names)
        self.assertEqual(names[-1], "end")
        self.assertEqual(self.requests, 1)  # the whole stream used one fetch
        snapshot = json.loads(next(line for line in text.splitlines() if line.startswith("data: ")).removeprefix("data: "))
        self.assertEqual(snapshot["cities"][0]["city"], "manila")

    def test_the_snapshot_carries_only_the_next_day_of_hours(self):
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        hourly = forecast_starting(now - timedelta(hours=1))["hourly"]
        hourly += [{"time": (now + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M:%SZ"), "values": {}} for i in range(5, 60)]
        row = {"city": "manila", "fetched_on": date(2026, 11, 1), "fetched_at": now, "hourly": hourly, "daily": []}
        trimmed = weather_router.to_city_forecast(row, now, max_hours=24)
        self.assertEqual(len(trimmed.hourly), 24)
        self.assertEqual(trimmed.hourly[0].time, trimmed.now.time)  # starts at the current hour, not 5 days ago
        self.assertEqual(len(weather_router.to_city_forecast(row, now).hourly), len(hourly))  # the JSON endpoint keeps all

    def test_all_17_cities_are_forecast_cities(self):
        self.assertEqual(len(service.DASHBOARD_CITIES), 17)
        self.assertIn("makati", service.DASHBOARD_CITIES)

    def test_the_open_stream_count_goes_back_down(self):
        with mock.patch.object(weather_router, "TICK_SECONDS", 0.05), mock.patch.object(weather_router, "MAX_STREAM_SECONDS", 0.1):
            with self.client() as client:
                client.get("/weather/stream?cities=manila")
        self.assertEqual(weather_router.open_streams, 0)


if __name__ == "__main__":
    unittest.main()
