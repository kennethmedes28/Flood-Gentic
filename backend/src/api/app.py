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
    WS   /ws/voice, /ws/camera  live speech-to-text and the webcam flood check

Interactive documentation is served at /docs.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.rate_limit import RateLimiter
from src.api.routers import advisories, analytics, chat, dashboard, evacuation, health, help_requests, reports, staff, weather
from src.api.settings import Settings, load_settings
from src.api.startup import real_services
from src.services.media_upload import MAX_IMAGE_BASE64_CHARS, MAX_VIDEO_BYTES
from video.camera_router import create_camera_router
from voice.websocket_router import create_voice_router


MAX_REQUEST_BYTES = MAX_IMAGE_BASE64_CHARS + 100_000  # a photo as base64 text, plus room for the rest of the message
VIDEO_PATH = "/chat/stream/video"  # the one endpoint whose body is a whole video, so it has a much larger limit
MAX_VIDEO_REQUEST_BYTES = MAX_VIDEO_BYTES + 100_000


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
    app.state.limiters = {
        "chat": RateLimiter(settings.chat_per_minute, window_seconds=60),
        "reports": RateLimiter(settings.reports_per_hour, window_seconds=3600),
        "requests": RateLimiter(settings.requests_per_hour, window_seconds=3600),
        "staff": RateLimiter(settings.staff_per_minute, window_seconds=60),
        "weather": RateLimiter(settings.weather_per_minute, window_seconds=60),
        "media": RateLimiter(settings.media_per_hour, window_seconds=3600),
    }

    @app.middleware("http")
    async def limit_body_size(request: Request, call_next):
        """Refuse a request that says its body is larger than its endpoint needs: a chat message with a photo, or a video."""
        declared = request.headers.get("content-length", "")
        limit = MAX_VIDEO_REQUEST_BYTES if request.url.path == VIDEO_PATH else MAX_REQUEST_BYTES
        if declared.isdigit() and int(declared) > limit:
            return JSONResponse(status_code=413, content={"detail": "That request is too large."})
        return await call_next(request)

    # Browsers may call the API only from the listed origins. This does not cover the WebSockets.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    for module in (health, chat, reports, help_requests, evacuation, advisories, dashboard, analytics, weather):
        app.include_router(module.router)
    if settings.staff_api_key:  # without a key the staff endpoints simply do not exist
        app.include_router(staff.router)
    app.include_router(create_voice_router())
    app.include_router(create_camera_router())
    return app
