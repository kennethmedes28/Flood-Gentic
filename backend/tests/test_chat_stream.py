"""Tests for POST /chat/stream: progress lines first, then the reply. A fake graph is used: no model or network.

Run from the backend folder:  python -m unittest tests.test_chat_stream -v
"""

import base64
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from src.api.settings import Settings
from tests.test_api import FakeGraph, make_client


class GraphWithSavedState(FakeGraph):
    """A fake graph that can also report the saved conversation, as the real one does."""

    def __init__(self, saved=None, **kwargs):
        super().__init__(**kwargs)
        self.saved = saved or {}

    async def aget_state(self, config):
        return SimpleNamespace(values=self.saved)


JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64  # the first bytes of a JPEG picture are what is checked
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def as_base64(data: bytes) -> str:
    return base64.b64encode(data).decode()


class GraphThatSeesThePicture(GraphWithSavedState):
    """Remembers whether the picture file existed (and what it held) at the moment the graph ran."""

    async def ainvoke(self, graph_input, config):
        media = graph_input.get("media")
        if media:
            path = Path(media["path"])
            self.seen = {"existed": path.is_file(), "starts_with": path.read_bytes()[:4] if path.is_file() else b"", "media": media}
        return await super().ainvoke(graph_input, config)


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
        self.assertIn("flood risk", events[1]["label"].lower())  # the routing does not need the saved conversation

    def test_an_empty_message_is_rejected_like_the_normal_endpoint(self):
        with make_client() as client:
            self.assertEqual(client.post("/chat/stream", json={"message": ""}).status_code, 422)


class ChatStreamPhotoTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        patch = mock.patch.dict("os.environ", {"MEDIA_UPLOAD_DIR": self.folder.name})
        patch.start()
        self.addCleanup(patch.stop)

    def send(self, body: dict, graph=None):
        graph = graph or GraphThatSeesThePicture(text="Water covers some of the picture")
        with make_client(graph) as client:
            return client.post("/chat/stream", json=body), graph

    def uploaded_files(self):
        return list(Path(self.folder.name).glob("*"))

    def test_a_photo_with_a_caption_reaches_the_graph_as_a_saved_file(self):
        response, graph = self.send({"message": "is this flooded?", "image": as_base64(JPEG)})
        events = read_events(response)
        self.assertEqual(events[-1]["reply"], "Water covers some of the picture")
        self.assertTrue(graph.seen["existed"])
        self.assertEqual(graph.seen["starts_with"], JPEG[:4])
        self.assertEqual(graph.seen["media"]["kind"], "image")
        self.assertTrue(graph.seen["media"]["path"].startswith(self.folder.name))

    def test_the_picture_is_deleted_when_the_answer_is_done(self):
        self.send({"image": as_base64(PNG)})
        self.assertEqual(self.uploaded_files(), [])

    def test_a_photo_alone_is_enough_and_the_status_names_the_photo_check(self):
        response, _ = self.send({"image": as_base64(JPEG)})
        events = read_events(response)
        self.assertEqual(response.status_code, 200)
        self.assertIn("photo", events[1]["label"].lower())

    def test_by_default_only_water_is_looked_for(self):
        _, graph = self.send({"image": as_base64(JPEG)})
        self.assertFalse(graph.seen["media"]["include_people_and_vehicles"])

    def test_detailed_also_counts_people_and_vehicles(self):
        _, graph = self.send({"image": as_base64(JPEG), "detailed": True})
        self.assertTrue(graph.seen["media"]["include_people_and_vehicles"])

    def test_something_that_is_not_a_picture_is_refused_and_nothing_is_saved(self):
        response, graph = self.send({"image": as_base64(b"%PDF-1.7 not a picture")})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(graph.inputs, [])
        self.assertEqual(self.uploaded_files(), [])

    def test_text_that_is_not_base64_is_refused(self):
        response, _ = self.send({"image": "this is !!! not base64"})
        self.assertEqual(response.status_code, 422)

    def test_a_picture_over_the_size_limit_is_refused(self):
        too_big = JPEG + b"\x00" * 2_000_000
        response, graph = self.send({"image": as_base64(too_big)})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(graph.inputs, [])

    def test_a_request_that_declares_a_huge_body_is_refused_before_it_is_read(self):
        with make_client() as client:
            response = client.post("/chat/stream", content=b"{}", headers={"content-length": "50000000", "content-type": "application/json"})
        self.assertEqual(response.status_code, 413)

    def test_a_secret_in_the_caption_is_still_blocked_and_the_picture_is_not_used(self):
        response, graph = self.send({"message": "my key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789", "image": as_base64(JPEG)})
        self.assertTrue(read_events(response)[-1]["blocked"])
        self.assertEqual(graph.inputs, [])
        self.assertEqual(self.uploaded_files(), [])

    def test_photo_checks_have_their_own_lower_limit(self):
        settings = Settings(media_per_hour=2)
        graph = GraphThatSeesThePicture(text="ok")
        with make_client(graph, settings=settings) as client:
            codes = [client.post("/chat/stream", json={"image": as_base64(JPEG)}).status_code for _ in range(3)]
            text_code = client.post("/chat/stream", json={"message": "hello"}).status_code
        self.assertEqual(codes, [200, 200, 429])
        self.assertEqual(text_code, 200)  # plain messages are not affected


if __name__ == "__main__":
    unittest.main()
