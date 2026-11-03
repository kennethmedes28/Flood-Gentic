"""Settings for the API, read from environment variables (and ``backend/.env``).

Nothing secret is stored here. The database and model keys are read where they
are used (``checkpointer/db_config.py`` and ``utils/llm.py``).

Variables, all optional:

    CORS_ORIGINS         comma-separated browser origins allowed to call the API
                         (default ``http://localhost:3000``)
    CHECKPOINTER         ``postgres`` (default, conversations survive restarts) or
                         ``memory`` (for local work; conversations are lost on restart)
    ENABLE_RAG           ``true`` (default) loads the document search at start-up
    TRUST_PROXY_HEADERS  ``true`` only behind a proxy you control (Railway, nginx). The
                         client address is then read from ``X-Forwarded-For``; anyone can
                         fake that header when there is no proxy, so the default is ``false``
    CHAT_PER_MINUTE      calls to POST /chat allowed per client per minute (default 30)
    REPORTS_PER_HOUR     calls to POST /reports allowed per client per hour (default 10)
    REQUESTS_PER_HOUR    calls to POST /requests allowed per client per hour (default 10)
    ORS_API_KEY          OpenRouteService key for the route agent
    STAFF_API_KEY        secret for the /staff endpoints (list and review reports and requests).
                         At least 24 characters, e.g. from `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
                         Without it the /staff endpoints do not exist at all
    USER_REQUESTS_PER_DAY, USER_UPLOADS_PER_DAY, USER_VOICE_PER_DAY, USER_TOKENS_PER_MONTH,
    EVERYONE_REQUESTS_PER_DAY, EVERYONE_UPLOADS_PER_DAY
                         per-user and whole-app spending caps (defaults 20, 3, 8, 150000, 500, 100; see
                         ``src/services/usage.py``). Only signed-in users are counted
    REQUIRE_AUTH         ``true`` (default) means the assistant chat, photo check and voice need a Google sign-in
                         (a Supabase access token). Set ``false`` for local work without Supabase auth. Emergency
                         messages are answered without sign-in either way
    SUPABASE_URL         the project address, for example ``https://abcd.supabase.co`` (default: built from
                         ``SUPABASE_PROJECT_REF``). Needed when ``REQUIRE_AUTH`` is true
    REDIS_URL            Redis address (for example ``redis://default:password@host:6379``). Turns on the cache and the
                         shared rate limits. Without it nothing is cached and the limits are counted in memory
    STAFF_PER_MINUTE     calls to /staff allowed per client per minute (default 60); this also slows key guessing
"""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

from src.services.usage import UsageLimits

CHECKPOINTER_CHOICES = ("postgres", "memory")
MIN_STAFF_KEY_CHARS = 24  # a short key can be guessed


@dataclass(frozen=True)
class Settings:
    """Everything the API can be configured with."""

    cors_origins: tuple[str, ...] = ("http://localhost:3000",)
    checkpointer: str = "postgres"
    enable_rag: bool = True
    trust_proxy_headers: bool = False
    chat_per_minute: int = 30
    reports_per_hour: int = 10
    requests_per_hour: int = 10
    ors_api_key: str | None = None
    staff_api_key: str | None = None
    staff_per_minute: int = 60
    weather_per_minute: int = 30
    media_per_hour: int = 20  # photo checks, which use paid SAM requests
    redis_url: str | None = None  # turns on the Redis cache and shared rate limits
    require_auth: bool = False  # direct construction (tests) is open; load_settings() turns it on unless REQUIRE_AUTH=false
    supabase_url: str | None = None
    usage_limits: UsageLimits = UsageLimits()  # the spending caps of signed-in users


def read_bool(name: str, default: bool) -> bool:
    """Read a true/false variable. Accepts true, 1, yes, on (any case)."""
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in ("true", "1", "yes", "on")


def load_settings() -> Settings:
    """Build the settings from the environment, checking the values that can be wrong."""
    load_dotenv()

    checkpointer = os.getenv("CHECKPOINTER", "postgres").strip().lower()
    if checkpointer not in CHECKPOINTER_CHOICES:
        raise RuntimeError(f"CHECKPOINTER must be one of {CHECKPOINTER_CHOICES}, not {checkpointer!r}")

    staff_api_key = os.getenv("STAFF_API_KEY") or None
    if staff_api_key and len(staff_api_key) < MIN_STAFF_KEY_CHARS:
        raise RuntimeError(f"STAFF_API_KEY must be at least {MIN_STAFF_KEY_CHARS} characters long.")

    require_auth = read_bool("REQUIRE_AUTH", True)
    supabase_url = os.getenv("SUPABASE_URL") or None
    if supabase_url is None and os.getenv("SUPABASE_PROJECT_REF"):
        supabase_url = f"https://{os.environ['SUPABASE_PROJECT_REF'].strip()}.supabase.co"
    if require_auth and supabase_url is None:
        raise RuntimeError("REQUIRE_AUTH is on, so set SUPABASE_URL (or SUPABASE_PROJECT_REF), or set REQUIRE_AUTH=false for local work.")

    origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    return Settings(
        cors_origins=tuple(origin.strip() for origin in origins.split(",") if origin.strip()),
        checkpointer=checkpointer,
        enable_rag=read_bool("ENABLE_RAG", True),
        trust_proxy_headers=read_bool("TRUST_PROXY_HEADERS", False),
        chat_per_minute=int(os.getenv("CHAT_PER_MINUTE", "30")),
        reports_per_hour=int(os.getenv("REPORTS_PER_HOUR", "10")),
        requests_per_hour=int(os.getenv("REQUESTS_PER_HOUR", "10")),
        ors_api_key=os.getenv("ORS_API_KEY") or None,
        staff_api_key=staff_api_key,
        staff_per_minute=int(os.getenv("STAFF_PER_MINUTE", "60")),
        weather_per_minute=int(os.getenv("WEATHER_PER_MINUTE", "30")),
        media_per_hour=int(os.getenv("MEDIA_PER_HOUR", "20")),
        redis_url=os.getenv("REDIS_URL") or None,
        require_auth=require_auth,
        supabase_url=supabase_url,
        usage_limits=UsageLimits(
            user_requests_per_day=int(os.getenv("USER_REQUESTS_PER_DAY", "20")),
            user_uploads_per_day=int(os.getenv("USER_UPLOADS_PER_DAY", "3")),
            user_voice_per_day=int(os.getenv("USER_VOICE_PER_DAY", "8")),
            user_tokens_per_month=int(os.getenv("USER_TOKENS_PER_MONTH", "150000")),
            everyone_requests_per_day=int(os.getenv("EVERYONE_REQUESTS_PER_DAY", "500")),
            everyone_uploads_per_day=int(os.getenv("EVERYONE_UPLOADS_PER_DAY", "100")),
        ),
    )
