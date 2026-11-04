"""The main chat model for the agents: Muse Wonder first, then the Muse Spark models when Wonder is unavailable.

Muse's API is OpenAI-compatible, so the standard LangChain OpenAI client is used
with Meta's base URL. The weather and document agents take the model as an
argument, so this is the one place that decides which model they get:

    llm = build_main_llm()
    async with open_chat_graph(llm, retriever) as graph:
        ...

Settings can be overridden with environment variables (useful for trying
another model without editing code):

    MUSE_API               the API key (required)
    MUSE_CHAT_MODEL        the first model tried, default ``muse-wonder-1.0``
    MUSE_FALLBACK_MODELS   the models tried next, in order, separated by commas
                           (default ``FALLBACK_MODELS`` below; empty means no fallback)
    MUSE_REASONING_EFFORT  ``minimal``, ``low`` (default), ``medium`` or ``high``

Fallback order: the main model is tried, and tried again a couple of times when the API answers "model_not_found" (it
sometimes does for a model that works a moment later). If it is still unavailable, each fallback model is tried once, in
order, until one answers. "Unavailable" means "model_not_found" (404) or a server error (5xx). A timeout or a lost
connection is raised at once instead: another model would not help, and several timeouts in a row would keep the
person waiting for minutes.

High effort gives the most careful answers but the slowest ones: much of the
time is hidden thinking, counted as output tokens (see docs/agent_benchmarks.md, where
``minimal`` was 2 to 4 times faster on the Spark models).
"""

import asyncio
import logging
import os
import time

from langchain_openai import ChatOpenAI
from openai import InternalServerError, NotFoundError

from src.services.usage_meter import TokenCounter
from utils.muse_endpoint import META_API_URL, muse_endpoint

BASE_URL = META_API_URL  # used when MUSE_PROXY_URL is not set (see utils/muse_endpoint.py)
DEFAULT_MODEL = "muse-wonder-1.0"
DEFAULT_REASONING_EFFORT = "low"  # the server has no GPU, and "low" is several times faster than "high" (docs/agent_benchmarks.md)
REQUEST_TIMEOUT_SECONDS = 45.0  # a stalled call fails with the "try again" reply instead of leaving the page waiting

# Meta's API sometimes answers "model_not_found" (HTTP 404) for a model that exists and works a moment later (seen in the
# production logs, for documents and photos alike). The OpenAI client does not retry a 404, so this module does.
MODEL_NOT_FOUND_RETRIES = 2  # extra tries on the same model
RETRY_PAUSE_SECONDS = 0.7  # doubled before each further try
# Tried once each, in this order, when the main model is unavailable (all checked to answer the weather question).
FALLBACK_MODELS = ("muse-spark-1.3", "muse-spark-1.2", "muse-spark-1.3-contributor", "muse-spark-1.2-contributor")

# Errors that mean "this model is unavailable right now", so the next model is tried. Any other error is raised at once.
UNAVAILABLE_ERRORS = (NotFoundError, InternalServerError)

logger = logging.getLogger(__name__)


class RetryingChatOpenAI(ChatOpenAI):
    """ChatOpenAI that moves on to the next model when the current one is unavailable.

    The main model is tried ``MODEL_NOT_FOUND_RETRIES`` extra times first, then each of ``fallback_models`` once, in
    order. Errors other than ``UNAVAILABLE_ERRORS`` are raised at once (the client already retries timeouts, 429 and
    5xx on the same model). When every model is unavailable, the last error is raised.
    """

    # The models tried after the main one, in order (set from MUSE_FALLBACK_MODELS by build_main_llm).
    fallback_models: tuple[str, ...] = FALLBACK_MODELS

    def _generate(self, *args, **kwargs):
        last_error = None

        # 1. The main model, tried again after a short pause.
        pause = RETRY_PAUSE_SECONDS
        for attempt in range(MODEL_NOT_FOUND_RETRIES + 1):
            try:
                return super()._generate(*args, **kwargs)
            except UNAVAILABLE_ERRORS as error:
                last_error = error
                logger.warning("Chat model %s unavailable (try %d): %s", self.model_name, attempt + 1, error)
                if attempt < MODEL_NOT_FOUND_RETRIES:
                    time.sleep(pause)
                    pause *= 2

        # 2. Each fallback model once. ChatOpenAI's own method is called on purpose: the copy is also a
        #    RetryingChatOpenAI, and its _generate would start this whole chain again for every model.
        for name in self._fallback_names():
            try:
                result = ChatOpenAI._generate(self._with_model(name), *args, **kwargs)
                logger.warning("Answered by fallback chat model %s", name)
                return result
            except UNAVAILABLE_ERRORS as error:
                last_error = error
                logger.warning("Fallback chat model %s unavailable: %s", name, error)

        raise last_error

    async def _agenerate(self, *args, **kwargs):
        """The same as ``_generate``, for async callers."""
        last_error = None

        pause = RETRY_PAUSE_SECONDS
        for attempt in range(MODEL_NOT_FOUND_RETRIES + 1):
            try:
                return await super()._agenerate(*args, **kwargs)
            except UNAVAILABLE_ERRORS as error:
                last_error = error
                logger.warning("Chat model %s unavailable (try %d): %s", self.model_name, attempt + 1, error)
                if attempt < MODEL_NOT_FOUND_RETRIES:
                    await asyncio.sleep(pause)
                    pause *= 2

        for name in self._fallback_names():
            try:
                result = await ChatOpenAI._agenerate(self._with_model(name), *args, **kwargs)
                logger.warning("Answered by fallback chat model %s", name)
                return result
            except UNAVAILABLE_ERRORS as error:
                last_error = error
                logger.warning("Fallback chat model %s unavailable: %s", name, error)

        raise last_error

    def _fallback_names(self) -> list[str]:
        """The fallback models to try, in order, without the main model (it was just tried)."""
        return [name for name in self.fallback_models if name != self.model_name]

    def _with_model(self, name: str) -> "ChatOpenAI":
        """The same settings (key, timeout, reasoning effort, token counter) with another model."""
        return self.model_copy(update={"model_name": name})


def fallback_models_from_env() -> tuple[str, ...]:
    """The fallback models from MUSE_FALLBACK_MODELS ("a, b, c"), or ``FALLBACK_MODELS`` when it is not set."""
    value = os.getenv("MUSE_FALLBACK_MODELS")
    if value is None:
        return FALLBACK_MODELS
    return tuple(name.strip() for name in value.split(",") if name.strip())


def build_main_llm(api_key: str | None = None) -> RetryingChatOpenAI:
    """Build the chat model used by the weather and document agents.

    It talks to Meta directly, or to the Muse proxy on Render when MUSE_PROXY_URL is set (see utils/muse_endpoint.py).
    """
    api_key = api_key or os.getenv("MUSE_API")
    if not api_key:
        raise RuntimeError("MUSE_API is not set")
    base_url, key = muse_endpoint(api_key)

    return RetryingChatOpenAI(
        model=os.getenv("MUSE_CHAT_MODEL", DEFAULT_MODEL),
        base_url=base_url,
        api_key=key,
        reasoning_effort=os.getenv("MUSE_REASONING_EFFORT", DEFAULT_REASONING_EFFORT),
        timeout=REQUEST_TIMEOUT_SECONDS,
        fallback_models=fallback_models_from_env(),
        callbacks=[TokenCounter()],  # adds each call's tokens to the signed-in user's usage (see src/services/usage_meter.py)
        # No max_tokens: the model's hidden thinking counts against it, and a low cap
        # can leave nothing for the answer (a 300-token test returned an empty reply).
    )
