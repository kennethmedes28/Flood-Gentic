"""Measures what ONE request costs, so it can be added to the signed-in user's usage afterwards.

A request sets up a ``UsageScope`` (``start_scope``). While it runs, the chat model's token counts and the SAM requests it makes
are added to that scope, wherever they happen, because the scope is kept in a context variable that follows the request into
the graph and its worker threads. When the request is done, the route reads the totals and records them (see
``src/services/usage.py``).

Outside a request (scripts, tests) there is no scope and nothing is counted.
"""

from contextvars import ContextVar
from dataclasses import dataclass

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult


@dataclass
class UsageScope:
    """What one request has used so far."""

    tokens: int = 0
    sam_requests: int = 0


_scope: ContextVar[UsageScope | None] = ContextVar("usage_scope", default=None)


def start_scope() -> UsageScope:
    """Begin measuring the current request. Each request runs in its own task, so a new scope never leaks into another."""
    scope = UsageScope()
    _scope.set(scope)
    return scope


def add_sam_request(count: int = 1) -> None:
    """Count paid SAM requests against the current request (does nothing outside a request)."""
    scope = _scope.get()
    if scope is not None:
        scope.sam_requests += count


def add_tokens(count: int) -> None:
    scope = _scope.get()
    if scope is not None:
        scope.tokens += count


def tokens_in_result(result: LLMResult) -> int:
    """The total tokens a chat model call used, from the message's usage data (or the provider's summary as a fallback)."""
    total = 0
    for generations in result.generations:
        for generation in generations:
            usage = getattr(getattr(generation, "message", None), "usage_metadata", None)
            if usage:
                total += int(usage.get("total_tokens") or 0)
    if total == 0:
        summary = (result.llm_output or {}).get("token_usage") or {}
        total = int(summary.get("total_tokens") or 0)
    return total


class TokenCounter(BaseCallbackHandler):
    """Attached to the chat model: adds the tokens of every call to the current request's scope."""

    def on_llm_end(self, response: LLMResult, **kwargs) -> None:
        add_tokens(tokens_in_result(response))
