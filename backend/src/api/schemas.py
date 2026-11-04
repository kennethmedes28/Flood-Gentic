"""Request and response bodies of the API (Pydantic models).

Validation lives here, so the routers stay short. Two rules apply everywhere:

    * unknown fields are rejected, so a typo in a field name is an error and not silently ignored;
    * every position must lie inside Metro Manila, which is all this service covers. A GPS
      point outside it would be matched to the nearest Metro Manila city and give a wrong answer.
"""

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from agents.location_agent import NCR_BOUNDS
from src.services.media_upload import MAX_IMAGE_BASE64_CHARS

OUTSIDE_COVERAGE = (
    "This location is outside Metro Manila, which is all this service covers. "
    "If you are in danger, call 911 and contact your local DRRMO. "
    "Nasa labas ito ng Metro Manila, na siya lamang saklaw ng serbisyong ito. "
    "Kung nasa panganib, tumawag sa 911 at makipag-ugnayan sa inyong lokal na DRRMO."
)

# A short piece of text with the spaces around it removed.
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
# Letters (including the Spanish n with a tilde), digits, spaces, dots, apostrophes and hyphens.
# The query parameters use this pattern so "%" and "_" cannot widen a database search.
PLAIN_NAME_PATTERN = r"^[A-Za-zÑñ0-9 .'\-]+$"


class StrictModel(BaseModel):
    """Base class: unknown fields are an error."""

    model_config = ConfigDict(extra="forbid")


class Coordinates(StrictModel):
    """A GPS point inside Metro Manila."""

    lat: float
    lng: float

    @model_validator(mode="after")
    def inside_metro_manila(self) -> "Coordinates":
        west, south, east, north = NCR_BOUNDS
        # Written as "not inside" so that NaN, which fails every comparison, is rejected too.
        if not (south <= self.lat <= north and west <= self.lng <= east):
            raise ValueError(OUTSIDE_COVERAGE)
        return self


# --- Chat -----------------------------------------------------------------------------------


class ChatRequest(StrictModel):
    """One message from the user."""

    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
    # Leave out to start a new conversation; send back the value from the first reply to continue it.
    # It must be a UUID so ids cannot be guessed from a pattern.
    thread_id: UUID | None = None
    location: Coordinates | None = None


class ChatStreamRequest(StrictModel):
    """One message for POST /chat/stream: text, a photo, or both."""

    # May be empty when a photo is attached (the photo is then checked with a default question).
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""
    thread_id: UUID | None = None
    location: Coordinates | None = None
    # A JPEG, PNG or WebP picture as base64 text. It is checked and limited in src/services/media_upload.py.
    image: Annotated[str, StringConstraints(max_length=MAX_IMAGE_BASE64_CHARS)] | None = None
    # With a photo: also count people and vehicles. Slower: 6 SAM requests instead of 4.
    detailed: bool = False

    @model_validator(mode="after")
    def needs_text_or_photo(self):
        if not self.message and not self.image:
            raise ValueError("Send a message, a photo, or both.")
        return self


class ChatResponse(BaseModel):
    """The assistant's reply."""

    thread_id: str
    reply: str
    # True when the reply is the fixed "I am not confident enough" text, so the app can style it differently.
    safe_answer: bool
    # True when the message was stopped before any processing (it held a secret, or tried to change the assistant's rules).
    blocked: bool = False
    # For a checked photo: the boxes (label, confidence, corners) and the water overlay to draw on it (video/annotations.py).
    annotations: dict | None = None


# --- Places in reports and requests ----------------------------------------------------------


class PlaceFields(StrictModel):
    """Where something happened: a city name, a GPS point, or both."""

    city: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)] | None = None
    barangay: ShortText | None = None
    location: Coordinates | None = None

    @model_validator(mode="after")
    def needs_a_place(self):
        if self.city is None and self.location is None:
            raise ValueError("Give a city or a location.")
        return self


class ReportCreate(PlaceFields):
    """A community report of a hazard. Saved as unverified."""

    hazard: Literal["flood", "landslide", "other"] = "flood"
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]


class ReportOut(BaseModel):
    """A report as listed publicly. Phone-number-like digits in the text are hidden."""

    hazard: str
    city: str
    barangay: str | None = None
    body: str
    status: str
    trust_level: str
    created_at: datetime


class RequestCreate(PlaceFields):
    """A supply or assistance request. Saved as unverified."""

    kind: Literal["supply", "assistance"]
    details: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]
    people_count: int | None = Field(default=None, ge=1, le=10000)
    # Optional. Digits with spaces, dashes, brackets and a leading plus.
    contact_phone: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?\d[\d \-()]{5,18}\d$")] | None = None


class Received(BaseModel):
    """Answer to a report or request that was saved."""

    status: str
    message: str


# --- Evacuation centers and advisories ------------------------------------------------------


class EvacuationCenterOut(BaseModel):
    """One evacuation center."""

    name: str
    city: str | None = None
    barangay: str | None = None
    type: str | None = None
    lat: float | None = None
    lng: float | None = None
    notes: str | None = None


class UsageOut(BaseModel):
    """A signed-in user's usage against the spending caps (GET /me/usage)."""

    messages_today: int
    messages_limit: int
    photos_today: int
    photos_limit: int
    voice_today: int
    voice_limit: int
    tokens_this_month: int
    tokens_limit: int
    resets_in_seconds: int
    unlimited: bool = False  # True for an account in UNLIMITED_EMAILS: the per-user limits above do not apply to it


class PlaceCenterOut(BaseModel):
    """One evacuation center as the Evacuation page lists it (GET /places/evacuation-centers)."""

    id: str
    city: str
    barangay: str
    name: str
    type: str
    status: str
    source: str
    lat: float
    lng: float
    notes: str


class ContactOut(BaseModel):
    """One emergency contact number (GET /places/contacts). The number is exactly as written in the list."""

    agency: str
    category: str
    type: str
    number: str
    notes: str
    cities: list[str]


class AdvisoryOut(BaseModel):
    """One official page (a PAGASA bulletin or advisory), shortened."""

    title: str
    source: str
    excerpt: str
    mentions_city: bool | None = None  # only set when a city was asked for


class AdvisoriesOut(BaseModel):
    """Current official advisories, or a plain statement that they could not be read."""

    available: bool
    fetched_at: datetime
    advisories: list[AdvisoryOut]
    note: str


# --- Dashboard ---------------------------------------------------------------------------------


class DayRecordOut(BaseModel):
    """One recorded day, for the charts."""

    date: str
    rain_mm: float | None = None
    high_c: float | None = None
    low_c: float | None = None
    river_flow_m3s: float | None = None


class ReasonCodeOut(BaseModel):
    """One reason for a flood risk level: a code (for example ``peak_rain``) and the number it is about, if any."""

    code: str
    value: float | None = None


class DashboardCityOut(BaseModel):
    """What the dashboard shows for one city, from the last recorded day. A value that is not in the data is null."""

    city: str  # the key used everywhere in the API, e.g. "quezon city"
    lat: float
    lng: float
    data_date: str | None = None  # the day these numbers are from (can be days behind today)
    high_c: float | None = None
    low_c: float | None = None
    rain_mm: float | None = None
    wind_kmh: float | None = None
    gust_kmh: float | None = None
    river_flow_m3s: float | None = None  # a flow (m3/s), not a water height
    river_percentile: float | None = None  # 0 to 1: the share of days since 2020 with a lower flow in this city
    river_high_flow_m3s: float | None = None  # the flow from which the river counts as high for this city
    risk_level: str | None = None  # low, watch, high or critical
    risk_reasons: list[str]  # the reasons in English
    risk_reason_codes: list[ReasonCodeOut] = []  # the same reasons as codes with a number, for the app to write in the chosen language
    missing: list[str]
    recent: list[DayRecordOut]  # the last days, oldest first


class DashboardOut(BaseModel):
    """Dashboard data from the recorded datasets. Rule-based and unofficial."""

    data_date: date | None = None  # the newest day in the data
    cities: list[DashboardCityOut]


# --- Macro weather analytics (long-run statistics from the recorded dataset) ----------------------


class AnalyticsStatsOut(BaseModel):
    """Totals, averages and extremes for a group of days. A value that is not in the data is null."""

    days: int
    rain_total_mm: float | None = None
    rain_max_day_mm: float | None = None
    rain_days: int = 0
    heavy_rain_days: int = 0
    high_avg_c: float | None = None
    high_max_c: float | None = None
    hot_days: int = 0
    low_avg_c: float | None = None
    low_min_c: float | None = None
    wind_max_kmh: float | None = None
    gust_max_kmh: float | None = None
    river_avg_m3s: float | None = None
    river_max_m3s: float | None = None


class AnalyticsPointOut(AnalyticsStatsOut):
    """One year, month or day on a chart. ``period`` is "2024", "2024-07" or "2024-07-15"."""

    period: str
    label: str


class AnalyticsDayValueOut(BaseModel):
    """A day and a value, for example the wettest day and how much rain fell."""

    date: date
    value: float


class AnalyticsDayOut(BaseModel):
    """The recorded numbers of one day."""

    date: date
    rain_mm: float | None = None
    high_c: float | None = None
    low_c: float | None = None
    wind_kmh: float | None = None
    gust_kmh: float | None = None
    river_flow_m3s: float | None = None


class AnalyticsCityOut(BaseModel):
    """One city in the ranking for the chosen period."""

    city: str
    rain_total_mm: float | None = None
    high_avg_c: float | None = None
    river_max_m3s: float | None = None
    gust_max_kmh: float | None = None


class AnalyticsOut(BaseModel):
    """Long-run weather statistics for the chosen city and period. Recorded data, not a forecast."""

    city: str | None = None  # null means all of Metro Manila combined
    level: str  # "year", "month" or "day": what each point in ``points`` stands for
    year: int | None = None
    month: int | None = None
    day: int | None = None
    years_available: list[str]
    data_first_date: date | None = None
    data_last_date: date | None = None
    summary: AnalyticsStatsOut
    wettest_day: AnalyticsDayValueOut | None = None
    hottest_day: AnalyticsDayValueOut | None = None
    coolest_night: AnalyticsDayValueOut | None = None
    strongest_gust: AnalyticsDayValueOut | None = None
    peak_river_day: AnalyticsDayValueOut | None = None
    rainiest_days: list[AnalyticsDayValueOut]
    points: list[AnalyticsPointOut]
    day_detail: AnalyticsDayOut | None = None
    city_ranking: list[AnalyticsCityOut]


# --- Weather forecast (Tomorrow.io, stored in Supabase) -----------------------------------------


class ForecastEntryOut(BaseModel):
    """One hour or one day of the forecast: its start time (UTC) and the values (metric units)."""

    time: str
    values: dict[str, float | int | None]


class CityForecastOut(BaseModel):
    """The stored forecast of one city, with the entry for the current hour."""

    city: str
    fetched_on: date  # the Manila day the forecast was fetched
    fetched_at: datetime
    now: ForecastEntryOut | None = None  # the current hour, or null when the forecast has run out
    hourly: list[ForecastEntryOut]
    daily: list[ForecastEntryOut]


class ForecastOut(BaseModel):
    """Stored forecasts for the requested cities. A city with none yet is left out."""

    cities: list[CityForecastOut]


# --- Staff (needs the staff key) -------------------------------------------------------------

ReportStatus = Literal["unverified", "verified", "rejected"]
RequestStatus = Literal["unverified", "verified", "assigned", "closed"]


class StaffReportOut(BaseModel):
    """A report as staff see it: everything, with the id needed to change its status."""

    id: UUID
    hazard: str
    city: str
    barangay: str | None = None
    body: str
    status: str
    trust_level: str
    lat: float | None = None
    lng: float | None = None
    created_at: datetime


class StaffRequestOut(BaseModel):
    """A request as staff see it, including the contact phone number."""

    id: UUID
    kind: str
    city: str
    barangay: str | None = None
    details: str
    people_count: int | None = None
    contact_phone: str | None = None
    lat: float | None = None
    lng: float | None = None
    status: str
    created_at: datetime


class ReportStatusUpdate(StrictModel):
    """The new status of a report."""

    status: ReportStatus


class RequestStatusUpdate(StrictModel):
    """The new status of a request."""

    status: RequestStatus


class StatusChanged(BaseModel):
    """Answer to a status change."""

    id: UUID
    status: str


class TableSummary(BaseModel):
    """Counts for one table, for monitoring."""

    total: int
    by_status: dict[str, int]
    by_city: dict[str, int]
    # When the oldest row still waiting for review arrived; None when nothing is waiting.
    oldest_unverified_at: datetime | None = None


class StaffSummary(BaseModel):
    """What is waiting, at a glance."""

    reports: TableSummary
    requests: TableSummary


# --- Health ---------------------------------------------------------------------------------


class HealthOut(BaseModel):
    """What works right now."""

    status: Literal["ok", "degraded"]
    checks: dict[str, str]
