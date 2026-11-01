"""Tests for POST /chat/stream: progress lines first, then the reply. A fake graph is used: no model or network.

Run from the backend folder:  python -m unittest tests.test_chat_stream -v
"""

import json
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from tests.test_api import FakeGraph, make_client


class GraphWithSavedState(FakeGraph):
    """A fake graph that can also report the saved conversation, as the real one does."""

    def __init__(self, saved=None, **kwargs):
        super().__init__(**kwargs)
        self.saved = saved or {}

    async def aget_state(self, config):
        return SimpleNamespace(values=self.saved)


def read_events(response) -> list[dict]:
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


class ChatStreamTests(unittest.TestCase):
    def post(self, message: str, graph=None):
        with make_client(graph or GraphWithSavedState(text="Low risk")) as client:
            return client.post("/chat/stream", json={"message": message})

    def test_sends_progress_then_the_reply(self):
        response = self.post("Will it flood in Marikina?")
        events = read_events(response)
        self.assertEqual(response.headers["content-type"].split(";")[0], "application/x-ndjson")
        self.assertEqual([event["type"] for event in events], ["status", "status", "reply"])
        self.assertEqual(events[0]["step"], "checking")
        self.assertIn("flood risk", events[1]["label"].lower())  # names the agent that will answer
        self.assertEqual((events[2]["reply"], events[2]["blocked"]), ("Low risk", False))

    def test_the_reply_carries_a_thread_id(self):
        reply = read_events(self.post("hello"))[-1]
        self.assertTrue(reply["thread_id"])

    def test_a_message_with_several_topics_lists_them(self):
        message = (
            "Mag forecast ka ng 7 days at kung bumaha hanggang tuhod dito ngayon, "
            "ano ang kailangan kong gawin at saan ang pinaka safe na evacuation center."
        )
        events = read_events(self.post(message))
        working = events[1]
        self.assertIn("topics", working)
        self.assertGreaterEqual(len(working["topics"]), 2)

    def test_a_secret_is_blocked_before_the_graph_runs(self):
        graph = GraphWithSavedState()
        events = read_events(self.post("my key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789", graph))
        self.assertTrue(events[-1]["blocked"])
        self.assertEqual(graph.inputs, [])  # nothing reached the graph

    def test_a_failure_becomes_an_error_event(self):
        events = read_events(self.post("hi there", GraphWithSavedState(error=RuntimeError("boom"))))
        self.assertEqual(events[-1]["type"], "error")
        self.assertNotIn("boom", events[-1]["message"])

    def test_still_works_when_the_saved_state_cannot_be_read(self):
        events = read_events(self.post("Will it flood in Marikina?", FakeGraph(text="ok")))  # no aget_state at all
        self.assertEqual(events[-1]["reply"], "ok")
        self.assertEqual(events[1]["label"], "Working on your question")

    def test_an_empty_message_is_rejected_like_the_normal_endpoint(self):
        with make_client() as client:
            self.assertEqual(client.post("/chat/stream", json={"message": ""}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
