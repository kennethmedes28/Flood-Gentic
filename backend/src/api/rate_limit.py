"""Rate limiters: at most N calls per client in a time window.

``RateLimiter`` lives in one process, so with several API replicas each one counts on its own. That is enough to stop a
single client from running up model and database costs. ``SharedRateLimiter`` counts in Redis, so all replicas (and
restarts) share one count; if Redis cannot be reached it falls back to its own in-memory ``RateLimiter``.

Example:
    limiter = RateLimiter(max_calls=30, window_seconds=60)
    wait = limiter.retry_after("203.0.113.7")   # None if allowed, else seconds to wait
"""

import logging
import math
import threading
import time
from collections import deque
from collections.abc import Callable

MAX_TRACKED_CLIENTS = 10_000  # when more are tracked, clients with no recent calls are forgotten


class RateLimiter:
    """Sliding window: a client may make ``max_calls`` calls in any ``window_seconds``."""

    def __init__(self, max_calls: int, window_seconds: float, clock: Callable[[], float] = time.monotonic):
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._clock = clock
        self._calls: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def retry_after(self, client: str) -> int | None:
        """Count a call for the client. Returns None if allowed, or the seconds until it would be.

        A call that is turned away is not counted, so waiting the returned time is enough.
        """
        now = self._clock()
        with self._lock:
            calls = self._calls.setdefault(client, deque())
            while calls and calls[0] <= now - self.window_seconds:
                calls.popleft()

            if len(calls) >= self.max_calls:
                return max(1, math.ceil(calls[0] + self.window_seconds - now))

            calls.append(now)
            if len(self._calls) > MAX_TRACKED_CLIENTS:
                self._forget_idle_clients(now)
            return None

    def _forget_idle_clients(self, now: float) -> None:
        """Drop clients whose calls have all left the window, so memory does not grow without end."""
        idle = [client for client, calls in self._calls.items() if not calls or calls[-1] <= now - self.window_seconds]
        for client in idle:
            del self._calls[client]


logger = logging.getLogger(__name__)


class SharedRateLimiter:
    """A rate limit kept in Redis, with the same ``retry_after`` as ``RateLimiter``.

    It counts calls in fixed windows (one counter per client and window, which Redis deletes when the window ends), so a
    client can briefly make up to twice the limit across the edge of two windows. Turned-away calls are counted too.
    If Redis fails, the in-memory limiter decides instead, so a Redis outage never lets calls through unchecked.
    """

    def __init__(self, name: str, max_calls: int, window_seconds: int, client, clock: Callable[[], float] = time.time):
        self.name = name
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._client = client
        self._clock = clock
        self._fallback = RateLimiter(max_calls, window_seconds)

    def retry_after(self, client: str) -> int | None:
        """Count a call. Returns None if allowed, or the seconds until the next window."""
        now = self._clock()
        window = int(now // self.window_seconds)
        key = f"floodgentic:limit:{self.name}:{client}:{window}"
        try:
            pipeline = self._client.pipeline()
            pipeline.incr(key)
            pipeline.expire(key, self.window_seconds)
            count = pipeline.execute()[0]
        except Exception as error:
            logger.warning("Redis rate limit failed (%s); using the in-memory limit.", type(error).__name__)
            return self._fallback.retry_after(client)

        if count > self.max_calls:
            return max(1, math.ceil((window + 1) * self.window_seconds - now))
        return None
