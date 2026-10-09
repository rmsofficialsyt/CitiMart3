"""CITIMART AI Chatbot & Operations Copilot Route.

Provides intelligent, role-aware operational insights, granular real-time MongoDB metrics,
time-slot pacing strategies, target gap analysis, YoY comparative diagnostics (08.10.2026 vs 08.10.2025),
product requisitions monitoring, and SOP guidelines for Store Managers (NM, HB, CHW)
and Executive Admins (Raphael Sir / Operations Head).
Supports English, Bengali (বাংলা), and Hindi (हिंदी) with dual Gemini + Granular Domain Analytics Engine.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
import logging
import os
from typing import Any, Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user
from config.settings import STORE_CODE_TO_NAME, TIME_SLOT_ORDER
from db.models import BILLS, DIRECTIVES, FOOTFALL, NOB, REQUISITIONS, TARGETS
from db.session import get_db
from src import daily_context, daily_dashboard_store, directives_store, requisitions_store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/daily/chat", tags=["chat"])

CITIMART_SYSTEM_INSTRUCTION = """
You are the CITIMART AI Decision Advisor & Retail Operations Co-Pilot — an advanced, intelligent retail analytics assistant designed specifically for CITIMART departmental stores in Kolkata (New Market [NM], Hatibagan [HB], and Chowringhee [CHW]).

Your role is to assist:
1. Store Managers (NM, HB, CHW): Provide actionable floor-level guidance, real-time target gap recovery tactics, conversion boost strategies, ATV & basket size improvements, time-slot pacing, and inventory requisition tracking.
2. Executive Admins (Raphael Sir / Operations Head): Provide consolidated 3-store network health analysis, benchmark rankings, variance flags, target projections, and directive drafting assistance.

CORE RETAIL FORMULAE & METRICS:
- Conversion Rate (%) = (Total Bills / Total Footfall) * 100
- Average Transaction Value (ATV) = Net Sales / Total Bills
- Revenue Per Visitor (RPV) = Net Sales / Total Footfall
- Sales Per Hour (SPH) = Net Sales / 12 Operating Hours (or slot duration)
- Basket Size (UPB) = Total Units Sold / Total Bills
- Target Achievement (%) = (Actual Net Sales / Target Sales) * 100
- Remaining Target Gap = Target Sales - Actual Net Sales
- YoY Tally Growth (%) = ((Present Net Sales - Previous Year Net Sales) / Previous Year Net Sales) * 100

STANDARD OPERATING TIME SLOTS:
1. 11.00 AM - 01.59 PM (Slot 1: Morning Setup, Cash Desk Ready & Initial Walk-ins)
2. 02.00 PM - 04.59 PM (Slot 2: Mid-Day Traffic & Casual Shoppers, Fitting Room Support)
3. 05.00 PM - 07.59 PM (Slot 3: Prime Evening Surge - Maximum Staffing at Billing Desks)
4. 08.00 PM - 11.59 PM (Slot 4: Night Rush, Closing Push & Mandatory 10:30 PM Data Log)

DATE & BASELINE AWARENESS:
- Today is 09.10.2026.
- The standard historical operating baseline is Yesterday: 08.10.2026.
- The 1-Year Ago Same Day YoY comparison is: 08.10.2025.
- Therefore, comparative YoY pacing evaluates 08.10.2026 vs 08.10.2025.

TONE & STYLE:
- Professional, sharp, encouraging, data-driven, and highly practical.
- Use markdown formatting with bullet points, bold highlights, KPI badges, and concise advice.
- When asked in Hindi (हिंदी) or Bengali (বাংলা), respond fluently and naturally in that language.
- Always ground your answers in the live MongoDB data provided in the system context.
"""


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    conversation_history: list[ChatMessage] = Field(default_factory=list)
    store_code: str | None = None  # "NM", "HB", "CHW", "ALL"
    date_str: str | None = None  # "YYYY-MM-DD"
    language: Literal["en", "hi", "bn"] = "en"


def _gather_live_context(db: Database, target_date: date, store_code: str | None, user: CurrentUser) -> dict[str, Any]:
    """Gather granular live operational metrics, targets, historical comparison baselines,
    recent bills, inventory requisitions, and active directives from MongoDB."""
    day_str = target_date.isoformat()
    baseline_date = target_date - timedelta(days=1)
    baseline_str = baseline_date.isoformat()
    
    try:
        prev_year_date = date(baseline_date.year - 1, baseline_date.month, baseline_date.day)
    except ValueError:
        prev_year_date = baseline_date - timedelta(days=365)
    prev_year_str = prev_year_date.isoformat()

    context_data: dict[str, Any] = {
        "date": day_str,
        "baseline_date": baseline_str,
        "prev_year_date": prev_year_str,
        "stores": {},
        "timeslot_breakdowns": {},
        "baseline_stores": {},
        "baseline_overall": {},
        "monthly_summary": {},
        "monthly_summary_overall": {},
        "recent_bills_summary": {},
        "requisitions_summary": {},
        "directives": [],
        "overall": None,
        "weather": None,
        "holiday": None,
    }

    # Weather & Context
    try:
        w = daily_context.get_weather(target_date)
        context_data["weather"] = w.__dict__ if w else None
        context_data["holiday"] = daily_context.get_holiday_name(target_date)
    except Exception as e:
        logger.debug("Failed to fetch weather/holiday: %s", e)

    # 1. Directives from Management
    try:
        dir_summary = directives_store.get_directives_summary(
            db=db,
            username=user.username,
            store_code=user.store_code,
            is_admin=user.is_admin,
        )
        context_data["directives"] = [
            {
                "title": d.get("title"),
                "message": d.get("message"),
                "priority": d.get("priority"),
                "target_store": d.get("target_store"),
            }
            for d in dir_summary.get("directives", [])[:5]
        ]
    except Exception as e:
        logger.debug("Failed to fetch directives for copilot context: %s", e)
        context_data["directives"] = []

    # 2. Store Live Performance & Overall Network for Today
    try:
        overall_res = daily_dashboard_store.compute_live_kpis_all_stores(db, target_date)
        context_data["overall"] = overall_res.get("combined", {})
        context_data["stores"] = overall_res.get("per_store", {})
    except Exception as e:
        logger.debug("Failed to compute live kpis all stores: %s", e)

    # Fetch individual store live KPIs + Timeslot breakdown for Today
    for sc in ("NM", "HB", "CHW"):
        try:
            kpis = daily_dashboard_store.compute_live_kpis(db, sc, target_date)
            context_data["stores"][sc] = kpis
            ts_breakdown = daily_dashboard_store.compute_timeslot_breakdown(db, sc, target_date)
            context_data["timeslot_breakdowns"][sc] = ts_breakdown
        except Exception as e:
            logger.debug("Failed to fetch store %s details: %s", sc, e)

    # 3. Baseline Data (Yesterday: 08.10.2026) for Baseline Comparisons
    try:
        base_overall = daily_dashboard_store.compute_live_kpis_all_stores(db, baseline_date)
        context_data["baseline_overall"] = base_overall.get("combined", {})
        context_data["baseline_stores"] = base_overall.get("per_store", {})
    except Exception as e:
        logger.debug("Failed to fetch baseline: %s", e)

    # 4. Monthly Target Summary (MTD)
    try:
        target_store_scope = store_code if store_code in ("NM", "HB", "CHW") else (user.store_code or "NM")
        context_data["monthly_summary"] = daily_dashboard_store.compute_monthly_target_summary(
            db, target_store_scope, target_date
        )
        context_data["monthly_summary_overall"] = daily_dashboard_store.compute_monthly_target_summary(
            db, "ALL", target_date
        )
    except Exception as e:
        logger.debug("Failed to compute monthly target summary: %s", e)

    # 5. Recent Bills & Sales Transactions Summary
    try:
        bill_query: dict[str, Any] = {"entry_date": day_str}
        if store_code and store_code in ("NM", "HB", "CHW"):
            bill_query["store_code"] = store_code
        bills_cursor = db[BILLS].find(bill_query).sort("bill_time", -1)
        bills_list = list(bills_cursor)
        if bills_list:
            amounts = [float(b.get("net_amount") or 0.0) for b in bills_list]
            quantities = [float(b.get("bill_quantity") or 0.0) for b in bills_list]
            avg_bill = sum(amounts) / len(amounts) if amounts else 0.0
            context_data["recent_bills_summary"] = {
                "total_bills_count": len(bills_list),
                "total_units_sold": sum(quantities),
                "max_single_bill": max(amounts) if amounts else 0.0,
                "avg_bill_value": avg_bill,
                "latest_bill_time": bills_list[0].get("bill_time", "N/A"),
                "latest_5_bills": [
                    {
                        "time": b.get("bill_time"),
                        "store": b.get("store_code"),
                        "amount": float(b.get("net_amount") or 0.0),
                        "qty": float(b.get("bill_quantity") or 0.0),
                    }
                    for b in bills_list[:5]
                ],
            }
        else:
            # Check baseline day bills if today has no bills yet
            base_query: dict[str, Any] = {"entry_date": baseline_str}
            if store_code and store_code in ("NM", "HB", "CHW"):
                base_query["store_code"] = store_code
            base_bills = list(db[BILLS].find(base_query).sort("bill_time", -1))
            amounts = [float(b.get("net_amount") or 0.0) for b in base_bills]
            quantities = [float(b.get("bill_quantity") or 0.0) for b in base_bills]
            avg_bill = sum(amounts) / len(amounts) if amounts else 0.0
            context_data["recent_bills_summary"] = {
                "total_bills_count": len(base_bills),
                "total_units_sold": sum(quantities),
                "max_single_bill": max(amounts) if amounts else 0.0,
                "avg_bill_value": avg_bill,
                "latest_bill_time": base_bills[0].get("bill_time", "N/A") if base_bills else "N/A",
                "latest_5_bills": [
                    {
                        "time": b.get("bill_time"),
                        "store": b.get("store_code"),
                        "amount": float(b.get("net_amount") or 0.0),
                        "qty": float(b.get("bill_quantity") or 0.0),
                    }
                    for b in base_bills[:5]
                ],
                "is_baseline_fallback": True,
            }
    except Exception as e:
        logger.debug("Failed to fetch recent bills summary: %s", e)

    # 6. Requisitions / Inventory Status
    try:
        req_query: dict[str, Any] = {}
        if store_code and store_code in ("NM", "HB", "CHW"):
            req_query["store_code"] = store_code
        reqs = list(db[REQUISITIONS].find(req_query).sort("created_at", -1).limit(15))
        pending_count = sum(1 for r in reqs if r.get("status") in ("Pending", "In Review"))
        urgent_count = sum(1 for r in reqs if r.get("priority") == "Urgent")
        context_data["requisitions_summary"] = {
            "total_recent_slips": len(reqs),
            "pending_slips": pending_count,
            "urgent_slips": urgent_count,
            "recent_items": [
                {
                    "req_code": r.get("req_code"),
                    "store": r.get("store_code"),
                    "priority": r.get("priority"),
                    "status": r.get("status"),
                    "dept": r.get("department", "General"),
                    "article": r.get("article_name") or r.get("article_code") or "Stock Line",
                    "qty": r.get("quantity_requested") or r.get("item_count", 1),
                }
                for r in reqs[:6]
            ],
        }
    except Exception as e:
        logger.debug("Failed to fetch requisitions summary: %s", e)

    return context_data


def _generate_domain_fallback(
    query: str,
    context: dict[str, Any],
    user: CurrentUser,
    active_store: str,
    lang: str,
) -> str:
    """Granular Rule-Based & Real-Time Analytics Engine grounded directly in MongoDB data."""
    q_lower = query.lower()
    store_names = {"NM": "New Market", "HB": "Hatibagan", "CHW": "Chowringhee", "ALL": "Consolidated Kolkata Network"}
    curr_store_name = store_names.get(active_store, active_store)

    store_kpi = context["stores"].get(active_store) or (context["stores"].get("NM") if context["stores"] else {})
    base_store_kpi = context.get("baseline_stores", {}).get(active_store) or {}
    overall_kpi = context.get("overall") or {}

    net_sales = float(store_kpi.get("net_sales") or 0.0)
    target_sales = float(store_kpi.get("sales_target") or store_kpi.get("target_sales") or 0.0)
    achieve_pct = float(store_kpi.get("achievement_pct") or 0.0)
    footfall = int(store_kpi.get("footfall") or 0)
    bills = int(store_kpi.get("nob") or 0)
    conv_pct = float(store_kpi.get("conversion_pct") or 0.0)
    atv = float(store_kpi.get("atv") or 0.0)
    rpv = float(store_kpi.get("rpv") or 0.0)
    basket = float(store_kpi.get("basket_size") or 0.0)
    units_sold = float(store_kpi.get("bill_quantity") or 0.0)

    gap = max(0.0, target_sales - net_sales) if target_sales else 0.0

    month_sum = context.get("monthly_summary") or {}
    month_target = month_sum.get("month_target") or 0.0
    month_actual = month_sum.get("month_net_sales") or 0.0
    month_prev = month_sum.get("prev_year_total") or 0.0
    month_growth = month_sum.get("growth_pct")

    # Dates formatting for exact YoY
    yest_date_fmt = "08.10.2026"
    py_date_fmt = "08.10.2025"

    base_sales = float(base_store_kpi.get("net_sales") or 0.0)
    daily_py_sales = month_sum.get("daily_prev_year_sales") or 0.0
    effective_base_sales = base_sales if base_sales > 0 else net_sales
    daily_growth = (
        ((effective_base_sales - daily_py_sales) / daily_py_sales * 100.0)
        if daily_py_sales > 0
        else (100.0 if effective_base_sales > 0 else 0.0)
    )
    daily_diff = effective_base_sales - daily_py_sales

    # 1. Baseline & YoY Comparison (08.10.2026 vs 08.10.2025)
    if any(k in q_lower for k in ["yoy", "tally growth", "previous year", "last year", "yesterday", "08.10", "8.10", "তুলনা", "গত বছর", "পূর্ববর্তী", "पिछले साल", "टैली", "ग्रोथ"]):
        growth_str = f"+{daily_growth:.1f}%" if daily_growth >= 0 else f"{daily_growth:.1f}%"

        if lang == "bn":
            return (
                f"### 📈 **YoY ট্যালি গ্রোথ ও তুলনামূলক বিশ্লেষণ ({curr_store_name})**\n\n"
                f"- **রেফারেন্স বেসলাইন দিন ({yest_date_fmt}):** ₹{effective_base_sales:,.2f}\n"
                f"- **পূর্ববর্তী বছরের একই দিন ({py_date_fmt}):** ₹{daily_py_sales:,.2f}\n"
                f"- **দৈনিক YoY গ্রোথ পেস:** **{growth_str}** ({'+' if daily_diff >= 0 else ''}₹{daily_diff:,.2f})\n"
                f"- **চলতি মাসের মোট সেলস (MTD):** ₹{month_actual:,.2f} (গত বছর: ₹{month_prev:,.2f})\n"
                f"- **মাসের সামগ্রিক গ্রোথ:** **{f'{month_growth:+.1f}%' if month_growth is not None else 'N/A'}**\n\n"
                f"💡 **স্ট্র্যাটেজি:** ০৮.১০.২০২৫ এর তুলনায় পজিটিভ মোমেন্টাম ধরে রাখতে হাই-ভ্যালু মার্চেন্ডাইজ ডিসপ্লে ও ক্যাশ কাউন্টার ক্রস-সেলিং জোরদার করুন।"
            )
        elif lang == "hi":
            return (
                f"### 📈 **YoY टैली ग्रोथ व पिछले वर्ष से तुलना ({curr_store_name})**\n\n"
                f"- **बेसलाइन संदर्भ दिन ({yest_date_fmt}):** ₹{effective_base_sales:,.2f}\n"
                f"- **पिछले वर्ष का समान दिन ({py_date_fmt}):** ₹{daily_py_sales:,.2f}\n"
                f"- **दैनिक YoY ग्रोथ पेस:** **{growth_str}** ({'+' if daily_diff >= 0 else ''}₹{daily_diff:,.2f})\n"
                f"- **चालू माह की कुल बिक्री (MTD):** ₹{month_actual:,.2f} (गत वर्ष: ₹{month_prev:,.2f})\n"
                f"- **माह की कुल ग्रोथ:** **{f'{month_growth:+.1f}%' if month_growth is not None else 'N/A'}**\n\n"
                f"💡 **रणनीति:** 08.10.2025 के मुकाबले बढ़त बनाए रखने के लिए शाम के पीक ऑवर्स में हाई-मार्जिन एक्सेसरीज की क्रॉस-सेलिंग पर फोकस करें।"
            )
        else:
            return (
                f"### 📈 **YoY Tally Growth & Historical Comparison ({curr_store_name})**\n\n"
                f"- **Baseline Operating Day ({yest_date_fmt}):** ₹{effective_base_sales:,.2f}\n"
                f"- **Previous Year Same Day ({py_date_fmt}):** ₹{daily_py_sales:,.2f}\n"
                f"- **Daily YoY Growth Pace:** **{growth_str}** ({'+' if daily_diff >= 0 else ''}₹{daily_diff:,.2f} delta)\n"
                f"- **Month-To-Date (MTD) Net Sales:** ₹{month_actual:,.2f} vs Last Year ₹{month_prev:,.2f}\n"
                f"- **MTD Cumulative Growth:** **{f'{month_growth:+.1f}%' if month_growth is not None else 'N/A'}**\n\n"
                f"💡 **Strategic Takeaway:** Evaluating 08.10.2026 vs 08.10.2025 gives authentic historical pacing. Ensure high conversion during the 5 PM - 8 PM surge to outperform last year's benchmark consistently."
            )

    # 2. Time Slot Performance & Hourly Pacing
    if any(k in q_lower for k in ["timeslot", "time slot", "slot", "hour", "hourly", "peak", "evening", "morning", "স্লট", "সময়", "পিক", "ঘंटे", "पीक", "समय"]):
        ts_data = context.get("timeslot_breakdowns", {}).get(active_store, {})
        slot_lines = []
        for slot in TIME_SLOT_ORDER:
            s_stat = ts_data.get(slot, {})
            s_sales = float(s_stat.get("net_sales") or 0.0)
            s_bills = int(s_stat.get("nob") or 0)
            s_conv = float(s_stat.get("conversion_pct") or 0.0)
            s_atv = float(s_stat.get("atv") or 0.0)
            slot_lines.append(f"- **{slot}:** ₹{s_sales:,.0f} Net Sales | {s_bills} Bills | Conv: {s_conv:.1f}% | ATV: ₹{s_atv:,.0f}")
        slot_summary_str = "\n".join(slot_lines) if slot_lines else "- Live time-slot records updating in real time."

        if lang == "bn":
            return (
                f"### ⏰ **টাইম-স্লটভিত্তিক লাইভ পারফরম্যান্স ও পেসিং ({curr_store_name})**\n\n"
                f"{slot_summary_str}\n\n"
                f"**মূল অপারেটিং নির্দেশিকা:**\n"
                f"1. **স্লট ১ (11:00 AM - 01:59 PM):** ওপেনিং ও ডিসপ্লে সেটআপ। সমস্ত ক্যাশ ডেস্ক প্রস্তুত রাখুন।\n"
                f"2. **স্লট ২ (02:00 PM - 04:59 PM):** ট্রায়াল রুম সহায়তা সক্রিয় করুন যাতে কাস্টমার ড্রপ-অফ না ঘটে।\n"
                f"3. **স্লট ৩ (05:00 PM - 07:59 PM):** **সন্ধ্যায় সর্বোচ্চ পিক রাশ!** সমস্ত বিলিং কাউন্টার সক্রিয় রাখুন এবং বিলিং স্পিড বাড়ান।\n"
                f"4. **স্লট ৪ (08:00 PM - 11:59 PM):** ক্লোজিং রাশ ও রাত ১০:৩০ টার মধ্যে চূড়ান্ত ডেটা লগ সম্পন্ন করুন।"
            )
        elif lang == "hi":
            return (
                f"### ⏰ **टाइम-स्लॉट आधारित लाइव रिपोर्ट व पेसिंग ({curr_store_name})**\n\n"
                f"{slot_summary_str}\n\n"
                f"**मुख्य ऑपरेटिंग दिशा-निर्देश:**\n"
                f"1. **स्लॉट 1 (11:00 AM - 01:59 PM):** ओपनिंग व डिस्प्ले रेडी। सभी कैश काउंटर एक्टिव रखें।\n"
                f"2. **स्लॉट 2 (02:00 PM - 04:59 PM):** ट्रायल रूम्स पर स्टाफ रखें ताकि साइज न मिलने से सेल मिस न हो।\n"
                f"3. **स्लॉट 3 (05:00 PM - 07:59 PM):** **शाम का सबसे मुख्य पीक समय!** कतारें न लगने दें और क्रॉस-सेलिंग बढ़ाएं।\n"
                f"4. **स्लॉट 4 (08:00 PM - 11:59 PM):** फाइनल क्लोजिंग पुश और रात 10:30 बजे तक डेटा एंट्री पूरी करें।"
            )
        else:
            return (
                f"### ⏰ **Time-Slot Live Pacing & Peak Hours Breakdown ({curr_store_name})**\n\n"
                f"{slot_summary_str}\n\n"
                f"**Operational Playbook for Today:**\n"
                f"1. **11.00 AM - 01.59 PM:** Floor setup & morning walk-ins conversion. Ensure POS machines are ready.\n"
                f"2. **02.00 PM - 04.59 PM:** Casual mid-day traffic. Deploy fitting room assistants to resolve size runs.\n"
                f"3. **05.00 PM - 07.59 PM:** **Prime Evening Surge!** Zero-delay billing checkout and high cashier throughput.\n"
                f"4. **08.00 PM - 11.59 PM:** Night closing acceleration. Mandatory manual entry completion by 10:30 PM."
            )

    # 3. Product Requisitions & Inventory Queries
    if any(k in q_lower for k in ["requisition", "stock", "product", "article", "category", "রিকুইজিশন", "স্টক", "মাল", "মালামাল", "सामान", "स्टॉक", "मांग", "रिक्वायरमेंट"]):
        req_sum = context.get("requisitions_summary") or {}
        tot_slips = req_sum.get("total_recent_slips", 0)
        pending_slips = req_sum.get("pending_slips", 0)
        urgent_slips = req_sum.get("urgent_slips", 0)
        recent_items = req_sum.get("recent_items", [])
        item_bullets = [
            f"- **{it['req_code']}** ({it['store']}): {it['article']} [{it['dept']}] × {it['qty']} | Priority: `{it['priority']}` | Status: **{it['status']}**"
            for it in recent_items
        ]
        req_details = "\n".join(item_bullets) if item_bullets else "- No active pending slips logged."

        if lang == "bn":
            return (
                f"### 📦 **প্রোডাক্ট রিকুইজিশন ও স্টক রিকোয়ারমেন্ট স্ট্যাটাস**\n\n"
                f"- **সাম্প্রতিক মোট রিকুইজিশন স্লিপ:** {tot_slips} টি\n"
                f"- **অপেক্ষমাণ (Pending) স্লিপ:** **{pending_slips}** টি | **জরুরি (Urgent):** **{urgent_slips}** টি\n\n"
                f"**সাম্প্রতিক স্লিপ তালিকা:**\n{req_details}\n\n"
                f"💡 **টিপ:** ফ্লোরে যে সকল ক্যাটাগরির সাইজ শেষ হয়ে গেছে, সেগুলোর জন্য অবিলম্বে `Product Requisition` ফর্মে স্লিপ সাবমিট করুন।"
            )
        elif lang == "hi":
            return (
                f"### 📦 **प्रोडक्ट रिक्विजिशन व स्टॉक रिक्वायरमेंट स्थिति**\n\n"
                f"- **कुल हालिया रिक्विजिशन स्लिप्स:** {tot_slips}\n"
                f"- **पेंडिंग (Pending) स्लिप्स:** **{pending_slips}** | **अति-आवश्यक (Urgent):** **{urgent_slips}**\n\n"
                f"**हालिया स्लिप्स विवरण:**\n{req_details}\n\n"
                f"💡 **सुझाव:** फास्ट-मूविंग डिपार्टमेंट्स में स्टॉक की कमी होने पर तुरंत `Product Requisition` फॉर्म से मांग भेजें।"
            )
        else:
            return (
                f"### 📦 **Product Requisitions & Stock Requirement Status**\n\n"
                f"- **Total Recent Requisition Slips:** {tot_slips}\n"
                f"- **Pending Action Slips:** **{pending_slips}** | **Urgent Priority:** **{urgent_slips}**\n\n"
                f"**Recent Store Slips:**\n{req_details}\n\n"
                f"💡 **Action Item:** Keep stock of high-demand items updated by logging fast-depleting lines via the Product Requisition form."
            )

    # 4. Single Bill / Billing Stream Transactions
    if any(k in q_lower for k in ["bill", "transaction", "highest bill", "largest bill", "average bill", "ticket", "বিল", "লেনদেন", "সবচেয়ে বড় বিল", "लेनदेन", "बिल", "बड़ा बिल"]):
        recent_b = context.get("recent_bills_summary") or {}
        tot_b = recent_b.get("total_bills_count", bills)
        max_b = recent_b.get("max_single_bill", 0.0)
        avg_b = recent_b.get("avg_bill_value", atv)
        units = recent_b.get("total_units_sold", units_sold)
        latest_bills = recent_b.get("latest_5_bills", [])
        b_lines = [f"- `{b['time']}` ({b['store']}): **₹{b['amount']:,.2f}** ({b['qty']:.0f} items)" for b in latest_bills]
        b_str = "\n".join(b_lines) if b_lines else "- No transactions logged yet."

        if lang == "bn":
            return (
                f"### 🧾 **বিলিং ও ট্রানজ্যাকশন অ্যানালিটিক্স ({curr_store_name})**\n\n"
                f"- **মোট বিল সংখ্যা:** {tot_b} টি\n"
                f"- **মোট বিক্রিত পণ্যের সংখ্যা:** {units:.0f} টি\n"
                f"- **সর্বোচ্চ একক বিল (Highest Bill):** **₹{max_b:,.2f}**\n"
                f"- **গড় বিল ভ্যালু (Average Ticket):** ₹{avg_b:,.2f}\n\n"
                f"**সাম্প্রতিক বিলিং স্ট্রিম:**\n{b_str}\n\n"
                f"💡 **টিপ:** বাস্কেট সাইজ বাড়াতে ক্যাশ কাউন্টারে অ্যাক্সেসরিজ অ্যাড-অন প্রদর্শন করুন।"
            )
        elif lang == "hi":
            return (
                f"### 🧾 **बिलिंग व ट्रांजैक्शन विश्लेषण ({curr_store_name})**\n\n"
                f"- **कुल बिलों की संख्या:** {tot_b}\n"
                f"- **कुल बेची गई वस्तुएं:** {units:.0f}\n"
                f"- **अधिकतम सिंगल बिल (Highest Bill):** **₹{max_b:,.2f}**\n"
                f"- **औसत बिल मूल्य (Average Ticket):** ₹{avg_b:,.2f}\n\n"
                f"**हालिया बिलिंग रिकॉर्ड:**\n{b_str}\n\n"
                f"💡 **सुझाव:** बास्केट साइज बढ़ाने के लिए चेकआउट काउंटर पर छोटे ऐड-ऑन प्रोडक्ट्स रखें।"
            )
        else:
            return (
                f"### 🧾 **Billing & Transaction Stream Analytics ({curr_store_name})**\n\n"
                f"- **Total Bills Processed:** {tot_b}\n"
                f"- **Total Units Sold:** {units:.0f}\n"
                f"- **Highest Single Bill:** **₹{max_b:,.2f}**\n"
                f"- **Average Ticket Size:** ₹{avg_b:,.2f}\n\n"
                f"**Recent Billing Stream:**\n{b_str}\n\n"
                f"💡 **Tip:** Push counter add-ons (socks, belts, handkerchiefs) at checkout to drive Average Transaction Value higher."
            )

    # 5. Multi-Store Comparison & Network Rankings
    if any(k in q_lower for k in ["compare", "ranking", "other store", "stores", "network", "benchmark", "তুলনা", "অন্য স্টোর", "তুলনামূলক", "তালিকায়", "स्टोर तुलना", "रैंकिंग"]):
        stores_data = context.get("stores", {})
        lines = []
        ranked_stores = sorted(
            [s for s in stores_data.items() if s[0] != "ALL"],
            key=lambda x: float(x[1].get("net_sales") or 0.0),
            reverse=True,
        )
        for rank, (sc, kpis) in enumerate(ranked_stores, 1):
            name = {"NM": "New Market", "HB": "Hatibagan", "CHW": "Chowringhee"}.get(sc, sc)
            s_sales = float(kpis.get("net_sales") or 0.0)
            s_ach = float(kpis.get("achievement_pct") or 0.0)
            s_atv = float(kpis.get("atv") or 0.0)
            s_conv = float(kpis.get("conversion_pct") or 0.0)
            medal = "🥇" if rank == 1 else "🥈" if rank == 2 else "🥉"
            if lang == "bn":
                lines.append(f"{medal} **{name}:** সেলস ₹{s_sales:,.0f} | অর্জন: {s_ach:.1f}% | কনভার্সন: {s_conv:.1f}% | ATV: ₹{s_atv:,.0f}")
            elif lang == "hi":
                lines.append(f"{medal} **{name}:** बिक्री ₹{s_sales:,.0f} | अचीवमेंट: {s_ach:.1f}% | कन्वर्शन: {s_conv:.1f}% | ATV: ₹{s_atv:,.0f}")
            else:
                lines.append(f"{medal} **{name}:** Sales ₹{s_sales:,.0f} | Ach: {s_ach:.1f}% | Conv: {s_conv:.1f}% | ATV: ₹{s_atv:,.0f}")

        comparison_str = "\n".join(lines) if lines else "- Multi-store live snapshots synchronized."
        ov_sales = float(overall_kpi.get("net_sales") or 0.0)
        ov_ach = float(overall_kpi.get("achievement_pct") or 0.0)

        if lang == "bn":
            return (
                f"### 🏬 **৩টি স্টোরের লাইভ পারফরম্যান্স র‍্যাঙ্কিং ও তুলনা**\n\n"
                f"{comparison_str}\n\n"
                f"- **নেটওয়ার্ক মোট সেলস:** ₹{ov_sales:,.0f} | **গড় অর্জন:** {ov_ach:.1f}%\n\n"
                f"💡 **উপদেশ:** যে স্টোরের কনভার্সন রেট পিছিয়ে রয়েছে, সেখানে ফ্লোর সুপারভাইজারদের ট্রায়াল রুমে সহায়তা বাড়াতে নির্দেশ দিন।"
            )
        elif lang == "hi":
            return (
                f"### 🏬 **तीनों स्टोर्स की लाइव रैंकिंग व तुलना**\n\n"
                f"{comparison_str}\n\n"
                f"- **नेटवर्क कुल बिक्री:** ₹{ov_sales:,.0f} | **औसत अचीवमेंट:** {ov_ach:.1f}%\n\n"
                f"💡 **सलाह:** जिस स्टोर का कन्वर्शन कम है, वहां ट्रायल रूम्स पर स्टाफ असिस्टेंस बढ़ाएं।"
            )
        else:
            return (
                f"### 🏬 **Consolidated 3-Store Network Live Benchmark**\n\n"
                f"{comparison_str}\n\n"
                f"- **Combined Kolkata Network Sales:** ₹{ov_sales:,.0f} | **Network Achievement:** {ov_ach:.1f}%\n\n"
                f"💡 **Management Directive:** Focus on lifting lower-performing stores by reallocating floor staff to active trial rooms during peak hours."
            )

    # 6. Conversion Rate & ATV Optimization Tactics
    if any(k in q_lower for k in ["conversion", "atv", "basket", "upb", "rpv", "boost", "improve", "lift", "কনভার্সন", "বাড়ানো", "উপায়", "কৌশল", "कन्वर्शन", "बढ़ाएं", "उपाय"]):
        if lang == "bn":
            return (
                f"### 🎯 **কনভার্সন রেট (৭০%+) ও ATV (₹১,৮০০+) বাড়ানোর ফ্লোর স্ট্র্যাটেজি**\n\n"
                f"**১. কনভার্সন রেট বৃদ্ধি (বর্তমান: {conv_pct:.1f}%):**\n"
                f"- **প্রবেশদ্বারে আন্তরিক অভ্যর্থনা:** আগত গ্রাহকদের অবিলম্বে সঠিক সেকশনে পৌঁছে দিন।\n"
                f"- **ট্রায়াল রুম সাপোর্ট:** সাইজ ও ফিটিং সমস্যার কারণে কাস্টমার যেন না ফিরে যায়, সেজন্য ট্রায়াল রুমের সামনে কর্মী রাখুন।\n\n"
                f"**২. ATV ও বাস্কেট সাইজ বৃদ্ধি (বর্তমান ATV: ₹{atv:,.0f}, UPB: {basket:.2f}):**\n"
                f"- **কমপ্লিমেন্টারি ক্রস-সেলিং:** শার্টের সাথে টাই/বেল্ট, শাড়ির সাথে ম্যাচিং অ্যাক্সেসরিজ অফার করুন।\n"
                f"- **ক্যাশ কাউন্টার অ্যাড-অন:** মোজা, রুমাল, পারফিউম কাউন্টারে রাখুন এবং বিলিংয়ের সময় অফার করুন।\n"
                f"- **মাল্টি-বাই প্রমোশন:** 'বাই ২ গেট ১' বা বান্ডেল ডিল গ্রাহকদের দৃষ্টিগোচর করুন।"
            )
        elif lang == "hi":
            return (
                f"### 🎯 **कन्वर्शन रेट (70%+) और ATV (₹1,800+) बढ़ाने की रणनीति**\n\n"
                f"**1. कन्वर्शन रेट बढ़ाएं (वर्तमान: {conv_pct:.1f}%):**\n"
                f"- **द्वार पर त्वरित सहायता:** ग्राहकों को सीधे उनके पसंदीदा सेक्शन में गाइड करें।\n"
                f"- **ट्रायल रूम एक्टिव असिस्टेंस:** साइज न मिलने की वजह से कोई ग्राहक बिना खरीदे न जाए।\n\n"
                f"**2. ATV व बास्केट साइज बढ़ाएं (वर्तमान ATV: ₹{atv:,.0f}, UPB: {basket:.2f}):**\n"
                f"- **क्रॉस-सेलिंग कॉम्बो:** शर्ट के साथ मैचिंग ट्राउजर या टाई सजेस्ट करें।\n"
                f"- **कैश काउंटर ऐड-ऑन्स:** बिलिंग के समय हैंकी, सॉक्स व डियोड्रेंट का तुरंत सुझाव दें।\n"
                f"- **बंडल ऑफर्स:** 2 या अधिक आइटम खरीदने पर आकर्षक डिस्काउंट हाइलाइट करें।"
            )
        else:
            return (
                f"### 🎯 **Floor Tactics to Boost Conversion (Target 70%+) & ATV (Target ₹1,800+)**\n\n"
                f"**1. Conversion Optimization (Current: {conv_pct:.1f}%):**\n"
                f"- **Door Greeting & Fast Section Direction:** Ensure no shopper feels lost upon entering.\n"
                f"- **Active Fitting Room Assistance:** Deploy dedicated floor runners to swap sizes directly at the trial rooms.\n\n"
                f"**2. ATV & Basket Expansion (Current ATV: ₹{atv:,.0f}, UPB: {basket:.2f}):**\n"
                f"- **Checkout Impulse Merchandising:** Place handkerchiefs, socks, accessories, and wallets right next to POS monitors.\n"
                f"- **Ensemble Selling:** Train sales floor reps to pitch complete outfits (e.g. shirt + chinos + belt) rather than single items.\n"
                f"- **Multi-Buy Highlights:** Actively announce 2-item bundled deals to incentivize higher unit sales."
            )

    # 7. Management Directives & Operational SOPs
    if any(k in q_lower for k in ["directive", "sop", "raphael", "order", "closing", "protocol", "রুল", "নির্দেশ", "রাফায়েল", "বসের নির্দেশ", "नियम", "निर्देश", "राफेल", "प्रोटोकॉल"]):
        dirs = context.get("directives", [])
        dir_lines = [f"- 🔴 **[{d['priority']}] {d['title']}:** {d['message']}" for d in dirs]
        dir_str = "\n".join(dir_lines) if dir_lines else "- Standard Operating Guidelines Active."

        if lang == "bn":
            return (
                f"### 📋 **রাফায়েল স্যারের সক্রিয় নির্দেশাবলী ও দৈনিক SOP**\n\n"
                f"{dir_str}\n\n"
                f"**দৈনিক আবশ্যকীয় প্রোটোকল:**\n"
                f"1. **সকাল ১১:০০ টা:** সমস্ত ক্যাশ ডেস্ক ও পিওএস মেশিন চালু নিশ্চিতকরণ।\n"
                f"2. **সন্ধ্যা ৫:০০ টা - ৮:০০ টা:** পিক রাশ চলাকালীন ক্যাশ কাউন্টারে কোনো বিলম্ব বরদাস্ত করা হবে না।\n"
                f"3. **রাত ১০:৩০ টা:** **বাধ্যতামূলক ম্যানুয়াল ডেটা লগ ও বিলিং ক্লোজিং সম্পন্ন করতে হবে।**"
            )
        elif lang == "hi":
            return (
                f"### 📋 **राफेल सर के सक्रिय निर्देश व दैनिक SOP**\n\n"
                f"{dir_str}\n\n"
                f"**अनिवार्य दैनिक प्रोटोकॉल:**\n"
                f"1. **सुबह 11:00 AM:** सभी बिलिंग काउंटर और पीओएस मशीनें चालू हों।\n"
                f"2. **शाम 5:00 PM - 8:00 PM:** पीक ऑवर्स में कैश काउंटर पर कतारें न लगने दें।\n"
                f"3. **रात 10:30 PM:** **मैन्युअल बिलिंग डेटा एंट्री पूरी करना अनिवार्य है।**"
            )
        else:
            return (
                f"### 📋 **Executive Directives & Daily Operating SOP**\n\n"
                f"{dir_str}\n\n"
                f"**Mandatory Daily Operations Checklist:**\n"
                f"1. **11:00 AM:** Complete cash desk POS verification and morning setup.\n"
                f"2. **05:00 PM - 08:00 PM:** Peak staffing at all checkout desks with zero cashier lag.\n"
                f"3. **10:30 PM:** **Strict mandatory deadline for finalized daily data entry submission.**"
            )

    # 8. Performance & Sales Check / Target Gaps
    if any(k in q_lower for k in ["performance", "sales", "target", "achievement", "how is", "gap", "run rate", "বিলিং", "সেলস", "টার্গেট", "পারফরম্যান্স", "बिक्री", "सेल", "टारगेट", "अंतर"]):
        recent_b = context.get("recent_bills_summary") or {}
        tot_b_count = recent_b.get("total_bills_count", bills)
        max_b = recent_b.get("max_single_bill", 0.0)

        if lang == "bn":
            return (
                f"### 📊 **{curr_store_name} লাইভ সেলস ও টার্গেট স্ট্যাটাস**\n\n"
                f"- **মোট নেট সেলস:** ₹{net_sales:,.2f}\n"
                f"- **আজকের সেলস টার্গেট:** ₹{target_sales:,.2f}\n"
                f"- **টার্গেট অর্জন (Achievement):** **{achieve_pct:.1f}%**\n"
                f"- **বাকি টার্গেট গ্যাপ:** ₹{gap:,.2f}\n"
                f"- **বিল সংখ্যা (NOB):** {bills} টি ({units_sold:.0f} আইটেম বিক্রিত)\n"
                f"- **ফুটফল:** {footfall} জন | **সর্বোচ্চ একক বিল:** ₹{max_b:,.2f}\n"
                f"- **কনভার্সন রেট:** **{conv_pct:.1f}%** | **ATV:** ₹{atv:,.2f} | **RPV:** ₹{rpv:,.2f}\n"
                f"- **বাস্কেট সাইজ (UPB):** {basket:.2f} items/bill\n\n"
                f"💡 **অ্যাকশন প্ল্যান:** {'পিক আওয়ারে (সন্ধ্যা ৫টা - ৮টা) ক্যাশ ডেস্কে দ্রুত বিলিং এবং এক্সেসরিজ অ্যাড-অন বাড়ানোর মাধ্যমে বাকি গ্যাপ পূরণ করুন।' if gap > 0 else 'অসাধারণ পারফরম্যান্স! আজকের টার্গেট ইতিমধ্যে সফলভাবে পূর্ণ হয়েছে। সারপ্লাস মার্জিন ধরে রাখুন।'}"
            )
        elif lang == "hi":
            return (
                f"### 📊 **{curr_store_name} आज की लाइव बिक्री व लक्ष्य रिपोर्ट**\n\n"
                f"- **कुल शुद्ध बिक्री (Net Sales):** ₹{net_sales:,.2f}\n"
                f"- **निर्धारित लक्ष्य (Target):** ₹{target_sales:,.2f}\n"
                f"- **टारगेट अचीवमेंट:** **{achieve_pct:.1f}%**\n"
                f"- **बाकी लक्ष्य अंतर (Gap):** ₹{gap:,.2f}\n"
                f"- **कुल बिल (NOB):** {bills} ({units_sold:.0f} वस्तुएं बेची गईं)\n"
                f"- **फुटफॉल:** {footfall} | **अधिकतम सिंगल बिल:** ₹{max_b:,.2f}\n"
                f"- **कन्वर्शन रेट:** **{conv_pct:.1f}%** | **ATV:** ₹{atv:,.2f} | **RPV:** ₹{rpv:,.2f}\n"
                f"- **बास्केट साइज:** {basket:.2f} वस्तुएं/बिल\n\n"
                f"💡 **कार्ययोजना:** {'पीक ऑवर्स (शाम 5 बजे - 8 बजे) में बिलिंग डेस्क पर एक्सेसरीज क्रॉस-सेलिंग बढ़ाकर गैप पूरा करें।' if gap > 0 else 'शानदार काम! आज का टारगेट सफलतापूर्वक पूरा हो चुका है। सरप्लस बनाए रखें।'}"
            )
        else:
            return (
                f"### 📊 **{curr_store_name} Live Sales & Target Gap Diagnostics**\n\n"
                f"- **Net Sales:** ₹{net_sales:,.2f}\n"
                f"- **Sales Target:** ₹{target_sales:,.2f}\n"
                f"- **Target Achievement:** **{achieve_pct:.1f}%**\n"
                f"- **Remaining Target Gap:** ₹{gap:,.2f}\n"
                f"- **Bills Count (NOB):** {bills} ({units_sold:.0f} units sold)\n"
                f"- **Footfall:** {footfall} visitors | **Peak Single Bill:** ₹{max_b:,.2f}\n"
                f"- **Conversion Rate:** **{conv_pct:.1f}%** | **ATV:** ₹{atv:,.2f} | **RPV:** ₹{rpv:,.2f}\n"
                f"- **Basket Size (UPB):** {basket:.2f} items/bill\n\n"
                f"💡 **Action Plan:** {'Deploy floor supervisors during the peak evening rush (5 PM - 8 PM) to assist shoppers and push counter add-ons to bridge the target gap.' if gap > 0 else 'Outstanding performance! Today target has been successfully achieved. Maintain surplus momentum.'}"
            )

    # 9. Retail Mathematical Formulas & Definitions
    if any(k in q_lower for k in ["formula", "kpi formula", "definition", "গাণিতিক সূত্র", "ফর্মুলা", "सूत्र"]):
        return (
            "### 📐 **CITIMART Official KPI Mathematical Formulas**\n\n"
            "- **Conversion Rate (%)** = `(Total Bills / Total Footfall) × 100`\n"
            "- **Average Transaction Value (ATV)** = `Net Sales / Total Bills`\n"
            "- **Revenue Per Visitor (RPV)** = `Net Sales / Total Footfall`\n"
            "- **Basket Size (UPB)** = `Total Units Sold / Total Bills`\n"
            "- **Sales Per Hour (SPH)** = `Net Sales / 12 Operating Hours`\n"
            "- **Target Achievement (%)** = `(Actual Net Sales / Target Sales) × 100`\n"
            "- **Remaining Target Gap** = `Target Sales - Actual Net Sales`\n"
            "- **YoY Tally Growth (%)** = `((Present Net Sales - Prev Year Net Sales) / Prev Year Net Sales) × 100`\n\n"
            "*(Comparative YoY benchmarks compare 08.10.2026 vs 08.10.2025)*"
        )

    # Default Helpful Response Grounded in Live Data
    if lang == "bn":
        return (
            f"নমস্কার! আমি **CITIMART AI ডিসিশন অ্যাডভাইজার ও অপারেশনস কো-পাইলট**।\n\n"
            f"আজকের ({target_date.strftime('%d.%m.%Y')}) {curr_store_name}-এর বর্তমান লাইভ সেলস **₹{net_sales:,.0f}** (টার্গেট: ₹{target_sales:,.0f}, অর্জন: **{achieve_pct:.1f}%**)।\n\n"
            f"**আমি আপনাকে নিম্নলিখিত বিষয়গুলোতে তাৎক্ষণিক বিশ্লেষণ দিতে পারি:**\n"
            f"- 📊 *আজকের সেলস ও টার্গেট গ্যাপ স্ট্যাটাস*\n"
            f"- 📈 *YoY ট্যালি গ্রোথ (বেসলাইন ০৮.১০.২০২৬ বনাম ০৮.১০.২০২৫)*\n"
            f"- ⏰ *টাইম-স্লটভিত্তিক সেলস ও ইভিনিং পিক আওয়ার পেসিং*\n"
            f"- 🏬 *নিউ মার্কেট, হাতিবাগান ও চৌরঙ্গীর তুলনামূলক র‍্যাঙ্কিং*\n"
            f"- 📦 *প্রোডাক্ট রিকুইজিশন ও স্টক ঘাটতির বিবরণ*\n"
            f"- 🧾 *সর্বোচ্চ একক বিল ও বিলিং স্ট্রিম বিবরণ*\n"
            f"- 🎯 *কনভার্সন রেট ও ATV বাড়ানোর কৌশল*"
        )
    elif lang == "hi":
        return (
            f"नमस्ते! मैं **CITIMART AI डिसीजन एडवाइजर व ऑपरेशन्स को-पायलट** हूँ।\n\n"
            f"आज ({target_date.strftime('%d.%m.%Y')}) {curr_store_name} की वर्तमान लाइव बिक्री **₹{net_sales:,.0f}** है (टारगेट: ₹{target_sales:,.0f}, अचीवमेंट: **{achieve_pct:.1f}%**)।\n\n"
            f"**आप मुझसे निम्नलिखित विषयों पर तुरंत रिपोर्ट ले सकते हैं:**\n"
            f"- 📊 *आज की बिक्री व टारगेट अंतर विश्लेषण*\n"
            f"- 📈 *YoY टैली ग्रोथ (बेसलाइन 08.10.2026 बनाम 08.10.2025)*\n"
            f"- ⏰ *टाइम-स्लॉट अनुसार सेल्स व पीक ऑवर्स स्ट्रैटेजी*\n"
            f"- 🏬 *न्यू मार्केट, हाथीबागान व चौरंगी की तुलनात्मक रैंकिंग*\n"
            f"- 📦 *प्रोडक्ट रिक्विजिशन व स्टॉक स्टेटस*\n"
            f"- 🧾 *अधिकतम बिल व बिलिंग स्ट्रीम आंकड़े*\n"
            f"- 🎯 *कन्वर्शन रेट और ATV बढ़ाने के उपाय*"
        )
    else:
        return (
            f"Hello! I am the **CITIMART AI Decision Advisor & Operations Co-Pilot**.\n\n"
            f"Currently for {curr_store_name} on {target_date.strftime('%d.%m.%Y')}, live net sales stand at **₹{net_sales:,.0f}** against target **₹{target_sales:,.0f}** (**{achieve_pct:.1f}%** achieved).\n\n"
            f"**You can ask me about:**\n"
            f"- 📊 *Live sales performance & target gap recovery*\n"
            f"- 📈 *YoY Tally growth (Baseline 08.10.2026 vs 08.10.2025)*\n"
            f"- ⏰ *Time-slot pacing & peak evening surge strategies (5 PM - 8 PM)*\n"
            f"- 🏬 *Network rankings across New Market, Hatibagan & Chowringhee*\n"
            f"- 📦 *Pending product requisitions & departmental stock demand*\n"
            f"- 🧾 *Highest single bill, average ticket size & recent transactions*\n"
            f"- 🎯 *Tactics to boost conversion rate and ATV above ₹1,800*\n"
            f"- 📐 *Official KPI formulas and retail mathematical definitions*"
        )


@router.post("")
def chat_with_copilot(
    payload: ChatRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Chat endpoint supporting Gemini API with granular real-time MongoDB dataset injection,
    with automatic failover to high-precision Local Domain Analytics Engine."""
    target_date = date.today()
    if payload.date_str:
        try:
            target_date = date.fromisoformat(payload.date_str)
        except ValueError:
            target_date = date.today()

    active_store = payload.store_code or user.store_code or "NM"
    if not user.is_admin and active_store != user.store_code:
        active_store = user.store_code or "NM"

    # Gather comprehensive real-time MongoDB context
    context = _gather_live_context(db, target_date, active_store, user)

    # Check for Gemini API Key
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    if gemini_key:
        try:
            import requests

            store_kpi = context["stores"].get(active_store, {})
            overall_kpi = context.get("overall", {})
            timeslot_data = context.get("timeslot_breakdowns", {}).get(active_store, {})
            monthly_summary = context.get("monthly_summary", {})
            recent_bills = context.get("recent_bills_summary", {})
            requisitions = context.get("requisitions_summary", {})

            context_str = (
                f"REAL-TIME MONGODB OPERATIONAL DATASET:\n"
                f"- Active Date: {target_date.isoformat()} (Baseline Date: {context.get('baseline_date')} [08.10.2026], Prev Year Date: {context.get('prev_year_date')} [08.10.2025])\n"
                f"- User: {user.username} (Role: {user.role}, Assigned Store: {user.store_code or 'ALL'})\n"
                f"- Active Store Scope: {active_store} ({STORE_CODE_TO_NAME.get(active_store, active_store)})\n"
                f"- Active Store Live KPIs (Today): {store_kpi}\n"
                f"- Active Store Baseline KPIs (Yesterday 08.10.2026): {context.get('baseline_stores', {}).get(active_store, {})}\n"
                f"- Time-Slot Breakdown Today: {timeslot_data}\n"
                f"- Monthly Target Summary (MTD): {monthly_summary}\n"
                f"- Consolidated 3-Store Network KPIs: {overall_kpi}\n"
                f"- Network Per-Store Snapshots: {context.get('stores')}\n"
                f"- Billing Stream & Transactions Summary: {recent_bills}\n"
                f"- Product Requisitions Status: {requisitions}\n"
                f"- Active Management Directives: {context.get('directives', [])}\n"
                f"- Weather & Context: {context.get('weather')}, Holiday: {context.get('holiday')}\n"
                f"- Preferred Output Language: {payload.language} (Respond in {'Bengali (বাংলা)' if payload.language == 'bn' else 'Hindi (हिंदी)' if payload.language == 'hi' else 'English'})\n"
            )

            messages = [{"role": "system", "parts": [{"text": CITIMART_SYSTEM_INSTRUCTION + "\n\n" + context_str}]}]

            for h in payload.conversation_history[-8:]:
                role = "user" if h.role == "user" else "model"
                messages.append({"role": role, "parts": [{"text": h.content}]})

            messages.append({"role": "user", "parts": [{"text": payload.message}]})

            # Try primary Gemini 2.5 Flash / 1.5 Flash / 2.0 Flash
            for model_name in ("gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-pro"):
                try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
                    resp = requests.post(
                        url,
                        json={
                            "contents": messages,
                            "generationConfig": {
                                "temperature": 0.35,
                                "maxOutputTokens": 1500,
                            },
                        },
                        timeout=10,
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        reply = data["candidates"][0]["content"]["parts"][0]["text"]
                        return {
                            "reply": reply,
                            "engine": model_name,
                            "store": active_store,
                            "date": target_date.isoformat(),
                        }
                except Exception as inner_e:
                    logger.debug("Gemini model %s attempt failed: %s", model_name, inner_e)
                    continue

        except Exception as e:
            logger.debug("External LLM connection failed, using Granular Domain Engine: %s", e)

    # Granular Real-Time Domain Intelligence Engine
    reply = _generate_domain_fallback(
        query=payload.message,
        context=context,
        user=user,
        active_store=active_store,
        lang=payload.language,
    )

    return {
        "reply": reply,
        "engine": "citimart-realtime-mongodb-analytics",
        "store": active_store,
        "date": target_date.isoformat(),
    }
