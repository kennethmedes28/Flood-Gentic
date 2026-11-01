"""Flood media agent: checks a photo or video of a street for flood water, and answers questions about it.

Two steps:

    1. Measure: SAM 3.1 (see ``video/``) finds flood water, people and vehicles. These numbers are always worked out
       the same way, so they are the grounded part of the answer.
    2. Answer the question: when the person asked something of their own ("can a car pass?", "ilan ang tao?"),
       a chat model that can see pictures looks at the photo (or a few stills of the video), the question and the
       measurements, and answers it. Its rules are in ``ANSWER_RULES``. When no question was asked, or the model is not
       available, the fixed bilingual report is used instead, with no model call.

What it can and cannot say:

    * It reports how much of the picture is covered by water and how many people or vehicles stand in it.
    * It never says a road is safe, and a depth is only ever a rough guess. A picture can be old, edited or from
      another place, so the result is unverified evidence and never overrides PAGASA or NDRRMC.

Needs the ``MUSE_API`` environment variable (the same key as the chat models).

Example:
    reply = answer_flood_media_question(ImageInput(path="street.jpg"), ChatContext(location=place))
    print(reply.text)
"""

import base64
import logging
import os
from io import BytesIO
from pathlib import Path

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from agents.flood_types import AgentReply, ChatContext
from video.flood_depth import BAND_ANKLE, BAND_CHEST, BAND_KNEE, BAND_NONE, BAND_WAIST
from video.flood_scene import LEVEL_NONE, LEVEL_SOME, FloodSceneReport, analyze_flood_media
from video.sam_client import ImageInput, VideoInput
from video.video_prepare import video_stills
from utils.call_budget import model_budget
from utils.tracing import traced_agent

logger = logging.getLogger(__name__)

NO_KEY_ANSWER = (
    "I cannot check pictures right now.\n"
    "Hindi ko ma-check ang mga larawan sa ngayon.\n"
    "If someone is in danger, call 911."
)
FAILED_ANSWER = (
    "I could not check that picture or video. Please try again, or describe what you see.\n"
    "Hindi ko ma-check ang larawan o video. Subukan ulit, o ilarawan ang nakikita mo.\n"
    "If someone is in danger, call 911."
)
SAFETY_TEXT = (
    "This is an automatic check of the picture or video only. It cannot tell whether a road is passable, any depth shown "
    "is only a rough guess, and the picture may be old. Do not walk or drive through flood water. If someone is in danger, call 911.\n"
    "Awtomatikong pagsusuri lang ito ng larawan o video. Hindi nito matutukoy kung madadaanan ang kalsada, hula lang ang anumang "
    "lalim na ipinapakita, at maaaring luma ang larawan. Huwag lumusong o magmaneho sa baha. Kung may nasa panganib, tumawag sa 911."
)


# The rules the chat model follows when it answers a question about a picture. They keep it to what can be seen,
# and away from the things a flood photo must never be used for (judging a road safe, a precise depth, a person's identity).
ANSWER_RULES = """You help people in Metro Manila understand a photo or video of a possible flood.
You get the picture (for a video, a few stills from it), measurements from an automatic flood check, and the person's question.

Rules:
- Answer the question directly, in the same language the person used (English, Filipino or a mix), in at most 6 short sentences.
- Only describe what can be seen. If the picture does not show what was asked, say so plainly instead of guessing.
- The measurements are from a separate automatic check. Use them for the share of water and the number of people and vehicles.
  If what you see disagrees with them, say both.
- Never say that a road or an area is safe to walk, wade or drive through, and never encourage anyone to enter flood water.
  If asked, say that a picture cannot show how deep or fast the water is, and that they should not cross.
- Do not give a water depth in centimetres or metres unless the measurements include an estimate; you may describe it relative
  to people or cars ("up to the knees of the people") and say it is a rough look, not a measurement.
- Do not identify people, guess who they are, or read out licence plates or house numbers.
- You cannot tell where or when the picture was taken; do not claim to.
- If anyone in the picture looks in danger, start with: call 911 now.
- No lists or headings: plain sentences."""

# The longest side of a photo handed to the chat model: enough detail, and a small request.
ANSWER_PICTURE_WIDTH = 1024
ANSWER_HEADING = "Measured by the automatic check:"


DEPTH_WORDS = {
    BAND_NONE: ("almost none", "halos wala"),
    BAND_ANKLE: ("ankle-deep", "hanggang bukung-bukong"),
    BAND_KNEE: ("about knee-deep", "mga hanggang tuhod"),
    BAND_WAIST: ("about waist-deep", "mga hanggang baywang"),
    BAND_CHEST: ("chest-deep or deeper", "hanggang dibdib o mas malalim"),
}


@traced_agent("flood_media_agent")
def answer_flood_media_question(
    media: ImageInput | VideoInput,
    context: ChatContext,
    api_key: str | None = None,
    estimate_depth: bool = False,
    include_people_and_vehicles: bool = True,
    question: str | None = None,
    llm: BaseChatModel | None = None,
    video_path: str | Path | None = None,
) -> AgentReply:
    """Analyse a photo or video, and answer the person's question about it.

    ``question`` is what the person asked with the picture; leave it out (or None) when they only sent the picture,
    and the fixed report is given. With a question and a chat model (``llm``), the model answers it from the picture
    and the measurements, and the measurements follow under ``ANSWER_HEADING``. ``video_path`` is where a video file
    is, so stills can be taken from it for the model.

    ``estimate_depth=True`` (photos only) adds a rough depth from the people standing in the water.
    ``include_people_and_vehicles=False`` looks for water only. Water is asked for with two phrases, and for a photo also
    on a mirrored copy (see ``WATER_CONCEPTS`` in ``video/flood_scene.py``): 4 SAM requests for a photo, 2 for a video.
    Counting people and vehicles adds 2 more. A question adds one chat model call.
    """
    api_key = api_key or os.getenv("MUSE_API")
    if not api_key:
        return AgentReply(text=NO_KEY_ANSWER)

    try:
        report = analyze_flood_media(
            media, api_key, estimate_depth=estimate_depth, include_people_and_vehicles=include_people_and_vehicles
        )
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
        counted = include_people_and_vehicles or estimate_depth  # the depth estimate always counts people too
        answer = answer_with_model(llm, question.strip(), pictures_for_model(media, video_path), report, counted)
    except Exception as error:  # the model failed or timed out: the measurements are still a useful answer
        logger.error("Answering the question about the picture failed: %s", error)
        return AgentReply(text=fixed_report)
    if not answer:
        return AgentReply(text=fixed_report)
    return AgentReply(text=f"{answer}\n\n{ANSWER_HEADING}\n{fixed_report}")


def pictures_for_model(media: ImageInput | VideoInput, video_path: str | Path | None) -> list[bytes]:
    """The JPEG pictures the chat model looks at: the photo (made smaller), or a few stills of the video."""
    if isinstance(media, VideoInput):
        path = video_path or media.path
        return video_stills(Path(path)) if path else []

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
        f"Kind: {report.media_kind}.",
        f"Flood water level: {report.level} (about {report.water_coverage:.0%} of the picture).",
    ]
    if report.media_kind == "video":
        lines.append(f"Water was seen in {report.frames_with_water:.0%} of {report.frames_checked} frames.")
    if not counted:
        lines.append("People and vehicles were not counted by this check (it was not asked to); count them yourself from the picture if asked.")
    else:
        lines.append(f"People: {report.people} ({report.people_in_water} in water). Vehicles: {report.vehicles} ({report.vehicles_in_water} in water).")
    if report.depth_cm is not None:
        lines.append(f"Rough depth estimate: about {report.depth_cm:.0f} cm (could be {report.depth_low_cm:.0f} to {report.depth_high_cm:.0f} cm).")
    else:
        lines.append("No depth estimate.")
    return "\n".join(lines)


def answer_with_model(
    llm: BaseChatModel, question: str, pictures: list[bytes], report: FloodSceneReport, counted: bool = True
) -> str:
    """Ask the chat model the person's question, with the pictures and the measurements. Returns its plain-text answer."""
    if pictures:
        seen = "the photo" if report.media_kind != "video" else f"{len(pictures)} stills taken from the video, in order"
    else:
        seen = "no picture (it could not be shown to you), so answer only from the measurements and say so"
    content = [
        {"type": "text", "text": f"Question: {question}\n\nYou are given {seen}.\n\nMeasurements:\n{describe_measurements(report, counted)}"},
        *(
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(picture).decode("ascii")}}
            for picture in pictures
        ),
    ]
    reply = llm.invoke([SystemMessage(content=ANSWER_RULES), HumanMessage(content=content)])
    return str(reply.content).strip()


def format_report(report: FloodSceneReport, context: ChatContext) -> str:
    """Write the report as English and Filipino text for the user."""
    kind = "video" if report.media_kind == "video" else "picture"
    kind_fil = "video" if report.media_kind == "video" else "larawan"

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
    if report.media_kind == "video":
        english_lines.append(f"Water was seen in {report.frames_with_water:.0%} of the {report.frames_checked} frames checked.")
        filipino_lines.append(f"Nakita ang baha sa {report.frames_with_water:.0%} ng {report.frames_checked} frame na sinuri.")

    if report.depth_cm is not None:
        words, words_fil = DEPTH_WORDS[report.depth_band]
        english_lines.append(
            f"Rough depth estimate: {words} (about {report.depth_cm:.0f} cm, could be {report.depth_low_cm:.0f} to "
            f"{report.depth_high_cm:.0f} cm), from {report.depth_people_used} people standing in the water. This is a guess, not a measurement."
        )
        filipino_lines.append(
            f"Tantiyang lalim: {words_fil} (mga {report.depth_cm:.0f} cm, maaaring {report.depth_low_cm:.0f} hanggang "
            f"{report.depth_high_cm:.0f} cm), batay sa {report.depth_people_used} taong nasa baha. Hula lang ito, hindi sukat."
        )

    place = ""
    if context.location is not None:
        place = f"Place given by you: {context.location.name} (not confirmed from the {kind}).\n"

    return place + " ".join(english_lines) + "\n" + " ".join(filipino_lines) + "\n\n" + SAFETY_TEXT
