"""GET /dashboard: weather, rain, river flow and flood risk for the dashboard page, from the recorded days in Supabase.

The numbers are from the last recorded day (see ``data_date``), which can be behind today. If Supabase cannot be read,
the older files in ``datasets/`` are used instead.
Rule-based and unofficial: not from PAGASA bulletins.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from agents.fetch_supabase_open_meteo_datasets import NCR_LOCATIONS
from agents.location_agent import find_city
from src.api.deps import UNKNOWN_CITY, get_optional_db
from src.api.schemas import DashboardOut
from src.services.dashboard_data import MAX_CITIES, build_dashboard

router = APIRouter(tags=["dashboard"])

DEFAULT_CITIES = ",".join(NCR_LOCATIONS)  # all 17 cities of Metro Manila


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    cities: str = Query(default=DEFAULT_CITIES, max_length=300, description="Metro Manila cities, separated by commas."),
    get_connection=Depends(get_optional_db),
) -> DashboardOut:
    """Return the last recorded conditions and the flood risk for each city, in the order asked."""
    keys: list[str] = []
    for name in cities.split(","):
        if not name.strip():
            continue
        key = find_city(name)
        if key is None or key not in NCR_LOCATIONS:
            raise HTTPException(status_code=422, detail=UNKNOWN_CITY)
        if key not in keys:
            keys.append(key)

    if not keys or len(keys) > MAX_CITIES:
        raise HTTPException(status_code=422, detail=UNKNOWN_CITY)
    return DashboardOut(**build_dashboard(keys, get_connection=get_connection))
