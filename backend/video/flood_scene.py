"""Turn SAM 3.1 detections into a short flood summary of a photo or video.

Three things are looked for, one SAM request per phrase (SAM takes one phrase per request):

    * water          - how much of the picture is covered, and in how many frames
    * "person"       - how many people, and how many stand in the water
    * "vehicle"      - how many vehicles, and how many sit in the water

Water is found with "augmented" SAM: no training, but several requests whose masks are combined.

    * Several phrases (``WATER_CONCEPTS``): SAM finds different parts of the water depending on the words
      ("flood water" misses some muddy or still water that "muddy water" finds).
    * A mirrored copy of a photo (``MIRROR_PHOTOS``): SAM is asked again on the left-right mirrored picture and the
      masks are mirrored back, which fills gaps that one view misses.
    * A vote (``WATER_VOTES_NEEDED``): a spot counts as water when that many of the requests agree on it.

The settings were chosen by measuring them against labelled flood photos (``scripts/evaluate_flood_media.py``).
Every phrase is one paid SAM request, and mirroring doubles them for photos; the requests run at the same time,
so the wait hardly grows.

The result is a ``FloodSceneReport``. It is only what the camera shows: it cannot tell how DEEP the
water is or whether a road is safe, and a photo can be old or from somewhere else. Treat it as
unverified evidence, never as an official warning.

    report = analyze_flood_media(ImageInput(path="street.jpg"), api_key)
    report.level            # "none", "some" or "widespread"
    report.water_coverage   # share of the picture covered by water, 0 to 1
"""

import asyncio
import re
import threading
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path

import numpy as np
from meta_sam_parser import decode_mask_to_raster

from video.sam_client import ImageInput, SamClient, VideoInput
from video.video_prepare import shrink_video

WATER_CONCEPT = "flood water"
# The phrases water is asked for, and whether a photo is also checked mirrored (see the top of this file).
# Measured on 60 labelled flood photos (30 to choose, 30 to check; scripts/evaluate_flood_media.py), as the overlap (IoU)
# with the hand-drawn water: "flood water" alone 0.723; + "muddy water" 0.752; + the mirrored photo 0.764 (4 requests);
# all four phrases tried, mirrored, 0.765 (8 requests), so more requests stop paying off here. SAM is precise
# (about 97% of what it marks is water) but misses water; each extra request finds some of what the others missed,
# which is why the vote is 1 (any request that found it). The confidence cut-off made no difference between 0.3 and 0.5.
WATER_CONCEPTS: tuple[str, ...] = (WATER_CONCEPT, "muddy water")
MIRROR_PHOTOS = True
WATER_VOTES_NEEDED = 1  # a spot is water when at least this many of the water requests found it
PEOPLE_CONCEPT = "person"
VEHICLE_CONCEPT = "vehicle"

MIN_CONFIDENCE = 0.5  # matches SAM is less sure about are ignored

# Share of the picture covered by water (starting values, to be tuned on real photos).
SOME_WATER_FROM = 0.03
WIDESPREAD_WATER_FROM = 0.20

# An object counts as "in the water" when this much of the ground around its base is water.
# SAM leaves the object itself out of the water mask, so the area at its feet is checked, not its body.
IN_WATER_OVERLAP = 0.5
FEET_ABOVE_BASE = 0.1  # the checked strip starts this far (share of the box height) above the bottom edge...
FEET_BELOW_BASE = 0.3  # ...and ends this far below it
FEET_SIDE_MARGIN = 0.25  # ...and reaches this far (share of the box width) past each side

GRID_COLUMNS = 192  # water is drawn on a coarse grid (a few pixels per cell); fine enough for shares and overlaps

LEVEL_NONE = "none"
LEVEL_SOME = "some"
LEVEL_WIDESPREAD = "widespread"


@dataclass
class Detection:
    """One object SAM found in one frame (a photo is frame 0)."""

    object_id: str
    frame: int
    box: tuple[float, float, float, float]  # left, top, right, bottom in source pixels
    confidence: float | None
    raster: bytes | None = None  # mask pixels, row by row, 0 or 1; covers the box
    mask_size: tuple[int, int] | None = None  # (rows, columns) of ``raster``
    variant: str = ""  # which water request found it (phrase, and "mirrored" for the mirrored photo); used for the vote


@dataclass
class FloodSceneReport:
    """What the camera shows, in numbers."""

    media_kind: str  # "image" or "video"
    frames_checked: int  # 1 for a photo
    water_coverage: float  # typical share of the picture under water, 0 to 1 (median over frames with water)
    peak_water_coverage: float  # the highest share in any frame
    frames_with_water: float  # share of frames that show flood water (1.0 or 0.0 for a photo)
    level: str  # none / some / widespread
    people: int  # most people seen in one frame
    people_in_water: int
    vehicles: int
    vehicles_in_water: int
    notes: list[str] = field(default_factory=list)  # things a reader should know about this result
    # Rough water depth, only when asked for (photos only; see flood_depth.py). All None when not estimated.
    depth_cm: float | None = None
    depth_low_cm: float | None = None
    depth_high_cm: float | None = None
    depth_band: str | None = None
    depth_confidence: str | None = None
    depth_people_used: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


# --- Reading SAM's answer ----------------------------------------------------


def frame_size_from_output(raw_output: str) -> tuple[int, int] | None:
    """The (width, height) of the source frame, repeated in every box token as ``w=..;h=..``."""
    match = re.search(r"w=(\d+);h=(\d+)", raw_output)
    return (int(match.group(1)), int(match.group(2))) if match else None


def to_detections(result, min_confidence: float = MIN_CONFIDENCE, variant: str = "") -> list[Detection]:
    """Pair each box with its mask (same object and frame) and drop matches below ``min_confidence``."""
    masks = {}
    for record in result.records:
        if record.kind == "mask":
            masks[(record.object_id, _frame_index(record))] = record

    detections = []
    for record in result.records:
        if record.kind != "box":
            continue
        if record.confidence is not None and record.confidence < min_confidence:
            continue
        frame = _frame_index(record)
        detection = Detection(
            object_id=record.object_id,
            frame=frame,
            box=(record.left, record.top, record.right, record.bottom),
            confidence=record.confidence,
            variant=variant,
        )
        mask_record = masks.get((record.object_id, frame))
        if mask_record is not None:
            detection.raster = decode_mask_to_raster(mask_record.mask)
            detection.mask_size = (mask_record.mask.height, mask_record.mask.width)
        detections.append(detection)
    return detections


def _frame_index(record) -> int:
    return record.frame.frame_index if record.frame is not None else 0


def mirror_back(detection: Detection, frame_width: int) -> Detection:
    """A detection from the mirrored photo, turned back to the original's left and right."""
    left, top, right, bottom = detection.box
    raster = detection.raster
    if raster is not None and detection.mask_size is not None:
        rows, columns = detection.mask_size
        raster = np.frombuffer(raster, dtype=np.uint8).reshape(rows, columns)[:, ::-1].tobytes()
    return replace(detection, box=(frame_width - right, top, frame_width - left, bottom), raster=raster)


def mirrored_photo(photo: ImageInput) -> ImageInput | None:
    """The photo mirrored left to right, as JPEG bytes, or None when it cannot be mirrored safely.

    A photo with an EXIF rotation tag is skipped: SAM may turn the original by that tag while the mirrored copy
    (saved without it) would not be, and the two views would no longer line up.
    """
    from io import BytesIO

    from PIL import Image

    with Image.open(BytesIO(photo.read_bytes())) as picture:
        if picture.getexif().get(0x0112, 1) != 1:  # 0x0112 is the EXIF orientation tag
            return None
        mirrored = picture.convert("RGB").transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        output = BytesIO()
        mirrored.save(output, format="JPEG", quality=92)
    return ImageInput(data=output.getvalue(), mime_type="image/jpeg")


# --- Measuring ---------------------------------------------------------------


def grid_shape(frame_size: tuple[int, int]) -> tuple[int, int]:
    """(rows, columns) of the coarse grid for a frame of (width, height) pixels."""
    width, height = frame_size
    return max(1, round(GRID_COLUMNS * height / width)), GRID_COLUMNS


def paint_water(grid: np.ndarray, detection: Detection, frame_size: tuple[int, int]) -> None:
    """Mark the grid cells covered by one water mask (nearest-pixel sampling)."""
    if detection.raster is None or detection.mask_size is None:
        return
    rows, columns = grid.shape
    width, height = frame_size
    left, top, right, bottom = detection.box
    mask_rows, mask_columns = detection.mask_size
    mask = np.frombuffer(detection.raster, dtype=np.uint8).reshape(mask_rows, mask_columns)

    # Frame position of every grid cell centre, then the mask pixel under it.
    x = (np.arange(columns) + 0.5) * width / columns
    y = (np.arange(rows) + 0.5) * height / rows
    inside_x = (x >= left) & (x < right)
    inside_y = (y >= top) & (y < bottom)
    if not inside_x.any() or not inside_y.any():
        return
    mask_x = np.clip(((x[inside_x] - left) / (right - left) * mask_columns).astype(int), 0, mask_columns - 1)
    mask_y = np.clip(((y[inside_y] - top) / (bottom - top) * mask_rows).astype(int), 0, mask_rows - 1)
    covered = mask[np.ix_(mask_y, mask_x)] == 1
    grid[np.ix_(inside_y, inside_x)] |= covered


def share_in_water(grid: np.ndarray, box: tuple[float, float, float, float], frame_size: tuple[int, int]) -> float:
    """Share of the ground around an object's base (feet, wheels) that lies on water."""
    rows, columns = grid.shape
    width, height = frame_size
    left, top, right, bottom = box
    box_width, box_height = right - left, bottom - top

    x_start, x_end = left - FEET_SIDE_MARGIN * box_width, right + FEET_SIDE_MARGIN * box_width
    y_start, y_end = bottom - FEET_ABOVE_BASE * box_height, bottom + FEET_BELOW_BASE * box_height
    x0, x1 = int(x_start / width * columns), int(np.ceil(x_end / width * columns))
    y0, y1 = int(y_start / height * rows), int(np.ceil(y_end / height * rows))

    region = grid[max(y0, 0):min(max(y1, y0 + 1), rows), max(x0, 0):min(max(x1, x0 + 1), columns)]
    return float(region.mean()) if region.size else 0.0


def water_grid(detections: list[Detection], frame_size: tuple[int, int], votes_needed: int = 1) -> np.ndarray:
    """The water cells of one frame: a cell is water when at least ``votes_needed`` water requests found it."""
    by_variant: dict[str, np.ndarray] = {}
    for detection in detections:
        grid = by_variant.setdefault(detection.variant, np.zeros(grid_shape(frame_size), dtype=bool))
        paint_water(grid, detection, frame_size)
    if not by_variant:
        return np.zeros(grid_shape(frame_size), dtype=bool)
    votes = np.sum(list(by_variant.values()), axis=0)
    return votes >= votes_needed


def build_report(
    media_kind: str,
    frame_size: tuple[int, int] | None,
    water: list[Detection],
    people: list[Detection],
    vehicles: list[Detection],
    water_votes_needed: int = 1,
) -> FloodSceneReport:
    """Combine the detections of the three concepts into one report.

    ``water`` may hold the masks of several water requests (see ``WATER_CONCEPTS``); a spot counts as water when
    ``water_votes_needed`` of them found it.
    """
    notes = ["Automatic check of the picture only: road safety cannot be judged from it, and any water depth is a rough guess."]
    frames = sorted({d.frame for d in water + people + vehicles})
    if frame_size is None:  # SAM found nothing at all, so there is nothing to measure
        return FloodSceneReport(media_kind, 1, 0.0, 0.0, 0.0, LEVEL_NONE, 0, 0, 0, 0,
                                notes + ["No flood water, people or vehicles were found."])

    # A video where every match was too weak has no frames left; it still counts as one frame checked, with no water.
    frames_checked = max(frames) + 1 if media_kind == "video" and frames else 1
    coverage_by_frame, grids = {}, {}
    for frame in {d.frame for d in water}:
        grid = water_grid([d for d in water if d.frame == frame], frame_size, water_votes_needed)
        grids[frame] = grid
        coverage_by_frame[frame] = float(grid.mean())

    wet_coverages = [value for value in coverage_by_frame.values() if value > 0]
    water_coverage = float(np.median(wet_coverages)) if wet_coverages else 0.0
    peak_coverage = max(wet_coverages, default=0.0)
    frames_with_water = len(wet_coverages) / frames_checked

    def counts(objects: list[Detection]) -> tuple[int, int]:
        """Most objects seen in one frame, and the most of those standing in water."""
        most, most_in_water = 0, 0
        for frame in {d.frame for d in objects}:
            here = [d for d in objects if d.frame == frame]
            grid = grids.get(frame)
            in_water = 0 if grid is None else sum(
                share_in_water(grid, d.box, frame_size) >= IN_WATER_OVERLAP for d in here
            )
            most, most_in_water = max(most, len(here)), max(most_in_water, in_water)
        return most, most_in_water

    people_count, people_in_water = counts(people)
    vehicle_count, vehicles_in_water = counts(vehicles)

    level = LEVEL_NONE
    if water_coverage >= WIDESPREAD_WATER_FROM:
        level = LEVEL_WIDESPREAD
    elif water_coverage >= SOME_WATER_FROM:
        level = LEVEL_SOME
    if media_kind == "video":
        notes.append(f"{frames_checked} frames were checked; water appeared in {frames_with_water:.0%} of them.")

    return FloodSceneReport(media_kind, frames_checked, water_coverage, peak_coverage, frames_with_water,
                            level, people_count, people_in_water, vehicle_count, vehicles_in_water, notes)


# --- Running it ----------------------------------------------------------------


async def analyze_flood_media_async(
    media: ImageInput | VideoInput,
    api_key: str,
    include_people_and_vehicles: bool = True,
    estimate_depth: bool = False,
    water_concepts: tuple[str, ...] | None = None,
    mirror_photo: bool | None = None,
    water_votes_needed: int | None = None,
) -> FloodSceneReport:
    """Ask SAM for water, people and vehicles (all at the same time) and summarise what it found.

    Water is asked for with every phrase in ``water_concepts`` (default ``WATER_CONCEPTS``) and, for a photo, also on
    a mirrored copy when ``mirror_photo`` is on (default ``MIRROR_PHOTOS``); the masks are combined by a vote
    (``water_votes_needed``, default ``WATER_VOTES_NEEDED``). See the top of this file.

    With ``include_people_and_vehicles=False`` only the water is looked for, which is what a repeating webcam
    check uses to keep the cost down.

    ``estimate_depth=True`` (photos only) also runs the depth model and adds a rough water depth
    to the report. It needs people in the picture, so it always looks for them.
    """
    water_concepts = tuple(water_concepts or WATER_CONCEPTS)
    mirror_photo = MIRROR_PHOTOS if mirror_photo is None else mirror_photo
    water_votes_needed = WATER_VOTES_NEEDED if water_votes_needed is None else water_votes_needed
    estimate_depth = estimate_depth and isinstance(media, ImageInput)
    include_people_and_vehicles = include_people_and_vehicles or estimate_depth
    media_kind = "video" if isinstance(media, VideoInput) else "image"

    small_copy = None  # a shrunk copy of a video file (see video_prepare.py), removed when the answer is in
    try:
        async with SamClient(api_key) as sam:
            if isinstance(media, VideoInput) and media.path and not media.file_id:
                path = Path(media.path)
                small = await asyncio.to_thread(shrink_video, path)  # ffmpeg is blocking, so it runs in a thread
                small_copy = small if small != path else None
                media = VideoInput(file_id=await sam.upload_video(small))  # upload once, reuse for each concept

            # The water requests: every phrase on the media, and on the mirrored photo when that is on.
            water_jobs = [(concept, media, False) for concept in water_concepts]
            if mirror_photo and isinstance(media, ImageInput):
                mirrored = await asyncio.to_thread(mirrored_photo, media)
                if mirrored is not None:
                    water_jobs += [(concept, mirrored, True) for concept in water_concepts]
            other_concepts = [PEOPLE_CONCEPT, VEHICLE_CONCEPT] if include_people_and_vehicles else []

            results = await asyncio.gather(
                *(sam.segment(concept, job_media) for concept, job_media, _ in water_jobs),
                *(sam.segment(concept, media) for concept in other_concepts),
            )
    finally:
        if small_copy is not None:
            small_copy.unlink(missing_ok=True)

    sizes = [size for size in (frame_size_from_output(r.raw_output) for r in results) if size]
    frame_size = sizes[0] if sizes else None

    water: list[Detection] = []
    for (concept, _, is_mirrored), result in zip(water_jobs, results):
        found = to_detections(result, variant=f"{concept}|mirrored" if is_mirrored else concept)
        if is_mirrored and frame_size is not None:
            found = [mirror_back(detection, frame_size[0]) for detection in found]
        water += found
    others = [to_detections(result) for result in results[len(water_jobs):]]
    people, vehicles = (others + [[], []])[:2]

    report = build_report(media_kind, frame_size, water, people, vehicles, water_votes_needed)
    if estimate_depth and frame_size:
        await add_depth_estimate(report, media, water, people, frame_size)
    return report


async def add_depth_estimate(
    report: FloodSceneReport, media: ImageInput, water: list[Detection], people: list[Detection], frame_size: tuple[int, int]
) -> None:
    """Fill in the report's depth fields. A failure only adds a note; the rest of the report stays."""
    # Imported here: flood_depth needs this module's helpers, and the depth model is heavy to load.
    from video.depth_model import get_depth_estimator
    from video.flood_depth import estimate_flood_depth, exif_focal_mm_35

    if report.level == LEVEL_NONE:
        return
    try:
        image_bytes = await asyncio.to_thread(media.read_bytes)
        depth_map = await asyncio.to_thread(get_depth_estimator().estimate, image_bytes)  # blocking model work
        estimate = estimate_flood_depth(people, water, depth_map, frame_size, exif_focal_mm_35(image_bytes))
    except Exception as error:  # download, model or memory problems must not lose the detection result
        report.notes.append(f"Depth could not be estimated ({type(error).__name__}).")
        return

    if estimate is None:
        report.notes.append("Depth was not estimated: no person was clear enough standing in the water.")
        return
    report.depth_cm, report.depth_low_cm, report.depth_high_cm = estimate.depth_cm, estimate.low_cm, estimate.high_cm
    report.depth_band, report.depth_confidence, report.depth_people_used = estimate.band, estimate.confidence, estimate.people_used
    report.notes.extend(estimate.notes)


def analyze_flood_media(
    media: ImageInput | VideoInput, api_key: str, estimate_depth: bool = False, include_people_and_vehicles: bool = True
) -> FloodSceneReport:
    """Blocking version of ``analyze_flood_media_async`` for the (synchronous) agents.

    ``include_people_and_vehicles=False`` looks for water only (2 people-and-vehicle requests fewer).
    """
    options = {"estimate_depth": estimate_depth, "include_people_and_vehicles": include_people_and_vehicles}
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(analyze_flood_media_async(media, api_key, **options))

    # Already inside an event loop (for example an async server): run in a helper thread instead.
    outcome = {}

    def work() -> None:
        try:
            outcome["report"] = asyncio.run(analyze_flood_media_async(media, api_key, **options))
        except BaseException as error:  # handed back to the caller below
            outcome["error"] = error

    thread = threading.Thread(target=work)
    thread.start()
    thread.join()
    if "error" in outcome:
        raise outcome["error"]
    return outcome["report"]
