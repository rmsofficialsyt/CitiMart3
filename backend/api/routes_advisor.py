"""AI Decision Advisor & Store Co-Pilot panel (`src/advisor/`).

GET  /api/advisor?store=&date=        -> insights (Tier 1 + 2), pacing, projection,
                                         bill mix, staffing, stock, ranked checklist
PUT  /api/advisor/actions             -> tick / untick one checklist item (today only)
GET  /api/advisor/explain?store=&date= -> "why did we miss / beat target?" (Tier 3)
GET  /api/advisor/whatif?store=&date=&conversion_pp=&atv_delta=&footfall_pct=
GET  /api/advisor/brief?kind=&date=   -> network morning / midday brief, evening debrief (admin;
                                         midday = today so far vs pace, today only)
GET  /api/advisor/brief/pdf?kind=&date= -> the same brief as a PDF download (admin, audited)
GET  /api/advisor/replan?store=&month= -> recommended remaining-month targets (admin;
                                         recommendation only -- never writes)

Store-scoped exactly like the rest of Daily Operations: admin any store,
a manager only their own (`require_store_access`, 403 before any DB read).
The analytics routes are rate-limited per user (`advisor_limiter`).
"""
from __future__ import annotations

import logging
from datetime import date as _date
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user, require_admin, require_store_access
from config.settings import STORE_CODE_TO_NAME
from db.session import get_db
from src.advisor import actions as advisor_actions
from src.advisor.brief import build_brief
from src.advisor.brief_report import render_brief_pdf
from src.advisor.engine import ACTION_KEYS, build_advice, ist_now
from src.advisor.explain import explain_day
from src.advisor.replan import build_replan
from src.advisor.whatif import LIMITS, simulate
from src.audit import audit_event
from src.rate_limiter import advisor_limiter, get_client_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/advisor", tags=["advisor"])

# How far back an explanation / brief may look; older days have no useful
# same-weekday baseline left in the 8-week windows anyway.
MAX_LOOKBACK_DAYS = 400


def _parse_date(value: str) -> _date:
    try:
        return _date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD") from None


def _past_or_today(value: str) -> _date:
    d = _parse_date(value)
    today = ist_now().date()
    if d > today or d < today - timedelta(days=MAX_LOOKBACK_DAYS):
        raise HTTPException(status_code=400, detail="date is out of range.")
    return d


@router.get("")
def get_advice(
    store: str = Query(..., max_length=8),
    date: str = Query(..., max_length=10),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    require_store_access(store, user)
    return build_advice(db, store, _parse_date(date))


class ActionPayload(BaseModel):
    store: str = Field(..., max_length=8)
    date: str = Field(..., max_length=10)
    action_key: str = Field(..., max_length=40)
    done: bool


@router.put("/actions")
def put_action(
    payload: ActionPayload,
    request: Request,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    require_store_access(payload.store, user)
    if payload.action_key not in ACTION_KEYS:
        raise HTTPException(status_code=400, detail="Unknown action_key.")
    target_date = _parse_date(payload.date)
    if target_date != ist_now().date():
        # The checklist is a live floor tool; a past day's ticks are a record.
        raise HTTPException(status_code=400, detail="Only today's checklist can be changed.")
    result = advisor_actions.set_action(db, payload.store, target_date, payload.action_key, payload.done, user.username)
    audit_event(
        "advisor_action", db=db, username=user.username, ip=get_client_ip(request),
        target=f"{payload.store}:{target_date.isoformat()}",
        details={"action_key": payload.action_key, "done": payload.done},
    )
    return result


@router.get("/explain")
def get_explain(
    store: str = Query(..., max_length=8),
    date: str = Query(..., max_length=10),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    require_store_access(store, user)
    advisor_limiter.check(user.username)
    return explain_day(db, store, _past_or_today(date))


@router.get("/whatif")
def get_whatif(
    store: str = Query(..., max_length=8),
    date: str = Query(..., max_length=10),
    conversion_pp: float = Query(0.0, ge=LIMITS["conversion_pp"][0], le=LIMITS["conversion_pp"][1]),
    atv_delta: float = Query(0.0, ge=LIMITS["atv_delta"][0], le=LIMITS["atv_delta"][1]),
    footfall_pct: float = Query(0.0, ge=LIMITS["footfall_pct"][0], le=LIMITS["footfall_pct"][1]),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    require_store_access(store, user)
    advisor_limiter.check(user.username)
    return simulate(db, store, _parse_date(date), conversion_pp, atv_delta, footfall_pct)


def _brief_day(kind: str, date: str | None) -> _date:
    today = _past_or_today(date) if date else ist_now().date()
    if kind == "midday" and today != ist_now().date():
        # The midday brief is "today so far" against the pace curve at this
        # moment; there is no meaningful "now" for a past day.
        raise HTTPException(status_code=400, detail="The midday brief is only available for today.")
    return today


@router.get("/brief")
def get_brief(
    kind: Literal["morning", "midday", "evening"] = Query("morning"),
    date: str | None = Query(None, max_length=10),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(require_admin),
):
    advisor_limiter.check(user.username)
    today = _brief_day(kind, date)
    return build_brief(db, list(STORE_CODE_TO_NAME), today, kind)


@router.get("/brief/pdf")
def get_brief_pdf(
    request: Request,
    kind: Literal["morning", "midday", "evening"] = Query("morning"),
    date: str | None = Query(None, max_length=10),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(require_admin),
):
    advisor_limiter.check(user.username)
    today = _brief_day(kind, date)
    brief = build_brief(db, list(STORE_CODE_TO_NAME), today, kind)
    try:
        content, filename = render_brief_pdf(brief)
    except Exception:  # noqa: BLE001 -- fail closed with a generic message; details go to the log
        logger.exception("Brief PDF render failed (%s, %s).", kind, today.isoformat())
        raise HTTPException(status_code=500, detail="Failed to generate the brief PDF.") from None
    audit_event(
        "advisor_brief_export", db=db, username=user.username, ip=get_client_ip(request),
        target=brief["review_date"], details={"kind": kind, "format": "pdf"},
    )
    return Response(content=content, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/replan")
def get_replan(
    store: str = Query(..., max_length=8),
    month: str = Query(..., max_length=7, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(require_admin),
):
    require_store_access(store, user)
    advisor_limiter.check(user.username)
    month_start = _date.fromisoformat(f"{month}-01")
    return build_replan(db, store, month_start, ist_now().date())
