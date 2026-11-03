"""GET /analytics/weather: long-run weather statistics for the "Macro Weather Analytics" page.

Reads the recorded daily data from Supabase (2020 to the last recorded day; the older dataset files are used only if
the database cannot be read), grouped by year, month or day so the page can drill
down. Recorded data only: it is not a forecast and not an official PAGASA statistic.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from agents.location_agent import find_city
from src.api.deps import UNKNOWN_CITY, get_optional_db
from src.api.schemas import AnalyticsOut
from src.cache import get_cache
from src.services.weather_analytics import InvalidFilter, build_analytics

router = APIRouter(tags=["analytics"])

CACHE_SECONDS = 10 * 60  # the recorded days change at most once a night


@router.get("/analytics/weather", response_model=AnalyticsOut)
def weather_analytics(
    city: str | None = Query(default=None, max_length=60, description="One Metro Manila city. Leave out for all of Metro Manila."),
    year: int | None = Query(default=None, ge=2000, le=2100, description="Keep one year: one point per month."),
    month: int | None = Query(default=None, ge=1, le=12, description="Keep one month (needs year): one point per day."),
    day: int | None = Query(default=None, ge=1, le=31, description="Look at one day (needs year and month)."),
    get_connection=Depends(get_optional_db),
) -> AnalyticsOut:
    """Statistics for the chosen city and period. With no year there is one point per year."""
    key = None
    if city and city.strip():
        key = find_city(city)
        if key is None:
            raise HTTPException(status_code=422, detail=UNKNOWN_CITY)
    try:
        data = get_cache().get_or_set(
            f"analytics:{key}:{year}:{month}:{day}",
            CACHE_SECONDS,
            lambda: build_analytics(city=key, year=year, month=month, day=day, get_connection=get_connection),
        )
        return AnalyticsOut(**data)
    except InvalidFilter as error:
        raise HTTPException(status_code=422, detail=str(error))
