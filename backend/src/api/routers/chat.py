"""POST /chat: send one message through the chat graph and get the reply."""

import json
import logging
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from langgraph_orchestrator.graph import ask_reply
from langgraph_orchestrator.stream import ask_stream
from src.api.deps import DATABASE_UNAVAILABLE, get_graph, limit_requests
from pydantic import ValidationError

from src.api.schemas import ChatRequest, ChatResponse, ChatStreamRequest, Coordinates
from src.services.media_upload import MAX_VIDEO_BYTES, VIDEO_TOO_LARGE, BadImage, BadVideo, VideoTooLarge, delete_quietly, save_base64_image, save_video_stream

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse, dependencies=[Depends(limit_requests("chat"))])
async def chat(body: ChatRequest, graph=Depends(get_graph)) -> ChatResponse:
    """Answer one message.

    The first call needs no ``thread_id``; the reply carries one. Send it back with every
    later message so the assistant remembers the place and the last suggested center.
    ``location`` is an optional GPS fix from the app.

    The reply is plain text and carries no separate source list. Use POST /chat/stream to also get progress.
    """
    thread_id = str(body.thread_id) if body.thread_id else str(uuid4())
    location = body.location.model_dump() if body.location else None

    try:
        reply = await ask_reply(graph, body.message, thread_id=thread_id, location=location)
    except Exception:
        # The message text is left out of the log on purpose: it can hold a place and a phone number.
        logger.exception("Chat failed for thread %s", thread_id)
        raise HTTPException(status_code=502, detail=DATABASE_UNAVAILABLE)

    return ChatResponse(thread_id=thread_id, reply=reply.text, safe_answer=reply.safe_answer, blocked=reply.blocked)


@router.post("/chat/stream", dependencies=[Depends(limit_requests("chat"))])
async def chat_stream(request: Request, body: ChatStreamRequest, graph=Depends(get_graph)) -> StreamingResponse:
    """The same as POST /chat, but the answer arrives as progress first, and a photo can be attached.

    The body is one JSON object per line (``application/x-ndjson``): "status" events that say what the assistant
    is doing, then one "reply" event (the same fields as POST /chat) or one "error" event. The words of the
    reply are not streamed, because the agents produce the whole answer at once.

    With ``image`` (a JPEG, PNG or WebP picture as base64 text) the picture is checked for flood water and the
    reply describes it. ``message`` is then optional. The check uses paid SAM requests: 4 for water only (two
    phrases, on the photo and on a mirrored copy), 6 with ``detailed`` (which also counts people and vehicles and estimates
    a rough depth), so photo checks have their own, lower rate limit. The picture is deleted as soon as the answer is done.
    """
    thread_id = str(body.thread_id) if body.thread_id else str(uuid4())
    location = body.location.model_dump() if body.location else None

    picture: Path | None = None
    media = None
    if body.image:
        limit_requests("media")(request)  # photo checks cost more than a text message, so they have their own limit
        try:
            picture = save_base64_image(body.image)
        except BadImage as error:
            raise HTTPException(status_code=422, detail=str(error))
        media = {"kind": "image", "path": str(picture), "estimate_depth": body.detailed, "include_people_and_vehicles": body.detailed}

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


@router.post("/chat/stream/video", dependencies=[Depends(limit_requests("chat"))])
async def chat_stream_video(
    request: Request,
    graph=Depends(get_graph),
    message: str = Query(default="", max_length=1000, description="An optional caption or question about the video."),
    thread_id: UUID | None = Query(default=None),
    lat: float | None = Query(default=None),
    lng: float | None = Query(default=None),
    detailed: bool = Query(default=False, description="Also count people and vehicles: 4 SAM requests instead of 2."),
) -> StreamingResponse:
    """The same as POST /chat/stream with a video: the video itself is the request body.

    Send it with its own ``Content-Type`` (``video/mp4``, ``video/quicktime`` or ``video/webm``); ``message``,
    ``thread_id``, ``lat``, ``lng`` and ``detailed`` go in the query string. The whole video is analysed by SAM (not
    one frame), which can take a minute or two for a long clip, and uses paid SAM requests: 2 for water only (two phrases), 4
    with ``detailed``. Videos share the photo checks' rate limit. The video is deleted as soon as the answer is done.
    The answer is the same lines as POST /chat/stream.
    """
    limit_requests("media")(request)

    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail=VIDEO_TOO_LARGE)

    location = None
    if (lat is None) != (lng is None):
        raise HTTPException(status_code=422, detail="Send both lat and lng, or neither.")
    if lat is not None and lng is not None:
        try:
            location = Coordinates(lat=lat, lng=lng).model_dump()
        except ValidationError as error:
            raise HTTPException(status_code=422, detail=str(error.errors()[0]["msg"]).removeprefix("Value error, "))

    try:
        video = await save_video_stream(request.stream())
    except VideoTooLarge as error:
        raise HTTPException(status_code=413, detail=str(error))
    except BadVideo as error:
        raise HTTPException(status_code=422, detail=str(error))

    media = {"kind": "video", "path": str(video), "estimate_depth": False, "include_people_and_vehicles": detailed}

    async def lines():
        try:
            async for event in ask_stream(graph, message.strip(), str(thread_id or uuid4()), location=location, media=media):
                yield json.dumps(event) + "\n"
        finally:
            delete_quietly(video)  # also runs when the browser disconnects part way

    return StreamingResponse(
        lines(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}
    )
