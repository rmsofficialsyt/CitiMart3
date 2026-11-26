"""Sub-Agent 3: Predictive Forecasting & YoY Pacing Agent."""
from __future__ import annotations

from datetime import date
from typing import Any
from pymongo.database import Database

from src.advisor.engine import build_advice
from src.chat.intent import IntentResult, detect_intent
from src.chat.state import SecurityContext
from src.chat.tools.forecast_tools import (
    compute_evening_surge_requirements,
    compute_yoy_pacing,
)


class ForecastingAgent:
    """Specialized Sub-Agent for YoY comparisons and pacing run-rates."""

    name = "forecasting_agent"
    role = "Predictive Retail Forecasting Specialist"

    def run(
        self,
        db: Database,
        store_code: str,
        target_date: date,
        sec_ctx: SecurityContext,
        query: str,
        intent: IntentResult | None = None,
        date_explicit: bool = False,
    ) -> dict[str, Any]:
        intent = intent or detect_intent(query)
        results: dict[str, Any] = {"agent": self.name}

        if intent.has("yoy") or not intent.has("surge"):
            results["yoy"] = compute_yoy_pacing(
                db, store_code, target_date, sec_ctx, baseline_is_target=date_explicit
            )
        if intent.has("surge"):
            results["surge"] = compute_evening_surge_requirements(db, store_code, target_date, sec_ctx)
            results["advisor"] = advisor_facts(db, store_code, target_date, sec_ctx)
        return results


def advisor_facts(db: Database, store_code: str, target_date: date, sec_ctx: SecurityContext) -> dict[str, Any]:
    """The Advisor panel's own pacing/projection numbers (src/advisor/engine.py),
    so the Co-Pilot's answer to "are we on track?" matches the panel exactly."""
    store = store_code.strip().upper()
    if not sec_ctx.check_store_access(store):
        return {"error": "ACCESS_DENIED", "message": f"Access Restricted to store {sec_ctx.store_code}."}
    advice = build_advice(db, store, target_date)
    pacing = advice["pacing"]
    return {
        "day_status": advice["day_status"],
        "pacing_source": pacing["source"] if pacing["available"] else "insufficient_history",
        "pacing_days_used": pacing["days_used"],
        "expected_achievement_pct": pacing["expected_achievement_pct"],
        **advice["projection"],
        "insights": [i["id"] for i in advice["insights"]],
    }
