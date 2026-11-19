"""Historical Sales & Granular Date Tools for CITIMART Multi-Agent Chatbot.

Provides deep historical data alignment with MongoDB Atlas collections across 79+ operating days:
- Natural language date tokenizer (yesterday, ISO, DD.MM.YYYY, 18th Nov, MTD, past 7 days)
- 4-Time-Slot intra-day breakdown for any past date
- Past N-day tabular history summaries with daily averages
- Month-To-Date (MTD) cumulative pacing & run-rate gap analysis
- Peak (best) and Dip (lowest) operational day discovery
- Week-over-Week (WoW) same-day momentum comparisons
- Strict multi-tenant RBAC enforcement (store managers only see their store)
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import logging
import re
from typing import Any
from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME, TIME_SLOT_ORDER
from db.models import BILLS, TARGETS
from src import daily_dashboard_store
from src.chat.state import SecurityContext
from src.chat.tools.db_tools import store_kpis, store_label

logger = logging.getLogger(__name__)

MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def get_latest_recorded_date(db: Database, store_code: str) -> date | None:
    """Find the most recent operating date with recorded data for a store or all stores."""
    query = {} if store_code == "ALL" else {"store_code": store_code}
    candidates: list[date] = []
    for coll in (BILLS, TARGETS):
        doc = db[coll].find_one(query, sort=[("entry_date", -1)], projection={"entry_date": 1})
        if doc and doc.get("entry_date"):
            try:
                candidates.append(date.fromisoformat(doc["entry_date"]))
            except ValueError:
                pass
    return max(candidates) if candidates else None


import time as _pytime
import threading

_CALENDAR_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CALENDAR_CACHE_LOCK = threading.Lock()
_CALENDAR_CACHE_TTL = 60.0  # seconds


def clear_calendar_cache() -> None:
    """Clear calendar in-memory cache (used for cache invalidation and tests)."""
    with _CALENDAR_CACHE_LOCK:
        _CALENDAR_CACHE.clear()


def get_database_date_range(db: Database, store_code: str = "ALL") -> dict[str, Any]:
    """Return the earliest date, latest date, and total active operating days in MongoDB (60s TTL cached)."""
    now = _pytime.time()
    cache_key = f"{id(db)}_{store_code}"
    with _CALENDAR_CACHE_LOCK:
        if cache_key in _CALENDAR_CACHE:
            cached_at, cached_val = _CALENDAR_CACHE[cache_key]
            if now - cached_at < _CALENDAR_CACHE_TTL:
                return cached_val

    query = {} if store_code == "ALL" else {"store_code": store_code}
    earliest_doc = db[BILLS].find_one(query, sort=[("entry_date", 1)], projection={"entry_date": 1})
    latest_doc = db[BILLS].find_one(query, sort=[("entry_date", -1)], projection={"entry_date": 1})

    earliest = earliest_doc.get("entry_date") if earliest_doc else None
    latest = latest_doc.get("entry_date") if latest_doc else None

    # Count distinct dates
    distinct_dates = db[BILLS].distinct("entry_date", query)
    total_days = len(distinct_dates) if distinct_dates else 0

    result = {
        "earliest_date": earliest,
        "latest_date": latest,
        "total_operating_days": total_days,
        "store_code": store_code,
    }

    if earliest or latest:
        with _CALENDAR_CACHE_LOCK:
            _CALENDAR_CACHE[cache_key] = (now, result)

    return result


_IST = timezone(timedelta(hours=5, minutes=30))

_ISO_RE = re.compile(r"\b(20[2-9]\d)-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b")
_DMY_RE = re.compile(r"\b(0?[1-9]|[12]\d|3[01])[\.\-\/](0?[1-9]|1[0-2])[\.\-\/](20[2-9]\d)\b")
_MONTHS_ALT = (
    "january|february|march|april|june|july|august|september|october|november|december"
    "|jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec"
)
_DAY_MONTH_RE = re.compile(
    rf"\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(?:of\s+)?({_MONTHS_ALT})\b(?:,?\s+(20[2-9]\d))?"
)
_MONTH_DAY_RE = re.compile(
    rf"\b({_MONTHS_ALT})\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b(?:,?\s+(20[2-9]\d))?"
)
_DAY_BEFORE_YESTERDAY_RE = re.compile(r"day before yesterday|গত পরশু|(?<![\u0980-\u09FF])পরশু|(?<![\u0900-\u097F])परसों")
_YESTERDAY_RE = re.compile(
    r"\byesterday('?s)?\b|(?<![\u0980-\u09FF])গতকাল|(?<![\u0900-\u097F])बीते कल|(?<![\u0900-\u097F])कल(?![\u0900-\u097F])"
)
_TODAY_RE = re.compile(r"\btoday('?s)?\b|\bright now\b|\bso far\b|(?<![\u0980-\u09FF])আজ|(?<![\u0900-\u097F])आज(?![\u0900-\u097F])")
_PREVIOUS_DAY_RE = re.compile(
    r"\b(previous|last|past) (sales|day|business day|operating day)\b|পূর্বের সেলস|আগের সেলস|पिछली बिक्री"
)
_VAGUE_SALES_RE = re.compile(
    r"\bsales\b|\btargets?\b|\bdeficit\b|\brecovery\b|\bcarry-?forward\b|\badjustment\b|\bperformance\b|\bperforming\b|\bkpis?\b|\bcollection\b|\bmomentum\b|\bgap\b"
    r"|টার্গেট|সেলস|ঘাটতি|রিকভারি|সমন্বয়|বিক্রি|बিক্রী"
    r"|बिक्री|सेल्स|टारगेट|लक्ष्य|घाटा|डेफिसिट|रिकवरी|समायोजन"
)


def ist_today() -> date:
    """Business 'today' in Kolkata. The server may run in UTC (Render), where
    date.today() is still yesterday between 00:00 and 05:30 IST."""
    return datetime.now(_IST).date()


def _explicit_dates(query: str, today: date) -> list[date]:
    """Every explicit calendar date written in the query, in order of appearance."""
    q = query.lower()
    found: list[tuple[int, date]] = []

    def _add(pos: int, y: int, m: int, d: int) -> None:
        try:
            found.append((pos, date(y, m, d)))
        except ValueError:
            pass

    for m in _ISO_RE.finditer(q):
        _add(m.start(), int(m.group(1)), int(m.group(2)), int(m.group(3)))
    for m in _DMY_RE.finditer(q):
        _add(m.start(), int(m.group(3)), int(m.group(2)), int(m.group(1)))
    for m in _DAY_MONTH_RE.finditer(q):
        _add(m.start(), int(m.group(3) or today.year), MONTH_MAP[m.group(2)], int(m.group(1)))
    for m in _MONTH_DAY_RE.finditer(q):
        _add(m.start(), int(m.group(3) or today.year), MONTH_MAP[m.group(1)], int(m.group(2)))

    found.sort(key=lambda t: t[0])
    unique: list[date] = []
    for _, d in found:
        if d not in unique:
            unique.append(d)
    return unique


def resolve_query_target_date(
    db: Database,
    store_code: str,
    query: str,
    default_date: date | None = None,
    fallback_date: date | None = None,
) -> tuple[date, str]:
    """Resolve the operating date a query is about. Returns (date, reason).

    Precedence:
      1. explicit calendar date(s) in the text (with two or more -- a
         "08.10.2026 vs 08.10.2025" comparison -- the latest is the baseline);
      2. day before yesterday / yesterday, relative to `default_date`;
      3. an explicit "today" -- honoured even when nothing is logged yet, the
         caller reports that instead of silently showing another day;
      4. "previous/last day" -> latest recorded day before today;
      5. `fallback_date` -- the date the previous turn in this conversation was
         explicitly about, so follow-ups ("and footfall?") stay on that date;
      6. a vague sales/performance question while today has no bills yet ->
         latest recorded day (the reason string says so);
      7. today.
    `default_date` is the caller's "today" (route: IST today).
    """
    today = default_date or ist_today()
    q_lower = query.lower()

    dates = _explicit_dates(query, today)
    if len(dates) == 1:
        return dates[0], f"Explicit date {dates[0].isoformat()}"
    if len(dates) > 1:
        latest = max(dates)
        return latest, f"Explicit date {latest.isoformat()} (latest of {len(dates)} dates compared)"

    if _DAY_BEFORE_YESTERDAY_RE.search(q_lower):
        return today - timedelta(days=2), "Day before yesterday (2 days ago)"

    if _YESTERDAY_RE.search(q_lower):
        return today - timedelta(days=1), "Yesterday"

    if _TODAY_RE.search(q_lower):
        return today, "Today (explicitly requested)"

    if _PREVIOUS_DAY_RE.search(q_lower):
        latest = get_latest_recorded_date(db, store_code)
        if latest and latest < today:
            return latest, f"Latest completed business day ({latest.isoformat()})"
        return today - timedelta(days=1), "Previous operating day"

    if fallback_date is not None:
        return fallback_date, f"Carried over from the previous question ({fallback_date.isoformat()})"

    if _VAGUE_SALES_RE.search(q_lower):
        today_iso = today.isoformat()
        query_filter = {"entry_date": today_iso} if store_code == "ALL" else {"entry_date": today_iso, "store_code": store_code}
        if db[BILLS].count_documents(query_filter) == 0 and db[TARGETS].count_documents(query_filter) == 0:
            latest = get_latest_recorded_date(db, store_code)
            if latest and latest < today:
                return latest, f"No bills logged yet on {today_iso}; showing latest recorded day ({latest.isoformat()})"

    return today, "Current date"


def is_explicit_date_reason(reason: str) -> bool:
    """True when the user named the date themselves (eligible for follow-up carry-over)."""
    return reason.startswith(("Explicit date", "Yesterday", "Day before yesterday", "Latest completed", "Carried over"))


def get_exact_day_granular_kpis(
    db: Database,
    store_code: str,
    query_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Fetch exhaustive KPIs + 4 intra-day time slots + top bills for a specific date."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {
            "error": "ACCESS_DENIED",
            "message": f"Access Restricted: You are authorized only for store '{sec_ctx.store_code}'.",
            "authorized_store": sec_ctx.store_code,
        }

    try:
        details = daily_dashboard_store.get_history_details(db, target_store, query_date)
        kpis = details.get("kpis") or {}
        timeslot_list = details.get("timeslot_breakdown") or []
        timeslot_dict = {
            item.get("time_slot"): item
            for item in timeslot_list
            if isinstance(item, dict) and item.get("time_slot")
        }
        bill_logs = details.get("bill_logs") or []

        # Find peak slot by sales
        peak_slot = max(
            TIME_SLOT_ORDER,
            key=lambda s: float(timeslot_dict.get(s, {}).get("net_sales") or 0.0),
        )
        peak_sales = float(timeslot_dict.get(peak_slot, {}).get("net_sales") or 0.0)

        # Largest bill
        largest_bill = max(
            (float(b.get("net_amount") or 0.0) for b in bill_logs),
            default=0.0,
        )

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "date": query_date.isoformat(),
            "day_name": query_date.strftime("%A"),
            "kpis": {
                "net_sales": float(kpis.get("net_sales") or 0.0),
                "sales_target": float(kpis.get("sales_target") or 0.0),
                "achievement_pct": float(kpis.get("achievement_pct") or 0.0),
                "target_gap": max(0.0, float(kpis.get("sales_target") or 0.0) - float(kpis.get("net_sales") or 0.0)),
                "footfall": int(kpis.get("footfall") or 0),
                "nob": int(kpis.get("nob") or 0),
                "conversion_pct": float(kpis.get("conversion_pct") or 0.0),
                "atv": float(kpis.get("atv") or 0.0),
                "rpv": float(kpis.get("rpv") or 0.0),
                "basket_size": float(kpis.get("basket_size") or 0.0),
            },
            "peak_slot": {
                "slot": peak_slot,
                "net_sales": peak_sales,
                "share_pct": (peak_sales / float(kpis.get("net_sales") or 1.0) * 100) if float(kpis.get("net_sales") or 0.0) > 0 else 0.0,
            },
            "timeslot_breakdown": {
                slot: {
                    "net_sales": float(timeslot_dict.get(slot, {}).get("net_sales") or 0.0),
                    "bills": int(timeslot_dict.get(slot, {}).get("bill_count") or timeslot_dict.get(slot, {}).get("nob") or 0),
                    "footfall": int(timeslot_dict.get(slot, {}).get("footfall") or 0),
                    "atv": float(timeslot_dict.get(slot, {}).get("atv") or 0.0),
                    "conversion_pct": float(timeslot_dict.get(slot, {}).get("conversion_pct") or 0.0),
                }
                for slot in TIME_SLOT_ORDER
            },
            "largest_bill": largest_bill,
            "total_bills_recorded": len(bill_logs),
            "has_records": bool(
                bill_logs or details.get("footfall_logs") or details.get("nob_logs")
                or float(kpis.get("net_sales") or 0.0) > 0
            ),
        }
    except Exception as e:
        logger.error("Error fetching exact day granular KPIs for %s on %s: %s", target_store, query_date, e)
        return {"error": str(e), "store_code": target_store, "date": query_date.isoformat()}


def get_recent_daily_history_table(
    db: Database,
    store_code: str,
    days: int = 7,
    sec_ctx: SecurityContext = None,
    as_of: date | None = None,
) -> dict[str, Any]:
    """Fetch day-by-day table of the N most recent operating days on/before
    `as_of` (no upper bound when None), with totals and daily averages."""
    target_store = store_code.strip().upper()
    if sec_ctx and not sec_ctx.check_store_access(target_store):
        return {
            "error": "ACCESS_DENIED",
            "message": f"Access Restricted: You are authorized only for store '{sec_ctx.store_code}'.",
        }

    try:
        all_history = daily_dashboard_store.list_all_history_dates(db, target_store)
        # Filter only days that have net_sales > 0 or bills > 0
        cutoff = as_of.isoformat() if as_of else None
        recorded_days = [
            row for row in all_history
            if ((row.get("net_sales") or 0.0) > 0 or (row.get("nob") or 0) > 0)
            and (cutoff is None or (row.get("date") or "") <= cutoff)
        ]
        slice_days = recorded_days[:days]

        if not slice_days:
            return {
                "store_code": target_store,
                "days_requested": days,
                "days_found": 0,
                "rows": [],
                "totals": {},
                "averages": {},
            }

        total_sales = sum(float(r.get("net_sales") or 0.0) for r in slice_days)
        total_targets = sum(float(r.get("sales_target") or 0.0) for r in slice_days)
        total_footfall = sum(int(r.get("footfall") or 0) for r in slice_days)
        total_bills = sum(int(r.get("nob") or 0) for r in slice_days)
        n = len(slice_days)

        avg_sales = total_sales / n if n > 0 else 0.0
        avg_target = total_targets / n if n > 0 else 0.0
        avg_footfall = total_footfall / n if n > 0 else 0.0
        avg_bills = total_bills / n if n > 0 else 0.0
        overall_conversion = (total_bills / total_footfall * 100) if total_footfall > 0 else 0.0
        overall_atv = (total_sales / total_bills) if total_bills > 0 else 0.0
        overall_ach = (total_sales / total_targets * 100) if total_targets > 0 else 0.0

        rows = []
        for r in slice_days:
            rows.append({
                "date": r.get("date"),
                "day_name": r.get("day_name"),
                "net_sales": float(r.get("net_sales") or 0.0),
                "sales_target": float(r.get("sales_target") or 0.0),
                "achievement_pct": float(r.get("achievement_pct") or 0.0),
                "footfall": int(r.get("footfall") or 0),
                "bills": int(r.get("nob") or 0),
                "conversion_pct": float(r.get("conversion_pct") or 0.0),
                "atv": float(r.get("atv") or 0.0),
            })

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "days_requested": days,
            "days_found": n,
            "rows": rows,
            "totals": {
                "net_sales": total_sales,
                "sales_target": total_targets,
                "footfall": total_footfall,
                "bills": total_bills,
                "achievement_pct": overall_ach,
            },
            "averages": {
                "daily_sales": avg_sales,
                "daily_target": avg_target,
                "daily_footfall": avg_footfall,
                "daily_bills": avg_bills,
                "conversion_pct": overall_conversion,
                "atv": overall_atv,
            },
        }
    except Exception as e:
        logger.error("Error fetching recent daily history table for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def get_month_to_date_granular_summary(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Calculate Month-To-Date (MTD) cumulative sales, target pacing, and daily required run-rates."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {
            "error": "ACCESS_DENIED",
            "message": f"Access Restricted: You are authorized only for store '{sec_ctx.store_code}'.",
        }

    first_day_of_month = target_date.replace(day=1)
    # Total days in target month
    if target_date.month == 12:
        next_month = target_date.replace(year=target_date.year + 1, month=1, day=1)
    else:
        next_month = target_date.replace(month=target_date.month + 1, day=1)
    total_days_in_month = (next_month - first_day_of_month).days
    days_elapsed = target_date.day
    days_remaining = max(0, total_days_in_month - days_elapsed)

    try:
        all_history = daily_dashboard_store.list_all_history_dates(db, target_store)
        month_prefix = f"{target_date.year:04d}-{target_date.month:02d}"
        
        mtd_rows = [
            r for r in all_history
            if r.get("date", "").startswith(month_prefix) and r.get("date", "") <= target_date.isoformat()
        ]

        mtd_sales = sum(float(r.get("net_sales") or 0.0) for r in mtd_rows)
        mtd_target = sum(float(r.get("sales_target") or 0.0) for r in mtd_rows)
        mtd_footfall = sum(int(r.get("footfall") or 0) for r in mtd_rows)
        mtd_bills = sum(int(r.get("nob") or 0) for r in mtd_rows)
        active_days = len(mtd_rows)

        avg_daily_sales = mtd_sales / active_days if active_days > 0 else 0.0
        ach_pct = (mtd_sales / mtd_target * 100) if mtd_target > 0 else 0.0
        gap = max(0.0, mtd_target - mtd_sales)
        required_daily_run_rate = (gap / days_remaining) if days_remaining > 0 else 0.0

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "month_name": target_date.strftime("%B %Y"),
            "as_of_date": target_date.isoformat(),
            "days_elapsed": days_elapsed,
            "days_remaining": days_remaining,
            "active_operating_days": active_days,
            "mtd_sales": mtd_sales,
            "mtd_target": mtd_target,
            "achievement_pct": ach_pct,
            "target_gap": gap,
            "avg_daily_sales": avg_daily_sales,
            "required_daily_run_rate": required_daily_run_rate,
            "mtd_footfall": mtd_footfall,
            "mtd_bills": mtd_bills,
            "mtd_atv": (mtd_sales / mtd_bills) if mtd_bills > 0 else 0.0,
            "mtd_conversion": (mtd_bills / mtd_footfall * 100) if mtd_footfall > 0 else 0.0,
        }
    except Exception as e:
        logger.error("Error calculating MTD summary for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def get_best_and_worst_days_in_month(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Find peak highest sales day and lowest dip day for the store in the given month."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {"error": "ACCESS_DENIED", "message": f"Access Restricted to store {sec_ctx.store_code}."}

    month_prefix = f"{target_date.year:04d}-{target_date.month:02d}"
    try:
        all_history = daily_dashboard_store.list_all_history_dates(db, target_store)
        month_rows = [
            r for r in all_history
            if r.get("date", "").startswith(month_prefix) and (float(r.get("net_sales") or 0.0) > 0)
        ]

        if not month_rows:
            return {"store_code": target_store, "month": month_prefix, "message": "No sales records found for this month."}

        best_day = max(month_rows, key=lambda r: float(r.get("net_sales") or 0.0))
        worst_day = min(month_rows, key=lambda r: float(r.get("net_sales") or 0.0))

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "month": target_date.strftime("%B %Y"),
            "best_day": {
                "date": best_day.get("date"),
                "day_name": best_day.get("day_name"),
                "net_sales": float(best_day.get("net_sales") or 0.0),
                "sales_target": float(best_day.get("sales_target") or 0.0),
                "achievement_pct": float(best_day.get("achievement_pct") or 0.0),
                "bills": int(best_day.get("nob") or 0),
                "footfall": int(best_day.get("footfall") or 0),
                "atv": float(best_day.get("atv") or 0.0),
            },
            "worst_day": {
                "date": worst_day.get("date"),
                "day_name": worst_day.get("day_name"),
                "net_sales": float(worst_day.get("net_sales") or 0.0),
                "sales_target": float(worst_day.get("sales_target") or 0.0),
                "achievement_pct": float(worst_day.get("achievement_pct") or 0.0),
                "bills": int(worst_day.get("nob") or 0),
                "footfall": int(worst_day.get("footfall") or 0),
                "atv": float(worst_day.get("atv") or 0.0),
            },
        }
    except Exception as e:
        logger.error("Error finding peak/dip days for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def compare_same_day_prior_weeks(
    db: Database,
    store_code: str,
    query_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Compare a given day with the same day of the week 1 week and 2 weeks prior (WoW)."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {"error": "ACCESS_DENIED", "message": f"Access Restricted to store {sec_ctx.store_code}."}

    d1 = query_date
    d2 = query_date - timedelta(days=7)
    d3 = query_date - timedelta(days=14)

    try:
        def fetch_day(d: date) -> dict[str, Any]:
            kpis = store_kpis(db, target_store, d)
            return {
                "date": d.isoformat(),
                "day_name": d.strftime("%A"),
                "net_sales": float(kpis.get("net_sales") or 0.0),
                "sales_target": float(kpis.get("sales_target") or 0.0),
                "achievement_pct": float(kpis.get("achievement_pct") or 0.0),
                "footfall": int(kpis.get("footfall") or 0),
                "bills": int(kpis.get("nob") or 0),
                "atv": float(kpis.get("atv") or 0.0),
            }

        curr = fetch_day(d1)
        prev_1w = fetch_day(d2)
        prev_2w = fetch_day(d3)

        s_curr = curr["net_sales"]
        s_prev = prev_1w["net_sales"]
        wow_growth = ((s_curr - s_prev) / s_prev * 100) if s_prev > 0 else None

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "current_day": curr,
            "prior_week_same_day": prev_1w,
            "two_weeks_prior_same_day": prev_2w,
            "wow_growth_pct": wow_growth,
        }
    except Exception as e:
        logger.error("Error computing WoW comparison for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}
