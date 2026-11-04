"""Muse proxy: forwards the backend's chat-model and SAM calls to Meta's API from Render.

Why it exists: Meta's API refuses the requests that the backend sends from Railway (every chat model answers
"model_not_found" and every SAM request fails), while the same key works from Render (tested on 4 November 2026).
Voice works from Railway, so it is not proxied. The backend on Railway sends only these two kinds of calls here:

    POST /v1/chat/completions   the chat models (muse-wonder-1.0 and the muse-spark fallbacks)
    POST /v1/responses          SAM 3.1 (photo flood check and object search), streamed back as it arrives

How the key is kept safe: the Meta key (MUSE_API) lives only on this service. The backend authenticates with a separate
shared secret (MUSE_PROXY_SECRET) sent as ``Authorization: Bearer <secret>``, the same header the OpenAI client and the
SAM client already send, so the backend only swaps its address and key. The proxy checks the secret, then replaces the
header with the real Meta key. Any other path is refused, so the proxy cannot be used as an open relay to Meta.

Settings (environment variables):

    MUSE_API             Meta's API key (required)
    MUSE_PROXY_SECRET    the shared secret the backend must send (required; without it every call is refused)
    MUSE_UPSTREAM_URL    where to forward to (default https://api.meta.ai/v1; tests point it elsewhere)

Run locally:  uvicorn app:app --port 8100     Health check:  GET /health (no secret needed)
"""

import hmac
import logging
import os
import time

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

UPSTREAM_URL = os.getenv("MUSE_UPSTREAM_URL", "https://api.meta.ai/v1").rstrip("/")

# Only these paths are forwarded. Everything else gets a 404, so the proxy is not a general way into Meta's API.
ALLOWED_PATHS = {"chat/completions", "responses"}

# A photo is sent as base64 text inside the JSON body; the backend allows photos up to 20 MB, which is about 27 MB as base64.
MAX_BODY_BYTES = 30 * 1024 * 1024

# SAM answers as a stream that can take a while; the chat models have their own 45-second timeout in the backend.
UPSTREAM_TIMEOUT = httpx.Timeout(300.0, connect=15.0)

# Headers passed on from the backend's request. Authorization is never passed on: it is replaced by the Meta key.
FORWARDED_REQUEST_HEADERS = ("content-type", "accept")

logger = logging.getLogger("muse_proxy")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title="Muse proxy", docs_url=None, redoc_url=None, openapi_url=None)


def upstream_client() -> httpx.AsyncClient:
    """One HTTP client for all forwarded calls, made on first use (tests replace it with a fake)."""
    if getattr(app.state, "client", None) is None:
        app.state.client = httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT)
    return app.state.client


def secret_is_valid(authorization: str | None) -> bool:
    """True when the request carries ``Bearer <MUSE_PROXY_SECRET>``. Compared in constant time."""
    expected = os.getenv("MUSE_PROXY_SECRET", "")
    if not expected or not authorization or not authorization.startswith("Bearer "):
        return False
    given = authorization.removeprefix("Bearer ").strip()
    return hmac.compare_digest(given.encode(), expected.encode())


@app.get("/health")
async def health() -> dict:
    """For Render's health check and a quick manual test. Says nothing secret."""
    return {"ok": True, "key_set": bool(os.getenv("MUSE_API")), "secret_set": bool(os.getenv("MUSE_PROXY_SECRET"))}


@app.post("/v1/{path:path}")
async def forward(path: str, request: Request) -> StreamingResponse:
    """Check the secret, then forward the call to Meta with the real key and stream the answer back unchanged."""
    if path not in ALLOWED_PATHS:
        raise HTTPException(status_code=404, detail="Not found")
    if not secret_is_valid(request.headers.get("authorization")):
        raise HTTPException(status_code=401, detail="Unauthorized")
    meta_key = os.getenv("MUSE_API")
    if not meta_key:
        raise HTTPException(status_code=503, detail="The proxy has no Meta API key set")

    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request too large")

    headers = {name: request.headers[name] for name in FORWARDED_REQUEST_HEADERS if name in request.headers}
    headers["authorization"] = f"Bearer {meta_key}"

    started = time.perf_counter()
    client = upstream_client()
    upstream_request = client.build_request("POST", f"{UPSTREAM_URL}/{path}", content=body, headers=headers)
    try:
        upstream = await client.send(upstream_request, stream=True)
    except httpx.HTTPError as error:
        logger.error("POST /v1/%s could not reach Meta: %s", path, type(error).__name__)
        raise HTTPException(status_code=502, detail="Could not reach Meta's API") from error

    # Logged without the body or any key: only which call, Meta's status and how long it took to answer.
    logger.info("POST /v1/%s -> %s in %.1fs", path, upstream.status_code, time.perf_counter() - started)
    return StreamingResponse(
        upstream.aiter_raw(),
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
        background=BackgroundTask(upstream.aclose),  # closes Meta's connection once the answer has been passed on
    )
