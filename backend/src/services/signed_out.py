"""What someone who is NOT signed in may still get from the assistant: the emergency answer.

The assistant needs a Google or Facebook sign-in because it costs money to run. But in a flood, nobody should be refused 911 and the
local hotlines because they are not logged in. So a message that the emergency rules recognise is answered with the same
fixed text the chat graph uses, plus the hotlines of the person's city when the place is known. This uses NO model, NO
database and no photo, so it costs nothing and cannot be run up by someone who is not signed in.

Everything else needs sign-in.
"""

from agents.contacts_agent import format_contacts
from agents.flood_types import Location
from agents.location_agent import resolve_location
from langgraph_orchestrator.graph import EMERGENCY_ANSWER
from langgraph_orchestrator.intents import EMERGENCY, classify_intent


def signed_out_emergency_text(message: str, location: dict | None) -> str | None:
    """The fixed emergency answer when ``message`` is an emergency, otherwise None (the caller must sign in).

    ``location`` is the optional GPS place the app sends (a dictionary as stored in the chat state). When the place can
    be found, the hotlines of its city follow the fixed text.
    """
    if classify_intent(message) != EMERGENCY:
        return None
    place = resolve_location(message) or Location.from_dict(location)
    return EMERGENCY_ANSWER + ("\n\n" + format_contacts(place.city) if place else "")
