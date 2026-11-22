"""Anti-Hallucination Guardrail Hook ("Don't Know -> Never Guess").

Enforces the Karpathy Rule & CITIMART Constitution Rule:
"Never guess, never fabricate figures, never hide confusion."

If data is absent in MongoDB Atlas, out-of-range, or ambiguous, this hook strictly
intercepts the turn and returns an honest, structured, transparent refusal showing
the verified active calendar horizon and recorded stores.
"""
from __future__ import annotations

from datetime import date
import logging
import re
from typing import Any

from config.settings import STORE_CODE_TO_NAME

logger = logging.getLogger(__name__)


class AntiHallucinationHook:
    """Enterprise Retail Anti-Hallucination Guardrail Hook."""

    @classmethod
    def check_pre_generation(
        cls,
        query: str,
        active_date: date | None = None,
        resolved_date: date | None = None,
        active_store: str = "NM",
        db_calendar: dict[str, Any] | None = None,
        language: str = "en",
    ) -> str | None:
        """Inspect query and target date before LLM generation.
        
        Returns an honest refusal string if the query asks for out-of-bounds historical
        records (e.g. 2023, 2024, or future dates) where no verified records exist.
        """
        target_d = active_date or resolved_date or date.today()
        cal = db_calendar or {}
        earliest_str = cal.get("earliest_date")
        latest_str = cal.get("latest_date")
        total_days = cal.get("total_operating_days", 79)
        store_name = STORE_CODE_TO_NAME.get(active_store, active_store)

        if not earliest_str or not latest_str:
            return None

        try:
            earliest_d = date.fromisoformat(earliest_str)
            latest_d = date.fromisoformat(latest_str)
        except ValueError:
            return None

        q_lower = query.lower()
        is_yoy_or_forecast = any(k in q_lower for k in ["yoy", "growth", "forecast", "projection", "surge", "पूर्वानुमान"])

        # Check A: Out of range historical query (prior to recorded database horizon)
        if target_d < earliest_d and not is_yoy_or_forecast:
            if language == "bn":
                return (
                    f"⚠️ **তথ্য অনুপস্থিত (তথ্যসূত্র: মঙ্গোডিবি এটলাস)**\n\n"
                    f"**{store_name}** স্টোরের জন্য **{target_d.isoformat()}** তারিখের কোনো বিক্রয় বা অপারেশন রেকর্ড সিটিমার্ট ডাটাবেসে নেই।\n\n"
                    f"- **ডাটাবেসে সংরক্ষিত সক্রিয় সময়সীমা:** {earliest_d.strftime('%Y-%m-%d')} থেকে {latest_d.strftime('%Y-%m-%d')} (মোট {total_days} দিন)\n"
                    f"- **উপলব্ধ স্টোরসমূহ:** New Market (NM), Hatibagan (HB), Chowringhee (CHW)\n\n"
                    f"💡 **পরামর্শ:** অনুগ্রহ করে সংরক্ষিত সময়সীমার মধ্য থেকে তারিখ নির্বাচন করুন অথবা সর্বশেষ সম্পূর্ণ দিন ({latest_d.strftime('%Y-%m-%d')}) এর রিপোর্ট দেখতে চান কিনা জানান।"
                )
            elif language == "hi":
                return (
                    f"⚠️ **रिकॉर्ड उपलब्ध नहीं (डेटाबेस: मोंगोडीबी एटलस)**\n\n"
                    f"**{store_name}** के लिए **{target_d.isoformat()}** दिनांक का कोई भी बिक्री या परिचालन रिकॉर्ड डेटाबेस में मौजूद नहीं है।\n\n"
                    f"- **सत्यापित डेटा सीमा:** {earliest_d.strftime('%Y-%m-%d')} से {latest_d.strftime('%Y-%m-%d')} (कुल {total_days} दिन)\n"
                    f"- **अधिकृत स्टोर्स:** New Market (NM), Hatibagan (HB), Chowringhee (CHW)\n\n"
                    f"💡 **सुझाव:** कृपया उपलब्ध तारीखों में से पूछें या नवीनतम कारोबारी दिन ({latest_d.strftime('%Y-%m-%d')}) की रिपोर्ट देखें।"
                )
            else:
                return (
                    f"⚠️ **No Records Found in Database**\n\n"
                    f"No verified operational or sales transaction records exist in the CITIMART MongoDB Atlas database for **{store_name}** on **{target_d.isoformat()}**.\n\n"
                    f"- **Recorded Database Horizon:** {earliest_d.strftime('%Y-%m-%d')} to {latest_d.strftime('%Y-%m-%d')} ({total_days} operating days)\n"
                    f"- **Active Network Stores:** New Market (NM), Hatibagan (HB), Chowringhee (CHW)\n\n"
                    f"💡 **Action:** Please query a date within the verified operating range ({earliest_d.strftime('%Y-%m-%d')} to {latest_d.strftime('%Y-%m-%d')}), or ask for the latest completed business day."
                )

        return None

    @classmethod
    def sanitize_to_the_point_output(cls, text: str) -> str:
        """Strip conversational pleasantries, greetings, and preamble fluff to uphold Core Directive 1.
        
        Ensures the response opens directly with the metric card, data table, or factual answer.
        """
        if not text:
            return ""

        cleaned = text.strip()

        # Regular expressions for conversational openers (English, Bengali, Hindi)
        greeting_patterns = [
            r"^(?:hello|hi|hey|greetings|good\s+(?:morning|afternoon|evening))\s*[,!.:-]*\s*",
            r"^(?:certainly|sure\s*thing|sure|of\s*course|i'd\s*be\s*happy\s*to\s*help(?:\s*with\s*that)?)\s*[,!.:-]*\s*",
            r"^(?:here\s+(?:is|are)\s+(?:the\s+)?(?:requested\s+)?(?:[a-z0-9_\-]+\s+)*(?:details|figures|numbers|sales|data|metrics|information|kpis?|report))\s*[,!.:-]*\s*",
            r"^(?:here\s+is\s+what\s+(?:i\s+found|we\s+have))\s*[,!.:-]*\s*",
            r"^(?:let\s+me\s+(?:check|get|provide)\s+(?:that|the\s+data))\s*[,!.:-]*\s*",
            r"^(?:হ্যালো|নমস্কার|সুপ্রভাত|অবশ্যই|নিশ্চয়ই)\s*[,!.:-]*\s*",
            r"^(?:এখানে\s+(?:অনুরোধকৃত\s+)?(?:বিবরণ|তথ্য|রিপোর্ট)\s+(?:দেওয়া|দেয়া)\s+হলো)\s*[,!.:-]*\s*",
            r"^(?:नमस्ते|नमस्कार|हेलो|ज़रूर|बिल्कुल|यहाँ\s+(?:विवरण|आंकड़े|जानकारी)\s+है)\s*[,!.:-]*\s*",
        ]

        # Apply iteratively in case multiple pleasantries are chained (e.g. "Hello! Certainly! Here is...")
        changed = True
        iterations = 0
        while changed and iterations < 4:
            changed = False
            iterations += 1
            for pat in greeting_patterns:
                match = re.match(pat, cleaned, flags=re.IGNORECASE)
                if match:
                    cleaned = cleaned[match.end():].lstrip()
                    changed = True

        return cleaned

    @classmethod
    def audit_post_generation(
        cls,
        reply: str = "",
        response_text: str = "",
        query: str = "",
        active_store: str = "NM",
        active_date: date | None = None,
        target_date: date | None = None,
        subagent_data: dict[str, Any] | None = None,
        db_calendar: dict[str, Any] | None = None,
        language: str = "en",
    ) -> str:
        """Post-generation audit: ensure output does not fabricate or guess when data is missing,
        and sanitize output to be strictly to-the-point with zero conversational fluff.
        """
        text = reply or response_text
        subagents = subagent_data or {}
        db_ops = subagents.get("db_ops_agent", {})

        # If subagent explicitly reported missing records or access denial, preserve refusal
        if db_ops.get("exact_day_kpis", {}).get("error") == "ACCESS_DENIED":
            return cls.sanitize_to_the_point_output(text)

        # Check if subagent reported no records found
        if db_ops.get("kpis", {}).get("error") == "NO_RECORDS_FOUND":
            return (
                f"⚠️ **No verified operational sales records exist for this query in MongoDB Atlas.**\n\n"
                f"Please verify the selected store or date."
            )

        return cls.sanitize_to_the_point_output(text)
