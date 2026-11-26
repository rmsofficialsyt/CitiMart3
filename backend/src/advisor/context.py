"""Day tags for context-adjusted expectations (holiday, rain, day type).

Holiday and day type are local calendar lookups. Rain needs Open-Meteo, so
it is looked up only through ``weather_lookup`` -- one module-level hook the
test suite stubs, and which the Advisor calls only when a comparison
actually needs it (see ``pacing.learn_pacing_curve``). A failed lookup is
``rainy: None`` ("unknown"), never a guess of dry.
"""
from __future__ import annotations

from datetime import date

from src import daily_context

# Daily precipitation at or above this counts as a rainy trading day.
RAIN_MM = 5.0

weather_lookup = daily_context.get_weather


def rainy(d: date) -> bool | None:
    reading = weather_lookup(d)
    if reading is None or reading.precipitation_mm is None:
        return None
    return reading.precipitation_mm >= RAIN_MM


def day_tags(d: date, *, with_weather: bool = True) -> dict:
    return {
        "holiday": daily_context.get_holiday_name(d),
        "election": daily_context.get_election_info(d),
        "day_type": daily_context.day_type(d),
        "rainy": rainy(d) if with_weather else None,
    }
