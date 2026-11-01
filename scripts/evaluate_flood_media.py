"""Measure the flood water check against labelled photos, and pick the best way to "augment" SAM.

    uv run python ../scripts/evaluate_flood_media.py --dry-run        # how many SAM requests it would make
    uv run python ../scripts/evaluate_flood_media.py                  # ask SAM (once), then score every setting
    uv run python ../scripts/evaluate_flood_media.py --score-only     # score again from the saved answers, no requests

Run from backend/. The labelled photos are the "Flood Area Segmentation" set (290 flood photos, each with a hand-drawn
water mask). Put them in evaluation/flood_media/source/Data/raw/{images,masks}; that folder is not in git.

What it does:

    1. Takes a fixed random sample of the photos and makes each one 640 pixels wide, as the assistant page does.
    2. Asks SAM for water with every phrase in --concepts, on the photo and on its mirrored copy. Each answer is saved in
       evaluation/flood_media/cache, so it is never paid for twice; trying other settings later costs nothing.
    3. Scores every combination of: which phrases, mirrored copy or not, how many requests must agree (the vote),
       and the lowest SAM confidence kept. The score is the overlap with the hand-drawn mask (IoU), on the same
       192-column grid the app uses.
    4. Picks the best combination on one half of the photos ("tune") and reports it on the other half ("check"),
       so the number reported was not tuned on the photos it is measured on. Results go to
       evaluation/flood_media/results.json.

Note: most photos in this set are taken from the air (drones, helicopters), while people send street-level photos.
The ranking of the settings is still useful; the cut-offs for "some" and "widespread" water are NOT tuned here,
because the share of the picture covered by water depends a lot on the viewpoint.
"""

import argparse
import asyncio
import itertools
import json
import os
import pickle
import random
import re
import sys
from io import BytesIO
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from PIL import Image

REPO_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_DIR / "backend"))  # so `video` can be imported
load_dotenv(REPO_DIR / "backend" / ".env")

from video.flood_scene import (  # noqa: E402
    MIN_CONFIDENCE,
    WATER_CONCEPT,
    frame_size_from_output,
    grid_shape,
    mirror_back,
    to_detections,
    water_grid,
)
from video.sam_client import ImageInput, SamClient  # noqa: E402

EVALUATION_DIR = REPO_DIR / "evaluation" / "flood_media"
DEFAULT_DATA = EVALUATION_DIR / "source" / "Data" / "raw"
DEFAULT_CONCEPTS = ["flood water", "muddy water", "water", "flooded road"]
PHOTO_WIDTH = 640  # the assistant page sends photos at this width
CONFIDENCES = [0.3, 0.4, 0.5, 0.6, 0.7]


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score the flood water check against labelled photos.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="folder with images/ and masks/")
    parser.add_argument("--sample", type=int, default=60, help="how many photos to use (half to tune, half to check)")
    parser.add_argument("--seed", type=int, default=7, help="the same seed gives the same sample")
    parser.add_argument("--concepts", nargs="+", default=DEFAULT_CONCEPTS, help="water phrases to try")
    parser.add_argument("--concurrency", type=int, default=4, help="SAM requests at the same time")
    parser.add_argument("--dry-run", action="store_true", help="only say how many SAM requests are needed")
    parser.add_argument("--score-only", action="store_true", help="never ask SAM; use the saved answers")
    return parser.parse_args()


# ---------------------------------------------------------------- photos and labels


def sample_photos(data: Path, count: int, seed: int) -> list[Path]:
    """A fixed random sample of the photos that have a mask."""
    photos = sorted(p for p in (data / "images").iterdir() if (data / "masks" / f"{p.stem}.png").exists())
    random.Random(seed).shuffle(photos)
    return photos[:count]


def photo_as_sent(path: Path) -> bytes:
    """The photo as the assistant page sends it: at most PHOTO_WIDTH wide, JPEG."""
    with Image.open(path) as picture:
        picture = picture.convert("RGB")
        if picture.width > PHOTO_WIDTH:
            picture = picture.resize((PHOTO_WIDTH, round(picture.height * PHOTO_WIDTH / picture.width)))
        output = BytesIO()
        picture.save(output, format="JPEG", quality=80)
    return output.getvalue()


def mirrored(jpeg: bytes) -> bytes:
    with Image.open(BytesIO(jpeg)) as picture:
        output = BytesIO()
        picture.transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(output, format="JPEG", quality=92)
    return output.getvalue()


def label_grid(mask_path: Path, frame_size: tuple[int, int]) -> np.ndarray:
    """The hand-drawn water mask on the app's grid (True = water)."""
    rows, columns = grid_shape(frame_size)
    with Image.open(mask_path) as mask:
        small = mask.convert("L").resize((columns, rows), Image.Resampling.NEAREST)
    return np.array(small) > 127


# ---------------------------------------------------------------- asking SAM (cached)


def cache_path(photo: Path, concept: str, is_mirrored: bool) -> Path:
    slug = re.sub(r"[^a-z0-9]+", "-", concept.lower()).strip("-")
    return EVALUATION_DIR / "cache" / f"{photo.stem}__{slug}__{'mirrored' if is_mirrored else 'original'}.pkl"


def missing_requests(photos: list[Path], concepts: list[str]) -> list[tuple[Path, str, bool]]:
    return [
        (photo, concept, is_mirrored)
        for photo in photos
        for concept in concepts
        for is_mirrored in (False, True)
        if not cache_path(photo, concept, is_mirrored).exists()
    ]


async def ask_sam(requests: list[tuple[Path, str, bool]], api_key: str, concurrency: int) -> None:
    """Ask SAM for each missing answer and save it. Detections are kept down to confidence 0, so any cut-off can be tried."""
    limit = asyncio.Semaphore(concurrency)
    done = 0

    async def one(sam: SamClient, photo: Path, concept: str, is_mirrored: bool) -> None:
        nonlocal done
        jpeg = photo_as_sent(photo)
        async with limit:
            try:
                result = await sam.segment(concept, ImageInput(data=mirrored(jpeg) if is_mirrored else jpeg))
            except Exception as error:  # one failed request is reported and skipped; the rest go on
                print(f"  failed: {photo.name} / {concept} / mirrored={is_mirrored}: {type(error).__name__}")
                return
        frame_size = frame_size_from_output(result.raw_output)
        if frame_size is None:  # SAM found nothing: no box tokens, so no size either
            with Image.open(BytesIO(jpeg)) as picture:
                frame_size = picture.size
        detections = to_detections(result, min_confidence=0.0, variant=f"{concept}|mirrored" if is_mirrored else concept)
        if is_mirrored:
            detections = [mirror_back(detection, frame_size[0]) for detection in detections]
        path = cache_path(photo, concept, is_mirrored)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(pickle.dumps({"frame_size": frame_size, "detections": detections}))
        done += 1
        if done % 20 == 0:
            print(f"  {done} of {len(requests)} answers saved")

    async with SamClient(api_key) as sam:
        await asyncio.gather(*(one(sam, *request) for request in requests))


# ---------------------------------------------------------------- scoring


def load_answers(photos: list[Path], concepts: list[str]) -> dict[str, dict]:
    """Per photo: its frame size and the saved detections of every (phrase, mirrored) request."""
    answers = {}
    for photo in photos:
        saved = {}
        for concept in concepts:
            for is_mirrored in (False, True):
                path = cache_path(photo, concept, is_mirrored)
                if path.exists():
                    saved[(concept, is_mirrored)] = pickle.loads(path.read_bytes())
        if len(saved) == 2 * len(concepts):  # only photos with every answer, so all settings are compared fairly
            answers[photo.stem] = {"frame_size": saved[(concepts[0], False)]["frame_size"], "saved": saved}
    return answers


def score_photo(answer: dict, label: np.ndarray, concepts: tuple, mirror: bool, votes: int, confidence: float) -> dict:
    frame_size = answer["frame_size"]
    detections = []
    for concept in concepts:
        for is_mirrored in ((False, True) if mirror else (False,)):
            for detection in answer["saved"][(concept, is_mirrored)]["detections"]:
                if detection.confidence is None or detection.confidence >= confidence:
                    detections.append(detection)
    predicted = water_grid(detections, frame_size, votes)
    if predicted.shape != label.shape:  # SAM reported another size than the photo; compare on the label's grid
        predicted = np.array(Image.fromarray(predicted).resize(label.shape[::-1], Image.Resampling.NEAREST))
    both, either = np.logical_and(predicted, label).sum(), np.logical_or(predicted, label).sum()
    return {
        "iou": 1.0 if either == 0 else both / either,
        "precision": 1.0 if predicted.sum() == 0 else both / predicted.sum(),
        "recall": 1.0 if label.sum() == 0 else both / label.sum(),
        "coverage_error": abs(float(predicted.mean()) - float(label.mean())),
    }


def score_setting(answers: dict, labels: dict, names: list[str], setting: dict) -> dict:
    scores = [
        score_photo(answers[name], labels[name], setting["concepts"], setting["mirror"], setting["votes"], setting["confidence"])
        for name in names
    ]
    return {key: round(float(np.mean([s[key] for s in scores])), 4) for key in scores[0]}


def all_settings(concepts: list[str]) -> list[dict]:
    """Every combination of phrases, mirror, vote and confidence cut-off."""
    settings = []
    for size in range(1, len(concepts) + 1):
        for chosen in itertools.combinations(concepts, size):
            for mirror in (False, True):
                requests = len(chosen) * (2 if mirror else 1)
                for votes in range(1, requests + 1):
                    for confidence in CONFIDENCES:
                        settings.append({"concepts": chosen, "mirror": mirror, "votes": votes, "confidence": confidence,
                                         "requests_per_photo": requests})
    return settings


def describe(setting: dict) -> str:
    phrases = " + ".join(f'"{c}"' for c in setting["concepts"])
    mirror = ", mirrored" if setting["mirror"] else ""
    return f'{phrases}{mirror}, vote {setting["votes"]}, confidence {setting["confidence"]} ({setting["requests_per_photo"]} requests)'


def main() -> int:
    arguments = parse_arguments()
    if not (arguments.data / "images").is_dir():
        print(f"No labelled photos in {arguments.data}. See the top of this file.")
        return 1

    photos = sample_photos(arguments.data, arguments.sample, arguments.seed)
    missing = missing_requests(photos, arguments.concepts)
    print(f"{len(photos)} photos, {len(arguments.concepts)} phrases, original and mirrored: "
          f"{len(photos) * len(arguments.concepts) * 2} answers needed, {len(missing)} not saved yet.")
    if arguments.dry_run:
        return 0
    if missing and not arguments.score_only:
        api_key = os.getenv("MUSE_API")
        if not api_key:
            print("MUSE_API is not set (backend/.env).")
            return 1
        print(f"Asking SAM for {len(missing)} answers ...")
        asyncio.run(ask_sam(missing, api_key, arguments.concurrency))

    answers = load_answers(photos, arguments.concepts)
    if len(answers) < 4:
        print("Too few photos with every answer to score.")
        return 1
    labels = {name: label_grid(arguments.data / "masks" / f"{name}.png", answer["frame_size"]) for name, answer in answers.items()}

    # Half of the photos choose the setting, the other half check it.
    names = sorted(answers, key=lambda name: [p.stem for p in photos].index(name))
    tune, check = names[: len(names) // 2], names[len(names) // 2:]

    baseline = {"concepts": (WATER_CONCEPT,), "mirror": False, "votes": 1, "confidence": MIN_CONFIDENCE, "requests_per_photo": 1}
    settings = all_settings(arguments.concepts)
    print(f"Scoring {len(settings)} settings on {len(tune)} photos ...")
    ranked = sorted(settings, key=lambda s: score_setting(answers, labels, tune, s)["iou"], reverse=True)

    # The best setting for each number of requests per photo, so cost and accuracy can be weighed.
    best_per_cost = {}
    for setting in ranked:
        best_per_cost.setdefault(setting["requests_per_photo"], setting)

    rows = []
    for name, setting in [("today's setting", baseline)] + [(f"best with {cost} request(s)", s) for cost, s in sorted(best_per_cost.items())]:
        rows.append({"name": name, "setting": describe(setting), **{k: v for k, v in setting.items()},
                     "tune": score_setting(answers, labels, tune, setting), "check": score_setting(answers, labels, check, setting)})

    print(f"\n{'':28} {'IoU tune':>9} {'IoU check':>10} {'precision':>10} {'recall':>8} {'coverage err':>13}")
    for row in rows:
        check_scores = row["check"]
        print(f"{row['name']:28} {row['tune']['iou']:>9.3f} {check_scores['iou']:>10.3f} {check_scores['precision']:>10.3f} "
              f"{check_scores['recall']:>8.3f} {check_scores['coverage_error']:>13.3f}")
        print(f"{'':28} {row['setting']}")

    results = {"photos": len(names), "tune_photos": tune, "check_photos": check, "concepts_tried": arguments.concepts,
               "rows": [{**row, "concepts": list(row["concepts"])} for row in rows]}
    output = EVALUATION_DIR / "results.json"
    output.write_text(json.dumps(results, indent=2))
    print(f"\nSaved to {output.relative_to(REPO_DIR)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
