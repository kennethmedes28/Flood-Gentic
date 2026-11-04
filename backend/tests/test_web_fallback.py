"""Tests for the low-confidence web fallback. No network, browser or model is used.

Run from the backend folder:  python -m unittest discover -s tests -v
"""

import sys
import types
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.runnables import RunnableLambda

from agents import backup_sources, document_agents, flood_risk_agent, weather_agent, web_lookup_agent
from agents.flood_types import ChatContext, Location
from agents.safe_answer import SAFE_ANSWER
from src.rag.models import PHILIPPINE_TZ, Chunk
from utils.call_budget import BUSY_ANSWER

WEB_PAGE = {"page": "web", "source": "https://ndrrmc.gov.ph/update", "title": "Update", "text": "Flood update text"}
# A bulletin long enough to count as reliable (see backup_sources.MIN_PAGASA_CHARS).
PAGASA_PAGE = {"page": "forecast", "source": "https://www.pagasa.dost.gov.ph/weather", "title": "Forecast", "text": "Rainfall warning bulletin. " * 20}
BLOCK_PAGE = {"page": "forecast", "source": "https://www.pagasa.dost.gov.ph/weather", "title": "Blocked", "text": "Just a moment... " * 30}


def chunk_with_score(score: float) -> Chunk:
    return Chunk(doc_id="doc", chunk_idx=0, content="some text", score=score, metadata={})


class FakeLLM:
    """Stands in for the chat model; web_lookup_agent only needs it inside a chain, which is patched out."""


class TrustedUrlTests(unittest.TestCase):
    def test_trusted_domains_and_subdomains(self):
        self.assertTrue(web_lookup_agent.is_trusted_url("https://ndrrmc.gov.ph/news"))
        self.assertTrue(web_lookup_agent.is_trusted_url("https://www.dswd.gov.ph/news"))

    def test_other_hosts_and_plain_http_are_rejected(self):
        self.assertFalse(web_lookup_agent.is_trusted_url("https://evil.example.com/ndrrmc.gov.ph"))
        self.assertFalse(web_lookup_agent.is_trusted_url("https://notndrrmc.gov.ph/"))
        self.assertFalse(web_lookup_agent.is_trusted_url("http://ndrrmc.gov.ph/news"))

    def test_result_links_stay_on_the_site(self):
        html = (
            '<a href="/news/1">one</a><a href="https://evil.example.com/x">bad</a>'
            '<a href="/news/1">again</a><a href="/news/2#top">two</a><a href="/news/3">three</a>'
        )
        links = web_lookup_agent.find_result_links(html, "https://ndrrmc.gov.ph/?s=flood", "ndrrmc.gov.ph")
        self.assertEqual(links, ["https://ndrrmc.gov.ph/news/1", "https://ndrrmc.gov.ph/news/2"])


class DocumentFallbackTests(unittest.TestCase):
    def setUp(self):
        document_agents.answer_cache = type(document_agents.answer_cache)(ttl_seconds=60)

    def test_confidence_check(self):
        self.assertTrue(document_agents.is_low_confidence([]))
        self.assertTrue(document_agents.is_low_confidence([chunk_with_score(0.1)]))
        self.assertFalse(document_agents.is_low_confidence([chunk_with_score(0.1), chunk_with_score(0.9)]))

    def ask_with_a_busy_budget(self, sources):
        """Ask a question with these search results and a used-up model budget: the reply is the "busy" text, which shows the
        question got as far as the model (no fixed refusal, no web search)."""
        with mock.patch.object(document_agents, "find_sources", return_value=sources), \
             mock.patch.object(document_agents, "model_budget") as budget:
            budget.try_use.return_value = False
            return document_agents.answer_document_question("question", FakeLLM(), retriever=None)

    def test_a_weak_match_still_goes_to_the_model(self):
        answer = self.ask_with_a_busy_budget([chunk_with_score(0.1)])
        self.assertEqual(answer.text, BUSY_ANSWER)
        self.assertFalse(answer.safe_answer)

    def test_a_very_low_match_or_no_match_still_goes_to_the_model(self):
        self.assertTrue(document_agents.is_very_low_confidence([chunk_with_score(0.05)]))
        self.assertFalse(document_agents.is_very_low_confidence([]))
        for sources in ([chunk_with_score(0.05)], []):
            answer = self.ask_with_a_busy_budget(sources)
            self.assertEqual(answer.text, BUSY_ANSWER)
            self.assertFalse(answer.safe_answer)


class WeatherFallbackTests(unittest.TestCase):
    def setUp(self):
        weather_agent.answer_cache = type(weather_agent.answer_cache)(ttl_seconds=60)

    def test_no_pagasa_and_no_web_and_no_forecast_gives_the_fixed_reply(self):
        with mock.patch.object(weather_agent, "fetch_both_sources", return_value=([], None)), \
             mock.patch.object(weather_agent, "search_trusted_sites", return_value=[]):
            reply = weather_agent.answer_weather_question("ulan?", FakeLLM())
            self.assertEqual(reply.text, SAFE_ANSWER)
            self.assertTrue(reply.safe_answer)

    def test_pagasa_present_skips_the_web(self):
        with mock.patch.object(weather_agent, "fetch_both_sources", return_value=([PAGASA_PAGE], None)), \
             mock.patch.object(weather_agent, "search_trusted_sites") as web, \
             mock.patch.object(weather_agent, "model_budget") as budget:
            budget.try_use.return_value = False
            weather_agent.answer_weather_question("ulan?", FakeLLM())
        web.assert_not_called()


    def test_block_page_from_pagasa_counts_as_unreliable_and_uses_the_web(self):
        with mock.patch.object(weather_agent, "fetch_both_sources", return_value=([BLOCK_PAGE], None)), \
             mock.patch.object(weather_agent, "search_trusted_sites", return_value=[]) as web:
            reply = weather_agent.answer_weather_question("ulan?", FakeLLM())
        web.assert_called_once()
        self.assertTrue(reply.safe_answer)


# An Open-Meteo result as fetch_open_meteo returns it, with today and tomorrow.
OPEN_METEO_RESULT = {
    "plan": {"city": "marikina"},
    "weather": {
        "daily": {
            "time": ["2026-11-04", "2026-11-05"],
            "precipitation_probability_max": [70, 20],
            "precipitation_sum": [5.2, 0.4],
        },
        "daily_units": {"precipitation_probability_max": "%", "precipitation_sum": "mm"},
    },
    "history": None,
}


def failing_model(_prompt):
    """Stands in for a chat model whose API call fails (as when the API wrongly says model_not_found)."""
    raise RuntimeError("Error code: 404 - model_not_found")


class WeatherWithoutModelTests(unittest.TestCase):
    """When the chat model cannot be reached, the weather data is still given, written without the model."""

    def setUp(self):
        weather_agent.answer_cache = type(weather_agent.answer_cache)(ttl_seconds=60)
        budget = mock.patch.object(weather_agent, "model_budget")
        budget.start().try_use.return_value = True
        self.addCleanup(mock.patch.stopall)

    def ask(self, pages, forecast, llm):
        with mock.patch.object(weather_agent, "fetch_both_sources", return_value=(pages, forecast)), \
             mock.patch.object(weather_agent, "search_trusted_sites", return_value=[]):
            return weather_agent.answer_weather_question("Will it rain in my area today? (marikina)", llm)

    def test_a_failing_model_still_gives_the_forecast_and_the_bulletin(self):
        reply = self.ask([PAGASA_PAGE], OPEN_METEO_RESULT, RunnableLambda(failing_model))
        self.assertIn(weather_agent.NO_MODEL_HEADING, reply.text)
        self.assertIn("Forecast for Marikina", reply.text)
        self.assertIn("Today / Ngayon (2026-11-04): Chance of rain / Tsansa ng ulan 70%, Rain / Ulan 5.2mm", reply.text)
        self.assertIn("- 2026-11-05: Chance of rain / Tsansa ng ulan 20%, Rain / Ulan 0.4mm", reply.text)
        self.assertIn("PAGASA (official):", reply.text)
        self.assertIn("Source: https://www.pagasa.dost.gov.ph/weather", reply.text)
        self.assertIn("911", reply.text)
        self.assertFalse(reply.safe_answer)

    def test_only_the_bulletin_is_given_when_there_is_no_forecast(self):
        reply = self.ask([PAGASA_PAGE], None, RunnableLambda(failing_model))
        self.assertNotIn("Forecast for", reply.text)
        self.assertIn("Rainfall warning bulletin.", reply.text)

    def test_the_answer_without_the_model_is_not_cached(self):
        self.ask([PAGASA_PAGE], OPEN_METEO_RESULT, RunnableLambda(failing_model))
        working = FakeListChatModel(responses=["It may rain this afternoon."])
        reply = self.ask([PAGASA_PAGE], OPEN_METEO_RESULT, working)
        self.assertEqual(reply.text, "It may rain this afternoon.")


# The daily forecast page as fetch_weather_pages returns it: one item per line (copied from a real page, shortened).
FORECAST_PAGE_TEXT = "\n".join([
    "Issued at: 4:00 PM, 04 November 2026",
    "Synopsis",
    "Northeast Monsoon affecting Northern Luzon. Easterlies affecting the rest of the country.",
    "Forecast Weather Conditions",
    "Place", "Weather Condition", "Caused By", "Impacts",
    "Batanes and Babuyan Islands", "Cloudy skies with light rains", "Northeast Monsoon", "No significant impact",
    "Metro Manila and the rest of the country",
    "Partly cloudy to cloudy skies with isolated rainshowers or thunderstorms",
    "Easterlies",
    "Possible flash floods or landslides during severe thunderstorms",
    "Forecast Wind and Coastal Water Conditions",
    "Place", "Speed", "Direction", "Coastal Water",
])


class ForecastBulletinTests(unittest.TestCase):
    def test_the_metro_manila_row_issue_time_and_synopsis_are_read(self):
        bulletin = weather_agent.read_forecast_bulletin(FORECAST_PAGE_TEXT)
        self.assertEqual(bulletin["issued"], "Issued at: 4:00 PM, 04 November 2026")
        self.assertTrue(bulletin["synopsis"].startswith("Northeast Monsoon"))
        self.assertEqual(bulletin["row"]["place"], "Metro Manila and the rest of the country")
        self.assertEqual(bulletin["row"]["cause"], "Easterlies")

    def test_the_rest_of_the_country_row_is_used_when_metro_manila_is_not_named(self):
        text = FORECAST_PAGE_TEXT.replace("Metro Manila and the rest of the country", "The rest of the country")
        self.assertEqual(weather_agent.read_forecast_bulletin(text)["row"]["place"], "The rest of the country")

    def test_an_unknown_layout_is_not_read(self):
        self.assertIsNone(weather_agent.read_forecast_bulletin("Rainfall warning bulletin. " * 20))

    def test_the_answer_without_the_model_shows_the_metro_manila_row(self):
        page = {**PAGASA_PAGE, "text": FORECAST_PAGE_TEXT}
        lines = weather_agent.describe_pagasa([page], "manila", from_web=False)
        self.assertEqual(lines[0], "PAGASA (official), issued at 4:00 PM, 04 November 2026:")
        self.assertIn(
            "- Metro Manila and the rest of the country: Partly cloudy to cloudy skies with isolated rainshowers or thunderstorms "
            "(caused by: Easterlies). Possible flash floods or landslides during severe thunderstorms.",
            lines,
        )
        self.assertNotIn("Batanes", "\n".join(lines))


class PagasaReliabilityTests(unittest.TestCase):
    def test_reliability_check(self):
        self.assertFalse(backup_sources.is_pagasa_reliable(None))
        self.assertFalse(backup_sources.is_pagasa_reliable([]))
        self.assertFalse(backup_sources.is_pagasa_reliable([WEB_PAGE]))  # too short
        self.assertFalse(backup_sources.is_pagasa_reliable([BLOCK_PAGE]))  # long, but a block page
        self.assertTrue(backup_sources.is_pagasa_reliable([BLOCK_PAGE, PAGASA_PAGE]))


class FloodRiskFallbackTests(unittest.TestCase):
    context = ChatContext(location=Location("Marikina", 14.65, 121.10, "marikina"))

    def ask(self, pagasa_pages, backups, risk):
        """Run the agent with PAGASA, the backup sources and the rule-based risk all faked."""
        with mock.patch("agents.fetch_weather_using_browser.fetch_weather_pages", return_value=pagasa_pages), \
             mock.patch.object(flood_risk_agent, "gather_backup_sources", return_value=backups) as gather, \
             mock.patch.object(flood_risk_agent, "assess_flood_risk", return_value=risk):
            reply = flood_risk_agent.answer_flood_risk_question("baha ba?", self.context)
        return reply, gather

    def test_reliable_pagasa_does_not_touch_the_backups(self):
        risk = flood_risk_agent.FloodRisk(city="marikina", level="low")
        reply, gather = self.ask([PAGASA_PAGE], backup_sources.BackupData(), risk)
        gather.assert_not_called()
        self.assertFalse(reply.safe_answer)

    def test_unreliable_pagasa_uses_backups_and_adds_links_without_changing_the_level(self):
        risk = flood_risk_agent.FloodRisk(city="marikina", level="low")
        backups = backup_sources.BackupData(web_pages=[WEB_PAGE])
        reply, gather = self.ask([BLOCK_PAGE], backups, risk)  # rain and river read fine, so 3 readings
        gather.assert_called_once()
        self.assertIn("https://ndrrmc.gov.ph/update", reply.text)
        self.assertIn("LOW", reply.text)
        self.assertIn("PAGASA bulletin", reply.text)

    def test_too_few_readings_gives_the_safe_answer(self):
        # PAGASA empty, rain and river both failed, and the backups found nothing.
        risk = flood_risk_agent.FloodRisk(city="marikina", level="low", missing=["rain forecast", "river flow"])
        reply, _ = self.ask([], backup_sources.BackupData(), risk)
        self.assertEqual(reply.text, SAFE_ANSWER)
        self.assertTrue(reply.safe_answer)

    def test_tide_alone_is_not_enough_but_tide_with_rain_data_is(self):
        down = ["rain forecast", "river flow"]
        tide_only = backup_sources.BackupData(peak_tide_m=0.4)
        reply, _ = self.ask([], tide_only, flood_risk_agent.FloodRisk(city="marikina", level="low", missing=list(down)))
        self.assertTrue(reply.safe_answer)  # one reading only
        reply, _ = self.ask([], tide_only, flood_risk_agent.FloodRisk(city="marikina", level="low", missing=["river flow"]))
        self.assertFalse(reply.safe_answer)  # tide + rain forecast


class BackupReadingTests(unittest.TestCase):
    def test_high_tide_and_low_ground_raise_a_flood_signal_one_step_only(self):
        risk = flood_risk_agent.FloodRisk(city="manila", level="watch")
        flood_risk_agent.apply_backup_readings(risk, backup_sources.BackupData(peak_tide_m=1.4, elevation_m=3.0))
        self.assertEqual(risk.level, "high")
        self.assertEqual(len(risk.reasons), 2)

    def test_they_never_create_a_signal_on_their_own(self):
        risk = flood_risk_agent.FloodRisk(city="manila", level="low")
        flood_risk_agent.apply_backup_readings(risk, backup_sources.BackupData(peak_tide_m=1.4, elevation_m=3.0))
        self.assertEqual(risk.level, "low")

    def test_one_failing_backup_does_not_stop_the_others(self):
        now = datetime.now(PHILIPPINE_TZ)
        with mock.patch.object(backup_sources, "fetch_peak_tide", return_value=None), \
             mock.patch.object(backup_sources, "fetch_elevation", return_value=4.0), \
             mock.patch.object(backup_sources, "fetch_official_pages", return_value=[WEB_PAGE]):
            backups = backup_sources.gather_backup_sources("manila", 14.6, 120.98, now)
        self.assertIsNone(backups.peak_tide_m)
        self.assertEqual(backups.elevation_m, 4.0)
        self.assertEqual(backups.web_pages, [WEB_PAGE])

    def test_tide_with_no_data_is_none(self):
        now = datetime(2026, 10, 30, 12, 0, tzinfo=PHILIPPINE_TZ)
        empty = {"hourly": {"time": ["2026-10-30T13:00"], "sea_level_height_msl": [None]}}
        with mock.patch.object(backup_sources, "download_tide", return_value=empty):
            self.assertIsNone(backup_sources.fetch_peak_tide(14.6, 120.98, now))
        full = {"hourly": {"time": ["2026-10-30T13:00", "2026-10-30T14:00", "2026-11-02T14:00"],
                           "sea_level_height_msl": [0.5, 1.3, 9.9]}}
        with mock.patch.object(backup_sources, "download_tide", return_value=full):
            self.assertEqual(backup_sources.fetch_peak_tide(14.6, 120.98, now), 1.3)  # beyond 24 h ignored


if __name__ == "__main__":
    unittest.main()
