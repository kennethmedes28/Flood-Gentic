"""The FastAPI application.

    uv run uvicorn main:app --reload        # development
    uv run uvicorn main:app --host 0.0.0.0  # behind a proxy; set TRUST_PROXY_HEADERS=true there

Endpoints (see docs/backend_architecture.md section 4):

    POST /chat                  one message through the chat graph
    POST /chat/stream           the same, with progress events first; also takes a photo to check for flood water
    POST /reports, GET /reports community flood reports (unverified)
    POST /requests              supply and assistance requests (write only)
    GET  /evacuation-centers    search the centers
    GET  /advisories/latest     current PAGASA bulletins
    GET  /weather/forecast      stored Tomorrow.io forecast (fetched once a day)
    GET  /weather/stream        the same, streamed live (server-sent events)
    GET  /dashboard             weather, rain, river flow and flood risk per city (recorded datasets)
    GET  /analytics/weather     long-run weather statistics by city, year, month and day (recorded dataset)
    GET  /health, /health/ready what works
    /staff/...                  review reports and requests (only when STAFF_API_KEY is set)
    WS   /ws/voice              live speech-to-text

Interactive documentation is served at /docs.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.rate_limit import RateLimiter, SharedRateLimiter
from src.cache import configure_cache
from src.api.routers import advisories, analytics, chat, dashboard, evacuation, health, help_requests, places, reports, staff, weather
from src.api.settings import Settings, load_settings
from src.api.startup import real_services
from src.services.media_upload import MAX_IMAGE_BASE64_CHARS
from voice.websocket_router import create_voice_router


MAX_REQUEST_BYTES = MAX_IMAGE_BASE64_CHARS + 100_000  # a photo as base64 text, plus room for the rest of the message


async def validation_error_response(request: Request, error: RequestValidationError) -> JSONResponse:
    """The 422 answer, with only where each problem is and what it is.

    FastAPI's default also repeats the value that was sent. Here that is left out, because it can be
    a phone number or a place, and because a value such as NaN cannot be written back as JSON at all.
    """
    problems = [{"loc": item["loc"], "msg": item["msg"], "type": item["type"]} for item in error.errors()]
    return JSONResponse(status_code=422, content={"detail": problems})


def create_app(settings: Settings | None = None, lifespan=real_services) -> FastAPI:
    """Build the app. Tests pass their own ``settings`` and a ``lifespan`` that sets fakes on ``app.state``."""
    settings = settings or load_settings()

    app = FastAPI(
        title="Flood-Gentic API",
        version="0.1.0",
        description="Flood assistant for Metro Manila. Reports and requests are unverified community input.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.add_exception_handler(RequestValidationError, validation_error_response)
    cache = configure_cache(settings.redis_url)

    def make_limiter(name: str, max_calls: int, window_seconds: int):
        """A limit shared through Redis when it is set up, otherwise one counted in this process."""
        if cache.enabled:
            return SharedRateLimiter(name, max_calls, window_seconds, cache.client)
        return RateLimiter(max_calls, window_seconds)

    app.state.limiters = {
        "chat": make_limiter("chat", settings.chat_per_minute, 60),
        "reports": make_limiter("reports", settings.reports_per_hour, 3600),
        "requests": make_limiter("requests", settings.requests_per_hour, 3600),
        "staff": make_limiter("staff", settings.staff_per_minute, 60),
        "weather": make_limiter("weather", settings.weather_per_minute, 60),
        "media": make_limiter("media", settings.media_per_hour, 3600),
    }

    @app.middleware("http")
    async def limit_body_size(request: Request, call_next):
        """Refuse a request that says its body is larger than its endpoint needs: a chat message with a photo."""
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > MAX_REQUEST_BYTES:
            return JSONResponse(status_code=413, content={"detail": "That request is too large."})
        return await call_next(request)

    # Browsers may call the API only from the listed origins. This does not cover the WebSockets.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    for module in (health, chat, reports, help_requests, evacuation, advisories, dashboard, analytics, places, weather):
        app.include_router(module.router)
    if settings.staff_api_key:  # without a key the staff endpoints simply do not exist
        app.include_router(staff.router)
    app.include_router(create_voice_router())
    return app
