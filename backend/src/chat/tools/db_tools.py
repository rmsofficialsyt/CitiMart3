"""Database tools for real-time MongoDB Atlas operations with multi-tenant RBAC."""
from __future__ import annotations

from datetime import date
import logging
from typing import Any
from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME, TIME_SLOT_ORDER
from db.models import BILLS, REQUISITIONS
from src import daily_dashboard_store, directives_store
from src.chat.state import SecurityContext

logger = logging.getLogger(__name__)


def store_kpis(db: Database, store_code: str, target_date: date) -> dict[str, Any]:
    """compute_live_kpis for one store, or the blended network figures for "ALL".

    compute_live_kpis itself filters on {"store_code": store}, so passing
    "ALL" silently returned all-zero KPIs; the admin's Overall Summary chat
    needs compute_live_kpis_all_stores' "combined" bundle instead (raw totals
    summed, ratios re-derived -- the dashboard's own rule).
    """
    if store_code == "ALL":
        return daily_dashboard_store.compute_live_kpis_all_stores(db, target_date)["combined"]
    return daily_dashboard_store.compute_live_kpis(db, store_code, target_date)


def store_label(store_code: str) -> str:
    return "All Stores" if store_code == "ALL" else STORE_CODE_TO_NAME.get(store_code, store_code)


def get_live_store_kpis(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Fetch live store KPIs from MongoDB for the target date."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {
            "error": "ACCESS_DENIED",
            "message": f"Access Restricted: You are authorized only for store '{sec_ctx.store_code}'. Store '{target_store}' is restricted to central management.",
            "authorized_store": sec_ctx.store_code,
        }

    try:
        kpis = store_kpis(db, target_store, target_date)
        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "date": target_date.isoformat(),
            "net_sales": float(kpis.get("net_sales") or 0.0),
            "sales_target": float(kpis.get("sales_target") or kpis.get("target_sales") or 0.0),
            "achievement_pct": float(kpis.get("achievement_pct") or 0.0),
            "footfall": int(kpis.get("footfall") or 0),
            "nob": int(kpis.get("nob") or 0),
            "conversion_pct": float(kpis.get("conversion_pct") or 0.0),
            "atv": float(kpis.get("atv") or 0.0),
            "rpv": float(kpis.get("rpv") or 0.0),
            "basket_size": float(kpis.get("basket_size") or 0.0),
            "bill_quantity": float(kpis.get("bill_quantity") or 0.0),
            "target_gap": max(0.0, float(kpis.get("sales_target") or 0.0) - float(kpis.get("net_sales") or 0.0)),
        }
    except Exception as e:
        logger.error("Error computing live KPIs for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def get_timeslot_pacing(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Fetch hourly/time-slot pacing breakdown across the 4 standard shifts."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {
            "error": "ACCESS_DENIED",
            "message": f"Access Restricted: You are authorized only for store '{sec_ctx.store_code}'.",
        }

    try:
        breakdown = daily_dashboard_store.compute_live_timeslot_breakdown(db, target_store, target_date)
        slots = {}
        for slot in TIME_SLOT_ORDER:
            s_stat = breakdown.get(slot, {})
            slots[slot] = {
                "net_sales": float(s_stat.get("net_sales") or 0.0),
                "bills": int(s_stat.get("nob") or 0),
                "footfall": int(s_stat.get("footfall") or 0),
                "conversion_pct": float(s_stat.get("conversion_pct") or 0.0),
                "atv": float(s_stat.get("atv") or 0.0),
            }
        return {"store_code": target_store, "date": target_date.isoformat(), "slots": slots}
    except Exception as e:
        logger.error("Error fetching timeslot breakdown for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def get_recent_bills(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
    limit: int = 5,
) -> dict[str, Any]:
    """Fetch recent bills, largest single bill, and average ticket size."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {"error": "ACCESS_DENIED", "message": f"Access Restricted to store {sec_ctx.store_code}."}

    day_str = target_date.isoformat()
    try:
        # The whole day's bills for the asked date -- never silently another
        # day's -- and max/avg over all of them, not over a recent sample.
        bill_query: dict[str, Any] = {"entry_date": day_str}
        if target_store != "ALL":
            bill_query["store_code"] = target_store
        bills_list = list(db[BILLS].find(bill_query).sort("bill_time", -1))

        amounts = [float(b.get("net_amount") or 0.0) for b in bills_list]
        largest = max(bills_list, key=lambda b: float(b.get("net_amount") or 0.0)) if bills_list else None
        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "date": day_str,
            "total_bills": len(bills_list),
            "total_net_amount": sum(amounts),
            "max_single_bill": max(amounts) if amounts else 0.0,
            "max_single_bill_time": largest.get("bill_time") if largest else None,
            "avg_bill_value": (sum(amounts) / len(amounts)) if amounts else 0.0,
            "latest_bills": [
                {
                    "time": b.get("bill_time"),
                    "amount": float(b.get("net_amount") or 0.0),
                    "qty": float(b.get("bill_quantity") or 0.0),
                    **({"store": b.get("store_code")} if target_store == "ALL" else {}),
                }
                for b in bills_list[:limit]
            ],
        }
    except Exception as e:
        logger.error("Error fetching bills for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def get_requisitions(
    db: Database,
    store_code: str,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Fetch active inventory requisitions and urgent stockouts."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {"error": "ACCESS_DENIED", "message": f"Access Restricted to store {sec_ctx.store_code}."}

    try:
        req_query: dict[str, Any] = {} if target_store == "ALL" else {"store_code": target_store}
        reqs = list(db[REQUISITIONS].find(req_query).sort("created_at", -1).limit(10))
        pending = sum(1 for r in reqs if r.get("status") in ("Pending", "In Review"))
        urgent = sum(1 for r in reqs if r.get("priority") == "Urgent")
        return {
            "store_code": target_store,
            "total_slips": len(reqs),
            "pending_slips": pending,
            "urgent_slips": urgent,
            "items": [
                {
                    "req_code": r.get("req_code"),
                    "article": r.get("article_name") or r.get("article_code") or "Item",
                    "dept": r.get("department", "General"),
                    "priority": r.get("priority"),
                    "status": r.get("status"),
                    "qty": r.get("quantity_requested") or r.get("item_count", 1),
                    **({"store": r.get("store_code")} if target_store == "ALL" else {}),
                }
                for r in reqs[:5]
            ],
        }
    except Exception as e:
        logger.error("Error fetching requisitions for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def get_directives(db: Database, sec_ctx: SecurityContext) -> dict[str, Any]:
    """Fetch active management directives (from Raphael Sir / Head Office)."""
    try:
        dir_summary = directives_store.get_directives_summary(
            db=db,
            username=sec_ctx.username,
            store_code=sec_ctx.store_code,
            is_admin=sec_ctx.is_admin,
        )
        return {
            "directives": [
                {
                    "title": d.get("title"),
                    "message": d.get("message"),
                    "priority": d.get("priority"),
                    "target_store": d.get("target_store"),
                }
                for d in dir_summary.get("directives", [])[:5]
            ]
        }
    except Exception as e:
        logger.error("Error fetching directives: %s", e)
        return {"directives": []}


def get_network_ranking(
    db: Database,
    target_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Fetch 3-store network performance comparison (ADMIN ONLY)."""
    if not sec_ctx.is_admin:
        return {
            "error": "ACCESS_DENIED",
            "message": "Access Denied: Cross-store network rankings are restricted to Central Executive Admin.",
        }

    try:
        overall = daily_dashboard_store.compute_live_kpis_all_stores(db, target_date)
        stores_data = overall.get("per_store", {})
        ranked = sorted(
            [s for s in stores_data.items() if s[0] != "ALL"],
            key=lambda x: float(x[1].get("net_sales") or 0.0),
            reverse=True,
        )
        ranking = []
        for rank, (sc, k) in enumerate(ranked, 1):
            ranking.append({
                "rank": rank,
                "store_code": sc,
                "store_name": STORE_CODE_TO_NAME.get(sc, sc),
                "net_sales": float(k.get("net_sales") or 0.0),
                "achievement_pct": float(k.get("achievement_pct") or 0.0),
                "conversion_pct": float(k.get("conversion_pct") or 0.0),
                "atv": float(k.get("atv") or 0.0),
            })
        return {
            "date": target_date.isoformat(),
            "network_combined": overall.get("combined", {}),
            "rankings": ranking,
        }
    except Exception as e:
        logger.error("Error computing network ranking: %s", e)
        return {"error": str(e)}
