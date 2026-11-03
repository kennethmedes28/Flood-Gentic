"""A small cache in Redis. When Redis is not set up or not reachable, every call just does the work itself.

Set ``REDIS_URL`` (for example ``redis://default:password@host:6379``) to turn it on. Without it, ``NullCache`` is used:
nothing is stored and nothing can fail, which is what local work and the tests use.

What goes in: small JSON answers (weather, dashboard, analytics, lists, SAM measurements of a photo). What must NOT go
in: photos, videos or model files. Keys are plain text under the ``floodgentic:`` prefix and every value expires.

A Redis problem is logged (at most once a minute) and treated as "not in the cache", so a Redis outage never takes the
API down.

Example:
    cache = get_cache()
    data = cache.get_or_set("dashboard:manila", 300, lambda: build_dashboard(["manila"]))
"""

import json
import logging
import time
from collections.abc import Callable
from typing import Any

from fastapi.encoders import jsonable_encoder

logger = logging.getLogger(__name__)

KEY_PREFIX = "floodgentic:"
CONNECT_TIMEOUT_SECONDS = 1.0
COMMAND_TIMEOUT_SECONDS = 1.0
LOG_EVERY_SECONDS = 60


class NullCache:
    """The cache when Redis is off: it never has anything, and ``get_or_set`` just calls the function."""

    enabled = False
    client = None

    def get_json(self, key: str) -> Any | None:
        return None

    def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        return None

    def get_or_set(self, key: str, ttl_seconds: int, compute: Callable[[], Any]) -> Any:
        return compute()


class RedisCache:
    """The cache backed by a Redis client. Any Redis error counts as a miss."""

    enabled = True

    def __init__(self, client):
        self.client = client
        self._last_logged = 0.0

    def _problem(self, action: str, error: Exception) -> None:
        """Log a Redis problem, but not more than once a minute."""
        now = time.monotonic()
        if now - self._last_logged >= LOG_EVERY_SECONDS:
            self._last_logged = now
            logger.warning("Redis %s failed (%s); continuing without the cache.", action, type(error).__name__)

    def get_json(self, key: str) -> Any | None:
        """The stored value, or None when there is none (or Redis cannot be reached)."""
        try:
            text = self.client.get(KEY_PREFIX + key)
            return json.loads(text) if text is not None else None
        except Exception as error:
            self._problem("read", error)
            return None

    def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        """Store a value for ``ttl_seconds``. Dates and similar values are turned into text first."""
        try:
            self.client.set(KEY_PREFIX + key, json.dumps(jsonable_encoder(value)), ex=ttl_seconds)
        except Exception as error:
            self._problem("write", error)

    def get_or_set(self, key: str, ttl_seconds: int, compute: Callable[[], Any]) -> Any:
        """The stored value, or ``compute()`` stored for next time.

        The stored copy is plain JSON (dates become text), which is what the API's response models read.
        """
        found = self.get_json(key)
        if found is not None:
            return found
        value = compute()
        self.set_json(key, value, ttl_seconds)
        return value


_cache: NullCache | RedisCache = NullCache()


def build_cache(redis_url: str | None) -> NullCache | RedisCache:
    """A Redis cache for the URL, or the do-nothing cache when there is no URL or the client cannot be created."""
    if not redis_url:
        return NullCache()
    try:
        import redis

        client = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=CONNECT_TIMEOUT_SECONDS,
            socket_timeout=COMMAND_TIMEOUT_SECONDS,
        )
    except Exception as error:
        logger.warning("Redis is not used: %s", type(error).__name__)
        return NullCache()
    return RedisCache(client)


def configure_cache(redis_url: str | None) -> NullCache | RedisCache:
    """Choose the cache for this process (called once when the app is created)."""
    global _cache
    _cache = build_cache(redis_url)
    return _cache


def get_cache() -> NullCache | RedisCache:
    """The cache of this process."""
    return _cache
