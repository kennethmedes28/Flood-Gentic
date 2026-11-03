"""Find the objects a person names in a photo, the way the SAM playground does.

A message such as "human, child, car", "how many trees?" or "ilan ang tao?" is turned into short object names
("human", "child", "car"), and each name is sent to SAM 3.1 as its own request (SAM looks for one phrase per request),
all at the same time. The answer says how many of each were found and where in the picture.

    concepts = object_query_concepts("Find the cars and people")   # ["car", "people"] -> see below for the rules
    report = find_objects(ImageInput(path="street.jpg"), concepts, api_key)
    print(format_object_report(report))

This is plain segmentation: it does not judge flooding. The flood check is in ``video/flood_scene.py``.
"""

import asyncio
import re
import threading
from dataclasses import dataclass, field

from video.flood_scene import frame_size_from_output, to_detections
from video.sam_client import ImageInput, SamClient

MAX_CONCEPTS = 5  # one SAM request per name; a longer list is cut to keep the cost and the wait small
MAX_WORDS_PER_CONCEPT = 4  # longer pieces are sentences, not object names
MIN_CONFIDENCE = 0.3  # matches SAM is less sure about are not counted

# Words that start an object request. The longest are checked first, so "how many" wins over "how".
REQUEST_STARTS = sorted(
    [
        "how many", "count the", "count", "find the", "find all", "find", "detect", "segment", "show me the", "show me",
        "show", "locate", "highlight", "where are the", "where are", "where is the", "where is", "are there any",
        "are there", "is there a", "is there an", "is there any", "is there",
        "ilan ang mga", "ilan ang", "ilang", "hanapin ang mga", "hanapin ang", "hanapin", "nasaan ang mga", "nasaan ang",
        "meron bang", "mayroon bang", "may mga",
    ],
    key=len,
    reverse=True,
)

# Where an object name ends inside a longer request: "how many people are in the water" keeps "people".
NAME_ENDS = (" are ", " is ", " in ", " on ", " near ", " inside ", " sa ", " na ", " dito", " doon")

# Words at the end of a request that are not part of the object name.
TRAILING_WORDS = (
    "in the picture", "in this picture", "in the photo", "in this photo", "in the image", "in this image",
    "here", "there", "sa larawan", "sa litrato", "dito", "ba", "po",
)

# Words that make a short message a question rather than a list of objects ("is it deep?" is not an object).
QUESTION_WORDS = {
    "what", "why", "how", "can", "could", "should", "would", "is", "are", "do", "does", "did", "will", "when", "who",
    "which", "describe", "read", "say", "says", "safe", "deep",
    "saan", "hanggang", "gaano", "paano", "ano", "anong", "bakit", "sino", "kailan", "pwede", "puwede", "kaya", "ligtas",
    "malalim",
}

# Small words dropped from the start of each name.
LEADING_WORDS = ("the ", "a ", "an ", "any ", "some ", "all ", "mga ", "ang ", "ng ", "isang ")

# SAM understands English names; common Filipino ones are translated first.
FILIPINO_NAMES = {
    "tao": "person", "bata": "child", "sasakyan": "vehicle", "kotse": "car", "bahay": "house", "puno": "tree",
    "aso": "dog", "pusa": "cat", "motor": "motorcycle", "bangka": "boat", "tubig": "water", "baha": "flood water",
    "jeep": "jeepney", "trak": "truck", "bisikleta": "bicycle", "payong": "umbrella", "basura": "trash",
    "poste": "pole", "kawad": "wire", "kalsada": "road", "babae": "woman", "lalaki": "man", "matanda": "elderly person",
}

# Separators between names: commas, "and", Filipino "at" (and), "or", "o" (or), slashes.
SEPARATORS = re.compile(r"\s*(?:,|;|/|&|\band\b|\bat\b|\bor\b|\bo\b)\s*")

LEFT_EDGE, RIGHT_EDGE = 1 / 3, 2 / 3  # where "left", "middle" and "right" of the picture meet


@dataclass
class ObjectCount:
    """What SAM found for one name."""

    concept: str
    count: int = 0
    best_confidence: float | None = None
    left: int = 0
    middle: int = 0
    right: int = 0


@dataclass
class ObjectReport:
    """What SAM found for every name, in the order they were asked."""

    counts: list[ObjectCount] = field(default_factory=list)


# --- Reading the request ------------------------------------------------------


def clean_name(piece: str) -> str:
    """One object name without small words in front, and in English when it is a common Filipino word."""
    name = piece.strip(" .?!").lower()
    changed = True
    while changed:  # "the mga ..." style repeats are rare, but cheap to handle
        changed = False
        for word in LEADING_WORDS:
            if name.startswith(word):
                name = name[len(word):].strip()
                changed = True
    return FILIPINO_NAMES.get(name, name)


def object_query_concepts(text: str | None) -> list[str]:
    """The object names in a message, or an empty list when the message is a question rather than an object request.

    It is an object request when it starts with words such as "how many", "find" or "ilan ang", when it is a list
    ("human, child, car"), or when it is one to three words with no question word ("dog", "red car").
    """
    if not text or not text.strip():
        return []
    request = text.strip().lower().strip(" ?!.")

    started_with_request = False
    for start in REQUEST_STARTS:
        if request == start or request.startswith(start + " "):
            request = request[len(start):].strip()
            started_with_request = True
            break
    if started_with_request:
        # "people are in the water" -> "people": the name ends where the rest of the sentence starts.
        for end in NAME_ENDS:
            position = request.find(end)
            if position > 0:
                request = request[:position]
    for word in TRAILING_WORDS:
        if request.endswith(" " + word):
            request = request[: -len(word) - 1].strip()

    pieces = [piece for piece in SEPARATORS.split(request) if piece and piece.strip()]
    is_list = len(pieces) > 1
    if not started_with_request and not is_list:
        words = request.split()
        if len(words) > 3 or any(word in QUESTION_WORDS for word in words):
            return []

    names = []
    for piece in pieces:
        name = clean_name(piece)
        words = name.split()
        if not words or len(words) > MAX_WORDS_PER_CONCEPT or any(word in QUESTION_WORDS for word in words):
            continue
        if name not in names:
            names.append(name)
    return names[:MAX_CONCEPTS]


# --- Asking SAM -----------------------------------------------------------------


def count_detections(concept: str, result, min_confidence: float = MIN_CONFIDENCE) -> ObjectCount:
    """How many matches of one name SAM returned, and in which third of the picture each one is."""
    found = to_detections(result, min_confidence=min_confidence)
    counted = ObjectCount(concept=concept, count=len(found))
    if not found:
        return counted

    scores = [detection.confidence for detection in found if detection.confidence is not None]
    counted.best_confidence = max(scores) if scores else None

    frame_size = frame_size_from_output(result.raw_output)
    if frame_size is None:
        return counted
    width = frame_size[0]
    for detection in found:
        left, _, right, _ = detection.box
        centre = (left + right) / 2 / width
        if centre < LEFT_EDGE:
            counted.left += 1
        elif centre > RIGHT_EDGE:
            counted.right += 1
        else:
            counted.middle += 1
    return counted


async def find_objects_async(media: ImageInput, concepts: list[str], api_key: str) -> ObjectReport:
    """Ask SAM for every name at the same time (one request each) and count what it found."""
    async with SamClient(api_key) as sam:
        results = await asyncio.gather(*(sam.segment(concept, media) for concept in concepts))
    return ObjectReport(counts=[count_detections(concept, result) for concept, result in zip(concepts, results)])


def find_objects(media: ImageInput, concepts: list[str], api_key: str) -> ObjectReport:
    """Blocking version of ``find_objects_async`` for the (synchronous) agents."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(find_objects_async(media, concepts, api_key))

    # Already inside an event loop (for example an async server): run in a helper thread instead.
    outcome = {}

    def work() -> None:
        try:
            outcome["report"] = asyncio.run(find_objects_async(media, concepts, api_key))
        except BaseException as error:  # handed back to the caller below
            outcome["error"] = error

    thread = threading.Thread(target=work)
    thread.start()
    thread.join()
    if "error" in outcome:
        raise outcome["error"]
    return outcome["report"]


# --- Writing the answer ---------------------------------------------------------

REPORT_HEADING = "Found in your photo (Nakita sa larawan mo):"
REPORT_FOOTER = (
    "Found by Meta's SAM 3.1 segmentation. It can miss small or hidden objects, or mistake one thing for another.\n"
    "Natagpuan ng SAM 3.1 segmentation ng Meta. Maaaring may hindi nito makita o mapagkamalan."
)


def describe_count(counted: ObjectCount) -> str:
    """One line of the answer, for example "- person: 8 (left 2, middle 5, right 1), up to 79% sure"."""
    if counted.count == 0:
        return f"- {counted.concept}: none found (walang nakita)"
    places = [f"{name} {number}" for name, number in (("left", counted.left), ("middle", counted.middle), ("right", counted.right)) if number]
    line = f"- {counted.concept}: {counted.count}"
    if places:
        line += f" ({', '.join(places)})"
    if counted.best_confidence is not None:
        line += f", up to {round(counted.best_confidence * 100)}% sure"
    return line


def format_object_report(report: ObjectReport) -> str:
    """The answer the person reads: one line per name, then where the result comes from."""
    lines = [REPORT_HEADING, *(describe_count(counted) for counted in report.counts), "", REPORT_FOOTER]
    return "\n".join(lines)
