"""Tests for POST /chat/stream/video: the video is the request body, is checked, handed to the graph as a saved file and deleted.

A fake graph is used: no SAM request is made and no credit is used.

Run from the backend folder:  python -m unittest tests.test_chat_video -v
"""

import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from src.services import media_upload
from tests.test_api import FakeGraph, make_client

MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 200
MOV = b"\x00\x00\x00\x14ftypqt  \x00\x00\x00\x00qt  " + b"\x00" * 200
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 200
NOT_A_VIDEO = b"%PDF-1.4 this is a document, not a video" + b"\x00" * 100


class GraphThatSeesTheVideo(FakeGraph):
    """Records the media it was given, and whether the file existed and what it started with while the graph ran."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.seen = {}

    async def ainvoke(self, graph_input, config):
        media = graph_input.get("media")
        if media:
            path = Path(media["path"])
            self.seen = {"media": media, "existed": path.is_file(), "head": path.read_bytes()[:4], "suffix": path.suffix}
        return await super().ainvoke(graph_input, config)


def read_events(response) -> list[dict]:
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


class ChatVideoTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        patch = mock.patch.dict("os.environ", {"MEDIA_UPLOAD_DIR": self.folder.name})
        patch.start()
        self.addCleanup(patch.stop)

    def send(self, video: bytes, query: str = "", graph=None, content_type: str = "video/mp4"):
        graph = graph or GraphThatSeesTheVideo(text="Water was seen in 40% of the frames")
        with make_client(graph) as client:
            response = client.post(f"/chat/stream/video{query}", content=video, headers={"Content-Type": content_type})
        return response, graph

    def uploaded_files(self):
        return list(Path(self.folder.name).glob("*"))

    def test_a_video_reaches_the_graph_as_a_saved_file_and_the_reply_comes_back(self):
        response, graph = self.send(MP4, "?message=is%20this%20flooded%3F")
        events = read_events(response)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(events[-1]["reply"], "Water was seen in 40% of the frames")
        self.assertTrue(graph.seen["existed"])
        self.assertEqual(graph.seen["media"]["kind"], "video")
        self.assertEqual(graph.seen["suffix"], ".mp4")
        self.assertEqual(graph.inputs[0]["messages"], [("user", "is this flooded?")])

    def test_mov_and_webm_files_are_accepted_with_their_own_extension(self):
        self.assertEqual(self.send(MOV, content_type="video/quicktime")[1].seen["suffix"], ".mov")
        self.assertEqual(self.send(WEBM, content_type="video/webm")[1].seen["suffix"], ".webm")

    def test_the_video_is_deleted_when_the_answer_is_done(self):
        self.send(MP4)
        self.assertEqual(self.uploaded_files(), [])

    def test_the_status_names_the_video_check_and_says_it_takes_a_while(self):
        graph = GraphThatSeesTheVideo(text="ok")
        response, _ = self.send(MP4, graph=graph)
        label = read_events(response)[1]["label"].lower()
        self.assertIn("video", label)
        self.assertIn("minute", label)

    def test_only_water_is_looked_for_unless_detailed_is_asked_for(self):
        _, plain = self.send(MP4)
        _, detailed = self.send(MP4, "?detailed=true")
        self.assertFalse(plain.seen["media"]["include_people_and_vehicles"])
        self.assertTrue(detailed.seen["media"]["include_people_and_vehicles"])

    def test_a_video_far_larger_than_a_chat_message_is_accepted(self):
        big = MP4 + b"\x00" * (5 * 1024 * 1024)  # 5 MB: more than the limit for a message with a photo
        response, graph = self.send(big)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(graph.seen["existed"])

    def test_the_other_endpoints_still_refuse_a_large_body(self):
        with make_client() as client:
            response = client.post("/chat/stream", content=b"x" * (5 * 1024 * 1024), headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 413)

    def test_a_file_that_is_not_a_video_is_refused_and_nothing_is_saved(self):
        response, graph = self.send(NOT_A_VIDEO)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(graph.inputs, [])
        self.assertEqual(self.uploaded_files(), [])

    def test_an_empty_body_is_refused(self):
        self.assertEqual(self.send(b"")[0].status_code, 422)

    def test_a_video_over_the_limit_is_refused_and_removed(self):
        with mock.patch.object(media_upload, "MAX_VIDEO_BYTES", 100):
            response, graph = self.send(MP4)
        self.assertEqual(response.status_code, 413)
        self.assertEqual(graph.inputs, [])
        self.assertEqual(self.uploaded_files(), [])

    def test_a_secret_in_the_caption_is_blocked_before_the_graph_runs(self):
        response, graph = self.send(MP4, "?message=my%20key%20is%20sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789")
        self.assertTrue(read_events(response)[-1]["blocked"])
        self.assertEqual(graph.inputs, [])
        self.assertEqual(self.uploaded_files(), [])  # and the video is still removed

    def test_a_location_outside_metro_manila_is_refused(self):
        self.assertEqual(self.send(MP4, "?lat=14.3925&lng=120.8497")[0].status_code, 422)

    def test_only_one_of_lat_and_lng_is_refused(self):
        self.assertEqual(self.send(MP4, "?lat=14.6")[0].status_code, 422)

    def test_a_location_inside_metro_manila_reaches_the_graph(self):
        _, graph = self.send(MP4, "?lat=14.6507&lng=121.1029")
        self.assertIn("location", graph.inputs[0])

    def test_videos_share_the_photo_check_rate_limit(self):
        graph = GraphThatSeesTheVideo(text="ok")
        with make_client(graph) as client:
            codes = [
                client.post("/chat/stream/video", content=MP4, headers={"Content-Type": "video/mp4"}).status_code
                for _ in range(22)
            ]
        self.assertEqual(codes[:20], [200] * 20)
        self.assertEqual(codes[20], 429)


if __name__ == "__main__":
    unittest.main()
