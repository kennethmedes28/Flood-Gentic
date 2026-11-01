"""Chat with progress: the same answer as ``ask_reply``, preceded by status events.

The agents return their whole answer at once, so the words themselves are not streamed. What is
streamed is what the assistant is doing, so the person is not left looking at a blank wait:

    {"type": "status", "step": "checking", "label": "Checking your message"}
    {"type": "status", "step": "working",  "label": "Checking flood risk and river flow", "topics": [...]}
    {"type": "reply",  "thread_id": ..., "reply": ..., "safe_answer": ..., "blocked": ...}
    {"type": "error",  "message": ...}                      (instead of the reply, if something broke)

The step after "checking" is worked out with the same free, keyword-based routing the graph itself
uses (``route_message``), so it names the agent that is really about to run. No model is called for it.
"""

import logging
from collections.abc import AsyncIterator

from langchain_core.messages import HumanMessage

from agents.location_agent import location_from_coordinates
from langgraph_orchestrator import graph as chat_graph
from langgraph_orchestrator.intents import split_by_intent
from utils.input_guard import blocked_reply, check_message

logger = logging.getLogger(__name__)

# What the assistant is doing, for each node of the chat graph. Written for the person waiting.
WORKING_LABELS = {
    chat_graph.EMERGENCY_NODE: "Preparing your safety steps and hotlines",
    chat_graph.REPORT_NODE: "Saving your flood report",
    chat_graph.ROUTE_NODE: "Finding a route that avoids flooded roads",
    chat_graph.EVACUATION_NODE: "Looking for evacuation centers that are not flooded",
    chat_graph.CONTACTS_NODE: "Looking up hotlines for your city",
    chat_graph.FLOOD_RISK_NODE: "Checking rain, river flow and PAGASA for flood risk",
    chat_graph.WEATHER_NODE: "Reading PAGASA and Open-Meteo weather",
    chat_graph.DOCUMENTS_NODE: "Searching the flood guides",
    chat_graph.LOCATION_NODE: "Setting your location",
    chat_graph.FLOOD_MEDIA_NODE: "Checking your photo or video for flood water",
    chat_graph.MULTI_NODE: "Working on each part of your message",
    chat_graph.DURATION_NODE: "Estimating how long the flood may last",
    chat_graph.OUTSIDE_NODE: "Checking whether your place is covered",
}
GENERIC_LABEL = "Working on your question"
# A whole video is uploaded to SAM and analysed there, which takes much longer than a photo.
VIDEO_LABEL = "Analysing your video for flood water. This can take a minute or two"


async def next_node(graph, question: str, config: dict, media: dict | None) -> str | None:
    """The node that will answer this message, or None when that cannot be told.

    Needs the saved conversation (a waiting "which city?" changes where "Marikina" goes), so it asks the
    graph for it. Any failure just means the generic label is shown.
    """
    values: dict = {}
    try:
        saved = await graph.aget_state(config)
        values = dict(saved.values) if saved and saved.values else {}
    except Exception:
        logger.debug("Could not read the saved conversation", exc_info=True)  # the routing below still works without it

    try:
        state = {
            "messages": [HumanMessage(content=question)],
            "pending_intent": values.get("pending_intent"),
            "media": media,
        }
        return chat_graph.route_message(state)
    except Exception:
        logger.debug("Could not work out the next step", exc_info=True)
        return None


async def ask_stream(
    graph, question: str, thread_id: str, location: dict | None = None, media: dict | None = None
) -> AsyncIterator[dict]:
    """Send one user message through the graph and yield status events, then the reply (or an error)."""
    yield {"type": "status", "step": "checking", "label": "Checking your message"}

    # Same first step as ``ask_reply``: a secret or a rule-changing message stops here and costs nothing.
    blocked_category = check_message(question)
    if blocked_category:
        logger.warning("Blocked a %s message in thread %s", blocked_category, thread_id)
        yield {"type": "reply", "thread_id": thread_id, "reply": blocked_reply(blocked_category), "safe_answer": False, "blocked": True}
        return

    config, graph_input = chat_graph.prepare_run(question, thread_id, location, media)

    node = await next_node(graph, question, config, media)
    label = WORKING_LABELS.get(node, GENERIC_LABEL)
    if node == chat_graph.FLOOD_MEDIA_NODE and media and media.get("kind") == "video":
        label = VIDEO_LABEL
    event = {"type": "status", "step": "working", "label": label}
    if node == chat_graph.MULTI_NODE:
        event["topics"] = [intent for intent, _ in split_by_intent(question) or []]
    yield event

    try:
        result = await graph.ainvoke(graph_input, config)
    except Exception:
        # The message text is left out of the log on purpose: it can hold a place and a phone number.
        logger.exception("Chat failed for thread %s", thread_id)
        yield {"type": "error", "message": "The assistant couldn't finish. Please try again in a moment."}
        return

    yield {
        "type": "reply",
        "thread_id": thread_id,
        "reply": result["messages"][-1].content,
        "safe_answer": bool(result.get("safe_answer")),
        "blocked": False,
    }
