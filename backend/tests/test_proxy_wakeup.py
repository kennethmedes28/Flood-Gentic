"""Tests for waking the Muse proxy on Render before a question needs it. The proxy is faked: no network is used.

Run from the backend folder:  python -m unittest tests.test_proxy_wakeup -v
"""

import asyncio
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from tests.test_chat_stream import GraphWithSavedState, read_events  # noqa: E402
from tests.test_api import make_client  # noqa: E402
from utils import proxy_wakeup  # noqa: E402
from langgraph_orchestrator import stream  # noqa: E402

PROXY = {"MUSE_PROXY_URL": "https://muse-proxy.onrender.com", "MUSE_PROXY_SECRET": "secret"}


class FakeProxy:
    """Answers /health with 503 (still starting) a number of times, then 200 (awake)."""

    def __init__(self, sleepy_answers: int):
        self.sleepy_answers = sleepy_answers
        self.calls = 0

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        assert request.url == "https://muse-proxy.onrender.com/health"
        return httpx.Response(503 if self.calls <= self.sleepy_answers else 200)

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handle))


class WakeupTests(unittest.TestCase):
    def setUp(self):
        proxy_wakeup._last_seen_awake = None
        self.addCleanup(setattr, proxy_wakeup, "_last_seen_awake", None)
        mock.patch.object(proxy_wakeup, "WAKE_PAUSE_SECONDS", 0).start()
        self.addCleanup(mock.patch.stopall)

    def test_without_a_proxy_nothing_is_checked(self):
        with mock.patch.dict(os.environ, {"MUSE_PROXY_URL": ""}):
            self.assertTrue(asyncio.run(proxy_wakeup.proxy_is_awake()))
            self.assertTrue(asyncio.run(proxy_wakeup.wait_for_proxy()))

    def test_an_awake_proxy_is_seen_at_once_and_not_asked_again_for_a_while(self):
        proxy = FakeProxy(sleepy_answers=0)
        with mock.patch.dict(os.environ, PROXY):
            self.assertTrue(asyncio.run(proxy_wakeup.proxy_is_awake(proxy.client())))
            self.assertTrue(asyncio.run(proxy_wakeup.proxy_is_awake(proxy.client())))
        self.assertEqual(proxy.calls, 1)  # the second question skipped the check

    def test_a_sleeping_proxy_is_waited_for_until_it_answers(self):
        proxy = FakeProxy(sleepy_answers=3)
        with mock.patch.dict(os.environ, PROXY):
            self.assertFalse(asyncio.run(proxy_wakeup.proxy_is_awake(proxy.client())))
            self.assertTrue(asyncio.run(proxy_wakeup.wait_for_proxy(proxy.client())))
        self.assertEqual(proxy.calls, 4)  # one quick check, then two more 503s, then the 200
        self.assertTrue(proxy_wakeup.recently_awake())

    def test_the_wait_gives_up_after_its_time_limit(self):
        proxy = FakeProxy(sleepy_answers=10_000)
        with mock.patch.dict(os.environ, PROXY):
            self.assertFalse(asyncio.run(proxy_wakeup.wait_for_proxy(proxy.client(), timeout_seconds=0.2)))
        self.assertFalse(proxy_wakeup.recently_awake())

    def test_a_proxy_that_cannot_be_reached_counts_as_asleep(self):
        def refuse(request):
            raise httpx.ConnectError("refused", request=request)

        with mock.patch.dict(os.environ, PROXY):
            client = httpx.AsyncClient(transport=httpx.MockTransport(refuse))
            self.assertFalse(asyncio.run(proxy_wakeup.proxy_is_awake(client)))


class StreamWakeupTests(unittest.TestCase):
    """The chat stream says it is waking the proxy only when the question needs it and the proxy is asleep."""

    def events_for(self, message: str, awake: bool) -> tuple[list[dict], mock.AsyncMock]:
        waited = mock.AsyncMock(return_value=True)
        with mock.patch.object(stream, "proxy_is_awake", mock.AsyncMock(return_value=awake)), \
             mock.patch.object(stream, "wait_for_proxy", waited), \
             make_client(GraphWithSavedState(text="Answer")) as client:
            events = read_events(client.post("/chat/stream", json={"message": message}))
        return events, waited

    def test_a_question_for_the_model_waits_for_a_sleeping_proxy_and_says_so(self):
        events, waited = self.events_for("ano ang dapat gawin kapag may baha?", awake=False)
        steps = [event.get("step") for event in events if event["type"] == "status"]
        self.assertEqual(steps, ["checking", "waking", "working"])
        waking = next(event for event in events if event.get("step") == "waking")
        self.assertIn("Waking up the AI service", waking["label"])
        self.assertIn("Ginigising", waking["label"])
        waited.assert_awaited_once()
        self.assertEqual(events[-1]["type"], "reply")

    def test_an_awake_proxy_adds_no_step(self):
        events, waited = self.events_for("ano ang dapat gawin kapag may baha?", awake=True)
        self.assertNotIn("waking", [event.get("step") for event in events])
        waited.assert_not_awaited()

    def test_a_question_answered_from_data_never_waits(self):
        events, waited = self.events_for("hotline Pasig", awake=False)
        self.assertNotIn("waking", [event.get("step") for event in events])
        waited.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
