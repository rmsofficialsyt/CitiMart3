"""Sub-Agent: Decision Advisor (driver attribution + network brief)."""
from __future__ import annotations

import re
from datetime import date
from typing import Any

from pymongo.database import Database

from src.chat.intent import IntentResult, detect_intent
from src.chat.state import SecurityContext
from src.chat.tools.advisor_tools import explain_day, network_brief

_EVENING = re.compile(r"\b(evening|tonight|end of (the )?day|debrief)\b|সন্ধ্যা|शाम")
_MIDDAY = re.compile(r"\b(mid-?day|noon|afternoon|so far today|half[- ]day)\b|দুপুর|दोपहर")


class AdvisorAgent:
    name = "advisor_agent"
    role = "Retail Decision Advisor"

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
        results: dict[str, Any] = {"agent": self.name}
        if intent.has("explain_day"):
            results["explain"] = explain_day(db, store_code, target_date, sec_ctx)
        if intent.has("brief"):
            q = intent.normalized or query.lower()
            kind = "midday" if _MIDDAY.search(q) else "evening" if _EVENING.search(q) else "morning"
            results["brief"] = network_brief(db, target_date, kind, sec_ctx)
        return results
