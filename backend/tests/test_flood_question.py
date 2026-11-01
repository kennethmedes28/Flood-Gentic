"""Tests for free-form questions about a flood photo or video: SAM measures, a chat model answers the question.

No SAM request or model call is made: both are fakes.

Run from the backend folder:  python -m unittest tests.test_flood_question -v
"""

import asyncio
import subprocess
import sys
import tempfile
import types
import unittest
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))

from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langgraph.checkpoint.memory import MemorySaver
from PIL import Image

from agents import flood_media_agent
from agents.flood_media_agent import ANSWER_HEADING, answer_flood_media_question
from agents.flood_types import AgentReply, ChatContext
from langgraph_orchestrator import graph as chat_graph
from video import video_prepare
from video.flood_scene import FloodSceneReport
from video.sam_client import ImageInput, VideoInput

REPORT = FloodSceneReport("image", 1, 0.30, 0.30, 1.0, "widespread", 3, 2, 1, 1)


def photo_bytes(width=2000, height=1000) -> bytes:
    output = BytesIO()
    Image.new("RGB", (width, height), "blue").save(output, format="JPEG")
    return output.getvalue()


class RecordingModel:
    """Stands in for the chat model: records what it was sent and replies with a fixed answer (or fails)."""

    def __init__(self, answer="Yes, the water reaches the car wheels.", error=None):
        self.answer, self.error, self.sent = answer, error, []

    def invoke(self, messages):
        self.sent.append(messages)
        if self.error:
            raise self.error
        return SimpleNamespace(content=self.answer)

    def question_text(self):
        return self.sent[0][1].content[0]["text"]

    def pictures(self):
        return [part for part in self.sent[0][1].content if part["type"] == "image_url"]


class AgentTests(unittest.TestCase):
    def setUp(self):
        for patch in (
            mock.patch.object(flood_media_agent, "analyze_flood_media", return_value=REPORT),
            mock.patch.object(flood_media_agent.model_budget, "try_use", return_value=True),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        self.photo = ImageInput(data=photo_bytes())

    def ask(self, question, model, media=None):
        return answer_flood_media_question(media or self.photo, ChatContext(), api_key="key", question=question, llm=model)

    def test_a_question_is_answered_by_the_model_and_the_measurements_follow(self):
        model = RecordingModel()
        text = self.ask("Can a car pass here?", model).text
        self.assertTrue(text.startswith("Yes, the water reaches the car wheels."))
        self.assertIn(ANSWER_HEADING, text)
        self.assertIn("about 30%", text)  # the fixed report is still there
        self.assertIn("call 911", text)  # and so is the safety text

    def test_the_model_gets_the_question_the_measurements_the_picture_and_the_rules(self):
        model = RecordingModel()
        self.ask("Ilan ang tao?", model)
        self.assertIn("Ilan ang tao?", model.question_text())
        self.assertIn("about 30% of the picture", model.question_text())
        self.assertIn("People: 3 (2 in water)", model.question_text())
        self.assertEqual(len(model.pictures()), 1)
        self.assertTrue(model.pictures()[0]["image_url"]["url"].startswith("data:image/jpeg;base64,"))
        rules = model.sent[0][0].content
        self.assertIn("Never say that a road or an area is safe", rules)

    def test_when_counting_was_off_the_model_is_told_so_instead_of_none_found(self):
        model = RecordingModel()
        answer_flood_media_question(self.photo, ChatContext(), api_key="key", question="How many people?", llm=model,
                                    include_people_and_vehicles=False)
        self.assertIn("were not counted by this check", model.question_text())
        self.assertNotIn("People: 3", model.question_text())

    def test_a_large_photo_is_made_smaller_for_the_model(self):
        pictures = flood_media_agent.pictures_for_model(self.photo, None)
        with Image.open(BytesIO(pictures[0])) as picture:
            self.assertEqual(max(picture.size), flood_media_agent.ANSWER_PICTURE_WIDTH)

    def test_without_a_question_the_fixed_report_is_given_and_no_model_is_called(self):
        model = RecordingModel()
        text = self.ask(None, model).text
        self.assertEqual(model.sent, [])
        self.assertNotIn(ANSWER_HEADING, text)
        self.assertIn("about 30%", text)

    def test_a_failing_model_falls_back_to_the_fixed_report(self):
        text = self.ask("Can I walk here?", RecordingModel(error=TimeoutError("slow"))).text
        self.assertNotIn(ANSWER_HEADING, text)
        self.assertIn("about 30%", text)

    def test_an_empty_answer_falls_back_to_the_fixed_report(self):
        self.assertNotIn(ANSWER_HEADING, self.ask("Can I walk here?", RecordingModel(answer="  ")).text)

    def test_when_the_hourly_model_budget_is_used_up_no_model_is_called(self):
        model = RecordingModel()
        with mock.patch.object(flood_media_agent.model_budget, "try_use", return_value=False):
            text = self.ask("Can I walk here?", model).text
        self.assertEqual(model.sent, [])
        self.assertIn("about 30%", text)

    def test_a_video_is_shown_to_the_model_as_stills(self):
        model = RecordingModel()
        with mock.patch.object(flood_media_agent, "video_stills", return_value=[photo_bytes(64, 32)] * 3) as stills:
            self.ask("Is the water rising?", model, media=VideoInput(path="/uploads/clip.mp4"))
        stills.assert_called_once_with(Path("/uploads/clip.mp4"))
        self.assertEqual(len(model.pictures()), 3)

    def test_a_video_without_a_file_is_answered_from_the_measurements_alone(self):
        model = RecordingModel()
        self.ask("Is the water rising?", model, media=VideoInput(url="https://example.com/v.mp4"))
        self.assertEqual(model.pictures(), [])
        self.assertIn("no picture", model.question_text())


class GraphTests(unittest.TestCase):
    """The graph hands the person's own words to the agent, but not the default question used for a bare picture."""

    def run_graph(self, text):
        seen = {}

        def fake_agent(media, context, question=None, llm=None, **_other_options):
            seen["question"], seen["llm"] = question, llm
            return AgentReply(text="checked")

        model = FakeListChatModel(responses=["unused"])
        graph = chat_graph.build_graph(model, checkpointer=MemorySaver())
        with mock.patch.object(chat_graph, "answer_flood_media_question", fake_agent):
            asyncio.run(chat_graph.ask(graph, text, "thread-q", media={"kind": "image", "url": "https://example.com/a.jpg"}))
        return seen, model

    def test_the_persons_question_and_the_model_reach_the_agent(self):
        seen, model = self.run_graph("Can a jeepney pass?")
        self.assertEqual(seen["question"], "Can a jeepney pass?")
        self.assertIs(seen["llm"], model)

    def test_a_picture_sent_without_words_has_no_question(self):
        seen, _ = self.run_graph("")
        self.assertIsNone(seen["question"])


@unittest.skipIf(video_prepare.ffmpeg_path() is None, "the bundled ffmpeg is not installed")
class VideoStillTests(unittest.TestCase):
    def test_three_stills_are_taken_from_a_real_video(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        clip = Path(folder.name) / "clip.mp4"
        subprocess.run([video_prepare.ffmpeg_path(), "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=1280x720:rate=25",
                        "-pix_fmt", "yuv420p", str(clip)], check=True)
        stills = video_prepare.video_stills(clip)
        self.assertEqual(len(stills), 3)
        with Image.open(BytesIO(stills[0])) as still:
            self.assertEqual(still.size, (640, 360))

    def test_a_file_that_is_not_a_video_gives_no_stills(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        broken = Path(folder.name) / "broken.mp4"
        broken.write_bytes(b"not a video")
        self.assertEqual(video_prepare.video_stills(broken), [])


if __name__ == "__main__":
    unittest.main()
