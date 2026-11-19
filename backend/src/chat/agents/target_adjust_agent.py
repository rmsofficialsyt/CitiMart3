"""Sub-Agent 2: Target Adjustment & Rolling Recovery Agent.

Handles the 7-day, 14-day, and 30-day deficit carry-forward calculations:
T_t (Original Target), C_t (Carry-Forward), A_t (Adjusted Target), and S_t (Net Sales).
"""
from __future__ import annotations

from datetime import date
from typing import Any
from pymongo.database import Database

from src.chat.intent import IntentResult, detect_intent
from src.chat.state import SecurityContext
from src.chat.tools.target_tools import (
    calculate_rolling_target_adjustment,
    simulate_recovery_options,
)


class TargetAdjustmentAgent:
    """Specialized Sub-Agent for Retail Target Adjustments and rolling deficit recovery."""

    name = "target_adjust_agent"
    role = "Target Adjustment & Rolling Deficit Specialist"

    def run(
        self,
        db: Database,
        store_code: str,
        target_date: date,
        sec_ctx: SecurityContext,
        query: str,
        intent: IntentResult | None = None,
    ) -> dict[str, Any]:
        intent = intent or detect_intent(query)
        results: dict[str, Any] = {"agent": self.name}

        # Window comes only from an explicit "7/14/30 day(s)" phrase -- a date
        # like "14 Nov" used to flip this to a 14-day window.
        window = intent.window_days if intent.window_days in (7, 14, 30) else 7
        results["adjustment"] = calculate_rolling_target_adjustment(
            db=db,
            store_code=store_code,
            target_date=target_date,
            sec_ctx=sec_ctx,
            recovery_window_days=window,
        )

        if intent.has("target_simulate"):
            results["simulations"] = simulate_recovery_options(
                db=db,
                store_code=store_code,
                target_date=target_date,
                sec_ctx=sec_ctx,
            )

        return results
