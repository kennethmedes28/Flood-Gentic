"""Weather agent: answers weather questions from PAGASA and Open-Meteo.

It combines the two data sources written for this project:

    * ``fetch_weather_using_browser`` - official PAGASA bulletins and advisories
    * ``fetch_supabase_open_meteo_datasets`` - model forecast for the city in the question,
                                      plus its last few days of rain from Supabase

The two sources do not depend on each other, so they are fetched at the same
time. The slower one sets the wait, instead of the two waits adding up. If one
source fails, the answer is still built from the other.

The chat model is passed in, so this file does not depend on any one provider.

Example:
    from langchain_openai import ChatOpenAI  # or any LangChain chat model

    answer = answer_weather_question("Uulan ba bukas sa Makati?", ChatOpenAI())
"""

import contextvars
import logging
from concurrent.futures import ThreadPoolExecutor

from langchain_core.language_models import BaseChatModel
from langchain_core.output_parsers import StrOutputParser

from agents.backup_sources import is_pagasa_reliable
from agents.fetch_supabase_open_meteo_datasets import fetch_open_meteo
from agents.fetch_weather_using_browser import fetch_weather_pages
from agents.flood_types import AgentReply
from agents.safe_answer import safe_reply
from agents.web_lookup_agent import WEB_NOTE, search_trusted_sites
from prompts.weather_prompt import WEATHER_PROMPT
from utils.call_budget import BUSY_ANSWER, model_budget
from utils.text import normalize_question
from utils.ttl_cache import MISSING, TTLCache
from utils.tracing import traced_agent

logger = logging.getLogger(__name__)

PAGASA_UNAVAILABLE = "PAGASA data is unavailable right now."
OPEN_METEO_UNAVAILABLE = "Open-Meteo data is unavailable right now."

ANSWER_CACHE_SECONDS = 30 * 60  # demo setting
# Answers to repeated questions, kept briefly to avoid repeat model calls.
answer_cache = TTLCache(ttl_seconds=ANSWER_CACHE_SECONDS)

# Fewer characters sent to the model means fewer tokens billed.
MAX_PAGASA_CHARS_TOTAL = 2500
ALWAYS_KEEP_FIRST_CHARS = 700  # issue time and synopsis come first on PAGASA pages

# Lines containing these words are kept first when a page has to be shortened.
IMPORTANT_WORDS = [
    "signal", "warning", "advisory", "bulletin", "metro manila", "ncr", "manila",
    "rain", "flood", "wind", "gale", "thunderstorm", "storm", "issued",
]


# --- Fetching (both sources at once) -----------------------------------------


def fetch_both_sources(question: str) -> tuple[list[dict] | None, dict | None]:
    """Fetch PAGASA pages and Open-Meteo data in parallel.

    Returns ``(pagasa_pages, open_meteo_result)``. A source that fails is
    returned as ``None`` (and logged) so the other can still be used.
    """
    with ThreadPoolExecutor(max_workers=2) as executor:
        # copy_context() carries the LangSmith run into the worker threads, so both fetches show up under this agent.
        pagasa_future = executor.submit(contextvars.copy_context().run, fetch_weather_pages, question)
        open_meteo_future = executor.submit(contextvars.copy_context().run, fetch_open_meteo, question)

        return _result_or_none(pagasa_future, "PAGASA"), _result_or_none(
            open_meteo_future, "Open-Meteo"
        )


def _result_or_none(future, source_name: str):
    """Return a future's result, or None if it raised an error."""
    try:
        return future.result()
    except Exception as error:
        logger.error("%s fetch failed: %s", source_name, error)
        return None


# --- Turning the data into prompt text ---------------------------------------


def shrink_text(text: str, budget: int, extra_words: list[str] | None = None) -> str:
    """Shorten text to about ``budget`` characters, keeping the useful lines.

    Kept, in their original order: the first lines (issue time, synopsis),
    then any line mentioning a warning, signal, wind, rain, flood, or one of
    ``extra_words`` such as the user's city. Everything else is dropped. This
    keeps safety-relevant lines that a plain cut at N characters could lose.
    """
    if len(text) <= budget:
        return text

    words = IMPORTANT_WORDS + [word.lower() for word in (extra_words or [])]
    lines = text.splitlines()

    keep = set()
    used = 0

    # 1. The opening lines.
    for index, line in enumerate(lines):
        if used >= ALWAYS_KEEP_FIRST_CHARS:
            break
        keep.add(index)
        used += len(line) + 1

    # 2. Important lines, until the budget is used up.
    for index, line in enumerate(lines):
        if index in keep:
            continue
        if any(word in line.lower() for word in words) and used + len(line) + 1 <= budget:
            keep.add(index)
            used += len(line) + 1

    return "\n".join(lines[index] for index in sorted(keep))[:budget]


def format_pagasa(pages: list[dict] | None, extra_words: list[str] | None = None) -> str:
    """Write the PAGASA pages as text for the prompt, within the character budget."""
    if not pages:
        return PAGASA_UNAVAILABLE

    # Share the budget between the pages, leaving room for each heading.
    per_page_budget = MAX_PAGASA_CHARS_TOTAL // len(pages)

    sections = []
    for page in pages:
        body = shrink_text(page["text"], per_page_budget, extra_words)
        sections.append(f"[{page['title']}] ({page['source']})\n{body}")

    return "\n\n".join(sections)


def format_open_meteo(result: dict | None) -> str:
    """Write the Open-Meteo current and daily values as short text lines.

    Hourly values are left out: they are long, and the daily summary is
    enough to answer most questions.
    """
    if not result:
        return OPEN_METEO_UNAVAILABLE

    weather = result["weather"]
    lines = [f"City: {result['plan']['city'].title()}"]

    current = weather.get("current", {})
    current_units = weather.get("current_units", {})
    current_values = [
        f"{name} {value}{current_units.get(name, '')}"
        for name, value in current.items()
        if name not in ("time", "interval")
    ]
    if current_values:
        lines.append(f"Now ({current.get('time', '?')}): " + ", ".join(current_values))

    daily = weather.get("daily", {})
    daily_units = weather.get("daily_units", {})
    for index, date in enumerate(daily.get("time", [])):
        values = [
            f"{name} {daily[name][index]}{daily_units.get(name, '')}"
            for name in daily
            if name != "time"
        ]
        lines.append(f"{date}: " + ", ".join(values))

    lines.extend(format_history(result.get("history")))
    return "\n".join(lines)


def format_history(history: list[dict] | None) -> list[str]:
    """Write the recent past days (from the Supabase dataset) as short text lines.

    Returns no lines when the history is missing, so the forecast is not affected.
    """
    if not history:
        return []

    lines = ["Recent days (observed, from the project dataset):"]
    for row in history:
        lines.append(
            f"{row['date']}: rain {row['rain_mm']}mm, 3-day {row['rain_3d_mm']}mm, "
            f"7-day {row['rain_7d_mm']}mm, river discharge {row['river_discharge_m3s']}m3/s"
        )
    return lines


# --- Answer without the model --------------------------------------------------
# Used when the chat model cannot be reached (for example the API wrongly answers "model_not_found", or times out).
# The data is already fetched, so the person still gets it, written by fixed rules: no model writes it, so nothing is
# invented, and only the numbers and the official text are shown.

NO_MODEL_HEADING = (
    "The assistant model is not reachable right now, so here is the weather data directly.\n"
    "Hindi maabot ang assistant model sa ngayon, kaya narito ang datos ng panahon."
)
NO_MODEL_FOOTER = (
    "Check pagasa.dost.gov.ph and your local DRRMO for updates. If you are in danger, call 911.\n"
    "Tingnan ang pagasa.dost.gov.ph at ang inyong lokal na DRRMO. Kung nasa panganib, tumawag sa 911."
)
NO_MODEL_PAGASA_CHARS = 600  # the opening of the bulletin: issue time and synopsis

# The daily Open-Meteo values shown, in this order, with an English / Filipino label.
DAILY_LABELS = {
    "precipitation_probability_max": "Chance of rain / Tsansa ng ulan",
    "precipitation_sum": "Rain / Ulan",
    "temperature_2m_max": "High / Pinakamainit",
    "temperature_2m_min": "Low / Pinakamalamig",
    "wind_speed_10m_max": "Wind / Hangin",
    "wind_gusts_10m_max": "Gusts / Bugso ng hangin",
}


def describe_forecast(result: dict | None) -> list[str]:
    """The Open-Meteo daily forecast for the city as short lines, one per day. No lines when there is no forecast."""
    if not result:
        return []
    daily = result["weather"].get("daily", {})
    units = result["weather"].get("daily_units", {})
    dates = daily.get("time", [])
    if not dates:
        return []

    lines = [f"Forecast for {result['plan']['city'].title()} (Open-Meteo model forecast, not an official warning):"]
    for index, date in enumerate(dates):
        values = []
        for name, label in DAILY_LABELS.items():
            series = daily.get(name)
            if series is None or index >= len(series) or series[index] is None:
                continue
            values.append(f"{label} {series[index]}{units.get(name, '')}")
        if not values:
            continue
        if index == 0:
            day = f"Today / Ngayon ({date})"  # Open-Meteo's first day is today in Manila time
        else:
            day = date
        lines.append(f"- {day}: " + ", ".join(values))
    return lines if len(lines) > 1 else []


# Words that mark the Metro Manila row of PAGASA's forecast table. When Metro Manila is not named on its own, it is
# covered by the row for "the rest of the country" (or "the rest of Luzon").
METRO_MANILA_WORDS = ("metro manila", "ncr", "national capital region")
REST_OF_COUNTRY_WORDS = ("rest of the country", "rest of luzon")
TABLE_HEADER = ["Place", "Weather Condition", "Caused By", "Impacts"]


def read_forecast_bulletin(text: str) -> dict | None:
    """The parts of PAGASA's daily forecast page that matter for Metro Manila, or None when the layout is not recognised.

    The page text comes as one item per line: "Issued at: ...", "Synopsis" and its sentence, then the forecast table as
    the header (Place, Weather Condition, Caused By, Impacts) followed by four lines per row. Returns
    ``{"issued": ..., "synopsis": ..., "row": {"place", "condition", "cause", "impacts"} or None}``.
    """
    lines = [line.replace("\xa0", " ").strip() for line in text.splitlines()]
    issued = next((line for line in lines if line.startswith("Issued at:")), None)
    synopsis = None
    if "Synopsis" in lines:
        after = lines.index("Synopsis") + 1
        synopsis = lines[after] if after < len(lines) else None

    # Find the table header, then read rows of four lines until a line that starts the next section.
    rows = []
    for index in range(len(lines) - len(TABLE_HEADER)):
        if lines[index:index + len(TABLE_HEADER)] == TABLE_HEADER:
            position = index + len(TABLE_HEADER)
            while position + 4 <= len(lines) and not lines[position].startswith("Forecast "):
                place, condition, cause, impacts = lines[position:position + 4]
                rows.append({"place": place, "condition": condition, "cause": cause, "impacts": impacts})
                position += 4
            break

    if issued is None and synopsis is None and not rows:
        return None

    def first_row_with(words):
        return next((row for row in rows if any(word in row["place"].lower() for word in words)), None)

    row = first_row_with(METRO_MANILA_WORDS) or first_row_with(REST_OF_COUNTRY_WORDS)
    return {"issued": issued, "synopsis": synopsis, "row": row}


def describe_pagasa(pages: list[dict] | None, city: str | None, from_web: bool) -> list[str]:
    """The official text that matters for Metro Manila, with its link. No lines when there is none.

    PAGASA's daily forecast page gives its issue time, synopsis and the Metro Manila row of the forecast table. Any other
    page (a storm bulletin, an advisory, a page from the backup websites) gives its opening lines.
    """
    if not pages:
        return []
    page = pages[0]
    bulletin = None if from_web or page.get("page") != "forecast" else read_forecast_bulletin(page["text"])

    if bulletin is None:
        heading = "From the official websites:" if from_web else "PAGASA (official):"
        body = shrink_text(page["text"], NO_MODEL_PAGASA_CHARS, [city] if city else None).strip()
        return [heading, body, f"Source: {page['source']}"]

    heading = "PAGASA (official)"
    if bulletin["issued"]:
        heading += ", " + bulletin["issued"].replace("Issued at:", "issued at")  # "PAGASA (official), issued at 4:00 PM, ..."
    lines = [heading + ":"]
    if bulletin["synopsis"]:
        lines.append(f"- Synopsis: {bulletin['synopsis']}")
    row = bulletin["row"]
    if row:
        impacts = row["impacts"].rstrip(".")
        lines.append(f"- {row['place']}: {row['condition']} (caused by: {row['cause']}). {impacts}.")
    lines.append(f"Source: {page['source']}")
    return lines


def answer_from_data(pagasa_pages: list[dict] | None, open_meteo_result: dict | None, from_web: bool) -> AgentReply:
    """The weather answer written from the fetched data alone, for when the chat model cannot be reached."""
    city = open_meteo_result["plan"]["city"] if open_meteo_result else None
    sections = [NO_MODEL_HEADING]
    for lines in (describe_forecast(open_meteo_result), describe_pagasa(pagasa_pages, city, from_web)):
        if lines:
            sections.append("\n".join(lines))
    sections.append(NO_MODEL_FOOTER)
    return AgentReply(text="\n\n".join(sections))


# --- The agent -----------------------------------------------------------------


@traced_agent("weather_agent")
def answer_weather_question(question: str, llm: BaseChatModel) -> AgentReply:
    """Answer a weather question using PAGASA and Open-Meteo data.

    Cost savers:
        * The same question (ignoring case and punctuation) is answered from
          cache for a few minutes instead of calling the model again.
        * Source downloads are cached too (see the fetch modules).
        * If every source is down (including the web fallback), the flagged safe
          answer is returned and the model is not called. It is never cached, so the next request tries again.
        * The PAGASA text is shortened to the lines that matter.
    """
    cache_key = normalize_question(question)
    cached_answer = answer_cache.get(cache_key)
    if cached_answer is not MISSING:
        return AgentReply(text=cached_answer)

    pagasa_pages, open_meteo_result = fetch_both_sources(question)

    # An empty or unreliable PAGASA bulletin (a block page, a stub) is low confidence:
    # look on the trusted websites instead. Unreliable pages are not passed to the model.
    used_web = False
    if not is_pagasa_reliable(pagasa_pages):
        logger.info("PAGASA pages empty or unreliable; searching trusted websites.")
        pagasa_pages = search_trusted_sites(question)
        used_web = bool(pagasa_pages)

    if not pagasa_pages and open_meteo_result is None:
        return safe_reply()  # no source at all: never let the model guess the weather

    # The detected city is used to keep PAGASA lines that mention it.
    city = open_meteo_result["plan"]["city"] if open_meteo_result else None

    if not model_budget.try_use():  # hourly cap on model calls (see utils/call_budget.py)
        return AgentReply(text=BUSY_ANSWER)

    chain = WEATHER_PROMPT | llm | StrOutputParser()
    try:
        answer = chain.invoke(
            {
                "question": question,
                "pagasa_data": format_pagasa(pagasa_pages, [city] if city else None),
                "open_meteo_data": format_open_meteo(open_meteo_result),
            }
        )
    except Exception as error:
        # The model could not be reached (or failed): the data is already here, so answer from it instead of an
        # error. Not cached, so the next question tries the model again.
        logger.error("Weather model call failed, answering from the data alone: %s", error)
        return answer_from_data(pagasa_pages, open_meteo_result, from_web=used_web)
    if used_web:
        answer = f"{answer}\n\n{WEB_NOTE}"
    answer_cache.set(cache_key, answer)
    return AgentReply(text=answer)


if __name__ == "__main__":
    # Quick manual check of the data side only (no model needed):
    #   python -m agents.weather_agent "Uulan ba bukas sa Makati?"
    import sys

    sample_question = " ".join(sys.argv[1:]) or "Will it rain tomorrow in Quezon City?"
    pagasa, open_meteo = fetch_both_sources(sample_question)
    print(format_open_meteo(open_meteo))
    print()
    print(format_pagasa(pagasa)[:1500])
