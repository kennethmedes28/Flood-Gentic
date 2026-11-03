"""GET /places/evacuation-centers and GET /places/contacts: the lists behind the Evacuation and Contacts pages.

Both read Supabase. The frontend keeps a built-in copy of each list and uses it when these calls fail.
"""

from fastapi import APIRouter, Depends

from src.api.deps import database_unavailable, get_db
from src.api.schemas import ContactOut, PlaceCenterOut
from src.services.places import read_emergency_contacts, read_evacuation_centers

router = APIRouter(tags=["places"])


@router.get("/places/evacuation-centers", response_model=list[PlaceCenterOut])
def all_evacuation_centers(get_connection=Depends(get_db)) -> list[PlaceCenterOut]:
    """Every evacuation center, sorted by city, barangay and name."""
    try:
        rows = read_evacuation_centers(get_connection())
    except Exception as error:
        raise database_unavailable(error)
    return [PlaceCenterOut(**row) for row in rows]


@router.get("/places/contacts", response_model=list[ContactOut])
def all_contacts(get_connection=Depends(get_db)) -> list[ContactOut]:
    """Every emergency contact, in the order of the list. Numbers are exactly as written there."""
    try:
        rows = read_emergency_contacts(get_connection())
    except Exception as error:
        raise database_unavailable(error)
    return [ContactOut(**row) for row in rows]
