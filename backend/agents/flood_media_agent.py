"""Flood media agent: answers any question about a photo, and checks a photo of a street for flood water.

Four cases, checked in this order:

    1. A message that names objects ("human, child, car", "how many trees?", "find the dog", "ilan ang tao?") is a segmentation
       request, like the SAM playground: each name goes to SAM 3.1 as its own request and the answer says how many were found and
       where (see ``video/object_search.py`` and ``answer_object_search``). No flood check and no chat model.
    2. A photo with a question that is NOT about flooding ("what does the sign say?") goes straight to a chat model that can see
       pictures, with no paid SAM check (see ``answer_free_question``). Any question about the picture is welcome.
    3. A photo with a flood question ("can a car pass here?"): first SAM 3.1 (see ``video/``) measures flood water, people and
       vehicles, which is the grounded part of the answer; then the chat model answers the question from the picture and the
       measurements, and the measurements follow under ``ANSWER_HEADING``.
    4. A photo with no question, or no chat model available, gets the fixed bilingual flood report, with no model call.

The model's rules are in ``ANSWER_RULES``.

What it can and cannot say:

    * It reports how much of the picture is covered by water and how many people or vehicles stand in it.
    * It never says a road is safe and never gives a water depth. A picture can be old, edited or from
      another place, so the result is unverified evidence and never overrides PAGASA or NDRRMC.

Needs the ``MUSE_API`` environment variable (the same key as the chat models).

Example:
    reply = answer_flood_media_question(ImageInput(path="street.jpg"), ChatContext(location=place))
    print(reply.text)
"""

import base64
import hashlib
import logging
import os
import re
from io import BytesIO

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from agents.flood_types import AgentReply, ChatContext
from src.cache import get_cache
from video.flood_scene import LEVEL_NONE, LEVEL_SOME, FloodSceneReport, analyze_flood_media
from video.object_search import find_objects, format_object_report, object_query_concepts
from video.sam_client import ImageInput
from utils.call_budget import model_budget
from utils.tracing import traced_agent

logger = logging.getLogger(__name__)

NO_KEY_ANSWER = (
    "I cannot check pictures right now.\n"
    "Hindi ko ma-check ang mga larawan sa ngayon.\n"
    "If someone is in danger, call 911."
)
FAILED_ANSWER = (
    "I could not check that picture. Please try again, or describe what you see.\n"
    "Hindi ko ma-check ang larawan. Subukan ulit, o ilarawan ang nakikita mo.\n"
    "If someone is in danger, call 911."
)
SAFETY_TEXT = (
    "This is an automatic check of the picture only. It cannot tell whether a road is passable or how deep the water is, "
    "and the picture may be old. Do not walk or drive through flood water. If someone is in danger, call 911.\n"
    "Awtomatikong pagsusuri lang ito ng larawan. Hindi nito matutukoy kung madadaanan ang kalsada o gaano kalalim ang baha, "
    "at maaaring luma ang larawan. Huwag lumusong o magmaneho sa baha. Kung may nasa panganib, tumawag sa 911."
)


# The rules the chat model follows when it answers a question about a picture. Any question about the picture is welcome. The rules keep
# it to what can be seen, and away from the things a flood photo must never be used for (judging a road safe, a precise depth, a person's identity).
ANSWER_RULES = """You help people in Metro Manila with a photo they send. They can ask anything about the picture.
You get the picture and the person's question, and sometimes measurements from a separate automatic flood check.

Rules:
- Answer the question directly, in the same language the person used (English, Filipino or a mix), in at most 8 short sentences.
  Any question about the picture is welcome: what is in it, text or signs, counts, colours, objects, the weather or the surroundings.
- Only describe what can be seen. If the picture does not show what was asked, say so plainly instead of guessing.
- When measurements are given, they are from a separate automatic flood check. Use them for the share of water and the number of
  people and vehicles. If what you see disagrees with them, say both.
- If the picture shows flood water, never say that a road or an area is safe to walk, wade or drive through, and never encourage
  anyone to enter flood water. If asked, say that a picture cannot show how deep or fast the water is, and that they should not cross.
- Do not give a water depth in centimetres or metres; you may describe it relative to people or objects ("up to the knees
  of the people") and say it is a rough look, not a measurement.
- Do not identify real people or guess who they are, and do not read out licence plates, house numbers, ID cards or other personal details.
- You cannot tell where or when the picture was taken; do not claim to.
- If anyone in the picture looks in danger, start with: call 911 now.
- No lists or headings: plain sentences."""

# A question that mentions any of these is about flooding, so the automatic flood check (paid SAM requests) runs too. Any other question
# goes straight to the chat model with the picture. English and Filipino, matched as whole words or word starts.
FLOOD_QUESTION_WORDS = (
    "flood", "baha", "bumaha", "binaha", "water", "tubig", "deep", "lalim", "malalim", "tuhod", "baywang", "bewang", "hita", "dibdib", "ankle", "knee", "waist",
    "pass", "passable", "madaanan", "madadaanan", "daanan", "cross", "tawid", "tumawid", "drive", "magmaneho", "road", "kalsada", "street", "rain", "ulan",
    "walk", "wade", "lusong", "lumusong", "lakad", "maglakad", "travel", "biyahe", "swim", "lunod", "drown", "evacuat", "rescue", "safe", "ligtas", "people", "tao", "person", "car", "cars", "vehicle", "sasakyan", "jeep", "truck", "motor", "storm", "bagyo", "typhoon",
)
FREE_QUESTION_FOOTER = (
    "This answer comes from the picture only and may be wrong.\n"
    "Galing lang sa larawan ang sagot na ito at maaaring mali."
)
FREE_QUESTION_BUSY = (
    "I cannot look at pictures right now. Please try again in a little while.\n"
    "Hindi ko matingnan ang mga larawan ngayon. Subukan muli mamaya."
)


def is_flood_question(question: str) -> bool:
    """True when the question is about flooding, so the automatic flood check should run as well."""
    words = re.findall(r"[a-zñ]+", question.lower())
    return any(word.startswith(stem) if len(stem) >= 6 else word == stem for word in words for stem in FLOOD_QUESTION_WORDS)


# The longest side of a photo handed to the chat model: enough detail, and a small request.
ANSWER_PICTURE_WIDTH = 1024
ANSWER_HEADING = "Measured by the automatic check:"


SAM_CACHE_SECONDS = 24 * 60 * 60  # the same photo gives the same measurements; a day saves paid SAM requests on repeats


def measure_flood_media(media: ImageInput, api_key: str, include_people_and_vehicles: bool) -> FloodSceneReport:
    """The SAM measurements of the picture. A photo that was checked before is answered from the cache.

    Only the numbers are cached, under a hash of the photo's bytes: the photo itself is never stored.
    """
    cache = get_cache()
    key = None
    if cache.enabled:
        digest = hashlib.sha256(media.read_bytes()).hexdigest()
        key = f"sam:{digest}:{int(include_people_and_vehicles)}"
        found = cache.get_json(key)
        if found is not None:
            return FloodSceneReport(**found)

    report = analyze_flood_media(media, api_key, include_people_and_vehicles)
    if key is not None:
        cache.set_json(key, report.to_dict(), SAM_CACHE_SECONDS)
    return report


@traced_agent("flood_media_agent")
def answer_flood_media_question(
    media: ImageInput,
    context: ChatContext,
    api_key: str | None = None,
    include_people_and_vehicles: bool = True,
    question: str | None = None,
    llm: BaseChatModel | None = None,
) -> AgentReply:
    """Analyse a photo, and answer the person's question about it.

    ``question`` is what the person asked with the picture; leave it out (or None) when they only sent the picture,
    and the fixed report is given. With a question and a chat model (``llm``), the model answers it from the picture
    and the measurements, and the measurements follow under ``ANSWER_HEADING``.

    ``include_people_and_vehicles=False`` looks for water only. Water is asked for with two phrases, also on a mirrored
    copy of the photo (see ``WATER_CONCEPTS`` in ``video/flood_scene.py``): 4 SAM requests. Counting people and vehicles
    adds 2 more. A question adds one chat model call.
    """
    api_key = api_key or os.getenv("MUSE_API")
    if not api_key:
        return AgentReply(text=NO_KEY_ANSWER)

    # A message that names objects ("human, child, car", "how many trees?", "ilan ang tao?") is a segmentation request:
    # each name goes to SAM as its own request, the way the SAM playground works. No flood check and no chat model.
    concepts = object_query_concepts(question)
    if concepts:
        return answer_object_search(media, concepts, api_key)

    # Any question that is not about flooding goes straight to the chat model with the picture, with no paid SAM flood check.
    if question and question.strip() and llm is not None and not is_flood_question(question):
        return answer_free_question(media, question.strip(), llm)

    try:
        report = measure_flood_media(media, api_key, include_people_and_vehicles)
    except Exception as error:
        # SamError (a refused request, a limit), OSError (network problems, unreadable files) and ValueError are the usual
        # ones. The SAM stream library also wraps them in its own error type, so anything else is treated the same way:
        # the person gets the friendly "could not check" answer with the 911 line, not a bare error.
        logger.error("Flood media check failed: %s", error)
        return AgentReply(text=FAILED_ANSWER)

    fixed_report = format_report(report, context)
    if not question or not question.strip() or llm is None:
        return AgentReply(text=fixed_report)
    if not model_budget.try_use():  # hourly cap on model calls (see utils/call_budget.py): the measurements still answer
        return AgentReply(text=fixed_report)

    try:
        answer = answer_with_model(llm, question.strip(), pictures_for_model(media), report, include_people_and_vehicles)
    except Exception as error:  # the model failed or timed out: the measurements are still a useful answer
        logger.error("Answering the question about the picture failed: %s", error)
        return AgentReply(text=fixed_report)
    if not answer:
        return AgentReply(text=fixed_report)
    return AgentReply(text=f"{answer}\n\n{ANSWER_HEADING}\n{fixed_report}")


def answer_object_search(media: ImageInput, concepts: list[str], api_key: str) -> AgentReply:
    """Find each named object in the photo with SAM and say how many there are and where (one SAM request per name)."""
    try:
        report = find_objects(media, concepts, api_key)
    except Exception as error:  # a refused request, a limit, a network problem: the same friendly answer as the flood check
        logger.error("Object search failed for %s: %s", concepts, error)
        return AgentReply(text=FAILED_ANSWER)
    return AgentReply(text=format_object_report(report))


def answer_free_question(media: ImageInput, question: str, llm: BaseChatModel) -> AgentReply:
    """Answer any question about the picture from the picture alone (no flood measurements, one chat model call)."""
    if not model_budget.try_use():  # hourly cap on model calls (see utils/call_budget.py)
        return AgentReply(text=FREE_QUESTION_BUSY)
    try:
        answer = answer_with_model(llm, question, pictures_for_model(media), None)
    except Exception as error:
        logger.error("Answering the question about the picture failed: %s", error)
        return AgentReply(text=FAILED_ANSWER)
    if not answer:
        return AgentReply(text=FAILED_ANSWER)
    return AgentReply(text=f"{answer}\n\n{FREE_QUESTION_FOOTER}")


def pictures_for_model(media: ImageInput) -> list[bytes]:
    """The JPEG pictures the chat model looks at: the photo, made smaller."""
    from PIL import Image

    with Image.open(BytesIO(media.read_bytes())) as picture:
        picture = picture.convert("RGB")
        if max(picture.size) > ANSWER_PICTURE_WIDTH:
            picture.thumbnail((ANSWER_PICTURE_WIDTH, ANSWER_PICTURE_WIDTH))
        output = BytesIO()
        picture.save(output, format="JPEG", quality=85)
    return [output.getvalue()]


def describe_measurements(report: FloodSceneReport, counted: bool = True) -> str:
    """The automatic check's numbers, in plain words for the chat model.

    ``counted`` says whether people and vehicles were looked for at all, so "not counted" is never read as "none there".
    """
    lines = [
        f"Flood water level: {report.level} (about {report.water_coverage:.0%} of the picture).",
    ]
    if not counted:
        lines.append("People and vehicles were not counted by this check (it was not asked to); count them yourself from the picture if asked.")
    else:
        lines.append(f"People: {report.people} ({report.people_in_water} in water). Vehicles: {report.vehicles} ({report.vehicles_in_water} in water).")
    lines.append("No depth estimate.")
    return "\n".join(lines)


def answer_with_model(
    llm: BaseChatModel, question: str, pictures: list[bytes], report: FloodSceneReport | None, counted: bool = True
) -> str:
    """Ask the chat model the person's question, with the pictures and (when there are any) the measurements. Returns its plain-text answer."""
    if pictures:
        seen = "the photo"
    else:
        seen = "no picture (it could not be shown to you), so answer only from the measurements and say so"
    measurements = f"\n\nMeasurements:\n{describe_measurements(report, counted)}" if report is not None else ""
    content = [
        {"type": "text", "text": f"Question: {question}\n\nYou are given {seen}.{measurements}"},
        *(
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(picture).decode("ascii")}}
            for picture in pictures
        ),
    ]
    reply = llm.invoke([SystemMessage(content=ANSWER_RULES), HumanMessage(content=content)])
    return str(reply.content).strip()


def format_report(report: FloodSceneReport, context: ChatContext) -> str:
    """Write the report as English and Filipino text for the user."""
    kind, kind_fil = "picture", "larawan"

    if report.level == LEVEL_NONE:
        english = f"I did not find clear flood water in the {kind}."
        filipino = f"Walang malinaw na baha sa {kind_fil}."
    else:
        extent = "some" if report.level == LEVEL_SOME else "a large part"
        extent_fil = "bahagi" if report.level == LEVEL_SOME else "malaking bahagi"
        english = f"Flood water covers {extent} of the {kind} (about {report.water_coverage:.0%})."
        filipino = f"May baha sa {extent_fil} ng {kind_fil} (mga {report.water_coverage:.0%})."

    english_lines, filipino_lines = [english], [filipino]
    if report.people:
        english_lines.append(f"{report.people} people are visible, {report.people_in_water} of them standing in water.")
        filipino_lines.append(f"May {report.people} taong nakikita, {report.people_in_water} sa kanila ay nasa baha.")
    if report.vehicles:
        english_lines.append(f"{report.vehicles} vehicles are visible, {report.vehicles_in_water} of them in water.")
        filipino_lines.append(f"May {report.vehicles} sasakyang nakikita, {report.vehicles_in_water} sa kanila ay nasa baha.")
    place = ""
    if context.location is not None:
        place = f"Place given by you: {context.location.name} (not confirmed from the {kind}).\n"

    return place + " ".join(english_lines) + "\n" + " ".join(filipino_lines) + "\n\n" + SAFETY_TEXT
