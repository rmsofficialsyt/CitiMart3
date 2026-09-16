"""CITIMART AI Chatbot & Operations Copilot Route.

Provides intelligent, role-aware operational insights, KPI explanations,
time-slot pacing strategies, target gap analysis, and SOP guidelines
for Store Managers (NM, HB, CHW) and Executive Admins (Raphael Sir).
Supports English, Hindi, and Bengali with dual Gemini + Domain Analytics engine.
"""
from __future__ import annotations

from datetime import date, datetime
import os
from typing import Any, Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user
from db.session import get_db
from src import directives_store, daily_dashboard_store

router = APIRouter(prefix="/api/daily/chat", tags=["chat"])

CITIMART_SYSTEM_INSTRUCTION = """
You are the CITIMART AI Decision Advisor & Retail Operations Co-Pilot — an advanced, intelligent retail analytics assistant designed specifically for CITIMART departmental stores in Kolkata (New Market [NM], Hatibagan [HB], and Chowringhee [CHW]).

Your role is to assist:
1. Store Managers (NM, HB, CHW): Provide actionable floor-level guidance, target gap recovery tactics, conversion boost strategies, ATV & basket size improvements, time-slot pacing, and staff management advice.
2. Executive Admins (Raphael Sir / Operations Head): Provide consolidated 3-store network health analysis, benchmark rankings, variance flags, target projections, and directive drafting assistance.

CORE RETAIL FORMULAE & METRICS:
- Conversion Rate (%) = (Total Bills / Total Footfall) * 100
- Average Transaction Value (ATV) = Net Sales / Total Bills
- Sales Per Hour (SPH) = Net Sales / Operating Hours (or slot duration)
- Basket Size = Total Quantity Sold / Total Bills
- Target Achievement (%) = (Actual Net Sales / Target Sales) * 100
- Remaining Target = Target Sales - Actual Net Sales

TIME SLOTS (10:30 AM to 10:30 PM):
1. 10:30 - 13:00 (Opening & Setup)
2. 13:00 - 15:00 (Lunch & Casual Shoppers)
3. 15:00 - 17:00 (Early Evening Build-up)
4. 17:00 - 19:00 (Peak Evening Surge 1)
5. 19:00 - 21:00 (Peak Evening Surge 2 - Prime Shopping)
6. 21:00 - 22:30 (Closing Push & Billing Consolidation)

TONE & STYLE:
- Professional, sharp, encouraging, data-driven, and highly practical.
- Use markdown formatting with bullet points, bold highlights, KPI badges, and concise advice.
- When asked in Hindi (हिंदी) or Bengali (বাংলা), respond fluently and naturally in that language.
- Always respect the current user's role and assigned store context provided in the system message.
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
    """Gather live operational metrics, targets, and active directives."""
    context_data: dict[str, Any] = {
        "date": target_date.isoformat(),
        "stores": {},
        "directives": [],
        "overall": None,
    }

    # Directives
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
    except Exception:
        context_data["directives"] = []

    # Store Performance
    if user.is_admin or store_code in ("ALL", None):
        try:
            overall_res = daily_dashboard_store.compute_live_kpis_all_stores(db, target_date)
            context_data["overall"] = overall_res.get("combined", {})
            context_data["stores"] = overall_res.get("per_store", {})
        except Exception:
            pass

    if not context_data["stores"] or store_code in ("NM", "HB", "CHW"):
        target_store = store_code or user.store_code or "NM"
        try:
            kpis = daily_dashboard_store.compute_live_kpis(db, target_store, target_date)
            context_data["stores"][target_store] = kpis
        except Exception:
            pass

    return context_data


def _generate_domain_fallback(
    query: str,
    context: dict[str, Any],
    user: CurrentUser,
    active_store: str,
    lang: str,
) -> str:
    """Smart Rule-Based CITIMART Analytics Fallback Engine when external LLM is offline."""
    q_lower = query.lower()
    store_kpi = context["stores"].get(active_store) or (context["stores"].get("NM") if context["stores"] else {})

    net_sales = float(store_kpi.get("net_sales") or 0.0)
    target_sales = float(store_kpi.get("target_sales") or 0.0)
    achieve_pct = float(store_kpi.get("achievement_pct") or 0.0)
    footfall = int(store_kpi.get("footfall") or 0)
    bills = int(store_kpi.get("nob") or 0)
    conv_pct = float(store_kpi.get("conversion_pct") or 0.0)
    atv = float(store_kpi.get("atv") or 0.0)
    basket = float(store_kpi.get("basket_size") or 0.0)

    gap = max(0.0, target_sales - net_sales) if target_sales else 0.0
    store_names = {"NM": "New Market", "HB": "Hatibagan", "CHW": "Chowringhee", "ALL": "Overall Stores"}
    curr_store_name = store_names.get(active_store, active_store)

    # 1. Performance / Sales Check
    if any(k in q_lower for k in ["performance", "sales", "target", "achievement", "how is", "সেলস", "টার্গেট", "পারফরম্যান্স", "बिक्री", "सेल", "टारगेट"]):
        if lang == "bn":
            return (
                f"### 📊 **{curr_store_name} আজকের লাইভ পারফরম্যান্স রিপোর্ট**\n\n"
                f"- **মোট সেলস:** ₹{net_sales:,.2f}\n"
                f"- **টার্গেট সেলস:** ₹{target_sales:,.2f}\n"
                f"- **টার্গেট অর্জন (Achievement):** **{achieve_pct:.1f}%**\n"
                f"- **বাকি টার্গেট গ্যাপ:** ₹{gap:,.2f}\n"
                f"- **বিল সংখ্যা (NOB):** {bills} টি | **ফুটফল:** {footfall} জন\n"
                f"- **কনভার্সন রেট:** **{conv_pct:.1f}%** | **ATV:** ₹{atv:,.2f}\n\n"
                f"💡 **পরামর্শ:** {'টার্গেট অর্জনে গতি বাড়াতে পিক আওয়ারে (৩টা - ৯টা) বিলিং কাউন্টারে অ্যাক্টিভ ক্রস-সেলিং বৃদ্ধি করুন।' if gap > 0 else 'দারুণ পারফরম্যান্স! আজকের টার্গেট ইতিমধ্যে সফলভাবে পূর্ণ হয়েছে।'}"
            )
        elif lang == "hi":
            return (
                f"### 📊 **{curr_store_name} आज की लाइव परफॉर्मेंस रिपोर्ट**\n\n"
                f"- **कुल बिक्री (Net Sales):** ₹{net_sales:,.2f}\n"
                f"- **लक्ष्य (Target):** ₹{target_sales:,.2f}\n"
                f"- **टारगेट अचीवमेंट:** **{achieve_pct:.1f}%**\n"
                f"- **बाकी लक्ष्य अंतर (Gap):** ₹{gap:,.2f}\n"
                f"- **कुल बिल (NOB):** {bills} | **फुटफॉल:** {footfall}\n"
                f"- **कन्वर्शन रेट:** **{conv_pct:.1f}%** | **ATV:** ₹{atv:,.2f}\n\n"
                f"💡 **सलाह:** {'पीक ऑवर्स (3 PM - 9 PM) में बिलिंग डेस्क पर एक्सेसरीज और फास्ट-मूविंग आइटम्स की क्रॉस-सेलिंग बढ़ाकर गैप पूरा करें।' if gap > 0 else 'शानदार काम! आज का टारगेट सफलतापूर्वक पूरा हो चुका है।'}"
            )
        else:
            return (
                f"### 📊 **{curr_store_name} Today's Live Performance Summary**\n\n"
                f"- **Net Sales:** ₹{net_sales:,.2f}\n"
                f"- **Target Sales:** ₹{target_sales:,.2f}\n"
                f"- **Achievement:** **{achieve_pct:.1f}%**\n"
                f"- **Remaining Gap:** ₹{gap:,.2f}\n"
                f"- **Bills (NOB):** {bills} | **Footfall:** {footfall}\n"
                f"- **Conversion Rate:** **{conv_pct:.1f}%** | **ATV:** ₹{atv:,.2f}\n"
                f"- **Basket Size:** {basket:.2f} items/bill\n\n"
                f"💡 **Actionable Recommendation:** {'Deploy floor supervisors to assist browsing shoppers and activate cross-selling at billing counters during peak hours (3 PM - 9 PM) to bridge the target gap.' if gap > 0 else 'Excellent performance! Today target has been successfully achieved.'}"
            )

    # 2. Conversion & ATV Tactics
    if any(k in q_lower for k in ["conversion", "atv", "basket", "increase", "boost", "কনভার্সন", "বাড়াব", "बास्केट", "कन्वर्शन"]):
        if lang == "bn":
            return (
                f"### 🎯 **কনভার্সন রেট ও ATV বাড়ানোর ৩টি মোক্ষম কৌশল ({curr_store_name})**\n\n"
                f"1. **কাউন্টার ক্রস-সেলিং (Cross-Selling at Cash Desk):** ক্যাশ কাউন্টারে দ্রুত বিক্রিযোগ্য এক্সেসরিজ ও ডিল আইটেম সাজিয়ে রাখুন। এর ফলে ATV ₹১,৮০০+ এ উন্নীত হবে।\n"
                f"2. **গ্রাহক সহায়তা ও সাইজ টেস্ট (Active Floor Assistance):** ট্রায়াল রুমের কাছে ফ্লোর সুপারভাইজার রাখুন যাতে গ্রাহকরা সঠিক সাইজ দ্রুত পান এবং বিল কনভার্সন রেট ৭০%+ বজায় থাকে।\n"
                f"3. **কম্বো অফার ও বান্ডেলিং (Bundle Push):** শিশুদের ও মেনস ডিপার্টমেন্টে ২টির সাথে ১টি স্পেশাল অফার হাইলাইট করুন যাতে বাস্কেট সাইজ ২.৮+ এ পৌঁছায়।"
            )
        elif lang == "hi":
            return (
                f"### 🎯 **कन्वर्शन रेट और ATV बढ़ाने के 3 मुख्य उपाय ({curr_store_name})**\n\n"
                f"1. **कैश डेस्क पर क्रॉस-सेलिंग:** बिलिंग पॉइंट पर सॉक्स, बेल्ट्स और फास्ट-मूविंग प्रोडक्ट्स रखें जिससे एवरेज टिकट साइज ₹1,800+ पहुंचे।\n"
                f"2. **ट्रायल रूम और फ्लोर हेल्प:** ट्रायल रूम्स के पास स्टाफ सक्रिय रखें ताकि ग्राहक बिना खरीदारी के वापस न लौटें (कन्वर्शन 70%+ का लक्ष्य)।\n"
                f"3. **मल्टीपल आइटम बंडलिंग:** मेन्स और विमेंस सेक्शन में मैचिंग पेयरिंग का सुझाव दें जिससे बास्केट साइज 2.8+ हो सके।"
            )
        else:
            return (
                f"### 🎯 **Top 3 Tactics to Boost Conversion & ATV ({curr_store_name})**\n\n"
                f"1. **Cash Desk Cross-Selling & Impulse Displays:** Place high-margin add-ons (accessories, socks, fragrances) at billing counters to push ATV above ₹1,800.\n"
                f"2. **Trial Room & Floor Assistance:** Ensure floor supervisors assist customers looking for size runs immediately to prevent drop-offs and maintain conversion > 70%.\n"
                f"3. **Bundle & Multi-Buy Recommendations:** Train sales assistants on suggestive selling (e.g. matching shirts with trousers) to drive basket size >= 2.8 items."
            )

    # 3. Boss Directives & Operational Head
    if any(k in q_lower for k in ["boss", "raphael", "directive", "announcement", "বসের", "রাফায়েল", "নির্দেশনা", "निर्देश", "राफेल", "operational head"]):
        dirs = context.get("directives", [])
        if dirs:
            dir_list_str = "\n".join([f"- **{d['title']}**: {d['message'][:120]}..." for d in dirs[:3]])
        else:
            dir_list_str = "- No urgent directives currently broadcasted."

        if lang == "bn":
            return (
                f"### 👑 **অপারেশনস হেডের সাম্প্রতিক অপারেশনাল নির্দেশাবলী**\n\n"
                f"{dir_list_str}\n\n"
                f"📌 **প্রধান অগ্রাধিকার:** পিক আওয়ারে ফ্লোর সুপারভিশন নিশ্চিত করা এবং রাত ১০:৩০ টার মধ্যে সঠিক ডেটা এন্ট্রি সম্পন্ন করা।"
            )
        elif lang == "hi":
            return (
                f"### 👑 **ऑपरेशन्स हेड के हालिया निर्देश और घोषणाएं**\n\n"
                f"{dir_list_str}\n\n"
                f"📌 **मुख्य निर्देश:** पीक ऑवर्स में फ्लोर पर सक्रिय उपस्थिति रखें और रात 10:30 बजे तक सभी बिल डेटा एंट्री पूरी करें।"
            )
        else:
            return (
                f"### 👑 **Recent Directives from Operational Head**\n\n"
                f"{dir_list_str}\n\n"
                f"📌 **Core Mandate:** Maximize floor supervision during peak trading slots and ensure all billing logs are submitted by 10:30 PM sharp."
            )

    # 4. Formulas & Calculation Explanations
    if any(k in q_lower for k in ["formula", "calculate", "सूत्र", "হিসাব", "সূত্র"]):
        if lang == "bn":
            return (
                "### 📐 **CITIMART মূল মেট্রিক্স ও গাণিতিক সূত্রাবলী**\n\n"
                "- **Conversion Rate (%)** = `(মোট বিল সংখ্যা / মোট ফুটফল) × ১০০`\n"
                "- **Average Transaction Value (ATV)** = `মোট নেট সেলস / মোট বিল সংখ্যা`\n"
                "- **Basket Size** = `মোট বিক্রিত আইটেম সংখ্যা / মোট বিল সংখ্যা`\n"
                "- **Sales Per Hour (SPH)** = `মোট নেট সেলস / মোট কর্মঘণ্টা (১২ ঘণ্টা)`\n"
                "- **Target Achievement (%)** = `(অর্জিত সেলস / লক্ষ্যমাত্রা) × ১০০`"
            )
        elif lang == "hi":
            return (
                "### 📐 **CITIMART के प्रमुख सूत्र और गणना गाइड**\n\n"
                "- **कन्वर्शन रेट (%)** = `(कुल बिल / कुल फुटफॉल) × 100`\n"
                "- **औसत लेनदेन मूल्य (ATV)** = `कुल शुद्ध बिक्री / कुल बिल`\n"
                "- **बास्केट साइज** = `कुल बेची गई वस्तुएं / कुल बिल`\n"
                "- **प्रति घंटा बिक्री (SPH)** = `कुल शुद्ध बिक्री / 12 घंटे`\n"
                "- **टारगेट अचीवमेंट (%)** = `(प्राप्त बिक्री / निर्धारित लक्ष्य) × 100`"
            )
        else:
            return (
                "### 📐 **CITIMART Operational KPI Formulas**\n\n"
                "- **Conversion Rate (%)** = `(Total Bills / Total Footfall) × 100`\n"
                "- **Average Transaction Value (ATV)** = `Net Sales / Total Bills`\n"
                "- **Basket Size** = `Total Sold Quantity / Total Bills`\n"
                "- **Sales Per Hour (SPH)** = `Net Sales / 12 Operating Hours`\n"
                "- **Target Achievement (%)** = `(Actual Net Sales / Target Sales) × 100`"
            )

    # Default Helpful Response
    if lang == "bn":
        return (
            f"নমস্কার! আমি **CITIMART AI ডিসিশন অ্যাডভাইজার**। আমি আপনাকে স্টোর পারফরম্যান্স, আজকের সেলস টার্গেট, কনভার্সন রেট, টাইম-স্লট স্ট্র্যাটেজি বা অপারেশনস হেডের নির্দেশাবলী বিশ্লেষণে সাহায্য করতে পারি।\n\n"
            f"**দ্রুত জানতে ক্লিক বা টাইপ করুন:**\n"
            f"- আজকের সেলস ও টার্গেট স্ট্যাটাস কেমন?\n"
            f"- কনভার্সন রেট ও ATV কীভাবে বাড়াব?\n"
            f"- পিক আওয়ারে কী কী পদক্ষেপ নেওয়া উচিত?"
        )
    elif lang == "hi":
        return (
            f"नमस्ते! मैं **CITIMART AI डिसीजन एडवाइजर** हूँ। मैं स्टोर परफॉर्मेंस, सेल्स टारगेट, कन्वर्शन रेट, टाइम-स्लॉट रणनीति या ऑपरेशन्स हेड के निर्देशों में आपकी मदद कर सकता हूँ।\n\n"
            f"**आप पूछ सकते हैं:**\n"
            f"- आज की बिक्री और टारगेट स्थिति क्या है?\n"
            f"- कन्वर्शन रेट और ATV कैसे बढ़ाएं?\n"
            f"- पीक ऑवर्स के लिए बेस्ट प्रैक्टिसेज क्या हैं?"
        )
    else:
        return (
            f"Hello! I am the **CITIMART AI Decision Advisor & Co-Pilot**.\n\n"
            f"I can assist you with real-time sales performance, target gap analysis, hourly time-slot pacing, ATV boost strategies, or Operational Head's operational directives.\n\n"
            f"**Popular Queries:**\n"
            f"- *How is {curr_store_name} performing against today's target?*\n"
            f"- *Suggest 3 tactics to increase ATV and conversion rate*\n"
            f"- *What are the active directives from Operational Head?*\n"
            f"- *Show KPI formulas and calculation rules*"
        )


@router.post("")
def chat_with_copilot(
    payload: ChatRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Chat endpoint supporting Gemini API with instant high-precision local fallback."""
    target_date = date.today()
    if payload.date_str:
        try:
            target_date = date.fromisoformat(payload.date_str)
        except ValueError:
            target_date = date.today()

    active_store = payload.store_code or user.store_code or "NM"
    if not user.is_admin and active_store != user.store_code:
        active_store = user.store_code or "NM"

    # Gather live operational context
    context = _gather_live_context(db, target_date, active_store, user)

    # Check for Gemini API Key
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    if gemini_key:
        try:
            import requests

            # Build enriched system prompt with live state
            store_kpi = context["stores"].get(active_store, {})
            overall_kpi = context.get("overall", {})

            context_str = (
                f"LIVE SYSTEM CONTEXT (Date: {target_date.isoformat()}):\n"
                f"Current User: {user.username} (Role: {user.role}, Assigned Store: {user.store_code or 'ALL'})\n"
                f"Active Store Scope: {active_store}\n"
                f"Active Store Live KPIs: {store_kpi}\n"
                f"Consolidated All Stores KPIs: {overall_kpi}\n"
                f"Active Boss Directives: {context.get('directives', [])}\n"
                f"Preferred Language: {payload.language}\n"
            )

            messages = [{"role": "system", "parts": [{"text": CITIMART_SYSTEM_INSTRUCTION + "\n\n" + context_str}]}]

            for h in payload.conversation_history[-6:]:
                role = "user" if h.role == "user" else "model"
                messages.append({"role": role, "parts": [{"text": h.content}]})

            messages.append({"role": "user", "parts": [{"text": payload.message}]})

            # Call Gemini via REST
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
            resp = requests.post(
                url,
                json={
                    "contents": messages,
                    "generationConfig": {
                        "temperature": 0.4,
                        "maxOutputTokens": 1024,
                    },
                },
                timeout=12,
            )
            if resp.status_code == 200:
                data = resp.json()
                reply = data["candidates"][0]["content"]["parts"][0]["text"]
                return {
                    "reply": reply,
                    "engine": "gemini-2.5-flash",
                    "store": active_store,
                    "date": target_date.isoformat(),
                }
        except Exception:
            # Silently fallback to Domain Analytics Engine on timeout/network fail
            pass

    # High-precision Domain Intelligence Engine Fallback
    reply = _generate_domain_fallback(
        query=payload.message,
        context=context,
        user=user,
        active_store=active_store,
        lang=payload.language,
    )

    return {
        "reply": reply,
        "engine": "citimart-domain-analytics",
        "store": active_store,
        "date": target_date.isoformat(),
    }
