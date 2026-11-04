"""GET /me/usage: how much of the spending caps the signed-in user has used, for showing in the page."""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from src.api.deps import DATABASE_UNAVAILABLE, optional_user, sign_in_required
from src.api.schemas import UsageOut
from src.auth import User

router = APIRouter(tags=["account"])


@router.get("/me/usage", response_model=UsageOut)
async def my_usage(request: Request, user: User | None = Depends(optional_user)) -> UsageOut:
    """The user's messages, photo checks and voice sessions today, and tokens this month, each with its limit."""
    if user is None:
        raise sign_in_required()
    tracker = getattr(request.app.state, "usage", None)
    if tracker is None:
        raise HTTPException(status_code=503, detail=DATABASE_UNAVAILABLE)
    try:
        return UsageOut(**await run_in_threadpool(tracker.snapshot, user.id, user.email))
    except Exception:
        raise HTTPException(status_code=503, detail=DATABASE_UNAVAILABLE)
