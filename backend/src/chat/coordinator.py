"""Coordinator / Supervisor Agent Orchestrator.

Orchestrates 5 dedicated sub-agents:
1. DbOpsAgent (Live MongoDB Atlas Metrics & 79+ Days Historical Sales)
2. TargetAdjustmentAgent (7/14/30-day Rolling Deficit Carry-Forward)
3. ForecastingAgent (YoY Pacing & Run-Rates)
4. MarketIntelAgent (Live Internet Search & Weather)
5. RetailCoachAgent (Floor Tactics, SOPs & Multilingual Synthesis)
"""
from __future__ import annotations

import concurrent.futures
from datetime import date
import json
import logging
import re
from typing import Any
from pymongo.database import Database

from config.env import env
from config.settings import STORE_CODE_TO_NAME, TIME_SLOT_ORDER
from src.chat.agents.db_ops_agent import DbOpsAgent
from src.chat.agents.forecasting_agent import ForecastingAgent
from src.chat.agents.market_intel_agent import MarketIntelAgent
from src.chat.agents.retail_coach_agent import RetailCoachAgent
from src.chat.agents.target_adjust_agent import TargetAdjustmentAgent
from src.chat.client import generate_llm_response
from src.chat.hooks.anti_hallucination_hook import AntiHallucinationHook
from src.chat.intent import ADVICE_INTENTS, IntentResult, detect_intent
from src.chat.memory import SessionMemoryStore
from src.chat.state import ChatResponse, SecurityContext
from src.chat.tools.db_tools import store_label
from src.chat.tools.history_tools import (
    get_database_date_range,
    is_explicit_date_reason,
    ist_today,
    resolve_query_target_date,
)

logger = logging.getLogger(__name__)

BASE_COORDINATOR_SYSTEM_INSTRUCTION = """
You are the CITIMART AI Retail Operations Coordinator & Executive Co-Pilot — an authoritative, numbers-first retail decision system for CITIMART departmental stores in Kolkata (New Market [NM], Hatibagan [HB], and Chowringhee [CHW]).

CORE DIRECTIVES:
1. ZERO CONVERSATIONAL FILLER: Never start with "Hello", "Certainly", "I hope you are doing well", or pleasantries. Begin directly with the factual answer, metric card, or data table.
2. STRICT NUMBERS-FIRST GROUNDING: Every figure must come directly from verified MongoDB records. If a metric or date has no database record, explicitly declare that no record exists. Never fabricate, extrapolate, or guess sales, footfall, bills, or target numbers.
3. CONCISE FLOOR ACTION: Floor tactical recommendations must be concrete, operational, and strictly capped at 1-2 bullet points.
4. TARGET ADJUSTMENT FORMULA:
   - Original Target: T_t
   - Carry-Forward: C_t
   - Adjusted Target: A_t = T_t + C_t
   - Deficit recovery distributes unachieved balances over 7, 14, or 30-day windows.
5. MULTI-TENANT ISOLATION: Store managers (NM, HB, CHW) see only their assigned store. Only Executive Admin (Raphael Sir) sees network-wide consolidated rankings.
6. MULTILINGUAL SUPPORT: When queried in Bengali (বাংলা) or Hindi (हिंदी), respond fluently and precisely in that language using the same numbers-first, zero-fluff discipline.
"""


def _t(language: str, en: str, bn: str, hi: str) -> str:
    return bn if language == "bn" else hi if language == "hi" else en


def _inr(v: Any) -> str:
    try:
        return f"₹{float(v or 0):,.2f}"
    except (TypeError, ValueError):
        return "₹0.00"


def _no_records_card(store_name: str, day_iso: str, db_calendar: dict[str, Any] | None, language: str) -> str:
    from src.daily_context import get_holiday_name
    holiday_tag = ""
    try:
        d = date.fromisoformat(day_iso)
        h_name = get_holiday_name(d)
        if h_name:
            holiday_tag = f" ({h_name})"
    except Exception:
        pass

    latest = (db_calendar or {}).get("latest_date")
    hint_en = f"\n\n💡 **Tip:** The latest completed operating day with verified bills is **{latest}**. Ask *'Show {latest} report'* or *'Show yesterday's sales'* to inspect full numbers." if latest and latest != day_iso else ""
    hint_bn = f"\n\n💡 **পরামর্শ:** সর্বশেষ সম্পূর্ণ রেকর্ড করা দিন **{latest}**। সম্পূর্ণ রিপোর্ট দেখতে *'{latest} এর সেলস রিপোর্ট'* বা *'গতকালের রিপোর্ট'* দেখতে চাইতে পারেন।" if latest and latest != day_iso else ""
    hint_hi = f"\n\n💡 **सुझाव:** नवीनतम सत्यापित कारोबारी दिन **{latest}** है। पूरा विवरण देखने के लिए *'{latest} की रिपोर्ट'* या *'कल की बिक्री'* पूछें।" if latest and latest != day_iso else ""
    return _t(
        language,
        f"### ℹ️ **{store_name} — {day_iso}{holiday_tag}**\n\nNo sales (bills), footfall or NOB have been logged for this date yet.{hint_en}",
        f"### ℹ️ **{store_name} — {day_iso}{holiday_tag}**\n\nএই তারিখে এখনও ফ্লোর থেকে কোনো সেলস (বিল), ফুটফল বা এনওবি লগ করা হয়নি।{hint_bn}",
        f"### ℹ️ **{store_name} — {day_iso}{holiday_tag}**\n\nइस तारीख के लिए अभी तक स्टोर फ्लोर से कोई बिक्री (बिल), फुटफॉल या एनओबी लॉग नहीं हुआ है।{hint_hi}",
    )


def _simulation_card(store_name: str, sims: dict[str, Any], language: str) -> str:
    rows = []
    for key in ("7_days", "14_days", "30_days"):
        o = sims["options"].get(key)
        if o:
            rows.append(f"| {key.split('_')[0]} | {_inr(o.get('total_deficit'))} | +{_inr(o.get('daily_carry'))} | **{_inr(o.get('adjusted_target'))}** |")
    safest = min(
        sims["options"].items(), key=lambda kv: float(kv[1].get("daily_carry") or 0.0)
    )[0].split("_")[0] if sims["options"] else "30"
    head = _t(language, "Window (days) | Deficit in window | Daily carry (C_t) | Adjusted target (A_t)",
              "উইন্ডো (দিন) | উইন্ডোর ঘাটতি | দৈনিক ক্যারি (C_t) | সমন্বিত টার্গেট (A_t)",
              "विंडो (दिन) | विंडो का घाटा | दैनिक कैरी (C_t) | समायोजित लक्ष्य (A_t)")
    return (
        _t(language, f"### 🎯 **Deficit Recovery Simulation — {store_name} ({sims.get('date')})**",
           f"### 🎯 **ডেফিসিট রিকভারি সিমুলেশন — {store_name} ({sims.get('date')})**",
           f"### 🎯 **डेफिसिट रिकवरी सिमुलेशन — {store_name} ({sims.get('date')})**")
        + f"\n\n- **T_t:** {_inr(sims.get('original_target'))} | **S_t:** {_inr(sims.get('net_sales'))}\n\n"
        + f"| {head} |\n| :---: | :---: | :---: | :---: |\n" + "\n".join(rows) + "\n\n"
        + _t(language,
             f"💡 The **{safest}-day** window adds the smallest daily load (lowest C_t); shorter windows recover faster but raise each day's target more.",
             f"💡 **{safest} দিনের** উইন্ডোতে দৈনিক অতিরিক্ত চাপ সবচেয়ে কম; ছোট উইন্ডোতে দ্রুত রিকভারি হয় কিন্তু দৈনিক টার্গেট বেশি বাড়ে।",
             f"💡 **{safest}-दिन** की विंडो में दैनिक अतिरिक्त भार सबसे कम है; छोटी विंडो से रिकवरी तेज़ होती है पर रोज़ का लक्ष्य ज़्यादा बढ़ता है।")
    )


def _coaching_card(store_name: str, primary: str, subagent_data: dict[str, Any], db_ops: dict[str, Any], language: str, query_norm: str = "") -> str:
    tactics = subagent_data.get("retail_coach_agent", {}).get("tactics", {})
    k = db_ops.get("kpis") or {}
    lines = [
        _t(language, f"### 🧭 **Floor Playbook — {store_name}**", f"### 🧭 **ফ্লোর প্লেবুক — {store_name}**", f"### 🧭 **फ्लोर प्लेबुक — {store_name}**"),
        "",
    ]
    if k and not k.get("error"):
        lines.append(
            _t(language, f"**Current ({k.get('date')}):**", f"**বর্তমান ({k.get('date')}):**", f"**वर्तमान ({k.get('date')}):**")
            + f" Net Sales {_inr(k.get('net_sales'))} | Conv {float(k.get('conversion_pct') or 0):.1f}% | ATV {_inr(k.get('atv'))} | Basket {float(k.get('basket_size') or 0):.2f}"
        )
        lines.append("")
    surge = subagent_data.get("forecasting_agent", {}).get("surge")
    if primary == "surge" and surge and not surge.get("error"):
        lines += [f"- **{surge.get('action_recommendation')}**", ""]
        picks = tactics.get("daily_sop_checkpoints", []) + tactics.get("conversion_boost_70pct", [])[2:3]
    elif "atv" in query_norm or "basket" in query_norm or "টিকিট" in query_norm or "बास्केट" in query_norm:
        picks = tactics.get("atv_expansion_1800inr", [])
    else:
        picks = tactics.get("conversion_boost_70pct", [])
    lines += [f"{i}. {p}" for i, p in enumerate(picks, 1)]
    return "\n".join(lines)


def _market_card(store_name: str, mi: dict[str, Any], language: str) -> str:
    lines = [_t(language, "### 🌦️ **Kolkata Market Context**", "### 🌦️ **কলকাতা বাজার ও আবহাওয়া**", "### 🌦️ **कोलकाता बाज़ार व मौसम**"), ""]
    w = mi.get("weather")
    if w:
        lines.append(
            f"- **{w.get('date')} ({w.get('source')}):** {w.get('condition')}, "
            f"{w.get('temp_min_c')}–{w.get('temp_max_c')} °C, rain {w.get('precipitation_mm')} mm"
        )
        if (w.get("precipitation_mm") or 0) >= 5:
            lines.append(_t(language, "- Heavy rain usually cuts walk-in footfall; push the evening slot once it clears.",
                            "- ভারী বৃষ্টিতে সাধারণত ফুটফল কমে; বৃষ্টি থামলে সন্ধ্যার স্লটে জোর দিন।",
                            "- भारी बारिश में आमतौर पर फुटफॉल घटता है; बारिश रुकने पर शाम के स्लॉट पर ज़ोर दें।"))
    for key in ("weather_signals", "festival_signals"):
        for r in mi.get(key) or []:
            lines.append(f"- **{r.get('title')}** — {r.get('snippet')}")
    for r in (mi.get("market_signals") or {}).get("signals", []):
        lines.append(f"- **{r.get('title')}** — {r.get('snippet')}")
    if len(lines) == 2:
        lines.append(_t(language, "External market data is unavailable right now.", "বাহ্যিক তথ্য এখন উপলব্ধ নয়।", "बाहरी जानकारी अभी उपलब्ध नहीं है।"))
    return "\n".join(lines)


def _bills_card(store_name: str, b: dict[str, Any], language: str) -> str:
    if b.get("error"):
        return f"⚠️ **{b.get('message') or b.get('error')}**"
    if not b.get("total_bills"):
        return _t(language, f"ℹ️ **No bills logged for {store_name} on {b.get('date')}.**",
                  f"ℹ️ **{b.get('date')} তারিখে {store_name} এ কোনো বিল এন্ট্রি নেই।**",
                  f"ℹ️ **{b.get('date')} को {store_name} में कोई बिल दर्ज नहीं है।**")
    rows = "\n".join(f"| {x.get('time')} | {_inr(x.get('amount'))} | {x.get('qty'):g} |" for x in b.get("latest_bills", []))
    return (
        _t(language, f"### 🧾 **Billing — {store_name} ({b.get('date')})**", f"### 🧾 **বিলিং — {store_name} ({b.get('date')})**", f"### 🧾 **बिलिंग — {store_name} ({b.get('date')})**")
        + f"\n\n- **Bills logged:** {b.get('total_bills')} | **Total:** {_inr(b.get('total_net_amount'))}\n"
        + f"- **Highest single bill:** **{_inr(b.get('max_single_bill'))}** at {b.get('max_single_bill_time') or '—'}\n"
        + f"- **Average bill value:** {_inr(b.get('avg_bill_value'))}\n\n"
        + "| Time | Amount | Qty |\n| :--- | :---: | :---: |\n" + rows
    )


def _requisitions_card(store_name: str, r: dict[str, Any], language: str) -> str:
    if r.get("error"):
        return f"⚠️ **{r.get('message') or r.get('error')}**"
    if not r.get("items"):
        return _t(language, f"ℹ️ **No requisition slips found for {store_name}.**", f"ℹ️ **{store_name} এর কোনো রিকুইজিশন স্লিপ নেই।**", f"ℹ️ **{store_name} की कोई रिक्विजिशन स्लिप नहीं है।**")
    rows = "\n".join(
        f"| {i.get('req_code') or '—'} | {i.get('article')} | {i.get('dept')} | {i.get('qty')} | {i.get('priority') or '—'} | {i.get('status') or '—'} |"
        for i in r["items"]
    )
    return (
        _t(language, f"### 📦 **Product Requisitions — {store_name}**", f"### 📦 **প্রোডাক্ট রিকুইজিশন — {store_name}**", f"### 📦 **प्रोडक्ट रिक्विजिशन — {store_name}**")
        + f"\n\n- **Recent slips:** {r.get('total_slips')} | **Pending/In review:** {r.get('pending_slips')} | **Urgent:** {r.get('urgent_slips')}\n\n"
        + "| Req | Article | Dept | Qty | Priority | Status |\n| :--- | :--- | :--- | :---: | :---: | :---: |\n" + rows
    )


def _directives_card(d: dict[str, Any], language: str) -> str:
    items = d.get("directives") or []
    if not items:
        return _t(language, "ℹ️ **No active directives right now.**", "ℹ️ **এখন কোনো সক্রিয় নির্দেশনা নেই।**", "ℹ️ **अभी कोई सक्रिय निर्देश नहीं है।**")
    lines = [_t(language, "### 📋 **Active Directives**", "### 📋 **সক্রিয় নির্দেশনা**", "### 📋 **सक्रिय निर्देश**"), ""]
    for x in items:
        lines.append(f"- **[{(x.get('priority') or 'normal').upper()}] {x.get('title')}** — {x.get('message')}")
    return "\n".join(lines)


def _synthesize_domain_response(
    query: str,
    active_store: str,
    target_date: date,
    subagent_data: dict[str, Any],
    sec_ctx: SecurityContext,
    language: str,
    intent: IntentResult | None = None,
    db_calendar: dict[str, Any] | None = None,
) -> str:
    """Deterministic answer card used when the LLM is unconfigured or fails.

    Dispatches on `intent.primary` -- exactly one card per question. It used
    to pick whichever data key it happened to test first, so a peak-day
    question that also said "this month" got the MTD card, and any query
    that ran the (then always-on) target agent got a Target Adjustment card.
    """
    intent = intent or detect_intent(query)
    primary = intent.primary
    store_name = store_label(active_store)
    db_ops = subagent_data.get("db_ops_agent", {})

    # 0a. Conversational Greeting & Status
    if primary == "greeting":
        today_iso = target_date.isoformat()
        latest = (db_calendar or {}).get("latest_date") or today_iso
        if language == "bn":
            return (
                f"### 👋 **সিটিমার্ট রিটেইল এআই কো-পাইলটে স্বাগতম!**\n\n"
                f"আমি **{store_name}** এর জন্য আপনার সার্বক্ষণিক অপারেশন অ্যাসিস্ট্যান্ট।\n\n"
                f"- **সক্রিয় স্টোর:** {store_name}\n"
                f"- **হিসাবের তারিখ:** {today_iso}\n"
                f"- **সর্বশেষ সম্পূর্ণ রেকর্ড:** {latest}\n\n"
                f"💡 **দ্রুত যা জানতে পারেন:**\n"
                f"1. *'গতকালের সেলস ও টাইম স্লট রিপোর্ট দেখাও'*\n"
                f"2. *'টার্গেট কত বাকি ও ৭ দিনের অ্যাডজাস্টমেন্ট কী?'*\n"
                f"3. *'বিগত ৭ দিনের সেলস হিস্ট্রি টেবিল দাও'*\n"
                f"4. *'কোন স্টোর সবচেয়ে এগিয়ে আছে?'*"
            )
        elif language == "hi":
            return (
                f"### 👋 **सिटीमार्ट रिटेल AI को-पायलट में आपका स्वागत है!**\n\n"
                f"मैं **{store_name}** के लिए आपका समर्पित ऑपरेशंस असिस्टेंट हूँ।\n\n"
                f"- **सक्रिय स्टोर:** {store_name}\n"
                f"- **परिचालन दिनांक:** {today_iso}\n"
                f"- **नवीनतम रिकॉर्डेड तिथि:** {latest}\n\n"
                f"💡 **त्वरित प्रश्न सुझाव:**\n"
                f"1. *'कल की कुल बिक्री और टाइम स्लॉट रिपोर्ट दिखाएं'*\n"
                f"2. *'टारगेट कितना बाकी है और रिकवरी क्या है?'*\n"
                f"3. *'पिछले 7 दिनों की दैनिक बिक्री तालिका दिखाएं'*\n"
                f"4. *'नेटवर्क में कौन सा स्टोर आगे है?'*"
            )
        else:
            return (
                f"### 👋 **Welcome to CITIMART Retail AI Operations Co-Pilot!**\n\n"
                f"I am your dedicated numbers-first retail decision co-pilot for **{store_name}**.\n\n"
                f"- **Active Store:** {store_name}\n"
                f"- **Operating Date:** {today_iso}\n"
                f"- **Latest Verified Records:** {latest}\n\n"
                f"💡 **Quick Operational Inquiries:**\n"
                f"1. *'Show yesterday's sales and time slot report'*\n"
                f"2. *'What is our target deficit and 7-day rolling recovery?'*\n"
                f"3. *'Give me past 7 operating days sales history table'*\n"
                f"4. *'Which store is currently leading network sales?'*"
            )

    # 0b. Help & Operational Capabilities
    if primary == "help":
        if language == "bn":
            return (
                "### ℹ️ **সিটিমার্ট এআই কো-পাইলট নির্দেশিকা ও ফিচারসমূহ**\n\n"
                "**🤖 ৫টি বিশেষায়িত সাব-এজেন্ট ক্ষমতা:**\n"
                "1. **DbOpsAgent:** মঙ্গোডিবি এটলাসের লাইভ সেলস, বিল কাউন্ট, ফুটফল ও ৪-স্লট ব্রেকডাউন।\n"
                "2. **TargetAdjustmentAgent:** ৭/১৪/৩০ দিনের রোলিং ডেফিসিট ক্যারি-ফরোয়ার্ড ($A_t = T_t + C_t$)।\n"
                "3. **ForecastingAgent:** YoY পেসিং ও রান-রেট প্রক্ষেপণ।\n"
                "4. **MarketIntelAgent:** কলকাতার স্থানীয় আবহাওয়া ও উৎসব ট্রাফিক বিশ্লেষণ।\n"
                "5. **RetailCoachAgent:** ফ্লোর কনভার্সন বৃদ্ধির কৌশল ও এসওপি নির্দেশিকা।\n\n"
                "💡 যেকোনো প্রশ্ন বাংলায় বা ইংরেজিতে সরাসরি টাইপ করতে পারেন।"
            )
        elif language == "hi":
            return (
                "### ℹ️ **सिटीमार्ट AI को-पायलट मार्गदर्शिका व सुविधाएं**\n\n"
                "**🤖 ५ समर्पित सब-एजेंट्स की क्षमताएं:**\n"
                "1. **DbOpsAgent:** मोंगोडीबी एटलस लाइव बिक्री, बिल, फुटफॉल व ४-स्लॉट विवरण।\n"
                "2. **TargetAdjustmentAgent:** ७/१४/३०-दिवसीय रोलिंग डेफिसिट रिकवरी ($A_t = T_t + C_t$)।\n"
                "3. **ForecastingAgent:** YoY ऐतिहासिक तुलना व दैनिक रन-रेट।\n"
                "4. **MarketIntelAgent:** कोलकाता का लाइव मौसम व त्योहारी मांग विश्लेषण।\n"
                "5. **RetailCoachAgent:** फ्लोर कन्वर्शन दर बढ़ाने के व्यावहारिक उपाय।\n\n"
                "💡 आप कोई भी परिचालन प्रश्न सीधे हिंदी या अंग्रेजी में पूछ सकते हैं।"
            )
        else:
            return (
                "### ℹ️ **CITIMART Retail AI Operations Co-Pilot Guide**\n\n"
                "**🤖 5 Specialized Autonomous Sub-Agents:**\n"
                "1. **DbOpsAgent:** Live MongoDB Atlas queries for net sales, bills, footfall, NOB, and 4-time-slot breakdowns.\n"
                "2. **TargetAdjustmentAgent:** 7/14/30-day Rolling Deficit Carry-Forward ($A_t = T_t + C_t$).\n"
                "3. **ForecastingAgent:** YoY historical pacing and run-rate projections.\n"
                "4. **MarketIntelAgent:** Kolkata live weather and festival surge intelligence.\n"
                "5. **RetailCoachAgent:** Floor conversion tactics (>70% target) and SOP guidance.\n\n"
                "💡 Ask any freeform operational question or select a prompt preset."
            )

    # 0c. KPI Mathematical Formulas & Definitions
    if primary == "formula":
        q_norm = query.lower()
        is_all = any(w in q_norm for w in ("all", "complete", "official", "গণনার", "সূত্রগুলো", "आधिकारिक", "formule"))
        if not is_all:
            if "atv" in q_norm:
                return (
                    "### 📐 **KPI Mathematical Formulas — Average Transaction Value (ATV)**\n\n"
                    "- **Formula:** `ATV = Net Sales / Total Bills`\n"
                    "- **Business Meaning:** Average amount spent by a customer per completed checkout bill.\n"
                    "- **CITIMART Target Benchmark:** ₹1,200 - ₹1,800 depending on store floor mix.\n"
                    "💡 **Floor Tactic:** Suggest impulse accessory add-ons at cash desks to raise ATV by ₹150+."
                )
            if "upt" in q_norm or "basket" in q_norm or "upb" in q_norm:
                return (
                    "### 📐 **KPI Mathematical Formulas — Units Per Transaction (UPT / UPB)**\n\n"
                    "- **Formula:** `UPT = Total Units Sold / Total Bills`\n"
                    "- **Business Meaning:** Number of individual merchandise units sold per customer transaction.\n"
                    "- **CITIMART Target Benchmark:** 2.2 - 2.8 units/bill.\n"
                    "💡 **Floor Tactic:** Train staff on 'Buy 2 Get 1' or combo pairing across apparel rails."
                )
            if "conversion" in q_norm:
                return (
                    "### 📐 **KPI Mathematical Formulas — Store Conversion Rate (%)**\n\n"
                    "- **Formula:** `Conversion Rate (%) = (Total Bills / Total Footfall) × 100`\n"
                    "- **Business Meaning:** Percentage of walking store visitors that make a purchase.\n"
                    "- **CITIMART Target Benchmark:** **> 70%**.\n"
                    "💡 **Floor Tactic:** Eliminate fitting room bottlenecks and greet shoppers within 30 seconds."
                )
            if "rpv" in q_norm:
                return (
                    "### 📐 **KPI Mathematical Formulas — Revenue Per Visitor (RPV)**\n\n"
                    "- **Formula:** `RPV = Net Sales / Total Footfall`\n"
                    "- **Business Meaning:** Total revenue generated across all store walk-ins regardless of purchase.\n"
                    "💡 **Floor Tactic:** Raising both Conversion and ATV directly compounds RPV."
                )
        return (
            "### 📐 **CITIMART Official KPI Mathematical Formulas**\n\n"
            "- **Conversion Rate (%)** = `(Total Bills / Total Footfall) × 100`\n"
            "- **Average Transaction Value (ATV)** = `Net Sales / Total Bills`\n"
            "- **Revenue Per Visitor (RPV)** = `Net Sales / Total Footfall`\n"
            "- **Basket Size (UPB)** = `Total Units Sold / Total Bills`\n"
            "- **Sales Per Hour (SPH)** = `Net Sales / 12 Operating Hours`\n"
            "- **Target Achievement (%)** = `(Actual Net Sales / Target Sales) × 100`\n"
            "- **Remaining Target Gap** = `Target Sales - Actual Net Sales`\n"
            "- **Adjusted Target ($A_t$)** = `Original Target ($T_t$) + Carry-Forward ($C_t$)`\n"
            "- **YoY Tally Growth (%)** = `((Present Net Sales - Prev Year Net Sales) / Prev Year Net Sales) × 100`\n"
        )

    # 1. Past 7 Days / Multi-Day Tabular History
    if primary == "history_n_days" and "history_table" in db_ops:
        ht = db_ops["history_table"]
        if ht.get("error") == "ACCESS_DENIED":
            return f"⚠️ **{ht.get('message')}**"

        rows = ht.get("rows", [])
        n_days = ht.get("days_found", len(rows))
        if not rows:
            return _t(
                language,
                f"⚠️ **No recorded operating days found for {store_name}.**",
                f"⚠️ **{store_name} এর কোনো রেকর্ড করা দিন পাওয়া যায়নি।**",
                f"⚠️ **{store_name} के लिए कोई रिकॉर्ड किया गया दिन नहीं मिला।**",
            )
        totals = ht.get("totals", {})
        avgs = ht.get("averages", {})

        if language == "bn":
            table_header = "| তারিখ | দিন | নেট সেলস | টার্গেট | অর্জন % | ফুটফল | বিল | কনভার্সন | ATV |\n| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
            rows_md = "\n".join(
                f"| {r['date']} | {r['day_name']} | ₹{r['net_sales']:,.0f} | ₹{r['sales_target']:,.0f} | {r['achievement_pct']:.1f}% | {r['footfall']} | {r['bills']} | {r['conversion_pct']:.1f}% | ₹{r['atv']:,.0f} |"
                for r in rows
            )
            return (
                f"### 📅 **{store_name} বিগত {n_days} দিনের সেলস ও পারফরম্যান্স টেবিল**\n\n"
                f"{table_header}\n{rows_md}\n\n"
                f"**📊 সর্বমোট ও গড় বিশ্লেষণ:**\n"
                f"- **মোট নেট সেলস:** ₹{totals.get('net_sales', 0):,.2f} (গড় দৈনিক: ₹{avgs.get('daily_sales', 0):,.2f})\n"
                f"- **মোট টার্গেট:** ₹{totals.get('sales_target', 0):,.2f} (সামগ্রিক অর্জন: **{totals.get('achievement_pct', 0):.1f}%**)\n"
                f"- **গড় ফুটফল:** {avgs.get('daily_footfall', 0):.0f} জন | **গড় বিল:** {avgs.get('daily_bills', 0):.0f} টি\n"
                f"- **গড় কনভার্সন রেট:** **{avgs.get('conversion_pct', 0):.1f}%** | **গড় ATV:** ₹{avgs.get('atv', 0):,.2f}\n\n"
                f"💡 **পরামর্শ:** যে দিনগুলিতে কনভার্সন ৭০% এর নিচে নেমেছে, সে দিনগুলির ফুটফল লিক বিশ্লেষণ করে ফ্লোর সাপোর্ট বাড়ান।"
            )
        elif language == "hi":
            table_header = "| दिनांक | दिन | शुद्ध बिक्री | लक्ष्य | अचीव % | फुटफॉल | बिल | कन्वर्शन | ATV |\n| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
            rows_md = "\n".join(
                f"| {r['date']} | {r['day_name']} | ₹{r['net_sales']:,.0f} | ₹{r['sales_target']:,.0f} | {r['achievement_pct']:.1f}% | {r['footfall']} | {r['bills']} | {r['conversion_pct']:.1f}% | ₹{r['atv']:,.0f} |"
                for r in rows
            )
            return (
                f"### 📅 **{store_name} पिछले {n_days} दिनों का बिक्री व प्रदर्शन डेटा**\n\n"
                f"{table_header}\n{rows_md}\n\n"
                f"**📊 कुल व औसत विश्लेषण:**\n"
                f"- **कुल बिक्री:** ₹{totals.get('net_sales', 0):,.2f} (दैनिक औसत: ₹{avgs.get('daily_sales', 0):,.2f})\n"
                f"- **कुल लक्ष्य:** ₹{totals.get('sales_target', 0):,.2f} (औसत अचीवमेंट: **{totals.get('achievement_pct', 0):.1f}%**)\n"
                f"- **दैनिक औसत फुटफॉल:** {avgs.get('daily_footfall', 0):.0f} | **औसत बिल संख्या:** {avgs.get('daily_bills', 0):.0f}\n"
                f"- **औसत कन्वर्शन दर:** **{avgs.get('conversion_pct', 0):.1f}%** | **औसत ATV:** ₹{avgs.get('atv', 0):,.2f}\n\n"
                f"💡 **सुझाव:** जिन दिनों कन्वर्शन कम रहा है, वहां शाम के 5-8 बजे के स्लॉट में अधिक कस्टमर सर्विस दें।"
            )
        else:
            table_header = "| Date | Day | Net Sales | Target | Ach % | Footfall | Bills | Conv % | ATV |\n| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
            rows_md = "\n".join(
                f"| {r['date']} | {r['day_name']} | ₹{r['net_sales']:,.0f} | ₹{r['sales_target']:,.0f} | {r['achievement_pct']:.1f}% | {r['footfall']} | {r['bills']} | {r['conversion_pct']:.1f}% | ₹{r['atv']:,.0f} |"
                for r in rows
            )
            return (
                f"### 📅 **{store_name} Last {n_days} Operating Days — Performance History**\n\n"
                f"{table_header}\n{rows_md}\n\n"
                f"**📊 Totals & Daily Averages:**\n"
                f"- **Total Net Sales:** ₹{totals.get('net_sales', 0):,.2f} (Daily Average: ₹{avgs.get('daily_sales', 0):,.2f})\n"
                f"- **Total Target:** ₹{totals.get('sales_target', 0):,.2f} (Overall Ach: **{totals.get('achievement_pct', 0):.1f}%**)\n"
                f"- **Average Daily Footfall:** {avgs.get('daily_footfall', 0):.0f} visitors | **Average Bills:** {avgs.get('daily_bills', 0):.0f}\n"
                f"- **Average Conversion:** **{avgs.get('conversion_pct', 0):.1f}%** | **Average ATV:** ₹{avgs.get('atv', 0):,.2f}\n\n"
                f"💡 **Takeaway:** Focus on days where conversion dipped below 70% to eliminate customer walkouts."
            )

    # 2. Month-To-Date (MTD) or Completed Full Month Granular Summary
    if primary == "mtd" and "mtd_summary" in db_ops:
        mtd = db_ops["mtd_summary"]
        if mtd.get("error") == "ACCESS_DENIED":
            return f"⚠️ **{mtd.get('message')}**"

        is_completed = mtd.get("is_completed", False) or mtd.get("days_remaining", 1) == 0
        month_name = mtd.get("month_name") or target_date.strftime("%B %Y")
        peak_dip = db_ops.get("peak_dip_days") or {}
        best_day = peak_dip.get("best_day")

        if is_completed:
            best_day_line = ""
            if best_day:
                best_day_line = f"- **Peak Sales Day:** {best_day.get('date')} ({best_day.get('day_name')}) — ₹{best_day.get('net_sales', 0):,.2f} ({best_day.get('achievement_pct', 0):.1f}% target ach)\n"

            if language == "bn":
                best_day_line_bn = ""
                if best_day:
                    best_day_line_bn = f"- **সর্বোচ্চ বিক্রির দিন (পিক ডে):** {best_day.get('date')} ({best_day.get('day_name')}) — ₹{best_day.get('net_sales', 0):,.2f} (টার্গেট অর্জন: {best_day.get('achievement_pct', 0):.1f}%)\n"
                return (
                    f"### 📆 **{store_name} {month_name} সম্পূর্ণ মাসের সেলস ও পারফরম্যান্স সামারি**\n\n"
                    f"- **হিসাবের মাস:** {month_name} (মোট অতিবাহিত দিন: {mtd.get('days_elapsed')} দিন)\n"
                    f"- **সক্রিয় ব্যবসায়িক দিন:** {mtd.get('active_operating_days')} দিন\n"
                    f"- **সম্পূর্ণ মাসের মোট নেট সেলস:** **₹{mtd.get('mtd_sales', 0):,.2f}**\n"
                    f"- **মোট মাসিক সেলস টার্গেট:** ₹{mtd.get('mtd_target', 0):,.2f} (অর্জন: **{mtd.get('achievement_pct', 0):.1f}%**)\n"
                    f"- **টার্গেট ঘাটতি / উদ্বৃত্ত:** ₹{mtd.get('target_gap', 0):,.2f}\n"
                    f"- **দৈনিক গড় সেলস:** ₹{mtd.get('avg_daily_sales', 0):,.2f}\n"
                    f"- **মোট ফুটফল:** {mtd.get('mtd_footfall', 0)} জন | **মোট বিল (NOB):** {mtd.get('mtd_bills', 0)} টি\n"
                    f"- **সামগ্রিক কনভার্সন রেট:** **{mtd.get('mtd_conversion', 0):.1f}%** | **গড় ATV:** ₹{mtd.get('mtd_atv', 0):,.2f}\n"
                    f"{best_day_line_bn}\n"
                    f"💡 **ফ্লোর সামারি:** {month_name} মাসের হিসাব সম্পন্ন হয়েছে। মোট সেলস অর্জিত হয়েছে ₹{mtd.get('mtd_sales', 0):,.0f} (টার্গেটের {mtd.get('achievement_pct', 0):.1f}%)।"
                )
            elif language == "hi":
                best_day_line_hi = ""
                if best_day:
                    best_day_line_hi = f"- **पीक सेल्स डे (सर्वोच्च बिक्री):** {best_day.get('date')} ({best_day.get('day_name')}) — ₹{best_day.get('net_sales', 0):,.2f} (लक्ष्य प्राप्ति: {best_day.get('achievement_pct', 0):.1f}%)\n"
                return (
                    f"### 📆 **{store_name} {month_name} पूरे महीने की बिक्री व परिचालन सारांश**\n\n"
                    f"- **महीना:** {month_name} (कुल दिन: {mtd.get('days_elapsed')} दिन)\n"
                    f"- **सक्रिय कारोबारी दिन:** {mtd.get('active_operating_days')} दिन\n"
                    f"- **पूरे महीने की कुल शुद्ध बिक्री:** **₹{mtd.get('mtd_sales', 0):,.2f}**\n"
                    f"- **कुल मासिक लक्ष्य:** ₹{mtd.get('mtd_target', 0):,.2f} (अचीवमेंट: **{mtd.get('achievement_pct', 0):.1f}%**)\n"
                    f"- **लक्ष्य अंतर / शेष:** ₹{mtd.get('target_gap', 0):,.2f}\n"
                    f"- **औसत दैनिक बिक्री:** ₹{mtd.get('avg_daily_sales', 0):,.2f}\n"
                    f"- **कुल फुटफॉल:** {mtd.get('mtd_footfall', 0)} | **कुल बिल (NOB):** {mtd.get('mtd_bills', 0)}\n"
                    f"- **कन्वर्शन रेट:** **{mtd.get('mtd_conversion', 0):.1f}%** | **औसत ATV:** ₹{mtd.get('mtd_atv', 0):,.2f}\n"
                    f"{best_day_line_hi}\n"
                    f"💡 **परिचालन सारांश:** {month_name} माह का लेखा-जोखा पूरा हो चुका है। कुल बिक्री ₹{mtd.get('mtd_sales', 0):,.0f} रही।"
                )
            else:
                return (
                    f"### 📆 **{store_name} {month_name} Full Month Operations Summary**\n\n"
                    f"- **Operating Month:** {month_name} (Days Elapsed: {mtd.get('days_elapsed')} days)\n"
                    f"- **Active Operating Days Recorded:** {mtd.get('active_operating_days')} days\n"
                    f"- **Total Net Sales:** **₹{mtd.get('mtd_sales', 0):,.2f}**\n"
                    f"- **Total Sales Target:** ₹{mtd.get('mtd_target', 0):,.2f} (**{mtd.get('achievement_pct', 0):.1f}%** achieved)\n"
                    f"- **Target Deficit:** ₹{mtd.get('target_gap', 0):,.2f}\n"
                    f"- **Average Daily Sales:** ₹{mtd.get('avg_daily_sales', 0):,.2f}\n"
                    f"- **Total Footfall:** {mtd.get('mtd_footfall', 0)} visitors | **Total Bills (NOB):** {mtd.get('mtd_bills', 0)}\n"
                    f"- **Overall Conversion Rate:** **{mtd.get('mtd_conversion', 0):.1f}%** | **Overall ATV:** ₹{mtd.get('mtd_atv', 0):,.2f}\n"
                    f"{best_day_line}\n"
                    f"💡 **Month Review:** {month_name} closed with ₹{mtd.get('mtd_sales', 0):,.0f} net sales ({mtd.get('achievement_pct', 0):.1f}% of target)."
                )

        if language == "bn":
            return (
                f"### 📆 **{store_name} {mtd.get('month_name')} চলতি মাসের সেলস স্ট্যাটাস (MTD)**\n\n"
                f"- **হিসাবের তারিখ:** {mtd.get('as_of_date')} (অতিবাহিত দিন: {mtd.get('days_elapsed')} | বাকি দিন: {mtd.get('days_remaining')})\n"
                f"- **সক্রিয় ব্যবসায়িক দিন:** {mtd.get('active_operating_days')} দিন\n"
                f"- **চলতি মাসের মোট সেলস (MTD):** **₹{mtd.get('mtd_sales', 0):,.2f}**\n"
                f"- **চলতি মাসের মোট টার্গেট:** ₹{mtd.get('mtd_target', 0):,.2f} (অর্জন: **{mtd.get('achievement_pct', 0):.1f}%**)\n"
                f"- **বাকি মাসের টার্গেট ঘাটতি:** ₹{mtd.get('target_gap', 0):,.2f}\n"
                f"- **বর্তমান দৈনিক গড় সেলস:** ₹{mtd.get('avg_daily_sales', 0):,.2f}\n"
                f"- **বাকি দিনগুলিতে প্রয়োজনীয় দৈনিক রান-রেট:** **₹{mtd.get('required_daily_run_rate', 0):,.2f}/দিন**\n"
                f"- **সামগ্রিক MTD কনভার্সন:** {mtd.get('mtd_conversion', 0):.1f}% | **গড় ATV:** ₹{mtd.get('mtd_atv', 0):,.2f}\n\n"
                f"💡 **স্ট্র্যাটেজি:** মাসিক লক্ষ্য অর্জনের জন্য পরবর্তী দিনগুলিতে দৈনিক রান-রেট ₹{mtd.get('required_daily_run_rate', 0):,.0f} বজায় রাখতে হবে।"
            )
        elif language == "hi":
            return (
                f"### 📆 **{store_name} {mtd.get('month_name')} इस महीने का कुल प्रदर्शन (MTD)**\n\n"
                f"- **गणना दिनांक:** {mtd.get('as_of_date')} (बीते दिन: {mtd.get('days_elapsed')} | शेष दिन: {mtd.get('days_remaining')})\n"
                f"- **सक्रिय कारोबारी दिन:** {mtd.get('active_operating_days')} दिन\n"
                f"- **इस महीने की कुल बिक्री:** **₹{mtd.get('mtd_sales', 0):,.2f}**\n"
                f"- **कुल मासिक लक्ष्य:** ₹{mtd.get('mtd_target', 0):,.2f} (अचीवमेंट: **{mtd.get('achievement_pct', 0):.1f}%**)\n"
                f"- **शेष लक्ष्य अंतर:** ₹{mtd.get('target_gap', 0):,.2f}\n"
                f"- **वर्तमान औसत दैनिक बिक्री:** ₹{mtd.get('avg_daily_sales', 0):,.2f}\n"
                f"- **शेष दिनों के लिए आवश्यक दैनिक रन-रेट:** **₹{mtd.get('required_daily_run_rate', 0):,.2f}/दिन**\n\n"
                f"💡 **रणनीति:** महीने का लक्ष्य पाने के लिए प्रतिदिन ₹{mtd.get('required_daily_run_rate', 0):,.0f} की न्यूनतम बिक्री बनाए रखें।"
            )
        else:
            return (
                f"### 📆 **{store_name} {mtd.get('month_name')} Month-To-Date (MTD) Pacing**\n\n"
                f"- **As of Date:** {mtd.get('as_of_date')} (Days Elapsed: {mtd.get('days_elapsed')} | Remaining: {mtd.get('days_remaining')})\n"
                f"- **Active Operating Days Recorded:** {mtd.get('active_operating_days')} days\n"
                f"- **Cumulative MTD Net Sales:** **₹{mtd.get('mtd_sales', 0):,.2f}**\n"
                f"- **Cumulative Target:** ₹{mtd.get('mtd_target', 0):,.2f} (**{mtd.get('achievement_pct', 0):.1f}%** achieved)\n"
                f"- **Remaining Target Deficit:** ₹{mtd.get('target_gap', 0):,.2f}\n"
                f"- **Current Daily Average Run-Rate:** ₹{mtd.get('avg_daily_sales', 0):,.2f}\n"
                f"- **Required Daily Run-Rate to Close Month on Target:** **₹{mtd.get('required_daily_run_rate', 0):,.2f}/day**\n"
                f"- **Month-to-Date Conversion:** {mtd.get('mtd_conversion', 0):.1f}% | **Overall ATV:** ₹{mtd.get('mtd_atv', 0):,.2f}\n\n"
                f"💡 **Pacing Directive:** Maintain a daily throughput of ₹{mtd.get('required_daily_run_rate', 0):,.0f} across remaining days."
            )

    # 2b. Full Year / Annual YTD Granular Summary
    if primary == "year_summary" and "year_summary" in db_ops:
        ys = db_ops["year_summary"]
        if ys.get("error") == "ACCESS_DENIED":
            return f"⚠️ **{ys.get('message')}**"
        if not ys.get("has_records", True):
            return f"⚠️ **No sales records found for year {ys.get('year')}** ({store_name})."

        target_year = ys.get("year")
        total_sales = ys.get("total_sales", 0.0)
        total_target = ys.get("total_target", 0.0)
        ach_pct = ys.get("achievement_pct", 0.0)
        total_gap = ys.get("total_gap", 0.0)
        total_ff = ys.get("total_footfall", 0)
        total_bills = ys.get("total_bills", 0)
        overall_conv = ys.get("overall_conversion", 0.0)
        overall_atv = ys.get("overall_atv", 0.0)
        active_days = ys.get("total_active_days", 0)
        best_month = ys.get("best_month")

        breakdown = ys.get("monthly_breakdown", [])
        table_rows = []
        for m in breakdown:
            table_rows.append(
                f"| {m.get('month_name')} | ₹{m.get('net_sales', 0):,.0f} | ₹{m.get('sales_target', 0):,.0f} | {m.get('achievement_pct', 0):.1f}% | {m.get('footfall', 0)} | {m.get('bills', 0)} | {m.get('conversion_pct', 0):.1f}% | ₹{m.get('atv', 0):,.0f} |"
            )
        monthly_table = (
            "| Month | Net Sales | Target | Ach % | Footfall | Bills | Conv % | ATV |\n"
            "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n" + "\n".join(table_rows)
        )

        best_month_note = ""
        if best_month:
            best_month_note = f"- **🏆 Top Performing Month:** **{best_month.get('month_name')}** (₹{best_month.get('net_sales', 0):,.2f} | {best_month.get('achievement_pct', 0):.1f}% ach)\n"

        if language == "bn":
            return (
                f"### 🗓️ **{store_name} {target_year} বার্ষিক সেলস ও পারফরম্যান্স সামারি (Annual YTD)**\n\n"
                f"- **হিসাবের বছর:** {target_year} (সক্রিয় ব্যবসায়িক দিন: {active_days} দিন)\n"
                f"- **মোট বার্ষিক নেট সেলস:** **₹{total_sales:,.2f}**\n"
                f"- **মোট বার্ষিক টার্গেট:** ₹{total_target:,.2f} (অর্জন: **{ach_pct:.1f}%**)\n"
                f"- **টার্গেট ঘাটতি:** ₹{total_gap:,.2f}\n"
                f"- **মোট বার্ষিক ফুটফল:** {total_ff} জন | **মোট বিল:** {total_bills} টি\n"
                f"- **সামগ্রিক কনভার্সন রেট:** **{overall_conv:.1f}%** | **গড় ATV:** ₹{overall_atv:,.2f}\n"
                f"{best_month_note}\n"
                f"**📊 মাসভিত্তিক বিস্তারিত পারফরম্যান্স টেবিল:**\n\n"
                f"{monthly_table}\n\n"
                f"💡 **বার্ষিক পর্যালোচনা:** {target_year} সালে মোট সক্রিয় {active_days} দিনে ₹{total_sales:,.0f} সেলস অর্জিত হয়েছে।"
            )
        elif language == "hi":
            return (
                f"### 🗓️ **{store_name} {target_year} वार्षिक बिक्री व प्रदर्शन सारांश (Annual YTD)**\n\n"
                f"- **वित्तीय/कैलेंडर वर्ष:** {target_year} (सक्रिय कारोबारी दिन: {active_days} दिन)\n"
                f"- **वार्षिक कुल शुद्ध बिक्री:** **₹{total_sales:,.2f}**\n"
                f"- **कुल वार्षिक लक्ष्य:** ₹{total_target:,.2f} (अचीवमेंट: **{ach_pct:.1f}%**)\n"
                f"- **लक्ष्य अंतर:** ₹{total_gap:,.2f}\n"
                f"- **कुल वार्षिक फुटफॉल:** {total_ff} | **कुल बिल:** {total_bills}\n"
                f"- **समग्र कन्वर्शन रेट:** **{overall_conv:.1f}%** | **औसत ATV:** ₹{overall_atv:,.2f}\n"
                f"{best_month_note}\n"
                f"**📊 माहवार विस्तृत प्रदर्शन तालिका:**\n\n"
                f"{monthly_table}\n\n"
                f"💡 **वार्षिक समीक्षा:** वर्ष {target_year} में कुल {active_days} दिनों में ₹{total_sales:,.0f} की बिक्री दर्ज की गई।"
            )
        else:
            return (
                f"### 🗓️ **{store_name} {target_year} Annual Sales & Performance Summary (YTD)**\n\n"
                f"- **Reporting Year:** {target_year} (Active Operating Days: {active_days} days)\n"
                f"- **Consolidated Annual Net Sales:** **₹{total_sales:,.2f}**\n"
                f"- **Total Annual Target:** ₹{total_target:,.2f} (**{ach_pct:.1f}%** achieved)\n"
                f"- **Annual Target Gap:** ₹{total_gap:,.2f}\n"
                f"- **Total Annual Footfall:** {total_ff} visitors | **Total Bills (NOB):** {total_bills}\n"
                f"- **Overall Conversion Rate:** **{overall_conv:.1f}%** | **Consolidated ATV:** ₹{overall_atv:,.2f}\n"
                f"{best_month_note}\n"
                f"**📊 Month-by-Month Performance Breakdown:**\n\n"
                f"{monthly_table}\n\n"
                f"💡 **Executive Review:** Year {target_year} recorded ₹{total_sales:,.0f} across {active_days} operating days with an overall conversion of {overall_conv:.1f}%."
            )

    # 3. Peak & Lowest Days in Month
    if primary == "peak_dip" and "peak_dip_days" in db_ops:
        pd = db_ops["peak_dip_days"]
        if pd.get("error") == "ACCESS_DENIED":
            return f"⚠️ **{pd.get('message')}**"
        if "best_day" not in pd:
            return f"⚠️ **{pd.get('message') or 'No sales records found for this month.'}** ({store_name}, {pd.get('month')})"

        best = pd.get("best_day", {})
        worst = pd.get("worst_day", {})

        return (
            f"### 🏆 **{store_name} Monthly Peak & Low Performance ({pd.get('month')})**\n\n"
            f"**🥇 Highest Sales Peak Day:**\n"
            f"- **Date:** {best.get('date')} ({best.get('day_name')})\n"
            f"- **Net Sales:** **₹{best.get('net_sales', 0):,.2f}** (Target: ₹{best.get('sales_target', 0):,.2f} | **{best.get('achievement_pct', 0):.1f}%**)\n"
            f"- **Traffic & Conversion:** {best.get('footfall', 0)} visitors, {best.get('bills', 0)} bills | ATV: ₹{best.get('atv', 0):,.2f}\n\n"
            f"**📉 Lowest Sales Dip Day:**\n"
            f"- **Date:** {worst.get('date')} ({worst.get('day_name')})\n"
            f"- **Net Sales:** ₹{worst.get('net_sales', 0):,.2f} (Target: ₹{worst.get('sales_target', 0):,.2f} | {worst.get('achievement_pct', 0):.1f}%)\n"
            f"- **Traffic & Conversion:** {worst.get('footfall', 0)} visitors, {worst.get('bills', 0)} bills | ATV: ₹{worst.get('atv', 0):,.2f}\n\n"
            f"💡 **Insight:** Replicate the staff allocation and high-ATV promotional displays used on {best.get('date')} to pull up slower days."
        )

    # 4. Week-over-Week (WoW) Comparison
    if primary == "wow" and "wow_comparison" in db_ops:
        wow = db_ops["wow_comparison"]
        if wow.get("error") == "ACCESS_DENIED":
            return f"⚠️ **{wow.get('message')}**"

        curr = wow.get("current_day", {})
        prev1 = wow.get("prior_week_same_day", {})
        prev2 = wow.get("two_weeks_prior_same_day", {})
        growth = wow.get("wow_growth_pct")
        growth_str = f"+{growth:.1f}%" if growth is not None and growth >= 0 else f"{growth:.1f}%" if growth is not None else "N/A"

        return (
            f"### 📊 **{store_name} Week-over-Week (WoW) Comparison ({curr.get('day_name')})**\n\n"
            f"| Period | Date | Net Sales | Target | Ach % | Footfall | Bills | ATV |\n"
            f"| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n"
            f"| **Current** | {curr.get('date')} | ₹{curr.get('net_sales', 0):,.0f} | ₹{curr.get('sales_target', 0):,.0f} | {curr.get('achievement_pct', 0):.1f}% | {curr.get('footfall', 0)} | {curr.get('bills', 0)} | ₹{curr.get('atv', 0):,.0f} |\n"
            f"| **1 Week Ago** | {prev1.get('date')} | ₹{prev1.get('net_sales', 0):,.0f} | ₹{prev1.get('sales_target', 0):,.0f} | {prev1.get('achievement_pct', 0):.1f}% | {prev1.get('footfall', 0)} | {prev1.get('bills', 0)} | ₹{prev1.get('atv', 0):,.0f} |\n"
            f"| **2 Weeks Ago** | {prev2.get('date')} | ₹{prev2.get('net_sales', 0):,.0f} | ₹{prev2.get('sales_target', 0):,.0f} | {prev2.get('achievement_pct', 0):.1f}% | {prev2.get('footfall', 0)} | {prev2.get('bills', 0)} | ₹{prev2.get('atv', 0):,.0f} |\n\n"
            f"- **Week-over-Week Sales Growth:** **{growth_str}**\n\n"
            f"💡 **Observation:** Comparing identical days of the week accounts for natural retail weekend/weekday traffic cycles."
        )

    # 5. YoY Historical Comparison
    if primary == "yoy" and "yoy" in subagent_data.get("forecasting_agent", {}):
        yoy = subagent_data["forecasting_agent"]["yoy"]
        if yoy.get("error") == "ACCESS_DENIED":
            return f"⚠️ **{yoy.get('message')}**"

        growth = yoy.get("growth_pct", 0.0)
        growth_str = f"+{growth:.1f}%" if growth >= 0 else f"{growth:.1f}%"
        delta = yoy.get("delta_amount", 0.0)

        return (
            f"### 📈 **YoY Historical Tally Growth ({store_name})**\n\n"
            f"- **Baseline Reference Date ({yoy.get('baseline_date')}):** ₹{yoy.get('baseline_net_sales', 0):,.2f}\n"
            f"- **Previous Year Same Day ({yoy.get('prev_year_date')}):** ₹{yoy.get('prev_year_net_sales', 0):,.2f}\n"
            f"- **Daily YoY Growth Pace:** **{growth_str}** ({'+' if delta >= 0 else ''}₹{delta:,.2f} delta)\n"
            f"- **Month-To-Date (MTD) Net Sales:** ₹{yoy.get('mtd_actual', 0):,.2f}\n\n"
            f"💡 **Takeaway:** Historical comparisons evaluate real growth against prior festive/seasonal cycles."
        )

    # 6. Exact Day Granular KPIs (Yesterday or Specific Date with 4-Time-Slot breakdown)
    if primary == "day_kpis" and "exact_day_kpis" in db_ops:
        edk = db_ops["exact_day_kpis"]
        if edk.get("error") == "ACCESS_DENIED":
            return f"⚠️ **{edk.get('message')}**"
        if not edk.get("has_records", True):
            return _no_records_card(store_name, edk.get("date") or target_date.isoformat(), db_calendar, language)

        k = edk.get("kpis", {})
        peak = edk.get("peak_slot", {})
        slots = edk.get("timeslot_breakdown", {})
        slot_lines = []
        for slot in TIME_SLOT_ORDER:
            s_data = slots.get(slot, {})
            slot_lines.append(
                f"| {slot} | ₹{s_data.get('net_sales', 0):,.0f} | {s_data.get('bills', 0)} | {s_data.get('footfall', 0)} | ₹{s_data.get('atv', 0):,.0f} | {s_data.get('conversion_pct', 0):.1f}% |"
            )
        slots_table = (
            "| Time Slot | Net Sales | Bills | Footfall | ATV | Conv % |\n"
            "| :--- | :---: | :---: | :---: | :---: | :---: |\n" + "\n".join(slot_lines)
        )

        sales_val = k.get("net_sales", 0.0)
        target_val = k.get("sales_target", 0.0)
        ach_val = k.get("achievement_pct", 0.0)
        footfall_val = k.get("footfall", 0)
        nob_val = k.get("nob", 0)
        conv_val = k.get("conversion_pct", 0.0)
        atv_val = k.get("atv", 0.0)
        rpv_val = k.get("rpv", 0.0)
        gap_val = k.get("target_gap", 0.0)
        largest_bill = edk.get("largest_bill", 0.0)
        from src.daily_context import get_holiday_name
        h_name = get_holiday_name(target_date)
        h_tag = f" — {h_name}" if h_name else ""

        if language == "bn":
            return (
                f"### 📊 **{store_name} ({edk.get('date')}, {edk.get('day_name')}{h_tag}) সেলস ও পারফরম্যান্স রিপোর্ট**\n\n"
                f"- **মোট নেট সেলস:** **₹{sales_val:,.2f}**\n"
                f"- **টার্গেট সেলস:** ₹{target_val:,.2f} (অর্জন: **{ach_val:.1f}%**)\n"
                f"- **টার্গেট ঘাটতি:** ₹{gap_val:,.2f}\n"
                f"- **মোট ফুটফল:** {footfall_val} জন | **মোট বিল:** {nob_val} টি\n"
                f"- **কনভার্সন রেট:** **{conv_val:.1f}%** | **ATV:** ₹{atv_val:,.2f} | **RPV:** ₹{rpv_val:,.2f}\n"
                f"- **সর্বোচ্চ একক বিল:** ₹{largest_bill:,.2f}\n"
                f"- **পিক রাশ আওয়ার:** {peak.get('slot')} (মোট সেলসের {peak.get('share_pct', 0):.1f}%)\n\n"
                f"**🕒 ৪-স্লটভিত্তিক সময়ভিত্তিক বিস্তারিত:**\n\n"
                f"{slots_table}\n\n"
                f"💡 **পর্যবেক্ষণ:** {peak.get('slot')} এ সর্বোচ্চ বিক্রি হয়েছে। অন্যান্য স্লটে কনভার্সন বাড়াতে ট্রায়াল রুম সার্ভিস আরও জোরদার করুন।"
            )
        elif language == "hi":
            return (
                f"### 📊 **{store_name} ({edk.get('date')}, {edk.get('day_name')}{h_tag}) बिक्री व प्रदर्शन रिपोर्ट**\n\n"
                f"- **कुल शुद्ध बिक्री:** **₹{sales_val:,.2f}**\n"
                f"- **लक्ष्य:** ₹{target_val:,.2f} (अचीवमेंट: **{ach_val:.1f}%**)\n"
                f"- **लक्ष्य अंतर:** ₹{gap_val:,.2f}\n"
                f"- **फुटफॉल:** {footfall_val} | **कुल बिल:** {nob_val}\n"
                f"- **कन्वर्शन रेट:** **{conv_val:.1f}%** | **ATV:** ₹{atv_val:,.2f} | **RPV:** ₹{rpv_val:,.2f}\n"
                f"- **सबसे बड़ा एकल बिल:** ₹{largest_bill:,.2f}\n"
                f"- **पीक स्लॉट:** {peak.get('slot')} (योगदान: {peak.get('share_pct', 0):.1f}%)\n\n"
                f"**🕒 ४-टाइम स्लॉट विस्तृत ब्रेकडाउन:**\n\n"
                f"{slots_table}\n\n"
                f"💡 **सुझाव:** {peak.get('slot')} में सबसे अधिक ग्राहक आए। अन्य स्लॉट में क्रॉस-सेलिंग बढ़ाकर कुल राजस्व बढ़ाएं।"
            )
        else:
            return (
                f"### 📊 **{store_name} ({edk.get('date')}, {edk.get('day_name')}{h_tag}) Detailed Operations Report**\n\n"
                f"- **Net Sales:** **₹{sales_val:,.2f}**\n"
                f"- **Sales Target:** ₹{target_val:,.2f} (**{ach_val:.1f}%** achieved)\n"
                f"- **Target Gap:** ₹{gap_val:,.2f}\n"
                f"- **Footfall:** {footfall_val} visitors | **Bills (NOB):** {nob_val}\n"
                f"- **Conversion Rate:** **{conv_val:.1f}%** | **ATV:** ₹{atv_val:,.2f} | **RPV:** ₹{rpv_val:,.2f}\n"
                f"- **Highest Single Bill:** ₹{largest_bill:,.2f}\n"
                f"- **Peak Operating Slot:** {peak.get('slot')} (Generated {peak.get('share_pct', 0):.1f}% of day sales)\n\n"
                f"**🕒 4-Time-Slot Intra-Day Breakdown:**\n\n"
                f"{slots_table}\n\n"
                f"💡 **Floor Takeaway:** {peak.get('slot')} drove the bulk of volume. Focus sales reps on cross-selling higher ticket items during earlier slots."
            )

    # 6. Target Adjustment & Rolling Deficit Queries
    if primary in ("target_adjust", "target_simulate") and "target_adjust_agent" in subagent_data:
        adj = subagent_data["target_adjust_agent"].get("adjustment", {})
        if adj.get("error") == "ACCESS_DENIED":
            return f"⚠️ **{adj.get('message')}**"
        sims = subagent_data["target_adjust_agent"].get("simulations")
        if primary == "target_simulate" and sims and sims.get("options"):
            return _simulation_card(store_name, sims, language)

        t_t = adj.get("original_target_Tt", 0.0)
        c_t = adj.get("carry_forward_Ct", 0.0)
        a_t = adj.get("adjusted_target_At", 0.0)
        s_t = adj.get("net_sales_St", 0.0)
        gap = adj.get("daily_target_gap", 0.0)
        window = adj.get("recovery_window_days", 7)
        balance = adj.get("outstanding_carry_balance", 0.0)

        adj_date = adj.get("date") or active_date.isoformat()

        if t_t == 0.0 and s_t == 0.0 and balance == 0.0:
            return _t(
                language,
                f"### 🎯 **Retail Target Adjustment & Rolling Recovery ({store_name} · {adj_date})**\n\n"
                f"ℹ️ **No daily sales target or operating records have been logged for {store_name} on {adj_date}.**\n\n"
                f"💡 Please allocate daily sales targets under **Sales Target Management** to activate rolling deficit recovery.",
                f"### 🎯 **টার্গেট অ্যাডজাস্টমেন্ট ও রোলিং ডেফিসিট রিকভারি ({store_name} · {adj_date})**\n\n"
                f"ℹ️ **{store_name}-এ {adj_date} তারিখের জন্য কোনো সেলস টার্গেট বা অপারেশনাল রেকর্ড এন্ট্রি করা হয়নি।**\n\n"
                f"💡 রোলিং ডেফিসিট রিকভারি দেখতে অনুগ্রহ করে **সেলস টার্গেট ম্যানেজমেন্ট**-এ গিয়ে দৈনিক টার্গেট নির্ধারণ করুন।",
                f"### 🎯 **टारगेट एडजस्टमेंट व रोलिंग डेफिसिट रिकवरी ({store_name} · {adj_date})**\n\n"
                f"ℹ️ **{adj_date} के लिए {store_name} में कोई बिक्री लक्ष्य या रिकॉर्ड दर्ज नहीं है।**\n\n"
                f"💡 डेफिसिट रिकवरी देखने के लिए कृपया **सेल्स टारगेट मैनेजमेंट** में दैनिक लक्ष्य निर्धारित करें।",
            )

        if language == "bn":
            return (
                f"### 🎯 **টার্গেট অ্যাডজাস্টমেন্ট ও রোলিং ডেফিসিট রিকভারি ({store_name} · {adj_date})**\n\n"
                f"- **মূল দৈনিক টার্গেট ($T_t$):** ₹{t_t:,.2f}\n"
                f"- **ক্যারি-ফরোয়ার্ড অ্যাডজাস্টমেন্ট ($C_t$ - {window} দিনের উইন্ডো):** +₹{c_t:,.2f}\n"
                f"- **সমন্বিত চূড়ান্ত টার্গেট ($A_t = T_t + C_t$):** **₹{a_t:,.2f}**\n"
                f"- **বর্তমান নেট সেলস ($S_t$):** ₹{s_t:,.2f}\n"
                f"- **সমন্বিত টার্গেট গ্যাপ:** **₹{gap:,.2f}**\n"
                f"- **মোট বাকি ডেফিসিট ব্যালেন্স:** ₹{balance:,.2f}\n\n"
                f"💡 **স্ট্র্যাটেজি:** পূর্ববর্তী ঘাটতি {window} দিনের রোলিং উইন্ডোতে সমন্বিত করা হয়েছে। সন্ধ্যা ৫টা - ৮টার পিক রাশ আওয়ারে ফ্লোর কনভার্সন বাড়িয়ে এই গ্যাপ পূরণ করুন।"
            )
        elif language == "hi":
            return (
                f"### 🎯 **टारगेट एडजस्टमेंट व रोलिंग डेफिसिट रिकवरी ({store_name} · {adj_date})**\n\n"
                f"- **मूल दैनिक लक्ष्य ($T_t$):** ₹{t_t:,.2f}\n"
                f"- **कैरी-फॉरवर्ड समायोजन ($C_t$ - {window} दिन की विंडो):** +₹{c_t:,.2f}\n"
                f"- **समायोजित कुल लक्ष्य ($A_t = T_t + C_t$):** **₹{a_t:,.2f}**\n"
                f"- **वर्तमान शुद्ध बिक्री ($S_t$):** ₹{s_t:,.2f}\n"
                f"- **समायोजित लक्ष्य अंतर (Gap):** **₹{gap:,.2f}**\n"
                f"- **कुल बकाया डेफिसिट बैलेंस:** ₹{balance:,.2f}\n\n"
                f"💡 **रणनीति:** पिछले अनअचीव्ड घाटे को {window} दिनों में बांट दिया गया है। शाम के पीक समय में बिलिंग तेज करें।"
            )
        else:
            return (
                f"### 🎯 **Retail Target Adjustment & Rolling Recovery ({store_name} · {adj_date})**\n\n"
                f"- **Original Daily Target ($T_t$):** ₹{t_t:,.2f}\n"
                f"- **Carry-Forward Allocation ($C_t$, {window}-Day Window):** +₹{c_t:,.2f}\n"
                f"- **Adjusted Sales Target ($A_t = T_t + C_t$):** **₹{a_t:,.2f}**\n"
                f"- **Current Net Sales ($S_t$):** ₹{s_t:,.2f}\n"
                f"- **Remaining Adjusted Target Gap:** **₹{gap:,.2f}**\n"
                f"- **Total Outstanding Carry Balance:** ₹{balance:,.2f}\n\n"
                f"💡 **Recovery Rule:** Past deficits are redistributed evenly over your {window}-day rolling period. Prioritize cross-selling at checkout desks during peak surge."
            )

    # 7. Network Ranking (Admin Only)
    if primary == "ranking" and "network_ranking" in db_ops:
        ranking_data = db_ops["network_ranking"]
        if ranking_data.get("error") == "ACCESS_DENIED":
            return f"⚠️ **{ranking_data.get('message')}**"

        ranks = ranking_data.get("rankings", [])
        rank_lines = []
        for r in ranks:
            medal = "🥇" if r["rank"] == 1 else "🥈" if r["rank"] == 2 else "🥉"
            rank_lines.append(f"{medal} **{r['store_name']}:** Sales ₹{r['net_sales']:,.0f} | Ach: {r['achievement_pct']:.1f}% | Conv: {r['conversion_pct']:.1f}% | ATV: ₹{r['atv']:,.0f}")
        rank_str = "\n".join(rank_lines)

        return (
            f"### 🏬 **Consolidated 3-Store Kolkata Network Benchmark**\n\n"
            f"{rank_str}\n\n"
            f"💡 **Executive Directive:** Maintain floor supervisor presence across fitting rooms in stores trailing the network average."
        )

    if primary in ("coaching", "surge"):
        return _coaching_card(store_name, primary, subagent_data, db_ops, language, intent.normalized)
    if primary in ("weather", "market"):
        return _market_card(store_name, subagent_data.get("market_intel_agent", {}), language)
    if primary == "bills" and "bills" in db_ops:
        return _bills_card(store_name, db_ops["bills"], language)
    if primary == "requisitions" and "requisitions" in db_ops:
        return _requisitions_card(store_name, db_ops["requisitions"], language)
    if primary == "directives" and "directives" in db_ops:
        return _directives_card(db_ops["directives"], language)

    # Any intent whose own data was unavailable: answer with the day's KPIs.
    edk = db_ops.get("exact_day_kpis") or {}
    if edk and not edk.get("error") and primary != "day_kpis":
        return _synthesize_domain_response(
            query, active_store, target_date, subagent_data, sec_ctx, language,
            intent=IntentResult(primary="day_kpis"), db_calendar=db_calendar,
        )

    # 8. Standard Live Sales & Gap Check Fallback
    kpi_block = db_ops.get("kpis", {})
    if kpi_block.get("error") == "ACCESS_DENIED":
        return f"⚠️ **{kpi_block.get('message')}**"

    sales = kpi_block.get("net_sales", 0.0)
    target = kpi_block.get("sales_target", 0.0)
    ach = kpi_block.get("achievement_pct", 0.0)
    gap = kpi_block.get("target_gap", 0.0)
    conv = kpi_block.get("conversion_pct", 0.0)
    atv = kpi_block.get("atv", 0.0)

    if language == "bn":
        return (
            f"### 📊 **{store_name} ({target_date.isoformat()}) সেলস ও টার্গেট স্ট্যাটাস**\n\n"
            f"- **মোট নেট সেলস:** ₹{sales:,.2f}\n"
            f"- **সেলস টার্গেট:** ₹{target:,.2f} (অর্জন: **{ach:.1f}%**)\n"
            f"- **বাকি টার্গেট গ্যাপ:** ₹{gap:,.2f}\n"
            f"- **কনভার্সন রেট:** **{conv:.1f}%** | **ATV:** ₹{atv:,.2f}\n\n"
            f"💡 **অ্যাকশন প্ল্যান:** {'পিক আওয়ারে ট্রায়াল রুম সাপোর্ট বৃদ্ধি করে টার্গেট গ্যাপ পূরণ করুন।' if gap > 0 else 'দারুণ পারফরম্যান্স! লক্ষ্য অর্জিত হয়েছে।'}"
        )
    elif language == "hi":
        return (
            f"### 📊 **{store_name} ({target_date.isoformat()}) बिक्री व लक्ष्य रिपोर्ट**\n\n"
            f"- **कुल शुद्ध बिक्री:** ₹{sales:,.2f}\n"
            f"- **निर्धारित लक्ष्य:** ₹{target:,.2f} (अचीवमेंट: **{ach:.1f}%**)\n"
            f"- **बाकी लक्ष्य अंतर (Gap):** ₹{gap:,.2f}\n"
            f"- **कन्वर्शन रेट:** **{conv:.1f}%** | **ATV:** ₹{atv:,.2f}\n\n"
            f"💡 **कार्ययोजना:** {'शाम के पीक समय में बिलिंग काउंटर्स पर कतारें न लगने दें।' if gap > 0 else 'शानदार काम! आज का टारगेट पूरा हो चुका है।'}"
        )
    else:
        return (
            f"### 📊 **{store_name} ({target_date.isoformat()}) Operational Diagnostics**\n\n"
            f"- **Net Sales:** ₹{sales:,.2f}\n"
            f"- **Sales Target:** ₹{target:,.2f} (**{ach:.1f}%** achieved)\n"
            f"- **Target Gap:** ₹{gap:,.2f}\n"
            f"- **Conversion Rate:** **{conv:.1f}%** | **ATV:** ₹{atv:,.2f}\n\n"
            f"💡 **Floor Action:** {'Deploy floor supervisors during peak evening rush to assist shoppers and close the gap.' if gap > 0 else 'Outstanding performance! Sales target is achieved.'}"
        )


# Which sub-agents each primary intent needs. db_ops_agent always runs: every
# answer is grounded in the resolved day's own figures.
_AGENTS_FOR_INTENT: dict[str, tuple[str, ...]] = {
    "target_adjust": ("target_adjust_agent",),
    "target_simulate": ("target_adjust_agent",),
    "yoy": ("forecasting_agent",),
    "surge": ("forecasting_agent", "retail_coach_agent"),
    "weather": ("market_intel_agent",),
    "market": ("market_intel_agent",),
    "coaching": ("retail_coach_agent",),
}

GROUNDING_RULES = """
ANSWERING RULES FOR THIS TURN:
- Answer the user's SPECIFIC question first (intent: {intent}). Do not substitute a different report.
- Use ONLY figures present in TOOL_DATA below. If a figure is absent, null, or a tool returned an error, say it is not recorded -- never estimate.
- The operating date for this turn is {date}; state it in the answer. If TOOL_DATA shows has_records=false, say nothing has been logged for that date yet.
- Format money as ₹ with thousands separators. Use a markdown table when listing several days or slots.
"""


def _select_agents(intent: IntentResult) -> list[str]:
    agents = ["db_ops_agent"]
    for name in (intent.primary, *intent.secondary):
        for agent in _AGENTS_FOR_INTENT.get(name, ()):
            # Secondary hits add data only; advice agents follow the primary only.
            if name != intent.primary and name in ADVICE_INTENTS:
                continue
            if agent not in agents:
                agents.append(agent)
    return agents


def _previous_turn_date(db: Database, session_id: str | None, sec_ctx: SecurityContext) -> date | None:
    """Date the last turn of this session was explicitly about (follow-up carry-over)."""
    if not session_id:
        return None
    meta = SessionMemoryStore.get_last_assistant_metadata(db, session_id, sec_ctx) or {}
    if not meta.get("date_explicit") or not meta.get("target_date"):
        return None
    try:
        return date.fromisoformat(meta["target_date"])
    except (TypeError, ValueError):
        return None


def run_copilot_turn(
    db: Database,
    query: str,
    sec_ctx: SecurityContext,
    target_date: date | None = None,
    requested_store: str | None = None,
    session_id: str | None = None,
    language: str = "en",
) -> ChatResponse:
    """Execute one full multi-agent conversational turn orchestrated by Coordinator."""
    # 1. Multi-tenant isolation: a manager is always clamped to their own store.
    active_store = (requested_store or sec_ctx.store_code or "NM").strip().upper()
    if not sec_ctx.is_admin:
        active_store = sec_ctx.store_code or "NM"
    else:
        # Admins can query any store in natural language or fallback to requested_store / ALL
        q_norm = query.lower()
        if "hatibagan" in q_norm or re.search(r"\b(hb|হাতিবাগান)\b", q_norm):
            active_store = "HB"
        elif "new market" in q_norm or re.search(r"\b(nm|নিউ মার্কেট)\b", q_norm):
            active_store = "NM"
        elif "chowringhee" in q_norm or re.search(r"\b(chw|চৌরঙ্গী)\b", q_norm):
            active_store = "CHW"
        elif "all stores" in q_norm or "all store" in q_norm or "all 3" in q_norm:
            active_store = "ALL"
        elif active_store != "ALL" and active_store not in STORE_CODE_TO_NAME:
            active_store = "ALL"

    # 2. Intent + date, each resolved exactly once for the whole turn.
    intent = detect_intent(query)
    db_calendar = get_database_date_range(db, active_store)
    active_date, resolve_reason = resolve_query_target_date(
        db,
        active_store,
        query,
        default_date=target_date or ist_today(),
        fallback_date=_previous_turn_date(db, session_id, sec_ctx),
    )
    turn_meta = {
        "store_code": active_store,
        "target_date": active_date.isoformat(),
        "date_resolution_reason": resolve_reason,
        "date_explicit": is_explicit_date_reason(resolve_reason),
        "intent": intent.primary,
    }

    # 3. Anti-hallucination pre-check (refuse out-of-horizon dates before any model call).
    pre_check = None
    if intent.primary not in ("formula", *ADVICE_INTENTS, "weather", "market", "directives", "requisitions"):
        pre_check = AntiHallucinationHook.check_pre_generation(
            query=query,
            active_date=active_date,
            active_store=active_store,
            db_calendar=db_calendar,
            language=language,
        )

    sid = SessionMemoryStore.get_or_create_session(
        db=db,
        session_id=session_id,
        sec_ctx=sec_ctx,
        store_code=active_store,
        initial_title=query[:50],
    )
    if pre_check:
        SessionMemoryStore.append_messages(
            db=db, session_id=sid, user_message=query, assistant_reply=pre_check,
            metadata={**turn_meta, "guardrail_triggered": "pre_generation_refusal", "engine": "citimart-guardrail-engine"},
        )
        return ChatResponse(
            session_id=sid,
            reply=pre_check,
            subagents_executed=[],
            tools_executed=["anti_hallucination_hook"],
            engine="citimart-guardrail-engine",
            store_code=active_store,
            target_date=active_date.isoformat(),
        )

    history = SessionMemoryStore.get_history(db, sid, sec_ctx)

    # 4. Run only the sub-agents this intent needs, in parallel.
    subagents_to_run = [] if intent.primary in ("formula", "greeting", "help") else _select_agents(intent)

    def _run_subagent(agent_name: str) -> tuple[str, Any, list[str]]:
        if agent_name == "db_ops_agent":
            return agent_name, DbOpsAgent().run(db, active_store, active_date, sec_ctx, query, intent=intent), ["db_tools", "history_tools"]
        if agent_name == "target_adjust_agent":
            return agent_name, TargetAdjustmentAgent().run(db, active_store, active_date, sec_ctx, query, intent=intent), ["target_tools"]
        if agent_name == "forecasting_agent":
            return agent_name, ForecastingAgent().run(
                db, active_store, active_date, sec_ctx, query, intent=intent, date_explicit=turn_meta["date_explicit"]
            ), ["forecast_tools"]
        if agent_name == "market_intel_agent":
            return agent_name, MarketIntelAgent().run(query, target_date=active_date, intent=intent), ["web_tools"]
        if agent_name == "retail_coach_agent":
            return agent_name, RetailCoachAgent().run(query, language), ["coach_tools"]
        return agent_name, {}, []

    subagent_data: dict[str, Any] = {}
    tools_executed: list[str] = []
    if subagents_to_run:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(subagents_to_run))) as executor:
            future_map = {executor.submit(_run_subagent, a): a for a in subagents_to_run}
            for future in concurrent.futures.as_completed(future_map):
                try:
                    a_name, res, tools = future.result()
                    subagent_data[a_name] = res
                    tools_executed.extend(tools)
                except Exception as ex:  # noqa: BLE001 - one agent must not sink the turn
                    logger.warning("Sub-agent %s failed: %s", future_map.get(future), type(ex).__name__)

    # 5. LLM synthesis, grounded in compact JSON of exactly the data fetched.
    today = target_date or ist_today()
    calendar_context = (
        "DATABASE CALENDAR CONTEXT:\n"
        f"- Today (IST): {today.isoformat()} ({today.strftime('%A')})\n"
        f"- Operating date for this question: {active_date.isoformat()} ({active_date.strftime('%A')}) [{resolve_reason}]\n"
        f"- Recorded range in MongoDB: {db_calendar.get('earliest_date')} to {db_calendar.get('latest_date')} "
        f"({db_calendar.get('total_operating_days', 0)} operating days)\n"
        f"- Active store: {active_store} ({store_label(active_store)})\n"
        f"- User role: {sec_ctx.role} (admin={sec_ctx.is_admin}); preferred language: {language}\n"
    )
    tool_json = json.dumps(subagent_data, default=str, ensure_ascii=False, separators=(",", ":"))
    system_instruction = (
        BASE_COORDINATOR_SYSTEM_INSTRUCTION
        + "\n" + GROUNDING_RULES.format(intent=intent.primary, date=active_date.isoformat())
        + "\n" + calendar_context
        + "\nTOOL_DATA (JSON):\n" + tool_json
    )
    llm_reply = generate_llm_response(
        prompt=query,
        system_instruction=system_instruction,
        conversation_history=history,
        temperature=env.llm_temperature,
        model_name=env.gemini_model,
    )

    engine_used = env.gemini_model if llm_reply else "citimart-multi-agent-domain-engine"
    final_reply = llm_reply or _synthesize_domain_response(
        query=query,
        active_store=active_store,
        target_date=active_date,
        subagent_data=subagent_data,
        sec_ctx=sec_ctx,
        language=language,
        intent=intent,
        db_calendar=db_calendar,
    )

    # 6. Anti-hallucination post-generation audit.
    final_reply = AntiHallucinationHook.audit_post_generation(
        reply=final_reply,
        active_date=active_date,
        db_calendar=db_calendar,
        subagent_data=subagent_data,
        language=language,
    )

    # 7. Persist the turn.
    SessionMemoryStore.append_messages(
        db=db,
        session_id=sid,
        user_message=query,
        assistant_reply=final_reply,
        metadata={
            **turn_meta,
            "subagents_executed": subagents_to_run,
            "tools_executed": tools_executed,
            "engine": engine_used,
        },
    )

    return ChatResponse(
        session_id=sid,
        reply=final_reply,
        subagents_executed=subagents_to_run,
        tools_executed=tools_executed,
        engine=engine_used,
        store_code=active_store,
        target_date=active_date.isoformat(),
    )
