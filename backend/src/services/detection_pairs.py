"""Pairs of example flood photos and their SAM-annotated copies, kept in the ``sam-detections`` folder.

The folder holds, for each kind of object (``human``, ``child``, ``car``):

    human_raw/humans2.jpg                  the photo as it was taken
    human_detected/humans-detected-2.png   the same photo with SAM's boxes and labels drawn on it

When someone uploads one of the raw photos in the chat, the assistant answers with its annotated copy instead of
running the paid SAM check. ``scripts/build_detection_pairs.py`` finds the pairs and writes ``pairs.json``;
this module reads that file and answers "is this upload one of the known photos?".

The upload is recognised by its file NAME without the extension (``humans2``), so a photo that was
saved again as ``.png`` or ``.jpeg`` still matches. Names are never turned into file paths directly: a name must be a key
in ``pairs.json``, and the file served is whatever that key maps to.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

# backend/src/services/detection_pairs.py -> the project root is three folders up from "services".
DETECTIONS_DIR = Path(__file__).resolve().parents[3] / "sam-detections"
PAIRS_FILE = DETECTIONS_DIR / "pairs.json"

# humans2.jpg, childs-2.jpg, cars1.jpg  ->  word "humans", number "2"
RAW_NAME = re.compile(r"^(?P<word>[a-z]+)-?(?P<number>\d+)\.(jpg|jpeg|png|webp)$", re.IGNORECASE)
# humans-detected-2.png  ->  word "humans", number "2"
DETECTED_NAME = re.compile(r"^(?P<word>[a-z]+)-detected-(?P<number>\d+)\.png$", re.IGNORECASE)

MAX_NAME_LENGTH = 200


def lookup_key(filename: str) -> str:
    """The name used to look a photo up: no folders, no extension, lower case. ``"C:\\x\\Humans2.JPG"`` becomes ``"humans2"``."""
    name = re.split(r"[\\/]", filename.strip())[-1]
    return name.rsplit(".", 1)[0].lower()


def _pair_key(word: str, number: str) -> tuple[str, int]:
    """What a raw file and its annotated copy have in common. ``int`` makes ``02`` and ``2`` the same number."""
    return word.lower(), int(number)


def build_pairs(folder: Path = DETECTIONS_DIR) -> tuple[dict[str, str], list[str]]:
    """Find the pairs in ``folder``.

    Returns ``(pairs, unpaired)``: ``pairs`` maps the lookup key of each raw photo to the path of its annotated
    copy relative to ``folder`` (for example ``{"humans2": "human_detected/humans-detected-2.png"}``);
    ``unpaired`` lists every file that has no partner, so a typo in a file name does not go unnoticed.
    """
    raw_files: dict[tuple[str, str, int], Path] = {}  # (kind folder, word, number) -> file
    detected_files: dict[tuple[str, str, int], Path] = {}

    for kind_folder in sorted(folder.glob("*_raw")):
        kind = kind_folder.name.removesuffix("_raw")
        for file in sorted(kind_folder.iterdir()):
            match = RAW_NAME.match(file.name)
            if match:
                raw_files[(kind, *_pair_key(match["word"], match["number"]))] = file
    for kind_folder in sorted(folder.glob("*_detected")):
        kind = kind_folder.name.removesuffix("_detected")
        for file in sorted(kind_folder.iterdir()):
            match = DETECTED_NAME.match(file.name)
            if match:
                detected_files[(kind, *_pair_key(match["word"], match["number"]))] = file

    pairs: dict[str, str] = {}
    for key, raw in raw_files.items():
        if key in detected_files:
            pairs[lookup_key(raw.name)] = detected_files[key].relative_to(folder).as_posix()

    unpaired = [file.relative_to(folder).as_posix() for key, file in raw_files.items() if key not in detected_files]
    unpaired += [file.relative_to(folder).as_posix() for key, file in detected_files.items() if key not in raw_files]
    return pairs, sorted(unpaired)


@lru_cache(maxsize=1)
def load_pairs() -> dict[str, str]:
    """The pairs from ``pairs.json``. An empty dict when the file is missing or unreadable, so uploads just go the normal way."""
    try:
        data = json.loads(PAIRS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(key): str(value) for key, value in data.items()}


def find_detected(filename: str | None) -> str | None:
    """The annotated copy (a path relative to ``sam-detections``) for an uploaded file name, or None when it is not a known photo."""
    if not filename or len(filename) > MAX_NAME_LENGTH:
        return None
    return load_pairs().get(lookup_key(filename))


def detected_file(relative_path: str) -> Path | None:
    """The file on disk for a path taken from ``pairs.json``, or None when ``relative_path`` is not one of the listed files."""
    if relative_path not in load_pairs().values():
        return None
    path = DETECTIONS_DIR / relative_path
    return path if path.is_file() else None
