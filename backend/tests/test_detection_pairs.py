"""Tests for the example photos that are answered with their stored annotated copy (no SAM request).

Run from the backend folder:  python -m unittest tests.test_detection_pairs -v
"""

import base64
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from src.services import detection_pairs
from tests.test_api import FakeGraph, make_client

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"fake annotated picture"


def make_folder(root: Path, files: list[str]) -> None:
    """Create empty files such as ``human_raw/humans2.jpg`` under ``root``."""
    for name in files:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x")


class PairingTests(unittest.TestCase):
    def test_pairs_raw_photos_with_their_detected_copy(self):
        with tempfile.TemporaryDirectory() as folder:
            make_folder(
                Path(folder),
                [
                    "human_raw/humans2.jpg", "human_detected/humans-detected-2.png",
                    "child_raw/childs-2.jpg", "child_detected/childs-detected-2.png",
                    "car_raw/cars1.jpg", "car_detected/cars-detected-1.png",
                ],
            )
            pairs, unpaired = detection_pairs.build_pairs(Path(folder))
        self.assertEqual(
            pairs,
            {
                "humans2": "human_detected/humans-detected-2.png",
                "childs-2": "child_detected/childs-detected-2.png",
                "cars1": "car_detected/cars-detected-1.png",
            },
        )
        self.assertEqual(unpaired, [])

    def test_files_without_a_partner_are_reported(self):
        with tempfile.TemporaryDirectory() as folder:
            make_folder(Path(folder), ["human_raw/humans1.jpg", "human_detected/humans-detected-9.png"])
            pairs, unpaired = detection_pairs.build_pairs(Path(folder))
        self.assertEqual(pairs, {})
        self.assertEqual(unpaired, ["human_detected/humans-detected-9.png", "human_raw/humans1.jpg"])

    def test_lookup_ignores_folders_case_and_extension(self):
        pairs = {"humans2": "human_detected/humans-detected-2.png"}
        with mock.patch.object(detection_pairs, "load_pairs", return_value=pairs):
            for name in ["humans2.jpg", "Humans2.PNG", "humans2", "C:\\photos\\humans2.jpeg", "/tmp/humans2.webp"]:
                self.assertEqual(detection_pairs.find_detected(name), "human_detected/humans-detected-2.png", name)
            for name in ["humans3.jpg", "", None, "../humans2/../x.jpg", "a" * 500]:
                self.assertIsNone(detection_pairs.find_detected(name), name)

    def test_only_listed_files_can_be_served(self):
        with tempfile.TemporaryDirectory() as folder:
            make_folder(Path(folder), ["human_detected/humans-detected-2.png"])
            with mock.patch.object(detection_pairs, "DETECTIONS_DIR", Path(folder)), mock.patch.object(
                detection_pairs, "load_pairs", return_value={"humans2": "human_detected/humans-detected-2.png"}
            ):
                self.assertIsNotNone(detection_pairs.detected_file("human_detected/humans-detected-2.png"))
                self.assertIsNone(detection_pairs.detected_file("human_detected/other.png"))
                self.assertIsNone(detection_pairs.detected_file("../backend/.env"))


class ChatTests(unittest.TestCase):
    """POST /chat/stream and GET /detections with a fake folder."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        root = Path(self.folder.name)
        (root / "human_detected").mkdir()
        (root / "human_detected" / "humans-detected-2.png").write_bytes(PNG_BYTES)
        pairs = {"humans2": "human_detected/humans-detected-2.png"}
        for patch in (
            mock.patch.object(detection_pairs, "DETECTIONS_DIR", root),
            mock.patch.object(detection_pairs, "load_pairs", return_value=pairs),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        self.addCleanup(self.folder.cleanup)

    def post_photo(self, filename, graph, location=None):
        body = {"message": "", "image": base64.b64encode(JPEG).decode()}
        if location is not None:
            body["location"] = location
        if filename is not None:
            body["filename"] = filename
        with make_client(graph) as client:
            response = client.post("/chat/stream", json=body)
            return response, [json.loads(line) for line in response.text.splitlines() if line.strip()]

    def test_known_photo_gets_its_detected_image_and_skips_the_graph(self):
        graph = FakeGraph()
        response, events = self.post_photo("humans2.jpg", graph)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(graph.inputs, [])  # the graph, which would call SAM, was not used
        reply = events[-1]
        self.assertEqual(reply["type"], "reply")
        self.assertEqual(reply["image_url"], "/detections/human_detected/humans-detected-2.png")

    def test_known_photo_is_still_read_when_the_location_is_shared(self):
        graph = FakeGraph()
        response, events = self.post_photo("humans2.jpg", graph, location={"lat": 14.5995, "lng": 120.9842})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(graph.inputs, [])
        self.assertEqual(events[-1]["image_url"], "/detections/human_detected/humans-detected-2.png")

    def test_unknown_photo_goes_through_the_normal_check(self):
        graph = FakeGraph(text="Some water")
        _, events = self.post_photo("holiday.jpg", graph)
        self.assertEqual(len(graph.inputs), 1)
        self.assertNotIn("image_url", events[-1])

    def test_a_photo_without_a_file_name_goes_through_the_normal_check(self):
        graph = FakeGraph(text="Some water")
        self.post_photo(None, graph)
        self.assertEqual(len(graph.inputs), 1)

    def test_a_file_name_does_not_skip_the_picture_check(self):
        with make_client(FakeGraph()) as client:
            response = client.post("/chat/stream", json={"message": "", "image": base64.b64encode(b"not a picture").decode(), "filename": "humans2.jpg"})
        self.assertEqual(response.status_code, 422)

    def test_the_detected_image_can_be_fetched(self):
        with make_client(FakeGraph()) as client:
            response = client.get("/detections/human_detected/humans-detected-2.png")
        self.assertEqual((response.status_code, response.content), (200, PNG_BYTES))

    def test_other_files_cannot_be_fetched(self):
        with make_client(FakeGraph()) as client:
            for path in ["/detections/human_detected/other.png", "/detections/human_detected/..%2F..%2Fx", "/detections/..%2Fbackend/.env"]:
                self.assertEqual(client.get(path).status_code, 404, path)


if __name__ == "__main__":
    unittest.main()
