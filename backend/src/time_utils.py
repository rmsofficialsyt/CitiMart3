"""Business-time helpers. The whole app runs on Kolkata time.

The server may run in UTC (Render), where `date.today()` / `datetime.now(timezone.utc)`
still reads *yesterday* between 00:00 and 05:30 IST -- so "today" for attendance,
staff summaries, document codes etc. must come from here, never from UTC.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def ist_now() -> datetime:
    return datetime.now(IST)


def ist_today() -> date:
    """Business 'today' in Kolkata."""
    return ist_now().date()
