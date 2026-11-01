"""Tests for shrinking a video before SAM reads it. A tiny real video is made with the bundled ffmpeg: no SAM request.

Run from the backend folder:  python -m unittest tests.test_video_prepare -v
"""

import asyncio
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from video import flood_scene, video_prepare
from video.sam_client import VideoInput


def make_test_video(path: Path, width: int = 960, height: int = 540, seconds: int = 2, fps: int = 25) -> None:
    """A real video of moving colour bars, made with the same ffmpeg the app uses."""
    subprocess.run(
        [video_prepare.ffmpeg_path(), "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", f"testsrc=duration={seconds}:size={width}x{height}:rate={fps}", "-pix_fmt", "yuv420p", str(path)],
        check=True,
    )


def video_facts(path: Path) -> tuple[int, int, float]:
    """(width, height, frames per second) read from ffmpeg's description of the file."""
    import re

    text = subprocess.run([video_prepare.ffmpeg_path(), "-i", str(path)], capture_output=True, text=True).stderr
    width, height = map(int, re.search(r"(\d{2,5})x(\d{2,5})", text.split("Video:")[1]).groups())
    fps = float(re.search(r"([\d.]+) fps", text).group(1))
    return width, height, fps


@unittest.skipIf(video_prepare.ffmpeg_path() is None, "the bundled ffmpeg is not installed")
class ShrinkVideoTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.original = Path(self.folder.name) / "clip.mp4"
        make_test_video(self.original)

    def test_the_copy_is_narrower_and_has_fewer_frames_per_second(self):
        small = video_prepare.shrink_video(self.original)
        self.assertNotEqual(small, self.original)
        width, height, fps = video_facts(small)
        self.assertEqual(width, video_prepare.TARGET_WIDTH)
        self.assertEqual(height, 270)  # the 16:9 shape is kept
        self.assertEqual(fps, video_prepare.TARGET_FPS)

    def test_the_original_is_left_alone(self):
        before = self.original.read_bytes()
        video_prepare.shrink_video(self.original)
        self.assertEqual(self.original.read_bytes(), before)

    def test_a_video_already_small_is_not_made_larger(self):
        tiny = Path(self.folder.name) / "tiny.mp4"
        make_test_video(tiny, width=320, height=180)
        self.assertEqual(video_facts(video_prepare.shrink_video(tiny))[0], 320)

    def test_a_file_that_is_not_a_video_gives_back_the_original_path(self):
        broken = Path(self.folder.name) / "broken.mp4"
        broken.write_bytes(b"not a video at all" * 10)
        self.assertEqual(video_prepare.shrink_video(broken), broken)
        self.assertEqual(list(Path(self.folder.name).glob("*.small.mp4")), [])  # no half-written copy is left

    def test_without_ffmpeg_the_original_path_is_used(self):
        with mock.patch.object(video_prepare, "ffmpeg_path", return_value=None):
            self.assertEqual(video_prepare.shrink_video(self.original), self.original)


@unittest.skipIf(video_prepare.ffmpeg_path() is None, "the bundled ffmpeg is not installed")
class AnalysisUsesTheSmallCopyTests(unittest.TestCase):
    def test_sam_gets_the_small_copy_and_it_is_removed_afterwards(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        original = Path(folder.name) / "clip.mp4"
        make_test_video(original)
        uploaded: list[Path] = []

        class FakeSam:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc_info):
                return None

            async def upload_video(self, path):
                uploaded.append(Path(path))
                return "file-1"

            async def segment(self, concept, media):
                raise RuntimeError("stop here: only the upload is being checked")

        with mock.patch.object(flood_scene, "SamClient", return_value=FakeSam()):
            with self.assertRaises(RuntimeError):
                asyncio.run(flood_scene.analyze_flood_media_async(VideoInput(path=original), "key", include_people_and_vehicles=False))

        self.assertEqual(len(uploaded), 1)
        self.assertTrue(uploaded[0].name.endswith(".small.mp4"))  # the shrunk copy went to SAM, not the original
        self.assertFalse(uploaded[0].exists())  # and it is gone, even though the analysis failed
        self.assertTrue(original.exists())  # the original is the caller's to remove


if __name__ == "__main__":
    unittest.main()
