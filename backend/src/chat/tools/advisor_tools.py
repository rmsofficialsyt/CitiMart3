"""Co-Pilot tools over the Advisor engine (src/advisor/), so the chat answer
and the Advisor panel quote the same deterministic numbers.

- explain_day(store, date): "why did we miss / beat target?" -- any role, own store
- network_brief(date, kind): morning / midday brief, evening debrief -- admin gets all
  stores; a manager gets the same brief for their own store only
"""
from __future__ import annotations

from datetime import date
from typing import Any

from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME
from src.advisor.brief import KINDS, build_brief
from src.advisor.engine import ist_now
from src.advisor.explain import explain_day as _explain_day
from src.chat.state import SecurityContext


def _denied(sec_ctx: SecurityContext) -> dict[str, Any]:
    return {"error": "ACCESS_DENIED", "message": f"Access Restricted to store {sec_ctx.store_code}."}


def explain_day(db: Database, store_code: str, target_date: date, sec_ctx: SecurityContext) -> dict[str, Any]:
    store = store_code.strip().upper()
    if store not in STORE_CODE_TO_NAME:
        return {"error": "STORE_REQUIRED", "message": "Pick one store to explain a day's result."}
    if not sec_ctx.check_store_access(store):
        return _denied(sec_ctx)
    result = _explain_day(db, store, target_date)
    review = result["review"]
    return {
        "store": store,
        "date": result["date"],
        "verdict": review["verdict"],
        "net_sales": review["net_sales"],
        "sales_target": review["sales_target"],
        "achievement_pct": review["achievement_pct"],
        "vs_baseline_pct": review["vs_baseline_pct"],
        "baseline_days": (review["baseline"] or {}).get("days_used"),
        "reasons": [{"id": r["id"], "impact": r["impact"], **r["evidence"]} for r in result["reasons"]],
    }


def network_brief(db: Database, today: date, kind: str, sec_ctx: SecurityContext) -> dict[str, Any]:
    stores = list(STORE_CODE_TO_NAME) if sec_ctx.is_admin else [sec_ctx.store_code]
    stores = [s for s in stores if s in STORE_CODE_TO_NAME and sec_ctx.check_store_access(s)]
    if not stores:
        return _denied(sec_ctx)
    kind = kind if kind in KINDS else "morning"
    if kind == "midday" and today != ist_now().date():
        # "Today so far" only exists for today; for a past date the full-day
        # debrief is the honest answer.
        kind = "evening"
    return build_brief(db, stores, today, kind)
