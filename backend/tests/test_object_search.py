"""Tests for finding the objects a person names in a photo (SAM segmentation, like the SAM playground).

No SAM request is made: the search is replaced by a fake.

Run from the backend folder:  python -m unittest tests.test_object_search -v
"""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents import flood_media_agent
from agents.flood_types import ChatContext
from video import object_search
from video.object_search import ObjectCount, ObjectReport, format_object_report, object_query_concepts
from video.sam_client import ImageInput


class ConceptTests(unittest.TestCase):
    """Which messages are object requests, and which object names they give."""

    def test_lists_and_requests_give_the_object_names(self):
        cases = {
            "human, child, car": ["human", "child", "car"],
            "person, vehicle and boat": ["person", "vehicle", "boat"],
            "how many trees?": ["trees"],
            "How many people are in the water?": ["people"],
            "Find the dog": ["dog"],
            "is there a boat?": ["boat"],
            "where are the children": ["children"],
            "car": ["car"],
            "red car": ["red car"],
            "flood water": ["flood water"],
        }
        for message, names in cases.items():
            self.assertEqual(object_query_concepts(message), names, message)

    def test_filipino_names_are_put_in_english_for_sam(self):
        self.assertEqual(object_query_concepts("Ilan ang tao?"), ["person"])
        self.assertEqual(object_query_concepts("bahay at puno"), ["house", "tree"])
        self.assertEqual(object_query_concepts("hanapin ang mga aso"), ["dog"])

    def test_questions_are_not_object_requests(self):
        for message in ("Can a car pass here?", "What does the sign say?", "Hanggang saan ang baha?", "How deep is the water?",
                        "Is it safe?", "Describe the photo", "Ligtas bang lumusong dito?", "", None):
            self.assertEqual(object_query_concepts(message), [], message)

    def test_a_long_list_is_cut_to_keep_the_cost_small(self):
        self.assertEqual(len(object_query_concepts("a, b, c, d, e, f, g")), object_search.MAX_CONCEPTS)


class CountTests(unittest.TestCase):
    """Counting SAM's matches and saying where they are."""

    @staticmethod
    def sam_result(boxes, width=900):
        """A SAM answer with a box (left, right, confidence) per match, in a picture ``width`` pixels wide."""
        records = [
            SimpleNamespace(kind="box", object_id=str(index), frame=None, left=left, top=0, right=right, bottom=10, confidence=score)
            for index, (left, right, score) in enumerate(boxes)
        ]
        return SimpleNamespace(records=records, raw_output=f"<box w={width};h=600>")

    def test_matches_are_counted_by_third_of_the_picture_and_weak_ones_dropped(self):
        result = self.sam_result([(0, 100, 0.9), (400, 500, 0.8), (800, 900, 0.7), (850, 890, 0.1)])
        counted = object_search.count_detections("person", result)
        self.assertEqual((counted.count, counted.left, counted.middle, counted.right), (3, 1, 1, 1))
        self.assertEqual(counted.best_confidence, 0.9)

    def test_the_answer_has_one_line_per_name_and_says_when_none_was_found(self):
        report = ObjectReport(counts=[ObjectCount("person", 8, 0.79, 2, 5, 1), ObjectCount("child")])
        text = format_object_report(report)
        self.assertIn("- person: 8 (left 2, middle 5, right 1), up to 79% sure", text)
        self.assertIn("- child: none found", text)
        self.assertIn("SAM 3.1", text)


class AgentTests(unittest.TestCase):
    """The photo agent sends object requests to SAM and nowhere else."""

    def setUp(self):
        self.find = mock.patch.object(flood_media_agent, "find_objects", return_value=ObjectReport([ObjectCount("child", 2, 0.8, 0, 2, 0)])).start()
        self.flood_check = mock.patch.object(flood_media_agent, "analyze_flood_media").start()
        self.addCleanup(mock.patch.stopall)
        self.photo = ImageInput(data=b"picture")

    def ask(self, question):
        model = mock.Mock()
        reply = flood_media_agent.answer_flood_media_question(self.photo, ChatContext(), api_key="key", question=question, llm=model)
        return reply, model

    def test_an_object_request_goes_to_sam_with_each_name(self):
        reply, model = self.ask("human, child, car")
        self.find.assert_called_once_with(self.photo, ["human", "child", "car"], "key")
        self.flood_check.assert_not_called()
        model.invoke.assert_not_called()
        self.assertIn("child: 2", reply.text)

    def test_a_failed_search_gives_the_friendly_answer(self):
        self.find.side_effect = RuntimeError("SAM down")
        reply, _ = self.ask("how many trees?")
        self.assertEqual(reply.text, flood_media_agent.FAILED_ANSWER)


if __name__ == "__main__":
    unittest.main()
