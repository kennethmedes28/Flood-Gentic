"""Tests for the retry of the chat model when the API wrongly says "model_not_found".

No request is sent: the parent class's _generate is replaced by a fake.

Run from the backend folder:  python -m unittest tests.test_llm_retry -v
"""

import sys
import unittest
from pathlib import Path
from unittest import mock

import httpx
from langchain_openai import ChatOpenAI
from openai import NotFoundError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils import llm


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

        def fake(instance, *args, **kwargs):
            used.append(instance.model_name)
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

    def test_after_the_retries_the_fallback_model_is_used(self):
        result, used = self.run_with([not_found(), not_found(), not_found(), "answer"])
        self.assertEqual(result, "answer")
        self.assertEqual(used[-1], llm.FALLBACK_MODEL)
        self.assertEqual(len(used), 4)

    def test_other_errors_are_raised_at_once(self):
        with self.assertRaises(ValueError):
            self.run_with([ValueError("boom")])


if __name__ == "__main__":
    unittest.main()
