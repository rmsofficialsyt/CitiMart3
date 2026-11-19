"""Target Adjustment & Rolling Deficit Carry-Forward Tools.

Implements the CITIMART Retail Daily Target Adjustment System:
- Original Target (T_t)
- Carry-Forward Adjustment (C_t)
- Adjusted Target (A_t = T_t + C_t)
- Actual Net Sales (S_t)
- 7-day, 14-day, or 30-day Rolling Deficit Recovery Window
- Outstanding Carry Balance and Amortization Schedule
"""
from __future__ import annotations

from datetime import date, timedelta
import logging
from typing import Any
from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME
from db.models import TARGETS
from src import daily_dashboard_store
from src.chat.state import SecurityContext
from src.chat.tools.db_tools import store_kpis, store_label

logger = logging.getLogger(__name__)


def calculate_rolling_target_adjustment(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
    recovery_window_days: int = 7,
) -> dict[str, Any]:
    """Calculate the rolling target adjustment for a store on a given date.
    
    Distributes past unachieved deficits across a 7-day, 14-day, or 30-day rolling recovery window.
    """
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {
            "error": "ACCESS_DENIED",
            "message": f"Access Restricted: You are authorized only for store '{sec_ctx.store_code}'.",
            "authorized_store": sec_ctx.store_code,
        }

    valid_windows = {7, 14, 30}
    window = recovery_window_days if recovery_window_days in valid_windows else 7

    try:
        # 1. Fetch Today's Original Target (T_t) and Net Sales (S_t)
        kpis = store_kpis(db, target_store, target_date)
        original_target = float(kpis.get("sales_target") or kpis.get("target_sales") or 0.0)
        actual_sales = float(kpis.get("net_sales") or 0.0)

        # 2. Look back over the past `window` days to calculate accumulated deficit via single cached batch
        all_history = daily_dashboard_store.list_all_history_dates(db, target_store)
        history_map = {row.get("date"): row for row in all_history if row.get("date")}

        accumulated_deficit = 0.0
        daily_deficits: list[dict[str, Any]] = []

        for d in range(1, window + 1):
            past_date = target_date - timedelta(days=d)
            past_iso = past_date.isoformat()
            past_row = history_map.get(past_iso)

            if past_row:
                p_target = float(past_row.get("sales_target") or 0.0)
                p_sales = float(past_row.get("net_sales") or 0.0)
            else:
                past_kpis = store_kpis(db, target_store, past_date)
                p_target = float(past_kpis.get("sales_target") or past_kpis.get("target_sales") or 0.0)
                p_sales = float(past_kpis.get("net_sales") or 0.0)

            gap = max(0.0, p_target - p_sales)
            if gap > 0:
                accumulated_deficit += gap
                daily_deficits.append({
                    "date": past_iso,
                    "target": p_target,
                    "sales": p_sales,
                    "deficit": gap,
                })

        # 3. Calculate Daily Carry Forward Allocation (C_t)
        carry_forward_amount = accumulated_deficit / window if window > 0 else 0.0
        adjusted_target = original_target + carry_forward_amount

        # 4. Target Gap against Adjusted Target
        adjusted_gap = max(0.0, adjusted_target - actual_sales)
        achievement_on_adjusted = (actual_sales / adjusted_target * 100.0) if adjusted_target > 0 else 0.0

        # If requested target_date has zero target, zero sales, and zero deficit across the window,
        # fallback to the latest recorded operating day so we don't return an empty card when data exists.
        if original_target == 0.0 and actual_sales == 0.0 and accumulated_deficit == 0.0:
            from src.chat.tools.history_tools import get_latest_recorded_date
            latest = get_latest_recorded_date(db, target_store)
            if latest and latest != target_date:
                return calculate_rolling_target_adjustment(
                    db=db,
                    store_code=store_code,
                    target_date=latest,
                    sec_ctx=sec_ctx,
                    recovery_window_days=recovery_window_days,
                )

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "date": target_date.isoformat(),
            "recovery_window_days": window,
            "original_target_Tt": original_target,
            "carry_forward_Ct": round(carry_forward_amount, 2),
            "adjusted_target_At": round(adjusted_target, 2),
            "net_sales_St": actual_sales,
            "daily_target_gap": round(adjusted_gap, 2),
            "achievement_on_adjusted_pct": round(achievement_on_adjusted, 1),
            "outstanding_carry_balance": round(accumulated_deficit, 2),
            "unresolved_past_days_count": len(daily_deficits),
            "formula_applied": "A_t = T_t + (Accumulated_Deficit / Recovery_Window)",
        }
    except Exception as e:
        logger.error("Error calculating target adjustment for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def simulate_recovery_options(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Compare 7-day, 14-day, and 30-day deficit recovery options side-by-side."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {
            "error": "ACCESS_DENIED",
            "message": f"Access Restricted: You are authorized only for store '{sec_ctx.store_code}'.",
        }

    simulations = {}
    for days in (7, 14, 30):
        sim = calculate_rolling_target_adjustment(db, target_store, target_date, sec_ctx, recovery_window_days=days)
        if "error" not in sim:
            simulations[f"{days}_days"] = {
                "daily_carry": sim.get("carry_forward_Ct"),
                "adjusted_target": sim.get("adjusted_target_At"),
                "total_deficit": sim.get("outstanding_carry_balance"),
            }

    kpis = store_kpis(db, target_store, target_date)
    return {
        "store_code": target_store,
        "store_name": store_label(target_store),
        "date": target_date.isoformat(),
        "original_target": float(kpis.get("sales_target") or 0.0),
        "net_sales": float(kpis.get("net_sales") or 0.0),
        "options": simulations,
    }
