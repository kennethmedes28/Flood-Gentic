"""POST /chat: send one message through the chat graph and get the reply."""

import json
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from langgraph_orchestrator.graph import ask_reply
from langgraph_orchestrator.stream import ask_stream
from src.api.deps import DATABASE_UNAVAILABLE, get_graph, limit_requests
from src.api.schemas import ChatRequest, ChatResponse

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
async def chat_stream(body: ChatRequest, graph=Depends(get_graph)) -> StreamingResponse:
    """The same as POST /chat, but the answer arrives as progress first.

    The body is one JSON object per line (``application/x-ndjson``): "status" events that say what the assistant
    is doing, then one "reply" event (the same fields as POST /chat) or one "error" event. The words of the
    reply are not streamed, because the agents produce the whole answer at once.
    """
    thread_id = str(body.thread_id) if body.thread_id else str(uuid4())
    location = body.location.model_dump() if body.location else None

    async def lines():
        async for event in ask_stream(graph, body.message, thread_id, location=location):
            yield json.dumps(event) + "\n"

    # no-transform and X-Accel-Buffering stop proxies from holding the lines back until the end.
    return StreamingResponse(
        lines(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}
    )
