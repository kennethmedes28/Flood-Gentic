"""Tests for the Redis cache and the shared rate limit, using a small fake Redis (no server needed).

Run from the backend folder:  python -m unittest tests.test_cache -v
"""

import sys
import types
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from src.api.rate_limit import SharedRateLimiter
from src.cache import NullCache, RedisCache, build_cache


class FakeRedis:
    """Just enough of a Redis client: get, set, incr, expire and a pipeline of those."""

    def __init__(self, broken: bool = False):
        self.values: dict[str, str] = {}
        self.broken = broken

    def _check(self):
        if self.broken:
            raise ConnectionError("down")

    def get(self, key):
        self._check()
        return self.values.get(key)

    def set(self, key, value, ex=None):
        self._check()
        self.values[key] = value

    def incr(self, key):
        self._check()
        self.values[key] = str(int(self.values.get(key, "0")) + 1)
        return int(self.values[key])

    def expire(self, key, seconds):
        self._check()

    def pipeline(self):
        return FakePipeline(self)


class FakePipeline:
    def __init__(self, redis):
        self.redis, self.steps = redis, []

    def incr(self, key):
        self.steps.append(lambda: self.redis.incr(key))

    def expire(self, key, seconds):
        self.steps.append(lambda: self.redis.expire(key, seconds))

    def execute(self):
        return [step() for step in self.steps]


class CacheTests(unittest.TestCase):
    def test_no_url_gives_the_do_nothing_cache(self):
        cache = build_cache(None)
        self.assertIsInstance(cache, NullCache)
        calls = []
        self.assertEqual(cache.get_or_set("a", 60, lambda: calls.append(1) or 5), 5)
        self.assertEqual(cache.get_or_set("a", 60, lambda: calls.append(1) or 5), 5)
        self.assertEqual(len(calls), 2)  # nothing was kept

    def test_second_call_comes_from_the_cache(self):
        cache = RedisCache(FakeRedis())
        calls = []
        compute = lambda: calls.append(1) or {"day": date(2026, 11, 2), "n": 3}
        first = cache.get_or_set("dashboard:manila", 300, compute)
        second = cache.get_or_set("dashboard:manila", 300, compute)
        self.assertEqual(len(calls), 1)
        self.assertEqual(second, {"day": "2026-11-02", "n": 3})  # dates are stored as text
        self.assertEqual(first["n"], 3)

    def test_a_redis_failure_just_runs_the_function(self):
        cache = RedisCache(FakeRedis(broken=True))
        self.assertEqual(cache.get_or_set("a", 60, lambda: 7), 7)
        self.assertIsNone(cache.get_json("a"))


class SharedRateLimiterTests(unittest.TestCase):
    def test_turns_away_calls_over_the_limit_until_the_next_window(self):
        now = [1000.0]
        limiter = SharedRateLimiter("chat", 2, 60, FakeRedis(), clock=lambda: now[0])
        self.assertIsNone(limiter.retry_after("1.2.3.4"))
        self.assertIsNone(limiter.retry_after("1.2.3.4"))
        wait = limiter.retry_after("1.2.3.4")
        self.assertIsNotNone(wait)
        self.assertLessEqual(wait, 60)
        self.assertIsNone(limiter.retry_after("5.6.7.8"))  # another client has its own count
        now[0] += 60
        self.assertIsNone(limiter.retry_after("1.2.3.4"))  # a new window

    def test_falls_back_to_the_in_memory_limit_when_redis_fails(self):
        limiter = SharedRateLimiter("chat", 1, 60, FakeRedis(broken=True))
        self.assertIsNone(limiter.retry_after("a"))
        self.assertIsNotNone(limiter.retry_after("a"))  # still limited


if __name__ == "__main__":
    unittest.main()
