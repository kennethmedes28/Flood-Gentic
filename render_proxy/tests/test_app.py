"""Tests for the Muse proxy. Meta's API is replaced by a fake, so no network call is made.

Run from the render_proxy folder:  python -m pytest -q
"""

import os
import sys
import unittest
from pathlib import Path
from unittest import mock

import httpx
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app as proxy  # noqa: E402

SECRET = "shared-secret-for-tests"
META_KEY = "meta-key-for-tests"


class StreamedBody(httpx.AsyncByteStream):
    """A response body that arrives as a stream, as Meta's do (httpx's test transport reads plain bodies in full first)."""

    def __init__(self, data: bytes):
        self.data = data

    async def __aiter__(self):
        yield self.data


def meta_answer(status: int, data: bytes, content_type: str) -> httpx.Response:
    return httpx.Response(status, stream=StreamedBody(data), headers={"content-type": content_type})


class FakeMeta:
    """Stands in for Meta's API: records each request and answers like the real one."""

    def __init__(self):
        self.requests: list[httpx.Request] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.path.endswith("/responses"):
            stream = b'event: response.created\ndata: {"id": "resp_1"}\n\ndata: [DONE]\n\n'
            return meta_answer(200, stream, "text/event-stream")
        return meta_answer(200, b'{"choices": [{"message": {"content": "OK"}}]}', "application/json")


class ProxyTests(unittest.TestCase):
    def setUp(self):
        environment = mock.patch.dict(os.environ, {"MUSE_API": META_KEY, "MUSE_PROXY_SECRET": SECRET})
        environment.start()
        self.addCleanup(environment.stop)
        self.meta = FakeMeta()
        proxy.app.state.client = httpx.AsyncClient(transport=httpx.MockTransport(self.meta.handle))
        self.addCleanup(setattr, proxy.app.state, "client", None)
        self.client = TestClient(proxy.app)

    def post(self, path, secret=SECRET, headers=None, **kwargs):
        """POST with the shared secret (or none, when ``secret`` is None) plus any other headers."""
        all_headers = dict(headers or {})
        if secret is not None:
            all_headers["Authorization"] = f"Bearer {secret}"
        return self.client.post(path, headers=all_headers, **kwargs)

    def test_health_needs_no_secret_and_reveals_nothing(self):
        body = self.client.get("/health").json()
        self.assertEqual(body, {"ok": True, "key_set": True, "secret_set": True})

    def test_a_chat_call_is_forwarded_with_the_meta_key_not_the_secret(self):
        response = self.post("/v1/chat/completions", json={"model": "muse-wonder-1.0", "messages": []})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["choices"][0]["message"]["content"], "OK")
        sent = self.meta.requests[0]
        self.assertEqual(sent.url, "https://api.meta.ai/v1/chat/completions")
        self.assertEqual(sent.headers["authorization"], f"Bearer {META_KEY}")
        self.assertNotIn(SECRET, str(sent.headers))
        self.assertIn(b"muse-wonder-1.0", sent.content)

    def test_a_sam_stream_is_passed_back_unchanged(self):
        response = self.post("/v1/responses", json={"model": "sam-3.1"}, headers={"Accept": "text/event-stream"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers["content-type"].startswith("text/event-stream"))
        self.assertIn("event: response.created", response.text)
        self.assertIn("[DONE]", response.text)

    def test_a_missing_or_wrong_secret_is_refused_before_meta_is_called(self):
        for secret in (None, "wrong", ""):
            self.assertEqual(self.post("/v1/chat/completions", secret=secret, json={}).status_code, 401, secret)
        self.assertEqual(self.meta.requests, [])

    def test_without_a_secret_configured_every_call_is_refused(self):
        with mock.patch.dict(os.environ, {"MUSE_PROXY_SECRET": ""}):
            self.assertEqual(self.post("/v1/chat/completions", secret="", json={}).status_code, 401)
        self.assertEqual(self.meta.requests, [])

    def test_only_chat_and_sam_are_forwarded(self):
        for path in ("/v1/models", "/v1/asr/transcribe", "/v1/files"):
            self.assertEqual(self.post(path, json={}).status_code, 404, path)
        self.assertEqual(self.meta.requests, [])

    def test_meta_errors_are_passed_back_with_their_status(self):
        self.meta.handle = lambda request: meta_answer(404, b'{"error": {"code": "model_not_found"}}', "application/json")
        proxy.app.state.client = httpx.AsyncClient(transport=httpx.MockTransport(self.meta.handle))
        response = self.post("/v1/chat/completions", json={})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"]["code"], "model_not_found")

    def test_an_unreachable_meta_gives_502(self):
        def refuse(request):
            raise httpx.ConnectError("refused", request=request)

        proxy.app.state.client = httpx.AsyncClient(transport=httpx.MockTransport(refuse))
        self.assertEqual(self.post("/v1/chat/completions", json={}).status_code, 502)

    def test_a_body_over_the_limit_is_refused(self):
        with mock.patch.object(proxy, "MAX_BODY_BYTES", 10):
            self.assertEqual(self.post("/v1/responses", content=b"x" * 11).status_code, 413)
        self.assertEqual(self.meta.requests, [])


if __name__ == "__main__":
    unittest.main()
