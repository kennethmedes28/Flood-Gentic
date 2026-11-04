"""Tests for the retry of the chat model when the API wrongly says "model_not_found".

No request is sent: the parent class's _generate is replaced by a fake.

Run from the backend folder:  python -m unittest tests.test_llm_retry -v
"""

import asyncio
import sys
import unittest
from pathlib import Path
from unittest import mock

import httpx
from langchain_openai import ChatOpenAI
from openai import APITimeoutError, InternalServerError, NotFoundError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils import llm


def server_error() -> InternalServerError:
    request = httpx.Request("POST", "https://api.meta.ai/v1/chat/completions")
    return InternalServerError("unavailable", response=httpx.Response(503, request=request), body=None)


def timeout_error() -> APITimeoutError:
    return APITimeoutError(request=httpx.Request("POST", "https://api.meta.ai/v1/chat/completions"))


def not_found() -> NotFoundError:
    request = httpx.Request("POST", "https://api.meta.ai/v1/chat/completions")
    return NotFoundError("model_not_found", response=httpx.Response(404, request=request), body=None)


class RetryTests(unittest.TestCase):
    def setUp(self):
        mock.patch.object(llm, "RETRY_PAUSE_SECONDS", 0).start()
        self.addCleanup(mock.patch.stopall)
        self.model = llm.build_main_llm(api_key="key")

    def run_with(self, outcomes):
        """Call the model with a parent _generate that returns or raises each outcome in turn; returns (result, models used)."""
        used = []
        self.calls = 0
        self.used = used

        def fake(instance, *args, **kwargs):
            used.append(instance.model_name)
            self.calls = len(used)
            outcome = outcomes[len(used) - 1]
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        with mock.patch.object(ChatOpenAI, "_generate", fake):
            return self.model._generate([]), used

    def test_a_model_not_found_is_tried_again_on_the_same_model(self):
        result, used = self.run_with([not_found(), "answer"])
        self.assertEqual(result, "answer")
        self.assertEqual(used, [self.model.model_name] * 2)

    def test_after_the_retries_the_first_fallback_model_is_used(self):
        result, used = self.run_with([not_found(), not_found(), not_found(), "answer"])
        self.assertEqual(result, "answer")
        self.assertEqual(used, [llm.DEFAULT_MODEL] * 3 + ["muse-spark-1.3"])

    def test_the_fallback_models_are_tried_in_order_until_one_answers(self):
        # Three tries on the main model, then muse-spark-1.3 is unavailable too, and muse-spark-1.2 answers.
        result, used = self.run_with([not_found()] * 4 + ["answer"])
        self.assertEqual(result, "answer")
        self.assertEqual(used[3:], ["muse-spark-1.3", "muse-spark-1.2"])

    def test_when_every_model_is_unavailable_the_error_is_raised_after_one_try_each(self):
        # Before the fix the fallback retried and fell back again until Python's recursion limit (seen in production).
        with self.assertRaises(NotFoundError):
            self.run_with([not_found()] * 20)
        self.assertEqual(self.calls, 3 + len(llm.FALLBACK_MODELS))
        self.assertEqual(self.used[3:], list(llm.FALLBACK_MODELS))

    def test_a_server_error_also_moves_on_to_the_next_model(self):
        result, used = self.run_with([server_error(), server_error(), server_error(), "answer"])
        self.assertEqual(result, "answer")
        self.assertEqual(used[-1], "muse-spark-1.3")

    def test_a_timeout_is_raised_at_once_without_trying_other_models(self):
        with self.assertRaises(APITimeoutError):
            self.run_with([timeout_error(), "answer"])
        self.assertEqual(self.calls, 1)

    def test_the_async_path_uses_the_same_order(self):
        used = []

        async def fake(instance, *args, **kwargs):
            used.append(instance.model_name)
            if len(used) <= 4:
                raise not_found()
            return "answer"

        with mock.patch.object(ChatOpenAI, "_agenerate", fake):
            result = asyncio.run(self.model._agenerate([]))
        self.assertEqual(result, "answer")
        self.assertEqual(used, [llm.DEFAULT_MODEL] * 3 + ["muse-spark-1.3", "muse-spark-1.2"])

    def test_the_fallback_list_can_be_set_and_emptied_by_a_variable(self):
        with mock.patch.dict("os.environ", {"MUSE_FALLBACK_MODELS": " muse-spark-1.2 , muse-spark-1.1 "}):
            self.assertEqual(llm.build_main_llm(api_key="key").fallback_models, ("muse-spark-1.2", "muse-spark-1.1"))
        with mock.patch.dict("os.environ", {"MUSE_FALLBACK_MODELS": ""}):
            model = llm.build_main_llm(api_key="key")
        self.assertEqual(model.fallback_models, ())
        with mock.patch.object(ChatOpenAI, "_generate", side_effect=not_found()), self.assertRaises(NotFoundError):
            model._generate([])

    def test_other_errors_are_raised_at_once(self):
        with self.assertRaises(ValueError):
            self.run_with([ValueError("boom")])


if __name__ == "__main__":
    unittest.main()
