"""Sub-Agent 5: Retail Strategy, Floor Coaching & SOP Compliance Agent."""
from __future__ import annotations

from typing import Any


class RetailCoachAgent:
    """Specialized Sub-Agent for floor-level retail tactics (70%+ conversion, ₹1800+ ATV) and SOPs."""

    name = "retail_coach_agent"
    role = "Floor Operations & Retail Strategy Specialist"

    def run(self, query: str, language: str = "en") -> dict[str, Any]:
        """Provide tactical retail countermeasures and floor operational coaching."""
        return {
            "agent": self.name,
            "language": language,
            "tactics": {
                "conversion_boost_70pct": [
                    "Active Trial Room Assistance: Keep fitting room runners to swap sizes directly so customers never drop off.",
                    "Warm Door Greeting: Guide incoming shoppers straight to high-interest seasonal sections.",
                    "Staff Redeployment: Shift support staff to cash counters during the 5 PM - 8 PM peak surge.",
                ],
                "atv_expansion_1800inr": [
                    "Impulse Accessories at POS: Stock belts, socks, handkerchiefs, deodorants right by billing monitors.",
                    "Ensemble Selling: Train sales reps to pitch coordinated complete outfits rather than single pieces.",
                    "Multi-Buy Bundles: Visibly highlight 2-item bundled promotions to raise Units Per Bill (UPB).",
                ],
                "daily_sop_checkpoints": [
                    "11:00 AM: Cash desk POS verification and morning floor setup complete.",
                    "05:00 PM - 08:00 PM: Peak billing throughput with all cash desks active and zero cashier lag.",
                    "10:30 PM: Mandatory daily log completion and manual verification.",
                ],
            },
        }
