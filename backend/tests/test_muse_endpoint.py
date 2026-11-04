"""Tests for where the chat-model and SAM calls go: Meta directly, or the Muse proxy on Render. No network is used.

Run from the backend folder:  python -m unittest tests.test_muse_endpoint -v
"""

import asyncio
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils import llm  # noqa: E402
from utils.muse_endpoint import META_API_URL, muse_endpoint  # noqa: E402
from video.sam_client import SamClient  # noqa: E402

PROXY = {"MUSE_PROXY_URL": "https://muse-proxy.onrender.com/", "MUSE_PROXY_SECRET": "shared-secret"}


class EndpointTests(unittest.TestCase):
    def test_without_a_proxy_the_calls_go_to_meta_with_the_meta_key(self):
        with mock.patch.dict(os.environ, {"MUSE_PROXY_URL": "", "MUSE_PROXY_SECRET": ""}):
            self.assertEqual(muse_endpoint("meta-key"), (META_API_URL, "meta-key"))

    def test_with_a_proxy_the_calls_go_there_with_the_secret_not_the_meta_key(self):
        with mock.patch.dict(os.environ, PROXY):
            self.assertEqual(muse_endpoint("meta-key"), ("https://muse-proxy.onrender.com/v1", "shared-secret"))

    def test_a_proxy_address_without_a_secret_is_a_clear_error(self):
        with mock.patch.dict(os.environ, {"MUSE_PROXY_URL": "https://muse-proxy.onrender.com", "MUSE_PROXY_SECRET": ""}):
            with self.assertRaises(RuntimeError):
                muse_endpoint("meta-key")

    def test_the_chat_model_uses_the_proxy_when_it_is_set(self):
        with mock.patch.dict(os.environ, PROXY):
            model = llm.build_main_llm(api_key="meta-key")
        self.assertEqual(str(model.openai_api_base), "https://muse-proxy.onrender.com/v1")
        self.assertEqual(model.openai_api_key.get_secret_value(), "shared-secret")

    def test_the_chat_model_calls_meta_directly_without_the_proxy(self):
        with mock.patch.dict(os.environ, {"MUSE_PROXY_URL": ""}):
            model = llm.build_main_llm(api_key="meta-key")
        self.assertEqual(str(model.openai_api_base), META_API_URL)
        self.assertEqual(model.openai_api_key.get_secret_value(), "meta-key")

    def test_sam_uses_the_proxy_when_it_is_set_and_meta_otherwise(self):
        async def open_and_close(**environment):
            with mock.patch.dict(os.environ, environment):
                client = SamClient("meta-key")
            details = (client._base_url, client._api_key)
            await client._http.aclose()
            return details

        self.assertEqual(asyncio.run(open_and_close(**PROXY)), ("https://muse-proxy.onrender.com/v1", "shared-secret"))
        self.assertEqual(asyncio.run(open_and_close(MUSE_PROXY_URL="")), (META_API_URL, "meta-key"))


if __name__ == "__main__":
    unittest.main()
