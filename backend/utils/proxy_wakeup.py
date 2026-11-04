"""Wake the Muse proxy on Render before a question needs it.

The proxy (``render_proxy/``) runs on Render's free plan, which puts it to sleep after about 15 minutes without calls.
The first call after that waits while Render starts it again, which can take about a minute: longer than the chat model's
45-second timeout, so without this the question would fail. So before a question that needs the chat model or SAM:

    1. ``proxy_is_awake`` asks the proxy's /health with a short timeout. If it answers, nothing else happens.
    2. If it does not, the chat stream tells the person it is waking up, and ``wait_for_proxy`` keeps asking /health
       (each call also nudges Render to start it) until it answers or ``WAKE_TIMEOUT_SECONDS`` have passed.

After the proxy has answered, it is not checked again for ``RECENTLY_AWAKE_SECONDS``: it stays awake for about
15 minutes after a call, so most questions skip the check. Without MUSE_PROXY_URL (local work, calling Meta directly)
there is no proxy and nothing here does anything.
"""

import asyncio
import logging
import os
import time

import httpx

logger = logging.getLogger(__name__)

QUICK_CHECK_SECONDS = 2.0  # an awake proxy answers /health in well under a second
WAKE_TIMEOUT_SECONDS = 90.0  # Render's free plan usually needs under a minute to start it again
WAKE_REQUEST_SECONDS = 15.0  # one /health try while waking; Render may hold it until the proxy is up
WAKE_PAUSE_SECONDS = 2.0  # pause between tries when a try fails at once
RECENTLY_AWAKE_SECONDS = 5 * 60  # well inside the ~15 minutes the proxy stays awake after a call

# When the proxy last answered (time.monotonic()), so most questions skip the check.
_last_seen_awake: float | None = None


def proxy_health_url() -> str | None:
    """The proxy's /health address, or None when the backend calls Meta directly (MUSE_PROXY_URL not set)."""
    proxy_url = (os.getenv("MUSE_PROXY_URL") or "").strip().rstrip("/")
    return f"{proxy_url}/health" if proxy_url else None


def mark_awake() -> None:
    """Remember that the proxy just answered."""
    global _last_seen_awake
    _last_seen_awake = time.monotonic()


def recently_awake() -> bool:
    """True when the proxy answered within the last ``RECENTLY_AWAKE_SECONDS``."""
    return _last_seen_awake is not None and time.monotonic() - _last_seen_awake < RECENTLY_AWAKE_SECONDS


async def _answers(client: httpx.AsyncClient, url: str, timeout: float) -> bool:
    """True when /health answers 200 within ``timeout`` seconds."""
    try:
        response = await client.get(url, timeout=timeout)
        return response.status_code == 200
    except httpx.HTTPError:
        return False


async def proxy_is_awake(client: httpx.AsyncClient | None = None) -> bool:
    """True when there is no proxy, when it answered recently, or when it answers /health right now."""
    url = proxy_health_url()
    if url is None or recently_awake():
        return True
    async with _client(client) as http:
        if await _answers(http, url, QUICK_CHECK_SECONDS):
            mark_awake()
            return True
    return False


async def wait_for_proxy(client: httpx.AsyncClient | None = None, timeout_seconds: float = WAKE_TIMEOUT_SECONDS) -> bool:
    """Keep asking /health until the proxy answers. True when it did, False when ``timeout_seconds`` passed first.

    The question goes ahead either way: if the proxy is still asleep, the agents' own fallbacks answer what they can.
    """
    url = proxy_health_url()
    if url is None:
        return True
    started = time.monotonic()
    async with _client(client) as http:
        while True:
            remaining = timeout_seconds - (time.monotonic() - started)
            if remaining <= 0:
                logger.warning("The Muse proxy did not wake up within %.0f seconds", timeout_seconds)
                return False
            if await _answers(http, url, min(WAKE_REQUEST_SECONDS, remaining)):
                mark_awake()
                logger.info("The Muse proxy woke up after %.1f seconds", time.monotonic() - started)
                return True
            await asyncio.sleep(min(WAKE_PAUSE_SECONDS, max(remaining - 0.1, 0)))


class _client:
    """Use the given client (tests pass a fake one), or open a short-lived one and close it afterwards."""

    def __init__(self, client: httpx.AsyncClient | None):
        self._given = client
        self._own: httpx.AsyncClient | None = None

    async def __aenter__(self) -> httpx.AsyncClient:
        if self._given is not None:
            return self._given
        self._own = httpx.AsyncClient()
        return self._own

    async def __aexit__(self, *exc_info) -> None:
        if self._own is not None:
            await self._own.aclose()
