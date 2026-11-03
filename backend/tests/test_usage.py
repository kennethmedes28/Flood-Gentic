"""Tests for the per-user spending caps: the counting rules, the routes that enforce them, and the usage meter.

The counters are an in-memory fake with the same rules as the Postgres ones (the real SQL was checked against a real
Postgres, including 40 parallel requests against a limit of 10). Run from the backend folder:  python -m unittest tests.test_usage -v
"""

import asyncio
import json
import sys
import types
import unittest
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, LLMResult
from starlette.websockets import WebSocketDisconnect

from src.api.app import create_app
from src.api.settings import Settings
from src.services import usage_meter
from src.services.usage import (
    EVERYONE, REQUESTS, TOKENS, UPLOADS, QuotaExceeded, UsageLimits, UsageTracker, seconds_until_next_day, seconds_until_next_month,
)
from tests.test_api import FakeConnection, FakeGraph
from tests.test_auth import EMERGENCY, GOOD_TOKEN, FakeVerifier, signed_in

MANILA = ZoneInfo("Asia/Manila")
NOW = datetime(2026, 11, 3, 10, 0, tzinfo=MANILA)


class FakeCounters:
    """In-memory counters with the same rules as ``PostgresCounters``."""

    def __init__(self):
        self.values: dict[tuple, int] = {}

    def reserve(self, scope, metric, period, amount, limit):
        key = (scope, metric, period)
        if key in self.values and self.values[key] + amount > limit:
            return False
        self.values[key] = self.values.get(key, 0) + amount
        return True

    def add(self, scope, metric, period, amount):
        key = (scope, metric, period)
        self.values[key] = self.values.get(key, 0) + amount

    def release(self, scope, metric, period, amount):
        key = (scope, metric, period)
        self.values[key] = max(self.values.get(key, 0) - amount, 0)

    def get(self, scope, metric, period):
        return self.values.get((scope, metric, period), 0)


def tracker(**limits) -> UsageTracker:
    return UsageTracker(FakeCounters(), UsageLimits(**limits), clock=lambda: NOW)


class CountingRuleTests(unittest.TestCase):
    def test_a_user_stops_at_the_daily_message_limit(self):
        usage = tracker(user_requests_per_day=2)
        usage.count_chat_request("a", photo=False)
        usage.count_chat_request("a", photo=False)
        with self.assertRaises(QuotaExceeded) as caught:
            usage.count_chat_request("a", photo=False)
        self.assertIn("midnight", caught.exception.message)
        self.assertIn("911", caught.exception.message)
        usage.count_chat_request("b", photo=False)  # another user has their own count

    def test_the_limit_is_per_manila_day(self):
        counters = FakeCounters()
        clock = {"now": NOW}
        usage = UsageTracker(counters, UsageLimits(user_requests_per_day=1), clock=lambda: clock["now"])
        usage.count_chat_request("a", photo=False)
        with self.assertRaises(QuotaExceeded):
            usage.count_chat_request("a", photo=False)
        clock["now"] = datetime(2026, 11, 4, 0, 1, tzinfo=MANILA)  # just after Manila midnight
        usage.count_chat_request("a", photo=False)

    def test_photos_have_their_own_daily_limit(self):
        usage = tracker(user_uploads_per_day=1)
        usage.count_chat_request("a", photo=True)
        with self.assertRaises(QuotaExceeded) as caught:
            usage.count_chat_request("a", photo=True)
        self.assertIn("photo checks", caught.exception.message)
        usage.count_chat_request("a", photo=False)  # a text message still works

    def test_a_refused_photo_does_not_use_up_a_message(self):
        counters = FakeCounters()
        usage = UsageTracker(counters, UsageLimits(user_uploads_per_day=0 + 1), clock=lambda: NOW)
        usage.count_chat_request("a", photo=True)
        before = counters.get("a", REQUESTS, "2026-11-03")
        with self.assertRaises(QuotaExceeded):
            usage.count_chat_request("a", photo=True)
        self.assertEqual(counters.get("a", REQUESTS, "2026-11-03"), before)  # the message was handed back

    def test_the_whole_app_breaker_stops_everyone_and_does_not_charge_the_user(self):
        counters = FakeCounters()
        usage = UsageTracker(counters, UsageLimits(everyone_requests_per_day=2), clock=lambda: NOW)
        usage.count_chat_request("a", photo=False)
        usage.count_chat_request("b", photo=False)
        with self.assertRaises(QuotaExceeded) as caught:
            usage.count_chat_request("c", photo=False)
        self.assertIn("for everyone", caught.exception.message)
        self.assertEqual(counters.get("c", REQUESTS, "2026-11-03"), 0)
        self.assertEqual(counters.get(EVERYONE, REQUESTS, "2026-11-03"), 2)

    def test_the_monthly_token_cap_is_checked_before_a_message(self):
        usage = tracker(user_tokens_per_month=100)
        usage.count_chat_request("a", photo=False)
        usage.record("a", tokens=150, sam_requests=0)  # one message may go over; the next is refused
        with self.assertRaises(QuotaExceeded) as caught:
            usage.count_chat_request("a", photo=False)
        self.assertIn("month", caught.exception.message)
        self.assertGreater(caught.exception.retry_after_seconds, 20 * 86400)

    def test_voice_sessions_are_limited_per_day(self):
        usage = tracker(user_voice_per_day=1)
        usage.count_voice_session("a")
        with self.assertRaises(QuotaExceeded):
            usage.count_voice_session("a")

    def test_the_snapshot_shows_usage_against_the_limits(self):
        usage = tracker()
        usage.count_chat_request("a", photo=True)
        usage.record("a", tokens=500, sam_requests=4)
        snapshot = usage.snapshot("a")
        self.assertEqual((snapshot["messages_today"], snapshot["photos_today"], snapshot["tokens_this_month"]), (1, 1, 500))
        self.assertEqual((snapshot["messages_limit"], snapshot["photos_limit"]), (20, 3))  # the tight defaults

    def test_reset_times(self):
        self.assertEqual(seconds_until_next_day(datetime(2026, 11, 3, 23, 0, tzinfo=MANILA)), 3600)
        self.assertEqual(seconds_until_next_month(datetime(2026, 11, 30, 23, 0, tzinfo=MANILA)), 3600)
        self.assertEqual(seconds_until_next_month(datetime(2026, 2, 1, 0, 0, tzinfo=MANILA)), 28 * 86400)


class UsingGraph(FakeGraph):
    """A graph that 'uses' 50 tokens and 4 SAM requests while it runs, as the real model and SAM client would."""

    async def ainvoke(self, graph_input, config):
        usage_meter.add_tokens(50)
        usage_meter.add_sam_request(4)
        return await super().ainvoke(graph_input, config)


def make_usage_client(usage: UsageTracker, graph=None) -> TestClient:
    graph = graph if graph is not None else UsingGraph()

    @asynccontextmanager
    async def fake_services(app):
        app.state.graph = graph
        app.state.get_connection = lambda: FakeConnection()
        app.state.llm_ready = True
        app.state.retriever_ready = False
        app.state.usage = usage
        yield

    app = create_app(Settings(require_auth=True, supabase_url="https://abcd.supabase.co"), lifespan=fake_services, verifier=FakeVerifier())
    return TestClient(app)


class RouteTests(unittest.TestCase):
    def test_a_message_is_counted_and_its_real_usage_recorded(self):
        usage = tracker()
        with make_usage_client(usage) as client:
            response = client.post("/chat", json={"message": "hi"}, headers=signed_in())
        self.assertEqual(response.status_code, 200)
        counters = usage.counters
        self.assertEqual(counters.get("user-1", REQUESTS, "2026-11-03"), 1)
        self.assertEqual(counters.get("user-1", TOKENS, "2026-11"), 50)
        self.assertEqual(counters.get("user-1", "sam_requests", "2026-11-03"), 4)

    def test_over_the_daily_limit_gives_429_with_a_retry_time_and_no_model_call(self):
        graph = UsingGraph()
        with make_usage_client(tracker(user_requests_per_day=1), graph) as client:
            client.post("/chat", json={"message": "hi"}, headers=signed_in())
            second = client.post("/chat", json={"message": "hi again"}, headers=signed_in())
        self.assertEqual(second.status_code, 429)
        self.assertIn("midnight", second.json()["detail"])
        self.assertGreater(int(second.headers["Retry-After"]), 0)
        self.assertEqual(len(graph.inputs), 1)

    def test_an_emergency_is_still_answered_when_the_limit_is_used_up(self):
        graph = UsingGraph()
        with make_usage_client(tracker(user_requests_per_day=1), graph) as client:
            client.post("/chat", json={"message": "hi"}, headers=signed_in())
            chat = client.post("/chat", json={"message": EMERGENCY}, headers=signed_in())
            stream = client.post("/chat/stream", json={"message": EMERGENCY}, headers=signed_in())
        self.assertEqual(chat.status_code, 200)
        self.assertIn("call 911", chat.json()["reply"])
        lines = [json.loads(line) for line in stream.text.splitlines() if line.strip()]
        self.assertEqual(stream.status_code, 200)
        self.assertIn("911", lines[0]["reply"])
        self.assertEqual(len(graph.inputs), 1)  # only the first message reached the graph

    def test_a_signed_in_emergency_under_the_limit_gets_the_full_answer(self):
        graph = UsingGraph()
        with make_usage_client(tracker(), graph) as client:
            client.post("/chat", json={"message": EMERGENCY}, headers=signed_in())
        self.assertEqual(len(graph.inputs), 1)

    def test_a_photo_over_the_photo_limit_is_refused_even_with_text_left(self):
        with make_usage_client(tracker(user_uploads_per_day=0 + 1)) as client:
            usage_counters = client.app.state.usage.counters
            usage_counters.add("user-1", UPLOADS, "2026-11-03", 1)  # today's one photo is already used
            response = client.post("/chat/stream", json={"message": "look", "image": "aGk="}, headers=signed_in())
        self.assertEqual(response.status_code, 429)

    def test_a_broken_counter_database_refuses_instead_of_skipping_the_cap(self):
        class BrokenCounters(FakeCounters):
            def get(self, *args):
                raise ConnectionError("down")

        with make_usage_client(UsageTracker(BrokenCounters(), UsageLimits(), clock=lambda: NOW)) as client:
            normal = client.post("/chat", json={"message": "hi"}, headers=signed_in())
            emergency = client.post("/chat", json={"message": EMERGENCY}, headers=signed_in())
        self.assertEqual(normal.status_code, 503)
        self.assertEqual(emergency.status_code, 200)

    def test_my_usage_needs_sign_in_and_shows_the_counts(self):
        usage = tracker()
        with make_usage_client(usage) as client:
            self.assertEqual(client.get("/me/usage").status_code, 401)
            client.post("/chat", json={"message": "hi"}, headers=signed_in())
            body = client.get("/me/usage", headers=signed_in()).json()
        self.assertEqual((body["messages_today"], body["messages_limit"], body["tokens_this_month"]), (1, 20, 50))

    def test_voice_is_refused_once_the_daily_sessions_are_used(self):
        with make_usage_client(tracker(user_voice_per_day=1)) as client:
            client.app.state.usage.counters.add("user-1", "voice_sessions", "2026-11-03", 1)
            with self.assertRaises(WebSocketDisconnect):
                with client.websocket_connect(f"/ws/voice?token={GOOD_TOKEN}"):
                    pass


class UsageMeterTests(unittest.TestCase):
    def test_tokens_come_from_the_message_usage_data(self):
        message = AIMessage(content="x", usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15})
        result = LLMResult(generations=[[ChatGeneration(message=message)]])
        self.assertEqual(usage_meter.tokens_in_result(result), 15)

    def test_tokens_fall_back_to_the_providers_summary(self):
        result = LLMResult(generations=[[ChatGeneration(message=AIMessage(content="x"))]], llm_output={"token_usage": {"total_tokens": 42}})
        self.assertEqual(usage_meter.tokens_in_result(result), 42)

    def test_the_callback_adds_to_the_current_scope_only(self):
        usage_meter.TokenCounter().on_llm_end(LLMResult(generations=[], llm_output={"token_usage": {"total_tokens": 9}}))  # no scope: ignored
        scope = usage_meter.start_scope()
        usage_meter.TokenCounter().on_llm_end(LLMResult(generations=[], llm_output={"token_usage": {"total_tokens": 9}}))
        self.assertEqual(scope.tokens, 9)

    def test_usage_follows_the_request_into_worker_threads(self):
        """The graph runs sync nodes in worker threads; their tokens and SAM requests must still reach the request's scope."""

        async def run():
            scope = usage_meter.start_scope()
            await asyncio.to_thread(usage_meter.add_tokens, 7)
            await asyncio.to_thread(usage_meter.add_sam_request, 2)
            return scope

        scope = asyncio.run(run())
        self.assertEqual((scope.tokens, scope.sam_requests), (7, 2))


if __name__ == "__main__":
    unittest.main()
