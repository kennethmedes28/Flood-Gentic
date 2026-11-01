"""Tests for "augmented" SAM: several water phrases, a mirrored photo, and the vote that combines them.

No SAM request is made: a fake client answers.

Run from the backend folder:  python -m unittest tests.test_flood_augment -v
"""

import asyncio
import sys
import unittest
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from video import flood_scene
from video.flood_scene import Detection, build_report, mirror_back, mirrored_photo, water_grid
from video.sam_client import ImageInput, VideoInput

FRAME = (200, 100)  # width, height


def water(left, top, right, bottom, variant="", raster=None, mask_size=None):
    """A water detection whose mask fills its box (or the given raster)."""
    rows, columns = mask_size or (int(bottom - top), int(right - left))
    return Detection("w", 0, (left, top, right, bottom), 0.9, raster or bytes([1]) * (rows * columns), (rows, columns), variant)


def photo_bytes(width=200, height=100, orientation=None) -> bytes:
    picture = Image.new("RGB", (width, height), "white")
    for x in range(width // 2):  # the left half is dark, so a mirror can be seen
        for y in range(height):
            picture.putpixel((x, y), (0, 0, 0))
    output = BytesIO()
    if orientation:
        exif = Image.Exif()
        exif[0x0112] = orientation
        picture.save(output, format="JPEG", exif=exif)
    else:
        picture.save(output, format="JPEG")
    return output.getvalue()


class MirrorTests(unittest.TestCase):
    def test_a_box_is_mirrored_back_to_its_side(self):
        found_on_mirrored = water(0, 10, 50, 60)  # left edge of the mirrored photo = right edge of the original
        back = mirror_back(found_on_mirrored, frame_width=200)
        self.assertEqual(back.box, (150, 10, 200, 60))

    def test_the_mask_is_mirrored_too(self):
        # a 1x4 mask "1 0 0 0" becomes "0 0 0 1"
        detection = water(0, 0, 4, 1, raster=bytes([1, 0, 0, 0]), mask_size=(1, 4))
        self.assertEqual(mirror_back(detection, frame_width=4).raster, bytes([0, 0, 0, 1]))

    def test_mirroring_twice_gives_the_original(self):
        detection = water(20, 5, 90, 40, raster=bytes(range(2)) * (35 * 35), mask_size=(35, 70))
        twice = mirror_back(mirror_back(detection, 200), 200)
        self.assertEqual((twice.box, twice.raster), (detection.box, detection.raster))

    def test_the_mirrored_photo_has_its_dark_half_on_the_other_side(self):
        mirrored = mirrored_photo(ImageInput(data=photo_bytes()))
        with Image.open(BytesIO(mirrored.data)) as picture:
            self.assertGreater(sum(picture.getpixel((10, 50))), 600)  # left side is now white
            self.assertLess(sum(picture.getpixel((190, 50))), 100)  # right side is now dark

    def test_a_photo_with_an_exif_rotation_is_not_mirrored(self):
        self.assertIsNone(mirrored_photo(ImageInput(data=photo_bytes(orientation=6))))


class VoteTests(unittest.TestCase):
    def setUp(self):
        # Two requests: one finds the left half, the other the left three quarters.
        self.left_half = water(0, 0, 100, 100, variant="flood water")
        self.left_three_quarters = water(0, 0, 150, 100, variant="muddy water")

    def test_one_vote_takes_everything_any_request_found(self):
        grid = water_grid([self.left_half, self.left_three_quarters], FRAME, votes_needed=1)
        self.assertAlmostEqual(grid.mean(), 0.75, places=2)

    def test_two_votes_keep_only_what_both_found(self):
        grid = water_grid([self.left_half, self.left_three_quarters], FRAME, votes_needed=2)
        self.assertAlmostEqual(grid.mean(), 0.5, places=2)

    def test_two_masks_from_the_same_request_count_as_one_vote(self):
        a, b = water(0, 0, 100, 100, variant="flood water"), water(100, 0, 200, 100, variant="flood water")
        self.assertFalse(water_grid([a, b], FRAME, votes_needed=2).any())

    def test_the_report_uses_the_vote(self):
        report = build_report("image", FRAME, [self.left_half, self.left_three_quarters], [], [], water_votes_needed=2)
        self.assertAlmostEqual(report.water_coverage, 0.5, places=2)

    def test_one_request_gives_the_same_result_as_before(self):
        report = build_report("image", FRAME, [self.left_half], [], [])
        self.assertAlmostEqual(report.water_coverage, 0.5, places=2)


class WeakMatchTests(unittest.TestCase):
    def test_a_video_whose_matches_were_all_too_weak_gives_no_water_instead_of_an_error(self):
        report = build_report("video", FRAME, [], [], [])
        self.assertEqual((report.level, report.frames_checked, report.water_coverage), ("none", 1, 0.0))


class FakeSam:
    """Answers every request with one water box on the left quarter, and records what was asked."""

    asked: list = []

    def __init__(self, api_key):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return None

    async def segment(self, concept, media):
        FakeSam.asked.append((concept, media))
        return SimpleNamespace(raw_output="w=200;h=100", records=[])


class AnalysisRequestTests(unittest.TestCase):
    def setUp(self):
        FakeSam.asked = []
        patch = mock.patch.object(flood_scene, "SamClient", FakeSam)
        patch.start()
        self.addCleanup(patch.stop)

    def run_analysis(self, media, **options):
        return asyncio.run(flood_scene.analyze_flood_media_async(media, "key", include_people_and_vehicles=False, **options))

    def concepts_asked(self):
        return [concept for concept, _ in FakeSam.asked]

    def test_every_phrase_is_asked_once(self):
        self.run_analysis(ImageInput(data=photo_bytes()), water_concepts=("flood water", "muddy water"), mirror_photo=False)
        self.assertEqual(sorted(self.concepts_asked()), ["flood water", "muddy water"])

    def test_mirroring_asks_every_phrase_again_on_the_mirrored_photo(self):
        original = ImageInput(data=photo_bytes())
        self.run_analysis(original, water_concepts=("flood water",), mirror_photo=True)
        media = [media for _, media in FakeSam.asked]
        self.assertEqual(len(media), 2)
        self.assertIn(original, media)
        self.assertTrue(any(m is not original and m.data != original.data for m in media))

    def test_a_video_is_never_mirrored(self):
        self.run_analysis(VideoInput(file_id="f-1"), water_concepts=("flood water",), mirror_photo=True)
        self.assertEqual(self.concepts_asked(), ["flood water"])

    def test_people_and_vehicles_are_asked_only_on_the_original(self):
        original = ImageInput(data=photo_bytes())
        asyncio.run(flood_scene.analyze_flood_media_async(original, "key", water_concepts=("flood water",), mirror_photo=True))
        self.assertEqual([m for c, m in FakeSam.asked if c in ("person", "vehicle")], [original, original])

    def test_the_defaults_are_used_when_nothing_is_given(self):
        with mock.patch.object(flood_scene, "WATER_CONCEPTS", ("a", "b", "c")), mock.patch.object(flood_scene, "MIRROR_PHOTOS", False):
            self.run_analysis(ImageInput(data=photo_bytes()))
        self.assertEqual(sorted(self.concepts_asked()), ["a", "b", "c"])


class WebcamCostTests(unittest.TestCase):
    def test_the_webcam_keeps_to_one_water_request_per_frame(self):
        from video import camera_router

        self.assertEqual(camera_router.WEBCAM_ANALYZE.keywords, {"water_concepts": ("flood water",), "mirror_photo": False})

    def test_the_chat_check_uses_the_measured_settings(self):
        self.assertEqual(flood_scene.WATER_CONCEPTS, ("flood water", "muddy water"))
        self.assertTrue(flood_scene.MIRROR_PHOTOS)
        self.assertEqual(flood_scene.WATER_VOTES_NEEDED, 1)


if __name__ == "__main__":
    unittest.main()
