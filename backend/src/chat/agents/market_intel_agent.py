"""Sub-Agent 4: Live Internet Search & External Market Intelligence Agent."""
from __future__ import annotations

from dataclasses import asdict
from datetime import date
from typing import Any

from src.chat.intent import IntentResult, detect_intent
from src.chat.tools.web_tools import get_kolkata_market_signals, live_web_search


class MarketIntelAgent:
    """Specialized Sub-Agent for real-time external context (weather, festivals)."""

    name = "market_intel_agent"
    role = "Live Web & Market Intelligence Specialist"

    def run(self, query: str, target_date: date | None = None, intent: IntentResult | None = None) -> dict[str, Any]:
        intent = intent or detect_intent(query)
        results: dict[str, Any] = {"agent": self.name}

        if intent.has("weather"):
            # Prefer the dashboard's own Open-Meteo reading (same source as
            # "Today's Context"); a generic web search is only a fallback.
            reading = None
            if target_date is not None:
                try:
                    from src.daily_context import get_weather

                    reading = get_weather(target_date)
                except Exception:
                    reading = None
            if reading is not None:
                results["weather"] = {"date": target_date.isoformat(), "source": "Open-Meteo", **asdict(reading)}
            else:
                results["weather_signals"] = live_web_search("Kolkata weather forecast today", max_results=2)
        if intent.has("market"):
            results["festival_signals"] = live_web_search("Kolkata upcoming festivals shopping season", max_results=3)
        if len(results) == 1:
            results["market_signals"] = get_kolkata_market_signals(topic="retail apparel demand")
        return results
