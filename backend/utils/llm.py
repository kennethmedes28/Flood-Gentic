"""The main chat model for the agents: Muse Wonder at high reasoning effort.

Muse's API is OpenAI-compatible, so the standard LangChain OpenAI client is used
with Meta's base URL. The weather and document agents take the model as an
argument, so this is the one place that decides which model they get:

    llm = build_main_llm()
    async with open_chat_graph(llm, retriever) as graph:
        ...

Settings can be overridden with environment variables (useful for trying
another model without editing code):

    MUSE_API               the API key (required)
    MUSE_CHAT_MODEL        model name, default ``muse-wonder-1.0``
    MUSE_REASONING_EFFORT  ``minimal``, ``low`` (default), ``medium`` or ``high``

High effort gives the most careful answers but the slowest ones: much of the
time is hidden thinking, billed as output (see docs/agent_benchmarks.md, where
``minimal`` was 2 to 4 times faster on the Spark models).
"""

import asyncio
import logging
import os
import time

from langchain_openai import ChatOpenAI
from openai import NotFoundError

from src.services.usage_meter import TokenCounter

BASE_URL = "https://api.meta.ai/v1"
DEFAULT_MODEL = "muse-wonder-1.0"
DEFAULT_REASONING_EFFORT = "low"  # the server has no GPU, and "low" is several times faster than "high" (docs/agent_benchmarks.md)
REQUEST_TIMEOUT_SECONDS = 45.0  # a stalled call fails with the "try again" reply instead of leaving the page waiting

# Meta's API sometimes answers "model_not_found" (HTTP 404) for a model that exists and works a moment later (seen in the
# production logs, for documents and photos alike). The OpenAI client does not retry a 404, so this module does.
MODEL_NOT_FOUND_RETRIES = 2  # extra tries on the same model
RETRY_PAUSE_SECONDS = 0.7  # doubled before each further try
FALLBACK_MODEL = "muse-spark-1.3"  # the last try, when the main model keeps being "not found"

logger = logging.getLogger(__name__)


class RetryingChatOpenAI(ChatOpenAI):
    """ChatOpenAI that tries again when the API wrongly says the model was not found.

    Every other error is raised at once, as before (the client already retries timeouts, 429 and 5xx).
    After the retries on the main model, one last try uses ``FALLBACK_MODEL`` so a person still gets an answer.
    """

    def _generate(self, *args, **kwargs):
        pause = RETRY_PAUSE_SECONDS
        for attempt in range(MODEL_NOT_FOUND_RETRIES + 1):
            try:
                return super()._generate(*args, **kwargs)
            except NotFoundError as error:
                logger.warning("Chat model not found (try %d): %s", attempt + 1, error)
                if attempt == MODEL_NOT_FOUND_RETRIES:
                    break
                time.sleep(pause)
                pause *= 2
        # One plain try on the fallback model. Calling ChatOpenAI's method directly matters: the fallback is a copy of
        # this class, so its own _generate would retry and fall back again, forever (a RecursionError after minutes).
        return ChatOpenAI._generate(self._fallback(), *args, **kwargs)

    async def _agenerate(self, *args, **kwargs):
        pause = RETRY_PAUSE_SECONDS
        for attempt in range(MODEL_NOT_FOUND_RETRIES + 1):
            try:
                return await super()._agenerate(*args, **kwargs)
            except NotFoundError as error:
                logger.warning("Chat model not found (try %d): %s", attempt + 1, error)
                if attempt == MODEL_NOT_FOUND_RETRIES:
                    break
                await asyncio.sleep(pause)
                pause *= 2
        # One plain try on the fallback model (see _generate for why ChatOpenAI's method is called directly).
        return await ChatOpenAI._agenerate(self._fallback(), *args, **kwargs)

    def _fallback(self) -> "ChatOpenAI":
        """The same settings with the fallback model. The callers make one plain try with it; if that fails, its error is raised."""
        return self.model_copy(update={"model_name": FALLBACK_MODEL})


def build_main_llm(api_key: str | None = None) -> RetryingChatOpenAI:
    """Build the chat model used by the weather and document agents."""
    api_key = api_key or os.getenv("MUSE_API")
    if not api_key:
        raise RuntimeError("MUSE_API is not set")

    return RetryingChatOpenAI(
        model=os.getenv("MUSE_CHAT_MODEL", DEFAULT_MODEL),
        base_url=BASE_URL,
        api_key=api_key,
        reasoning_effort=os.getenv("MUSE_REASONING_EFFORT", DEFAULT_REASONING_EFFORT),
        timeout=REQUEST_TIMEOUT_SECONDS,
        callbacks=[TokenCounter()],  # adds each call's tokens to the signed-in user's usage (see src/services/usage_meter.py)
        # No max_tokens: the model's hidden thinking counts against it, and a low cap
        # can leave nothing for the answer (a 300-token test returned an empty reply).
    )
