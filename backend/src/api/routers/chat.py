"""POST /chat: send one message through the chat graph and get the reply."""

import json
import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from langgraph_orchestrator.graph import ask_reply
from langgraph_orchestrator.stream import ask_stream
from src.api.deps import DATABASE_UNAVAILABLE, get_graph, limit_requests, optional_user, quota_exceeded, sign_in_required
from src.api.schemas import ChatRequest, ChatResponse, ChatStreamRequest
from src.auth import User
from src.services.media_upload import BadImage, delete_quietly, save_base64_image
from src.services.signed_out import signed_out_emergency_text
from src.services.usage import QuotaExceeded
from src.services.usage_meter import UsageScope, start_scope

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


async def count_usage(request: Request, user: User | None, photo: bool, emergency: str | None) -> bool:
    """Count this message against the signed-in user's spending caps. Returns True when it is counted (and should be recorded).

    Returns False when nothing is counted (no user, or the counters are off). When a cap is used up the message is refused
    with a 429, EXCEPT an emergency message (``emergency`` is its fixed answer): that is never stopped, so it returns False and
    the caller answers it with the fixed text. The same goes for a database problem with the counters: an emergency is still
    answered, anything else is a 503, so the caps cannot be skipped by breaking the database.
    """
    tracker = getattr(request.app.state, "usage", None)
    if user is None or tracker is None:
        return False
    try:
        await run_in_threadpool(tracker.count_chat_request, user.id, photo, user.email)
    except QuotaExceeded as exceeded:
        if emergency is None:
            raise quota_exceeded(exceeded)
        return False
    except Exception as error:
        logger.error("Usage counters failed: %s", type(error).__name__)
        if emergency is None:
            raise HTTPException(status_code=503, detail=DATABASE_UNAVAILABLE)
        return False
    return True


async def record_usage(request: Request, user: User, scope: UsageScope) -> None:
    """Add what the finished request really used (chat-model tokens, SAM requests) to the user's counters."""
    try:
        await run_in_threadpool(request.app.state.usage.record, user.id, scope.tokens, scope.sam_requests)
    except Exception as error:
        logger.error("Usage could not be recorded: %s", type(error).__name__)

@router.post("/chat", response_model=ChatResponse, dependencies=[Depends(limit_requests("chat"))])
async def chat(request: Request, body: ChatRequest, graph=Depends(get_graph), user: User | None = Depends(optional_user)) -> ChatResponse:
    """Answer one message.

    Needs a Google or Facebook sign-in (``Authorization: Bearer <access token>``), except that an emergency message is answered
    with the fixed 911 and hotline text without one (see ``src/services/signed_out.py``).

    The first call needs no ``thread_id``; the reply carries one. Send it back with every
    later message so the assistant remembers the place and the last suggested center.
    ``location`` is an optional GPS fix from the app.

    The reply is plain text and carries no separate source list. Use POST /chat/stream to also get progress.
    """
    thread_id = str(body.thread_id) if body.thread_id else str(uuid4())
    location = body.location.model_dump() if body.location else None

    if user is None and request.app.state.settings.require_auth:
        emergency = signed_out_emergency_text(body.message, location)
        if emergency is None:
            raise sign_in_required()
        return ChatResponse(thread_id=thread_id, reply=emergency, safe_answer=False, blocked=False)

    emergency = signed_out_emergency_text(body.message, location)  # the fixed answer when this is an emergency, else None
    counted = await count_usage(request, user, photo=False, emergency=emergency)
    if emergency is not None and user is not None and not counted and getattr(request.app.state, "usage", None) is not None:
        # A cap is used up (or the counters are down), but an emergency is never refused: the fixed answer goes out.
        return ChatResponse(thread_id=thread_id, reply=emergency, safe_answer=False, blocked=False)

    scope = start_scope()
    try:
        reply = await ask_reply(graph, body.message, thread_id=thread_id, location=location)
    except Exception:
        # The message text is left out of the log on purpose: it can hold a place and a phone number.
        logger.exception("Chat failed for thread %s", thread_id)
        raise HTTPException(status_code=502, detail=DATABASE_UNAVAILABLE)
    finally:
        if counted:
            await record_usage(request, user, scope)

    return ChatResponse(thread_id=thread_id, reply=reply.text, safe_answer=reply.safe_answer, blocked=reply.blocked)


@router.post("/chat/stream", dependencies=[Depends(limit_requests("chat"))])
async def chat_stream(
    request: Request, body: ChatStreamRequest, graph=Depends(get_graph), user: User | None = Depends(optional_user)
) -> StreamingResponse:
    """The same as POST /chat, but the answer arrives as progress first, and a photo can be attached.

    The body is one JSON object per line (``application/x-ndjson``): "status" events that say what the assistant
    is doing, then one "reply" event (the same fields as POST /chat) or one "error" event. The words of the
    reply are not streamed, because the agents produce the whole answer at once.

    With ``image`` (a JPEG, PNG or WebP picture as base64 text) the picture is checked for flood water and the
    reply describes it. ``message`` is then optional. The check uses paid SAM requests: 4 for water only (two
    phrases, on the photo and on a mirrored copy), 6 with ``detailed`` (which also counts people and vehicles), so photo checks have their own, lower rate limit. The picture is deleted as soon as the answer is done.
    """
    thread_id = str(body.thread_id) if body.thread_id else str(uuid4())
    location = body.location.model_dump() if body.location else None

    if user is None and request.app.state.settings.require_auth:
        # Signed out: only the fixed emergency answer, and never with a photo (a photo check costs paid SAM requests).
        emergency = None if body.image else signed_out_emergency_text(body.message, location)
        if emergency is None:
            raise sign_in_required()
        event = {"type": "reply", "thread_id": thread_id, "reply": emergency, "safe_answer": False, "blocked": False}
        return StreamingResponse(iter([json.dumps(event) + "\n"]), media_type="application/x-ndjson")

    emergency = None if body.image else signed_out_emergency_text(body.message, location)
    counted = await count_usage(request, user, photo=bool(body.image), emergency=emergency)
    if emergency is not None and user is not None and not counted and getattr(request.app.state, "usage", None) is not None:
        event = {"type": "reply", "thread_id": thread_id, "reply": emergency, "safe_answer": False, "blocked": False}
        return StreamingResponse(iter([json.dumps(event) + "\n"]), media_type="application/x-ndjson")

    picture: Path | None = None
    media = None
    if body.image:
        limit_requests("media")(request)  # photo checks cost more than a text message, so they have their own limit
        try:
            picture = save_base64_image(body.image)
        except BadImage as error:
            raise HTTPException(status_code=422, detail=str(error))

        media = {"kind": "image", "path": str(picture), "include_people_and_vehicles": body.detailed}

    async def lines():
        scope = start_scope()  # measures this request's chat-model tokens and SAM requests
        try:
            async for event in ask_stream(graph, body.message, thread_id, location=location, media=media):
                yield json.dumps(event) + "\n"
        finally:
            delete_quietly(picture)  # also runs when the browser disconnects part way
            if counted:
                await record_usage(request, user, scope)

    # no-transform and X-Accel-Buffering stop proxies from holding the lines back until the end.
    return StreamingResponse(
        lines(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}
    )
