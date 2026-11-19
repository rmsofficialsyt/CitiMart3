"""Sub-Agent 1: Database Operations & Granular Historical Sales Specialist."""
from __future__ import annotations

from datetime import date
from typing import Any
from pymongo.database import Database

from src.chat.intent import IntentResult, detect_intent
from src.chat.state import SecurityContext
from src.chat.tools.db_tools import (
    get_directives,
    get_live_store_kpis,
    get_network_ranking,
    get_recent_bills,
    get_requisitions,
    get_timeslot_pacing,
)
from src.chat.tools.history_tools import (
    compare_same_day_prior_weeks,
    get_best_and_worst_days_in_month,
    get_exact_day_granular_kpis,
    get_month_to_date_granular_summary,
    get_recent_daily_history_table,
)


class DbOpsAgent:
    """Role-guarded MongoDB reader. Fetches exactly what the query's intent needs.

    The date is resolved ONCE by the coordinator and passed in -- this agent
    no longer re-resolves it from the text (it used to, and could disagree
    with the date the coordinator reported and the LLM was told about).
    """

    name = "db_ops_agent"
    role = "Database & Real-Time / Historical Operational Metrics Specialist"

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
        wanted = set(intent.all)
        results: dict[str, Any] = {"agent": self.name, "query_date": target_date.isoformat()}

        if "history_n_days" in wanted:
            results["history_table"] = get_recent_daily_history_table(
                db, store_code, days=intent.history_days or 7, sec_ctx=sec_ctx, as_of=target_date
            )
        if "mtd" in wanted:
            results["mtd_summary"] = get_month_to_date_granular_summary(db, store_code, target_date, sec_ctx)
        if "peak_dip" in wanted:
            results["peak_dip_days"] = get_best_and_worst_days_in_month(db, store_code, target_date, sec_ctx)
        if "wow" in wanted:
            results["wow_comparison"] = compare_same_day_prior_weeks(db, store_code, target_date, sec_ctx)
        if "bills" in wanted:
            results["bills"] = get_recent_bills(db, store_code, target_date, sec_ctx)
        if "requisitions" in wanted:
            results["requisitions"] = get_requisitions(db, store_code, sec_ctx)
        if "directives" in wanted:
            results["directives"] = get_directives(db, sec_ctx)
        # Cross-store ranking is admin-only; only fetch it as a side signal for
        # admins, but always when it IS the question (so a manager is told why not).
        if intent.primary == "ranking" or ("ranking" in wanted and sec_ctx.is_admin):
            results["network_ranking"] = get_network_ranking(db, target_date, sec_ctx)
        if "timeslot" in wanted:
            results["timeslot"] = get_timeslot_pacing(db, store_code, target_date, sec_ctx)

        # Always ground the answer in the resolved day's own numbers (KPIs,
        # 4-slot breakdown, largest bill), whatever else was asked.
        results["exact_day_kpis"] = get_exact_day_granular_kpis(db, store_code, target_date, sec_ctx)
        results["kpis"] = get_live_store_kpis(db, store_code, target_date, sec_ctx)
        return results
