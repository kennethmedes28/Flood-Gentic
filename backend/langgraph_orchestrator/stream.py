"""Chat with progress: the same answer as ``ask_reply``, preceded by status events.

The agents return their whole answer at once, so the words themselves are not streamed. What is
streamed is what the assistant is doing, so the person is not left looking at a blank wait:

    {"type": "status", "step": "checking", "label": "Checking your message"}
    {"type": "status", "step": "waking",   "label": "Waking up the AI service ..."}   (only when the Render proxy is asleep)
    {"type": "status", "step": "working",  "label": "Checking flood risk and river flow", "topics": [...]}
    {"type": "reply",  "thread_id": ..., "reply": ..., "safe_answer": ..., "blocked": ..., "annotations": ...}
    {"type": "error",  "message": ...}                      (instead of the reply, if something broke)

The step after "checking" is worked out with the same free, keyword-based routing the graph itself
uses (``route_message``), so it names the agent that is really about to run. No model is called for it.

The chat-model and SAM calls go through the Muse proxy on Render, whose free plan sleeps when idle. When the question
needs it and it is asleep, a "waking" step is sent and the answer waits until the proxy is up (``utils/proxy_wakeup.py``),
so the question does not fail on the first try after a quiet period.
"""

import logging
from collections.abc import AsyncIterator

from langchain_core.messages import HumanMessage

from agents.location_agent import location_from_coordinates
from langgraph_orchestrator import graph as chat_graph
from langgraph_orchestrator.intents import split_by_intent
from utils.input_guard import blocked_reply, check_message
from utils.proxy_wakeup import proxy_is_awake, wait_for_proxy
from video.object_search import object_query_concepts

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
    chat_graph.DOCUMENTS_NODE: "Preparing your answer",
    chat_graph.LOCATION_NODE: "Setting your location",
    chat_graph.FLOOD_MEDIA_NODE: "Checking your photo for flood water",
    chat_graph.MULTI_NODE: "Working on each part of your message",
    chat_graph.DURATION_NODE: "Estimating how long the flood may last",
    chat_graph.OUTSIDE_NODE: "Checking whether your place is covered",
}
GENERIC_LABEL = "Working on your question"

# The steps that call the chat model or SAM through the Muse proxy, so they wait for it to wake up when it is asleep.
# The others (hotlines, flood risk, evacuation centers, reports, ...) are answered from data and never wait for it.
NODES_THAT_NEED_THE_PROXY = {
    chat_graph.DOCUMENTS_NODE,
    chat_graph.WEATHER_NODE,
    chat_graph.FLOOD_MEDIA_NODE,
    chat_graph.MULTI_NODE,
}
WAKING_LABEL = (
    "Waking up the AI service, this can take up to a minute… / "
    "Ginigising ang AI service, maaaring umabot ng isang minuto…"
)
# With a question of their own, the picture is also read by the chat model to answer it.
PHOTO_QUESTION_LABEL = "Looking at your photo to answer your question"
# A message that names objects ("human, child, car") is a segmentation request (see video/object_search.py).
PHOTO_OBJECTS_LABEL = "Finding those objects in your photo"


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
    if node == chat_graph.FLOOD_MEDIA_NODE and media:
        asked = bool(question.strip()) and question not in chat_graph.DEFAULT_MEDIA_QUESTIONS.values()
        if asked:
            label = PHOTO_OBJECTS_LABEL if object_query_concepts(question) else PHOTO_QUESTION_LABEL
    # The Render proxy sleeps when idle: wake it first, and say so, instead of letting the model call time out.
    if node in NODES_THAT_NEED_THE_PROXY and not await proxy_is_awake():
        yield {"type": "status", "step": "waking", "label": WAKING_LABEL}
        await wait_for_proxy()

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
        "annotations": result.get("annotations"),  # boxes and water for a checked photo, else None (video/annotations.py)
        "blocked": False,
    }
