"""Tests for the boxes and water overlay sent with a checked photo (video/annotations.py). Made-up detections, no SAM calls.

Run from the backend folder:  python -m pytest tests/test_photo_annotations.py -q
"""

import base64
import sys
import types
from pathlib import Path
from unittest import mock

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from agents import flood_media_agent  # noqa: E402
from agents.flood_types import ChatContext  # noqa: E402
from tests.test_flood_media import FRAME, person, water_detection  # noqa: E402
from video import object_search  # noqa: E402
from video.annotations import MAX_BOXES, box_entry, make_annotations, water_overlay  # noqa: E402
from video.flood_scene import Detection, build_report  # noqa: E402
from video.object_search import ObjectCount, ObjectReport  # noqa: E402
from video.sam_client import ImageInput  # noqa: E402


def unpack(water: dict) -> np.ndarray:
    """What the page does: base64 -> bits (highest bit first) -> rows x columns."""
    bits = np.unpackbits(np.frombuffer(base64.b64decode(water["cells"]), dtype=np.uint8))
    return bits[: water["rows"] * water["columns"]].reshape(water["rows"], water["columns"]).astype(bool)


def test_a_box_keeps_its_label_confidence_and_corners():
    assert box_entry("person", (10.04, 20, 30.26, 40), 0.87654) == {"label": "person", "confidence": 0.877, "box": [10.0, 20.0, 30.3, 40.0]}
    assert box_entry("car", (0, 0, 1, 1), None)["confidence"] is None


def test_the_water_grid_survives_packing():
    grid = np.zeros((5, 7), dtype=bool)
    grid[1:3, 2:6] = True
    assert (unpack(water_overlay(grid)) == grid).all()
    assert water_overlay(np.zeros((5, 7), dtype=bool)) is None  # no water, no overlay


def test_boxes_are_ranked_by_confidence_and_capped():
    boxes = [box_entry("person", (0, 0, 1, 1), index / 100) for index in range(MAX_BOXES + 10)]
    annotations = make_annotations((640, 480), boxes)
    assert (annotations["width"], annotations["height"]) == (640, 480)
    assert len(annotations["boxes"]) == MAX_BOXES
    assert annotations["boxes"][0]["confidence"] == (MAX_BOXES + 9) / 100
    assert make_annotations(None, boxes) is None  # without the picture's size nothing can be placed


def test_the_flood_check_sends_people_vehicle_boxes_and_the_water():
    vehicle = Detection("v", 0, (120, 60, 160, 90), 0.66)
    report = build_report("image", FRAME, [water_detection(0, 50, 200, 100)], [person(50, 40, 60, 75)], [vehicle])
    annotations = report.annotations
    assert (annotations["width"], annotations["height"]) == FRAME
    labels = [(entry["label"], entry["confidence"]) for entry in annotations["boxes"]]
    assert labels == [("person", 0.9), ("vehicle", 0.66)]
    water = unpack(annotations["water"])
    assert water[-1].all() and not water[0].any()  # the lower half of the picture is water, the top is not
    assert report.to_dict()["annotations"] == annotations  # kept in the cached report too


def test_a_cached_report_from_before_still_loads():
    old = build_report("image", FRAME, [], [], []).to_dict()
    old.pop("annotations")
    assert flood_media_agent.FloodSceneReport(**old).annotations is None


def test_the_photo_answer_carries_the_annotations():
    report = build_report("image", FRAME, [water_detection(0, 50, 200, 100)], [person(50, 40, 60, 75)], [])
    with mock.patch.object(flood_media_agent, "measure_flood_media", return_value=report):
        reply = flood_media_agent.answer_flood_media_question(ImageInput(data=b"x"), ChatContext(), api_key="key")
    assert reply.annotations == report.annotations


def test_an_object_search_answer_carries_its_boxes():
    found = ObjectReport([ObjectCount("dog", 1, 0.8, 1, 0, 0)], annotations={"width": 10, "height": 10, "boxes": [], "water": None})
    with mock.patch.object(flood_media_agent, "find_objects", return_value=found):
        reply = flood_media_agent.answer_flood_media_question(ImageInput(data=b"x"), ChatContext(), api_key="key", question="find the dog")
    assert reply.annotations == found.annotations


def test_find_objects_turns_every_counted_match_into_a_box():
    class FakeRecord:
        def __init__(self, kind, object_id, box, confidence):
            self.kind, self.object_id, self.confidence, self.frame, self.mask = kind, object_id, confidence, None, None
            self.left, self.top, self.right, self.bottom = box

    class FakeResult:
        raw_output = "box w=640;h=480"

        def __init__(self, records):
            self.records = records

    results = {
        "dog": FakeResult([FakeRecord("box", "1", (10, 10, 50, 50), 0.91), FakeRecord("box", "2", (60, 10, 90, 50), 0.1)]),
        "cat": FakeResult([FakeRecord("box", "3", (100, 100, 200, 200), 0.55)]),
    }

    class FakeSam:
        def __init__(self, api_key):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return None

        async def segment(self, concept, media):
            return results[concept]

    with mock.patch.object(object_search, "SamClient", FakeSam):
        report = object_search.find_objects(ImageInput(data=b"x"), ["dog", "cat"], "key")
    boxes = report.annotations["boxes"]
    assert [(entry["label"], entry["confidence"]) for entry in boxes] == [("dog", 0.91), ("cat", 0.55)]  # the 0.1 match is not counted
    assert (report.annotations["width"], report.annotations["height"]) == (640, 480)


def test_the_chat_endpoints_send_the_annotations_with_the_reply():
    import json

    from tests.test_api import FakeGraph, make_client

    annotations = {"width": 640, "height": 480, "boxes": [box_entry("person", (1, 2, 3, 4), 0.8)], "water": None}

    class GraphWithBoxes(FakeGraph):
        async def ainvoke(self, graph_input, config):
            result = await super().ainvoke(graph_input, config)
            return {**result, "annotations": annotations}

    with make_client(GraphWithBoxes(text="2 people")) as client:
        streamed = client.post("/chat/stream", json={"message": "how many people"})
        plain = client.post("/chat", json={"message": "how many people"})
    reply = [json.loads(line) for line in streamed.text.splitlines() if line.strip()][-1]
    assert reply["type"] == "reply" and reply["annotations"] == annotations
    assert plain.json()["annotations"] == annotations


def test_a_reply_without_a_photo_has_no_annotations():
    from tests.test_api import FakeGraph, make_client

    with make_client(FakeGraph(text="hotlines")) as client:
        assert client.post("/chat", json={"message": "hotline Pasig"}).json()["annotations"] is None
