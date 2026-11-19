"""Predictive forecasting, historical YoY pacing, and run-rate tools."""
from __future__ import annotations

from datetime import date, timedelta
import logging
from typing import Any
from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME
from src import daily_dashboard_store
from src.chat.state import SecurityContext
from src.chat.tools.db_tools import store_kpis, store_label

logger = logging.getLogger(__name__)


def compute_yoy_pacing(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
    baseline_is_target: bool = False,
) -> dict[str, Any]:
    """Compute authentic historical YoY pacing comparing 08.10.2026 vs 08.10.2025.

    By default the baseline is the last completed day (target_date - 1, i.e.
    "yesterday" when target_date is today). When the user named the date
    themselves (`baseline_is_target`), that date IS the baseline -- otherwise
    "YoY for 08.10.2026" compared 07.10.2026.
    """
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {"error": "ACCESS_DENIED", "message": f"Access Restricted to store {sec_ctx.store_code}."}

    baseline_date = target_date if baseline_is_target else target_date - timedelta(days=1)
    try:
        prev_year_date = date(baseline_date.year - 1, baseline_date.month, baseline_date.day)
    except ValueError:
        prev_year_date = baseline_date - timedelta(days=365)

    try:
        current_kpi = store_kpis(db, target_store, target_date)
        base_kpi = store_kpis(db, target_store, baseline_date)
        month_sum = daily_dashboard_store.compute_monthly_target_summary(db, target_store, target_date)

        curr_sales = float(current_kpi.get("net_sales") or 0.0)
        base_sales = float(base_kpi.get("net_sales") or 0.0)
        effective_base = base_sales if base_sales > 0 else curr_sales
        # Prior-year figure for the SAME day as the baseline (like with like).
        day_sum = (
            month_sum if baseline_date == target_date
            else daily_dashboard_store.compute_monthly_target_summary(db, target_store, baseline_date)
        )
        py_sales = float(day_sum.get("daily_prev_year_sales") or 0.0)

        growth_pct = (
            ((effective_base - py_sales) / py_sales * 100.0)
            if py_sales > 0
            else (100.0 if effective_base > 0 else 0.0)
        )
        delta_amount = effective_base - py_sales

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "baseline_date": baseline_date.strftime("%d.%m.%Y"),
            "baseline_net_sales": effective_base,
            "prev_year_date": prev_year_date.strftime("%d.%m.%Y"),
            "prev_year_net_sales": py_sales,
            "growth_pct": round(growth_pct, 1),
            "delta_amount": round(delta_amount, 2),
            "mtd_actual": float(month_sum.get("month_net_sales") or 0.0),
            "mtd_prev_year": float(month_sum.get("prev_year_total") or 0.0),
            "mtd_growth_pct": month_sum.get("growth_pct"),
        }
    except Exception as e:
        logger.error("Error computing YoY pacing for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def compute_evening_surge_requirements(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Calculate required billing throughput during the 5 PM - 8 PM peak surge to hit target."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {"error": "ACCESS_DENIED", "message": f"Access Restricted to store {sec_ctx.store_code}."}

    try:
        kpis = store_kpis(db, target_store, target_date)
        net_sales = float(kpis.get("net_sales") or 0.0)
        target_sales = float(kpis.get("sales_target") or 0.0)
        gap = max(0.0, target_sales - net_sales)
        atv = float(kpis.get("atv") or 1800.0)
        if atv <= 0:
            atv = 1800.0

        required_bills = int(gap / atv) if gap > 0 else 0
        bills_per_hour = round(required_bills / 3.0, 1)  # 3 hours (5 PM - 8 PM)

        return {
            "store_code": target_store,
            "target_gap": gap,
            "current_atv": atv,
            "required_additional_bills": required_bills,
            "required_bills_per_hour_peak": bills_per_hour,
            "action_recommendation": (
                f"To close the remaining gap of ₹{gap:,.0f}, need approx {required_bills} additional bills "
                f"({bills_per_hour} bills/hr during peak 5-8 PM) maintaining ATV >= ₹{atv:,.0f}."
                if gap > 0
                else "Target is already achieved! Focus on margin retention."
            ),
        }
    except Exception as e:
        logger.error("Error computing surge requirements for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}
