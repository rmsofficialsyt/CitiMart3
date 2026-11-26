"""Specialized WhatsApp Sales Alert & Reporting Agent (SPEC-05).

Produces two strictly separated, easy-to-scan tabular WhatsApp reports:
  1. Admin Report (`audience="admin"`, `store_code="ALL"`):
     Network totals, store-by-store KPIs (NM/HB/CHW), #1-#3 ranking,
     4-slot time breakdown, and cross-store pacing/anomaly signals.
  2. Manager Report (`audience="manager"`, single `store_code`):
     Strictly single-store scoped (zero cross-store data), containing
     store KPIs, 4-slot breakdown, bills needed to hit target, projected
     close, floor tactics, and active directive/requisition counts.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME, TIME_SLOT_ORDER
from db.models import DIRECTIVES, REQUISITIONS
from src import daily_dashboard_store
from src.advisor.engine import build_advice
from src.alerts.alert_store import get_alert_settings, record_alert_log
from src.alerts.whatsapp_provider import WhatsAppProvider, get_whatsapp_provider
from src.chat.client import generate_llm_response
from src.kpi_engine import safe_divide

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

AUDIENCES = ("admin", "manager")
ALERT_TYPES = (
    "hourly_pulse",
    "slot_summary",
    "daily_eod",
    "anomaly_pace",
    "closing_sprint",
    "custom_on_demand",
)

_SLOT_SHORT = {
    "11.00 AM - 01.59 PM": "11-02p",
    "02.00 PM - 04.59 PM": "02-05p",
    "05.00 PM - 07.59 PM": "05-08p",
    "08.00 PM - 11.59 PM": "08-12a",
}

_ALERT_TITLES = {
    "hourly_pulse": "Hourly Sales Pulse",
    "slot_summary": "Time-Slot Close Report",
    "daily_eod": "Daily EOD Executive Summary",
    "anomaly_pace": "Pace & KPI Anomaly Alert",
    "closing_sprint": "Closing Sprint Alert (9:30 PM)",
    "custom_on_demand": "Live Sales Briefing",
}

_ADMIN_SYSTEM_PROMPT = """
You are the CITIMART Executive WhatsApp Alert Agent.
Write a crisp, easy-to-scan WhatsApp briefing for the Admin using ONLY the numbers in FACTS.
Rules:
1. Keep the monospace tabular blocks (` ```...``` `) intact and easy to read on mobile.
2. Never invent, round differently, or extrapolate any number not present in FACTS.
3. Highlight the #1 store, any store with Red status or pace_behind, and 1-2 short executive bullets.
4. Keep total length under 1,300 characters. Use WhatsApp *bold* for headers.
5. Reply in the requested language (en / hi / bn), keeping digits, ₹ amounts, and store codes in English/0-9.
"""

_MANAGER_SYSTEM_PROMPT = """
You are the CITIMART Store Floor Coach WhatsApp Agent.
Write a crisp, easy-to-scan WhatsApp briefing for ONE Store Manager using ONLY the numbers in FACTS.
Rules:
1. Keep the monospace tabular block (` ```...``` `) intact and easy to read on mobile.
2. Never invent, round differently, or extrapolate any number not present in FACTS.
3. Focus on bills needed to hit target, projected close, and 2 concrete floor actions from FACTS.
4. Never mention any other store. Keep total length under 1,100 characters. Use WhatsApp *bold* for headers.
5. Reply in the requested language (en / hi / bn), keeping digits, ₹ amounts, and store codes in English/0-9.
"""


def _fmt_inr(val: float | int | None) -> str:
    if val is None:
        return "N/A"
    n = float(val)
    if abs(n) >= 100000:
        return f"₹{n:,.0f}"
    return f"₹{n:,.0f}"


def _fmt_compact_inr(val: float | int | None) -> str:
    if val is None:
        return "N/A"
    n = float(val)
    if abs(n) >= 100000:
        return f"₹{n / 100000:.2f}L"
    if abs(n) >= 1000:
        return f"₹{n / 1000:.1f}k"
    return f"₹{n:.0f}"


def _fmt_pct(val: float | None) -> str:
    return "N/A" if val is None else f"{val:.1f}%"


def _fmt_int(val: float | int | None) -> str:
    return "0" if val is None else f"{int(round(float(val))):,}"


def _status_badge(status: str | None) -> str:
    if status == "green":
        return "🟢"
    if status == "yellow":
        return "🟡"
    if status == "red":
        return "🔴"
    return "⚪"


def _extract_numbers(text: str) -> set[str]:
    """Extract normalized numeric tokens for grounding verification."""
    cleaned = text.replace(",", "")
    return set(re.findall(r"\d+(?:\.\d+)?", cleaned))


def _passes_grounding(candidate: str, facts_text: str) -> bool:
    """Verify every multi-digit number in candidate exists in FACTS (or is 1..4 rank/slot)."""
    allowed = _extract_numbers(facts_text)
    allowed.update({"1", "2", "3", "4", "9", "30", "100"})
    for tok in _extract_numbers(candidate):
        if tok in allowed:
            continue
        # Allow integer/float equivalence e.g. 83 vs 83.0
        if "." in tok and tok.rstrip("0").rstrip(".") in allowed:
            continue
        if f"{tok}.0" in allowed:
            continue
        return False
    return True


def build_admin_report_facts(
    db: Database,
    target_date: date,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Gather network-wide + per-store granular KPIs, rankings, 4-slot totals, and anomalies."""
    now = now or datetime.now(IST)
    stores_data: list[dict[str, Any]] = []
    network_slot_totals: dict[str, dict[str, float]] = {
        slot: {"net_sales": 0.0, "footfall": 0.0, "nob": 0.0, "bill_quantity": 0.0}
        for slot in TIME_SLOT_ORDER
    }

    total_sales = 0.0
    total_target = 0.0
    has_any_target = False
    total_ff = 0.0
    total_nob = 0.0
    total_qty = 0.0
    anomalies: list[dict[str, Any]] = []

    for code, full_name in STORE_CODE_TO_NAME.items():
        kpis = daily_dashboard_store.compute_live_kpis(db, code, target_date)
        slots = daily_dashboard_store.compute_live_timeslot_breakdown(db, code, target_date)
        advice = build_advice(db, code, target_date, now)

        net_sales = float(kpis.get("net_sales") or 0.0)
        sales_target = kpis.get("sales_target")
        ff = float(kpis.get("footfall") or 0.0)
        nob = float(kpis.get("nob") or 0.0)
        qty = float(kpis.get("bill_quantity") or 0.0)

        total_sales += net_sales
        if sales_target is not None:
            total_target += float(sales_target)
            has_any_target = True
        total_ff += ff
        total_nob += nob
        total_qty += qty

        for slot_name in TIME_SLOT_ORDER:
            cell = slots.get(slot_name) or {}
            network_slot_totals[slot_name]["net_sales"] += float(cell.get("net_sales") or 0.0)
            network_slot_totals[slot_name]["footfall"] += float(cell.get("footfall") or 0.0)
            network_slot_totals[slot_name]["nob"] += float(cell.get("nob") or 0.0)
            network_slot_totals[slot_name]["bill_quantity"] += float(cell.get("bill_quantity") or 0.0)

        store_insights = [
            ins for ins in (advice.get("insights") or [])
            if ins.get("severity") in {"urgent", "opportunity"}
        ]
        for ins in store_insights:
            anomalies.append({
                "store_code": code,
                "id": ins.get("id"),
                "severity": ins.get("severity"),
                "kpi": ins.get("kpi"),
                "evidence": ins.get("evidence") or {},
            })

        stores_data.append({
            "store_code": code,
            "store_name": full_name.replace("CITIMART - ", ""),
            "net_sales": round(net_sales, 2),
            "sales_target": round(float(sales_target), 2) if sales_target is not None else None,
            "remaining": round(max(0.0, float(sales_target) - net_sales), 2) if sales_target is not None else None,
            "achievement_pct": kpis.get("achievement_pct"),
            "achievement_status": (kpis.get("statuses") or {}).get("achievement_pct"),
            "footfall": int(ff),
            "nob": int(nob),
            "bill_quantity": int(qty),
            "atv": kpis.get("atv"),
            "rpv": kpis.get("rpv"),
            "conversion_pct": kpis.get("conversion_pct"),
            "conversion_status": (kpis.get("statuses") or {}).get("conversion_pct"),
            "bills_needed": advice.get("bills_needed"),
            "projected_close": advice.get("projected_close"),
        })

    # Rank stores (#1..#3) by achievement_pct if available, else net_sales
    ranked = sorted(
        stores_data,
        key=lambda s: (s["achievement_pct"] if s["achievement_pct"] is not None else -1.0, s["net_sales"]),
        reverse=True,
    )
    for idx, s in enumerate(ranked, start=1):
        s["rank"] = idx

    net_ach = safe_divide(total_sales, total_target) * 100 if has_any_target and total_target > 0 else None
    net_atv = safe_divide(total_sales, total_nob)
    net_rpv = safe_divide(total_sales, total_ff)
    net_conv = safe_divide(total_nob, total_ff) * 100 if total_ff > 0 else None
    net_basket = safe_divide(total_qty, total_nob)

    slot_rows = []
    for slot in TIME_SLOT_ORDER:
        agg = network_slot_totals[slot]
        slot_rows.append({
            "time_slot": slot,
            "short_slot": _SLOT_SHORT.get(slot, slot[:6]),
            "net_sales": round(agg["net_sales"], 2),
            "footfall": int(agg["footfall"]),
            "nob": int(agg["nob"]),
        })

    return {
        "audience": "admin",
        "store_code": "ALL",
        "date": target_date.isoformat(),
        "as_of_ist": now.strftime("%H:%M IST"),
        "network": {
            "net_sales": round(total_sales, 2),
            "sales_target": round(total_target, 2) if has_any_target else None,
            "remaining": round(max(0.0, total_target - total_sales), 2) if has_any_target else None,
            "achievement_pct": round(net_ach, 1) if net_ach is not None else None,
            "footfall": int(total_ff),
            "nob": int(total_nob),
            "bill_quantity": int(total_qty),
            "atv": round(net_atv, 2) if net_atv is not None else None,
            "rpv": round(net_rpv, 2) if net_rpv is not None else None,
            "basket_size": round(net_basket, 2) if net_basket is not None else None,
            "conversion_pct": round(net_conv, 1) if net_conv is not None else None,
        },
        "stores": ranked,
        "slots": slot_rows,
        "anomalies": anomalies,
    }


def build_manager_report_facts(
    db: Database,
    store_code: str,
    target_date: date,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Gather strictly single-store granular KPIs, 4-slot breakdown, and floor advice.

    Multi-tenant isolation: NEVER queries or includes any other store's data.
    """
    if store_code not in STORE_CODE_TO_NAME:
        raise ValueError(f"Unknown store_code: {store_code!r}")
    now = now or datetime.now(IST)
    kpis = daily_dashboard_store.compute_live_kpis(db, store_code, target_date)
    slots = daily_dashboard_store.compute_live_timeslot_breakdown(db, store_code, target_date)
    advice = build_advice(db, store_code, target_date, now)

    active_directives = db[DIRECTIVES].count_documents({"active": True})
    pending_reqs = db[REQUISITIONS].count_documents({"store_code": store_code, "status": "pending"})

    slot_rows = []
    for slot in TIME_SLOT_ORDER:
        cell = slots.get(slot) or {}
        s_sales = float(cell.get("net_sales") or 0.0)
        s_nob = int(cell.get("nob") or 0)
        slot_rows.append({
            "time_slot": slot,
            "short_slot": _SLOT_SHORT.get(slot, slot[:6]),
            "net_sales": round(s_sales, 2),
            "footfall": int(cell.get("footfall") or 0),
            "nob": s_nob,
            "atv": round(safe_divide(s_sales, s_nob), 2) if s_nob > 0 else None,
        })

    return {
        "audience": "manager",
        "store_code": store_code,
        "store_name": STORE_CODE_TO_NAME[store_code].replace("CITIMART - ", ""),
        "date": target_date.isoformat(),
        "as_of_ist": now.strftime("%H:%M IST"),
        "kpis": {
            "net_sales": round(float(kpis.get("net_sales") or 0.0), 2),
            "sales_target": round(float(kpis["sales_target"]), 2) if kpis.get("sales_target") is not None else None,
            "remaining": round(float(kpis["remaining"]), 2) if kpis.get("remaining") is not None else None,
            "achievement_pct": kpis.get("achievement_pct"),
            "footfall": int(kpis.get("footfall") or 0),
            "nob": int(kpis.get("nob") or 0),
            "bill_quantity": int(kpis.get("bill_quantity") or 0),
            "atv": kpis.get("atv"),
            "rpv": kpis.get("rpv"),
            "basket_size": kpis.get("basket_size"),
            "conversion_pct": kpis.get("conversion_pct"),
            "statuses": kpis.get("statuses") or {},
        },
        "slots": slot_rows,
        "advisor": {
            "projected_close": advice.get("projected_close"),
            "bills_needed": advice.get("bills_needed"),
            "current_slot": advice.get("current_slot"),
            "insights": advice.get("insights") or [],
        },
        "ops": {
            "active_directives": int(active_directives),
            "pending_requisitions": int(pending_reqs),
        },
    }


def format_admin_whatsapp_message(facts: dict[str, Any], alert_type: str) -> str:
    """Deterministic, mobile-friendly tabular WhatsApp message for Admin."""
    title = _ALERT_TITLES.get(alert_type, "Sales Briefing")
    net = facts["network"]

    lines = [
        f"*CITIMART {title}* (Admin)",
        f"📅 {facts['date']} · 🕒 {facts['as_of_ist']}",
        "",
        "*Network Total*",
        f"• Sales: *{_fmt_inr(net['net_sales'])}* / Target: {_fmt_inr(net['sales_target'])}",
        f"• Ach: *{_fmt_pct(net['achievement_pct'])}* | Rem: {_fmt_inr(net['remaining'])}",
        f"• FF: {_fmt_int(net['footfall'])} | NOB: {_fmt_int(net['nob'])} | ATV: {_fmt_inr(net['atv'])} | Conv: {_fmt_pct(net['conversion_pct'])}",
        "",
        "*Store Ranking & KPIs*",
        "```",
        "Rk Str | Sales    | Ach%   | FF   | NOB",
        "-------+----------+--------+------+----",
    ]
    for s in facts["stores"]:
        badge = _status_badge(s.get("achievement_status"))
        sales_str = _fmt_compact_inr(s["net_sales"]).ljust(8)
        ach_str = _fmt_pct(s["achievement_pct"]).rjust(6)
        ff_str = str(s["footfall"]).rjust(4)
        nob_str = str(s["nob"]).rjust(3)
        lines.append(f"#{s['rank']} {s['store_code']:<3} | {sales_str} | {ach_str} | {ff_str} | {nob_str} {badge}")
    lines.append("```")

    lines.append("")
    lines.append("*Time-Slot Breakdown (Network)*")
    lines.append("```")
    lines.append("Slot   | Sales    | FF   | NOB")
    lines.append("-------+----------+------+----")
    for sl in facts["slots"]:
        s_sales = _fmt_compact_inr(sl["net_sales"]).ljust(8)
        lines.append(f"{sl['short_slot']:<6} | {s_sales} | {str(sl['footfall']).rjust(4)} | {str(sl['nob']).rjust(3)}")
    lines.append("```")

    anomalies = facts.get("anomalies") or []
    if anomalies:
        lines.append("")
        lines.append("*Action Alerts*")
        for a in anomalies[:4]:
            lines.append(f"• *{a['store_code']}*: {a['id'].replace('_', ' ')} ({a['severity']})")

    return "\n".join(lines)


def format_manager_whatsapp_message(facts: dict[str, Any], alert_type: str) -> str:
    """Deterministic, mobile-friendly tabular WhatsApp message for a Store Manager."""
    title = _ALERT_TITLES.get(alert_type, "Store Briefing")
    k = facts["kpis"]
    adv = facts["advisor"]
    statuses = k.get("statuses") or {}

    lines = [
        f"*CITIMART {facts['store_name']} ({facts['store_code']}) — {title}*",
        f"📅 {facts['date']} · 🕒 {facts['as_of_ist']}",
        "",
        "*Store KPIs*",
        f"• Sales: *{_fmt_inr(k['net_sales'])}* / Target: {_fmt_inr(k['sales_target'])}",
        f"• Ach: *{_fmt_pct(k['achievement_pct'])}* {_status_badge(statuses.get('achievement_pct'))} | Rem: {_fmt_inr(k['remaining'])}",
        f"• FF: {_fmt_int(k['footfall'])} | NOB: {_fmt_int(k['nob'])} | Qty: {_fmt_int(k['bill_quantity'])}",
        f"• ATV: {_fmt_inr(k['atv'])} | Conv: {_fmt_pct(k['conversion_pct'])} | Basket: {k['basket_size'] if k['basket_size'] is not None else 'N/A'}",
        "",
        "*4-Slot Breakdown*",
        "```",
        "Slot   | Sales    | FF   | NOB",
        "-------+----------+------+----",
    ]
    for sl in facts["slots"]:
        s_sales = _fmt_compact_inr(sl["net_sales"]).ljust(8)
        lines.append(f"{sl['short_slot']:<6} | {s_sales} | {str(sl['footfall']).rjust(4)} | {str(sl['nob']).rjust(3)}")
    lines.append("```")

    lines.append("")
    lines.append("*Floor Pacing & Targets*")
    if adv.get("bills_needed") is not None:
        lines.append(f"• Bills needed to hit target: *{adv['bills_needed']}*")
    if adv.get("projected_close") is not None:
        lines.append(f"• Projected close: *{_fmt_inr(adv['projected_close'])}*")
    for ins in (adv.get("insights") or [])[:3]:
        lines.append(f"• {ins['id'].replace('_', ' ').title()} ({ins['severity']})")

    ops = facts.get("ops") or {}
    if ops.get("pending_requisitions") or ops.get("active_directives"):
        lines.append(
            f"• Ops: {ops.get('pending_requisitions', 0)} pending requisitions, "
            f"{ops.get('active_directives', 0)} active directives"
        )
    return "\n".join(lines)


class WhatsAppAlertAgent:
    """Specialized AI agent that composes and dispatches WhatsApp sales briefings."""

    name = "whatsapp_alert_agent"

    def __init__(self, provider: WhatsAppProvider | None = None) -> None:
        self._provider = provider or get_whatsapp_provider()

    def compose_message(
        self,
        db: Database,
        *,
        audience: str,
        store_code: str,
        alert_type: str,
        target_date: date,
        language: str = "en",
        use_ai: bool = True,
        now: datetime | None = None,
    ) -> tuple[str, dict[str, Any], bool]:
        """Build facts, synthesize grounded AI WhatsApp briefing (or fallback), and return (body, facts, ai_used)."""
        if audience == "admin":
            facts = build_admin_report_facts(db, target_date, now)
            fallback_msg = format_admin_whatsapp_message(facts, alert_type)
            sys_prompt = _ADMIN_SYSTEM_PROMPT
        elif audience == "manager":
            facts = build_manager_report_facts(db, store_code, target_date, now)
            fallback_msg = format_manager_whatsapp_message(facts, alert_type)
            sys_prompt = _MANAGER_SYSTEM_PROMPT
        else:
            raise ValueError(f"Unknown audience: {audience!r}")

        if not use_ai:
            return fallback_msg, facts, False

        facts_json = json.dumps(facts, ensure_ascii=False)
        prompt = (
            f"Alert Type: {_ALERT_TITLES.get(alert_type, alert_type)}\n"
            f"Language: {language}\n"
            f"Draft Tabular Template (preserve table structure & numbers):\n{fallback_msg}\n\n"
            f"FACTS (authoritative JSON):\n{facts_json}"
        )
        ai_text = generate_llm_response(
            prompt=prompt,
            system_instruction=sys_prompt,
            temperature=0.2,
            max_output_tokens=900,
        )
        if ai_text and _passes_grounding(ai_text, f"{facts_json}\n{fallback_msg}"):
            return ai_text.strip(), facts, True

        return fallback_msg, facts, False

    def send_report(
        self,
        db: Database,
        *,
        audience: str,
        store_code: str,
        alert_type: str,
        trigger_key: str,
        recipients: list[str] | None = None,
        target_date: date | None = None,
        language: str | None = None,
        use_ai: bool = True,
        preview_only: bool = False,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        """Compose and optionally dispatch a WhatsApp alert, logging to MongoDB `alert_logs`."""
        now = now or datetime.now(IST)
        target_date = target_date or now.date()
        settings = get_alert_settings(db)
        lang = language or settings.get("language", "en")

        if recipients is None:
            if audience == "admin":
                recipients = list(settings.get("admin_recipients") or [])
            else:
                recipients = list((settings.get("manager_recipients") or {}).get(store_code) or [])

        body, facts, ai_used = self.compose_message(
            db,
            audience=audience,
            store_code=store_code if audience == "manager" else "ALL",
            alert_type=alert_type,
            target_date=target_date,
            language=lang,
            use_ai=use_ai,
            now=now,
        )

        if preview_only:
            return {
                "preview_only": True,
                "audience": audience,
                "store_code": store_code if audience == "manager" else "ALL",
                "alert_type": alert_type,
                "ai_used": ai_used,
                "provider": self._provider.name,
                "recipients": recipients,
                "message_body": body,
                "facts": facts,
            }

        results: list[dict[str, Any]] = []
        if not recipients:
            status = "skipped_no_recipients"
        else:
            all_ok = True
            for phone in recipients:
                res = self._provider.send_text(phone, body)
                results.append({
                    "recipient": res.recipient,
                    "ok": res.ok,
                    "message_id": res.message_id,
                    "error": res.error,
                })
                if not res.ok:
                    all_ok = False
            status = "sent" if all_ok else ("partial_error" if any(r["ok"] for r in results) else "failed")

        record_alert_log(
            db,
            audience=audience,
            store_code=store_code if audience == "manager" else "ALL",
            alert_type=alert_type,
            trigger_key=trigger_key,
            recipients=recipients,
            message_body=body,
            ai_used=ai_used,
            provider=self._provider.name,
            status=status,
            results=results,
        )

        return {
            "preview_only": False,
            "audience": audience,
            "store_code": store_code if audience == "manager" else "ALL",
            "alert_type": alert_type,
            "trigger_key": trigger_key,
            "ai_used": ai_used,
            "provider": self._provider.name,
            "status": status,
            "recipients": recipients,
            "results": results,
            "message_body": body,
        }
