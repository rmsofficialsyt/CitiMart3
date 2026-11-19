"""Sub-Agent 3: Predictive Forecasting & YoY Pacing Agent."""
from __future__ import annotations

from datetime import date
from typing import Any
from pymongo.database import Database

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
        return results
