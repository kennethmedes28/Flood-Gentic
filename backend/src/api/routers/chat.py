"""POST /chat: send one message through the chat graph and get the reply."""

import json
import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from langgraph_orchestrator.graph import ask_reply
from langgraph_orchestrator.stream import ask_stream
from src.api.deps import DATABASE_UNAVAILABLE, get_graph, limit_requests, optional_user, sign_in_required
from src.api.schemas import ChatRequest, ChatResponse, ChatStreamRequest
from src.auth import User
from src.services.media_upload import BadImage, delete_quietly, save_base64_image
from src.services.signed_out import signed_out_emergency_text

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])

@router.post("/chat", response_model=ChatResponse, dependencies=[Depends(limit_requests("chat"))])
async def chat(request: Request, body: ChatRequest, graph=Depends(get_graph), user: User | None = Depends(optional_user)) -> ChatResponse:
    """Answer one message.

    Needs a Google sign-in (``Authorization: Bearer <access token>``), except that an emergency message is answered
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

    try:
        reply = await ask_reply(graph, body.message, thread_id=thread_id, location=location)
    except Exception:
        # The message text is left out of the log on purpose: it can hold a place and a phone number.
        logger.exception("Chat failed for thread %s", thread_id)
        raise HTTPException(status_code=502, detail=DATABASE_UNAVAILABLE)

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
        try:
            async for event in ask_stream(graph, body.message, thread_id, location=location, media=media):
                yield json.dumps(event) + "\n"
        finally:
            delete_quietly(picture)  # also runs when the browser disconnects part way

    # no-transform and X-Accel-Buffering stop proxies from holding the lines back until the end.
    return StreamingResponse(
        lines(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}
    )
