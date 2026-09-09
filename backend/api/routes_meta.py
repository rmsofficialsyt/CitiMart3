"""Header metadata for the TopBar.

The Analytics & Forecasting version of this route reports DATASET.xlsx's date
coverage and when the workbook was last parsed. Daily Operations has no
workbook: its data is whatever is in MongoDB right now, so `date_range`
describes the live day and `last_refresh` is the moment of the request. The
response keeps the same four keys so frontend/src/api/client.ts's
DashboardMeta shape is unchanged between the two sub-projects.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends

from api.auth import CurrentUser, get_current_user
from config.settings import STORE_CODE_TO_NAME

router = APIRouter(prefix="/api/meta", tags=["meta"])

# Every store, every log entry and the midnight finalize job are all on
# Asia/Kolkata -- the header must not drift to the server's UTC clock, or a
# manager in Kolkata sees "yesterday" for the first 5.5 hours of their day.
IST = ZoneInfo("Asia/Kolkata")


@router.get("")
def get_meta(user: CurrentUser = Depends(get_current_user)):
    """Store scope + a live timestamp. A manager sees only their own store
    named here, matching the single store their whole nav is pinned to."""
    now = datetime.now(IST)
    codes = user.allowed_stores(list(STORE_CODE_TO_NAME))
    return {
        "active_stores": codes,
        "store_names": [STORE_CODE_TO_NAME.get(code, code) for code in codes],
        "date_range": now.strftime("%d-%m-%Y"),
        "last_refresh": now.strftime("%d-%m-%Y %H:%M"),
    }
