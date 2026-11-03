"""Tests for the Google sign-in checks: the token verifier, the protected endpoints and the signed-out emergency answer.

A fake verifier stands in for Supabase, so no network is used. Run from the backend folder:  python -m unittest tests.test_auth -v
"""

import json
import sys
import time
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from src.api.app import create_app
from src.api.settings import Settings
from src.auth import TokenVerifier, User, bearer_token
from tests.test_api import FakeConnection, FakeGraph
from contextlib import asynccontextmanager

GOOD_TOKEN = "good-token"
EMERGENCY = "Help, trapped on the roof, the flood is rising"
ISSUER = "https://abcd.supabase.co/auth/v1"


class FakeVerifier:
    """Accepts one token, like a Supabase project that knows one user."""

    def verify(self, token):
        return User(id="user-1", email="a@example.org") if token == GOOD_TOKEN else None


def make_protected_client(graph=None) -> TestClient:
    graph = graph if graph is not None else FakeGraph()

    @asynccontextmanager
    async def fake_services(app):
        app.state.graph = graph
        app.state.get_connection = lambda: FakeConnection()
        app.state.llm_ready = True
        app.state.retriever_ready = False
        yield

    app = create_app(Settings(require_auth=True, supabase_url="https://abcd.supabase.co"), lifespan=fake_services, verifier=FakeVerifier())
    return TestClient(app)


def signed_in() -> dict:
    return {"Authorization": f"Bearer {GOOD_TOKEN}"}


class BearerTokenTests(unittest.TestCase):
    def test_reads_the_token(self):
        self.assertEqual(bearer_token("Bearer abc"), "abc")
        self.assertEqual(bearer_token("bearer  abc "), "abc")

    def test_anything_else_is_no_token(self):
        for header in ("", "abc", "Basic abc", "Bearer", "Bearer "):
            self.assertIsNone(bearer_token(header), header)


class ProtectedEndpointTests(unittest.TestCase):
    def test_a_message_without_sign_in_is_refused(self):
        graph = FakeGraph()
        with make_protected_client(graph) as client:
            response = client.post("/chat", json={"message": "What is the weather in Manila?"})
        self.assertEqual(response.status_code, 401)
        self.assertIn("911", response.json()["detail"])
        self.assertEqual(graph.inputs, [])  # the chat graph (and its model) was never called

    def test_a_bad_token_is_refused(self):
        with make_protected_client() as client:
            response = client.post("/chat", json={"message": "hi"}, headers={"Authorization": "Bearer nope"})
        self.assertEqual(response.status_code, 401)

    def test_a_signed_in_user_is_answered(self):
        graph = FakeGraph(text="Hello")
        with make_protected_client(graph) as client:
            response = client.post("/chat", json={"message": "hi"}, headers=signed_in())
        self.assertEqual((response.status_code, response.json()["reply"]), (200, "Hello"))

    def test_an_emergency_works_without_sign_in_and_never_reaches_the_model(self):
        graph = FakeGraph()
        with make_protected_client(graph) as client:
            response = client.post("/chat", json={"message": EMERGENCY})
        self.assertEqual(response.status_code, 200)
        self.assertIn("call 911", response.json()["reply"])
        self.assertEqual(graph.inputs, [])

    def test_a_signed_out_emergency_gets_the_hotlines_of_its_city(self):
        with make_protected_client() as client:
            response = client.post("/chat", json={"message": "Trapped by the flood in Marikina, please help"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("Marikina", response.json()["reply"])

    def test_the_stream_refuses_signed_out_messages_and_photos(self):
        with make_protected_client() as client:
            self.assertEqual(client.post("/chat/stream", json={"message": "weather in Pasig?"}).status_code, 401)
            photo = client.post("/chat/stream", json={"message": EMERGENCY, "image": "aGk="})  # even an emergency: a photo costs money
            self.assertEqual(photo.status_code, 401)

    def test_the_stream_answers_a_signed_out_emergency_with_one_reply_line(self):
        with make_protected_client() as client:
            response = client.post("/chat/stream", json={"message": EMERGENCY})
        lines = [json.loads(line) for line in response.text.splitlines() if line.strip()]
        self.assertEqual(response.status_code, 200)
        self.assertEqual([line["type"] for line in lines], ["reply"])
        self.assertIn("911", lines[0]["reply"])

    def test_public_pages_need_no_sign_in(self):
        with make_protected_client() as client:
            self.assertEqual(client.get("/health").status_code, 200)

    def test_cors_allows_the_authorization_header(self):
        with make_protected_client() as client:
            response = client.options(
                "/chat", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization"}
            )
        self.assertEqual(response.status_code, 200)
        self.assertIn("authorization", response.headers["access-control-allow-headers"].lower())


class VoiceSocketTests(unittest.TestCase):
    def test_voice_needs_a_valid_token(self):
        with make_protected_client() as client:
            with self.assertRaises(WebSocketDisconnect):
                with client.websocket_connect("/ws/voice"):
                    pass
            with self.assertRaises(WebSocketDisconnect):
                with client.websocket_connect("/ws/voice?token=nope"):
                    pass


class TokenVerifierTests(unittest.TestCase):
    """The real verifier, with a key pair made here instead of Supabase's published keys."""

    def setUp(self):
        self.private_key = ec.generate_private_key(ec.SECP256R1())
        self.verifier = TokenVerifier("https://abcd.supabase.co")
        self.verifier._keys = types.SimpleNamespace(
            get_signing_key_from_jwt=lambda token: types.SimpleNamespace(key=self.private_key.public_key())
        )

    def token(self, **changes):
        claims = {"sub": "user-9", "email": "x@example.org", "aud": "authenticated", "iss": ISSUER, "exp": int(time.time()) + 600}
        claims.update(changes)
        return jwt.encode({k: v for k, v in claims.items() if v is not None}, self.private_key, algorithm="ES256")

    def test_a_good_token_gives_the_user(self):
        self.assertEqual(self.verifier.verify(self.token()), User(id="user-9", email="x@example.org"))

    def test_an_expired_token_is_refused(self):
        self.assertIsNone(self.verifier.verify(self.token(exp=int(time.time()) - 10)))

    def test_a_token_for_another_project_or_audience_is_refused(self):
        self.assertIsNone(self.verifier.verify(self.token(iss="https://other.supabase.co/auth/v1")))
        self.assertIsNone(self.verifier.verify(self.token(aud="something-else")))

    def test_a_token_signed_with_another_key_is_refused(self):
        forged = jwt.encode({"sub": "u", "aud": "authenticated", "iss": ISSUER, "exp": int(time.time()) + 600}, ec.generate_private_key(ec.SECP256R1()), algorithm="ES256")
        self.assertIsNone(self.verifier.verify(forged))

    def test_garbage_is_refused(self):
        self.assertIsNone(self.verifier.verify("not.a.jwt"))


if __name__ == "__main__":
    unittest.main()
