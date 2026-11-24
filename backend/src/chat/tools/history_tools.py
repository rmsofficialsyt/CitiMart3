"""Historical Sales & Granular Date Tools for CITIMART Multi-Agent Chatbot.

Provides deep historical data alignment with MongoDB Atlas collections across 79+ operating days:
- Natural language date tokenizer (yesterday, ISO, DD.MM.YYYY, 18th Nov, MTD, past 7 days)
- 4-Time-Slot intra-day breakdown for any past date
- Past N-day tabular history summaries with daily averages
- Month-To-Date (MTD) cumulative pacing & run-rate gap analysis
- Peak (best) and Dip (lowest) operational day discovery
- Week-over-Week (WoW) same-day momentum comparisons
- Strict multi-tenant RBAC enforcement (store managers only see their store)
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import logging
import re
from typing import Any
import holidays
from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME, TIME_SLOT_ORDER
from db.models import BILLS, TARGETS
from src import daily_dashboard_store
from src.chat.state import SecurityContext
from src.chat.tools.db_tools import store_kpis, store_label

logger = logging.getLogger(__name__)

MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def get_latest_recorded_date(
    db: Database,
    store_code: str,
    bills_only: bool = False,
    before_date: date | None = None,
) -> date | None:
    """Find the most recent operating date with recorded data for a store or all stores.
    
    If bills_only is True, strictly looks at actual sales transaction records (BILLS collection).
    If before_date is provided, limits candidates to dates <= before_date.
    """
    query: dict[str, Any] = {} if store_code == "ALL" else {"store_code": store_code}
    if before_date is not None:
        query["entry_date"] = {"$lte": before_date.isoformat()}

    collections = (BILLS,) if bills_only else (BILLS, TARGETS)
    candidates: list[date] = []
    for coll in collections:
        doc = db[coll].find_one(query, sort=[("entry_date", -1)], projection={"entry_date": 1})
        if doc and doc.get("entry_date"):
            try:
                candidates.append(date.fromisoformat(doc["entry_date"]))
            except ValueError:
                pass
    return max(candidates) if candidates else None


import time as _pytime
import threading

_CALENDAR_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CALENDAR_CACHE_LOCK = threading.Lock()
_CALENDAR_CACHE_TTL = 60.0  # seconds


def clear_calendar_cache() -> None:
    """Clear calendar in-memory cache (used for cache invalidation and tests)."""
    with _CALENDAR_CACHE_LOCK:
        _CALENDAR_CACHE.clear()


def get_database_date_range(db: Database, store_code: str = "ALL") -> dict[str, Any]:
    """Return the earliest date, latest date, and total active operating days in MongoDB (60s TTL cached)."""
    now = _pytime.time()
    cache_key = f"{id(db)}_{store_code}"
    with _CALENDAR_CACHE_LOCK:
        if cache_key in _CALENDAR_CACHE:
            cached_at, cached_val = _CALENDAR_CACHE[cache_key]
            if now - cached_at < _CALENDAR_CACHE_TTL:
                return cached_val

    query = {} if store_code == "ALL" else {"store_code": store_code}
    earliest_doc = db[BILLS].find_one(query, sort=[("entry_date", 1)], projection={"entry_date": 1})
    latest_doc = db[BILLS].find_one(query, sort=[("entry_date", -1)], projection={"entry_date": 1})

    earliest = earliest_doc.get("entry_date") if earliest_doc else None
    latest = latest_doc.get("entry_date") if latest_doc else None

    # Count distinct dates
    distinct_dates = db[BILLS].distinct("entry_date", query)
    total_days = len(distinct_dates) if distinct_dates else 0

    result = {
        "earliest_date": earliest,
        "latest_date": latest,
        "total_operating_days": total_days,
        "store_code": store_code,
    }

    if earliest or latest:
        with _CALENDAR_CACHE_LOCK:
            _CALENDAR_CACHE[cache_key] = (now, result)

    return result


_IST = timezone(timedelta(hours=5, minutes=30))

_ISO_RE = re.compile(r"\b(20[2-9]\d)-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b")
_DMY_RE = re.compile(r"\b(0?[1-9]|[12]\d|3[01])[\.\-\/](0?[1-9]|1[0-2])[\.\-\/](20[2-9]\d)\b")
_MONTHS_ALT = (
    "january|february|march|april|june|july|august|september|october|november|december"
    "|jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec"
)
_DAY_MONTH_RE = re.compile(
    rf"\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(?:of\s+)?({_MONTHS_ALT})\b(?:,?\s+(20[2-9]\d))?"
)
_MONTH_DAY_RE = re.compile(
    rf"\b({_MONTHS_ALT})\s+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b(?:,?\s+(20[2-9]\d))?"
)
_DAY_BEFORE_YESTERDAY_RE = re.compile(
    r"\b(day before yesterday|parso|parson)\b|গত পরশু|(?<![\u0980-\u09FF])পরশু|(?<![\u0900-\u097F])परसों"
)
_YESTERDAY_RE = re.compile(
    r"\b(yesterday('?s)?|kal|kalke|gotokal)\b"
    r"|(?<![\u0980-\u09FF])(?:গতকাল|কালকে|কালকের|গতকালের|কাল)"
    r"|(?<![\u0900-\u097F])(?:बीते कल|कल)(?![\u0900-\u097F])"
)
_TODAY_RE = re.compile(
    r"\b(today('?s)?|right now|so far|aaj|aajke|aajker)\b"
    r"|(?<![\u0980-\u09FF])(?:আজ|আজকে|আজকের)"
    r"|(?<![\u0900-\u097F])(?:आज)(?![\u0900-\u097F])"
)
_PREVIOUS_DAY_RE = re.compile(
    r"\b(previous|last|past) (sales|day|business day|operating day)\b|পূর্বের সেলস|আগের সেলস|पिछली बिक्री"
)
# Bengali / Devanagari digits -> ASCII for the relative-date rules below.
_INDIC_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯०१२३४५६७८९", "01234567890123456789")
_WORD_NUMS = {"a": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
_N_DAYS_AGO_RE = re.compile(
    r"\b(\d{1,2}|a|one|two|three|four|five|six)\s+days?\s+ago\b|(\d{1,2})\s*দিন\s*আগে|(\d{1,2})\s*दिन\s*पहले"
)
_N_WEEKS_AGO_RE = re.compile(
    r"\b(\d{1,2}|a|one|two|three|four)\s+weeks?\s+ago\b"
    r"|(\d{1,2})\s*সপ্তাহ\s*আগে|(\d{1,2})\s*(?:हफ्ते|हफ़्ते|सप्ताह)\s*पहले"
)
# Monday=0 .. Sunday=6, matching date.weekday().
_WEEKDAY_NAMES: tuple[tuple[int, str], ...] = (
    (0, r"\bmonday\b|সোমবার|सोमवार"),
    (1, r"\btuesday\b|মঙ্গলবার|मंगलवार"),
    (2, r"\bwednesday\b|বুধবার|बुधवार"),
    (3, r"\bthursday\b|বৃহস্পতিবার|गुरुवार|बृहस्पतिवार"),
    (4, r"\bfriday\b|শুক্রবার|शुक्रवार"),
    (5, r"\bsaturday\b|শনিবার|शनिवार"),
    (6, r"\bsunday\b|রবিবার|রোববার|रविवार"),
)
_EN_WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
_LAST_RE = re.compile(r"\b(last|previous|past)\b|গত|পিছনের|पिछले|पिछला|बीते")
# "this day vs the same weekday two weeks ago" is a comparison anchored on the
# current day, not a request to move the operating date.
_COMPARISON_RE = re.compile(
    r"\b(same (week)?day|same day of the week|week over week|wow|compare|comparison|vs\.?|versus)\b"
    r"|তুলনা|একই দিন|तुलना|इसी दिन|मुकाबले"
)
_FUTURE_RE = re.compile(r"\b(next|coming|upcoming|this coming)\b|আগামী|अगले|आने वाले")


def _resolve_relative_days(query: str, today: date) -> tuple[date, str] | None:
    """'3 days ago', '2 weeks ago', 'last Saturday' (EN / BN / HI).

    A bare weekday ("Saturday's sales") means the most recent one before
    today; a weekday equal to today's only means a week ago when prefixed by
    "last". Future phrasings ("next Saturday") are left alone.
    """
    q = query.lower().translate(_INDIC_DIGITS)
    is_comparison = bool(_COMPARISON_RE.search(q))

    def _n(groups: tuple[str | None, ...]) -> int | None:
        tok = next((g for g in groups if g), None)
        if tok is None:
            return None
        return _WORD_NUMS.get(tok) if not tok.isdigit() else int(tok)

    m = None if is_comparison else _N_DAYS_AGO_RE.search(q)
    if m and (n := _n(m.groups())) and 1 <= n <= 90:
        d = today - timedelta(days=n)
        return d, f"Explicit date {d.isoformat()} ({n} days ago)"
    m = None if is_comparison else _N_WEEKS_AGO_RE.search(q)
    if m and (n := _n(m.groups())) and 1 <= n <= 12:
        d = today - timedelta(weeks=n)
        return d, f"Explicit date {d.isoformat()} ({n} week{'s' if n > 1 else ''} ago, same weekday)"
    if _FUTURE_RE.search(q):
        return None
    for wd, pattern in _WEEKDAY_NAMES:
        if re.search(pattern, q):
            delta = (today.weekday() - wd) % 7
            if delta == 0:
                if not _LAST_RE.search(q):
                    return None  # "Wednesday" on a Wednesday: leave it to "today" handling
                delta = 7
            d = today - timedelta(days=delta)
            return d, f"Explicit date {d.isoformat()} ({_EN_WEEKDAYS[wd]})"
    return None


_VAGUE_SALES_RE = re.compile(
    r"\b(sales|targets?|deficit|recovery|carry-?forward|adjustment|performance|performing|kpis?|collection|momentum|gap|revenue|numbers|figures|status|how (are we|is) .{0,25} doing)\b"
    r"|টার্গেট|সেলস|ঘাটতি|রিকভারি|সমন্বয়|বিক্রি|बিক্রী|কেমন চলছে|অবস্থা"
    r"|बिक्री|सेल्स|टारगेट|लक्ष्य|घाटा|डेफिसिट|रिकवरी|समायोजन|कैसा चल रहा"
)


def ist_today() -> date:
    """Business 'today' in Kolkata. The server may run in UTC (Render), where
    date.today() is still yesterday between 00:00 and 05:30 IST."""
    return datetime.now(_IST).date()


def _explicit_dates(query: str, today: date) -> list[date]:
    """Every explicit calendar date written in the query, in order of appearance."""
    q = query.lower()
    found: list[tuple[int, date]] = []

    def _add(pos: int, y: int, m: int, d: int) -> None:
        try:
            found.append((pos, date(y, m, d)))
        except ValueError:
            pass

    for m in _ISO_RE.finditer(q):
        _add(m.start(), int(m.group(1)), int(m.group(2)), int(m.group(3)))
    for m in _DMY_RE.finditer(q):
        _add(m.start(), int(m.group(3)), int(m.group(2)), int(m.group(1)))
    for m in _DAY_MONTH_RE.finditer(q):
        _add(m.start(), int(m.group(3) or today.year), MONTH_MAP[m.group(2)], int(m.group(1)))
    for m in _MONTH_DAY_RE.finditer(q):
        _add(m.start(), int(m.group(3) or today.year), MONTH_MAP[m.group(1)], int(m.group(2)))

    found.sort(key=lambda t: t[0])
    unique: list[date] = []
    for _, d in found:
        if d not in unique:
            unique.append(d)
    return unique


_YEAR_EXTRACT_RE = re.compile(r"\b(20[2-9]\d)\b")

_NAMED_HOLIDAYS: list[tuple[re.Pattern[str], int, int, str]] = [
    # (pattern, month, day, canonical_name)
    (
        re.compile(
            r"\b(gandhi('?s)? (birthday|jayanti|bday)|mahatma gandhi('?s)? (birthday|jayanti)|gandhi ji('?s)? (birthday|jayanti)|gandhi birthday)\b"
            r"|(?<![\u0980-\u09FF])(?:গান্ধী|গান্ধিজী|গান্ধিজীর)\s*(?:জয়ন্তী|জন্মদিন|জয়ন্তী)"
            r"|(?<![\u0900-\u097F])(?:गांधी|गांधीजी|महात्मा गांधी)\s*(?:जयंती|जन्मदिन)"
        ),
        10, 2, "Mahatma Gandhi's Jayanti / Birthday"
    ),
    (
        re.compile(
            r"\b(netaji('?s)? (birthday|jayanti|bday)|subhash? chandra bose (birthday|jayanti)|parakram diwas)\b"
            r"|(?<![\u0980-\u09FF])(?:নেতাজি|নেতাজির|সুভাষচন্দ্র বসু)\s*(?:জন্মদিন|জয়ন্তী|জয়ন্তী)"
            r"|(?<![\u0900-\u097F])(?:नेताजी|सुभाष चंद्र बोस)\s*(?:जयंती|जन्मदिन)|पराक्रम दिवस"
        ),
        1, 23, "Netaji Subhas Chandra Bose Jayanti"
    ),
    (
        re.compile(r"\brepublic day\b|(?<![\u0980-\u09FF])প্রজাতন্ত্র দিবস|(?<![\u0900-\u097F])गणतंत्र दिवस"),
        1, 26, "Republic Day"
    ),
    (
        re.compile(r"\bindependence day\b|(?<![\u0980-\u09FF])স্বাধীনতা দিবস|(?<![\u0900-\u097F])स्वतंत्रता दिवस"),
        8, 15, "Independence Day"
    ),
    (
        re.compile(
            r"\b(may day|labou?r day|workers?('?s)? day)\b"
            r"|(?<![\u0980-\u09FF])(?:মে দিবস|শ্রমিক দিবস)"
            r"|(?<![\u0900-\u097F])(?:मजदूर दिवस|मई दिवस)"
        ),
        5, 1, "May Day (Labour Day)"
    ),
    (
        re.compile(r"\b(christmas eve|xmas eve)\b|(?<![\u0980-\u09FF])বড়দিনের আগের দিন|(?<![\u0900-\u097F])क्रिसमस की पूर्व संध्या"),
        12, 24, "Christmas Eve"
    ),
    (
        re.compile(r"\b(christmas|xmas)\b|(?<![\u0980-\u09FF])বড়দিন|(?<![\u0900-\u097F])क्रिसमस"),
        12, 25, "Christmas"
    ),
    (
        re.compile(
            r"\b(new year('?s)? eve|31st dec(ember)?|thirty first dec(ember)?)\b"
            r"|(?<![\u0980-\u09FF])(?:থার্টিফার্স্ট|৩১শে ডিসেম্বর|৩১ ডিসেম্বর)"
            r"|(?<![\u0900-\u097F])(?:साल का आखिरी दिन|31 दिसंबर)"
        ),
        12, 31, "New Year's Eve"
    ),
    (
        re.compile(
            r"\b(new year('?s)?( day)?|first (of )?january|1st jan(uary)?)\b"
            r"|(?<![\u0980-\u09FF])(?:নতুন বছর|পয়লা জানুয়ারি|পয়লা জানুয়ারি)"
            r"|(?<![\u0900-\u097F])(?:नया साल|नव वर्ष|1 जनवरी)"
        ),
        1, 1, "New Year's Day"
    ),
    (
        re.compile(
            r"\b(poila|pohela) b(oi|ai)shakh\b|\bbengali new year\b"
            r"|(?<![\u0980-\u09FF])(?:পয়লা বৈশাখ|পহেলা বৈশাখ|বাংলা নববর্ষ)"
            r"|(?<![\u0900-\u097F])(?:पोइला बैशाख|बंगाली नया साल)"
        ),
        4, 15, "Pohela Boishakh"
    ),
    (
        re.compile(
            r"\b(rabindra jayanti|tagore('?s)? (birthday|jayanti))\b"
            r"|(?<![\u0980-\u09FF])(?:রবীন্দ্র জয়ন্তী|রবীন্দ্র জয়ন্তী|রবীন্দ্রনাথের জন্মদিন)"
            r"|(?<![\u0900-\u097F])(?:रवींद्रनाथ टैगोर जयंती|टैगोर जयंती)"
        ),
        5, 9, "Rabindra Jayanti"
    ),
    (
        re.compile(
            r"\b(ambedkar jayanti|b\.?r\.? ambedkar)\b"
            r"|(?<![\u0980-\u09FF])(?:আম্বেদকর জয়ন্তী|আম্বেদকর জয়ন্তী)"
            r"|(?<![\u0900-\u097F])आंबेडकर जयंती"
        ),
        4, 14, "Dr. B. R. Ambedkar's Jayanti"
    ),
]

_VARIABLE_FESTIVALS: list[tuple[re.Pattern[str], str, str]] = [
    (
        re.compile(
            r"\b(durga puja|pujo|dussehra|dasara|vijayadashami|dashami|nabami|navami|ashtami|maha ?ashtami)\b"
            r"|(?<![\u0980-\u09FF])(?:দুর্গা পূজা|দুর্গাপূজা|দশমী|নবমী|অষ্টমী|মহাষ্টমী)"
            r"|(?<![\u0900-\u097F])(?:दशहरा|दुर्गा पूजा|विजयादशमी|महानवमी|महाष्टमी)"
        ),
        "dussehra",
        "Durga Puja (Dussehra)",
    ),
    (
        re.compile(
            r"\b(diwali|deepavali|deepawali|kali puja)\b"
            r"|(?<![\u0980-\u09FF])(?:কালীপূজা|কালী পূজা|দীপাবলি|দিওয়ালি)"
            r"|(?<![\u0900-\u097F])(?:दीपावली|दिवाली|काली पूजा)"
        ),
        "diwali",
        "Diwali (Kali Puja)",
    ),
    (
        re.compile(
            r"\b(holi|dol jatra|dolyatra)\b"
            r"|(?<![\u0980-\u09FF])(?:হোলি|দোলযাত্রা|দোল)"
            r"|(?<![\u0900-\u097F])(?:होली|डोल यात्रा)"
        ),
        "holi",
        "Holi (Dol Jatra)",
    ),
    (
        re.compile(
            r"\b(eid|id ul fitr|eid ul fitr|meethi eid)\b"
            r"|(?<![\u0980-\u09FF])(?:ঈদ|ঈদুল ফিতর)"
            r"|(?<![\u0900-\u097F])(?:ईद|ईद उल फितर)"
        ),
        "id-ul-fitr",
        "Id-ul-Fitr (Eid)",
    ),
]


def _resolve_named_holiday(query: str, today: date) -> tuple[date, str] | None:
    """Resolve a national, state, or festive holiday in query to its exact date."""
    q = query.lower()

    # Determine reference year
    year_match = _YEAR_EXTRACT_RE.search(q)
    target_year = int(year_match.group(1)) if year_match else today.year

    # 1. Fixed national and regional calendar days
    for pat, month, day, label in _NAMED_HOLIDAYS:
        if pat.search(q):
            try:
                resolved = date(target_year, month, day)
                return resolved, f"Explicit holiday/festival: {label} ({resolved.isoformat()})"
            except ValueError:
                pass

    # 2. Variable festive calendar days via West Bengal holidays
    try:
        wb_cal = holidays.country_holidays("IN", subdiv="WB", years=[target_year])
        for pat, key, label in _VARIABLE_FESTIVALS:
            if pat.search(q):
                for h_date, h_name in sorted(wb_cal.items()):
                    if key in h_name.lower():
                        return h_date, f"Explicit holiday/festival: {label} ({h_date.isoformat()})"
    except Exception:
        pass

    return None


_PREV_MONTH_RE = re.compile(
    r"\b(previous|last|past|prior) month('?s)?\b"
    r"|(?<![\u0980-\u09FF])(?:গত মাস|গত মাসের|আগের মাস|পূর্ববর্তী মাস)"
    r"|(?<![\u0900-\u097F])(?:पिछले महीने|पिछले माह|पिछला महीना)"
)

_THIS_MONTH_RE = re.compile(
    r"\b(this|current|present) month('?s)?\b|\bmtd\b"
    r"|(?<![\u0980-\u09FF])(?:চলতি মাস|এই মাসের)"
    r"|(?<![\u0900-\u097F])(?:इस महीने|वर्तमान माह)"
)

_YEAR_TARGET_RE = re.compile(
    r"\b(full|entire|whole|this|current|past|previous|last)\s*(?:year|annual|yearly)\s*(?:sales|summary|summery|report|performance|numbers|figures|to date|total|status|kpis?)\b"
    r"|\b(?:sales|summary|summery|report|performance|numbers|figures|kpis?)\s+(?:for|of|in|to)\s+(?:the\s+)?(?:full\s+|whole\s+|entire\s+|this\s+|current\s+|last\s+|previous\s+)?year\b"
    r"|\bytd\b|\byear to date\b"
    r"|\bannual\s+(?:report|sales|summary|summery|kpis?|performance)\b"
    r"|(?<![\u0980-\u09FF])(?:সারা বছরের|পুরো বছরের|বার্ষিক সেলস|বার্ষিক রিপোর্ট|চলতি বছরের সেলস|বছরের সামারি|বছরের রিপোর্ট)"
    r"|(?<![\u0900-\u097F])(?:पूरे साल|सालाना बिक्री|वार्षिक रिपोर्ट|वार्षिक बिक्री|इस साल की बिक्री|साल का सारांश|साल की रिपोर्ट)"
)


def _resolve_relative_or_named_month(query: str, today: date) -> tuple[date, str] | None:
    """Resolve relative month ('previous month') or specific named month to last day of that month."""
    import calendar
    q = query.lower()

    if _PREV_MONTH_RE.search(q):
        if today.month == 1:
            prev_y, prev_m = today.year - 1, 12
        else:
            prev_y, prev_m = today.year, today.month - 1
        _, last_day = calendar.monthrange(prev_y, prev_m)
        target_d = date(prev_y, prev_m, last_day)
        return target_d, f"Previous month ({target_d.strftime('%B %Y')})"

    if _THIS_MONTH_RE.search(q):
        return today, f"Current month MTD ({today.strftime('%B %Y')})"

    # Check for standalone or named months (e.g. 'October sales summary')
    for m_name, m_idx in MONTH_MAP.items():
        if re.search(rf"\b{m_name}\b", q):
            y_match = _YEAR_EXTRACT_RE.search(q)
            if y_match:
                y = int(y_match.group(1))
            else:
                y = today.year if m_idx <= today.month else today.year - 1
            _, last_day = calendar.monthrange(y, m_idx)
            target_d = date(y, m_idx, last_day)
            return target_d, f"Explicit month ({target_d.strftime('%B %Y')})"

    return None


def _resolve_year_target(query: str, today: date) -> tuple[date, str] | None:
    """Resolve full year / YTD queries to reference date for the requested year."""
    q = query.lower()
    if _YEAR_TARGET_RE.search(q):
        y_match = _YEAR_EXTRACT_RE.search(q)
        target_y = int(y_match.group(1)) if y_match else today.year
        target_d = today if target_y == today.year else date(target_y, 12, 31)
        return target_d, f"Annual / Full Year Summary ({target_y})"
    return None


def resolve_query_target_date(
    db: Database,
    store_code: str,
    query: str,
    default_date: date | None = None,
    fallback_date: date | None = None,
) -> tuple[date, str]:
    """Resolve the operating date a query is about. Returns (date, reason).

    Precedence:
      1. explicit calendar date(s) in the text (with two or more -- a
         "08.10.2026 vs 08.10.2025" comparison -- the latest is the baseline);
      2. explicit named holidays/festivals (Gandhi birthday, Republic Day, Christmas, etc.);
      3. relative or named month ("previous month", "October sales", "this month");
      4. full year / annual summary queries;
      5. "N days/weeks ago", "last Saturday", then day before yesterday /
         yesterday, relative to `default_date`;
      6. an explicit "today" -- honoured even when nothing is logged yet, the
         caller reports that instead of silently showing another day;
      7. "previous/last day" -> latest recorded day before today;
      8. `fallback_date` -- the date the previous turn in this conversation was
         explicitly about, so follow-ups ("and footfall?") stay on that date;
      9. a vague sales/performance question while today has no bills yet ->
         latest recorded day (the reason string says so);
      10. today.
    `default_date` is the caller's "today" (route: IST today).
    """
    today = default_date or ist_today()
    q_lower = query.lower()

    dates = _explicit_dates(query, today)
    if len(dates) == 1:
        return dates[0], f"Explicit date {dates[0].isoformat()}"
    if len(dates) > 1:
        latest = max(dates)
        return latest, f"Explicit date {latest.isoformat()} (latest of {len(dates)} dates compared)"

    holiday_hit = _resolve_named_holiday(query, today)
    if holiday_hit is not None:
        return holiday_hit

    month_hit = _resolve_relative_or_named_month(query, today)
    if month_hit is not None:
        return month_hit

    year_hit = _resolve_year_target(query, today)
    if year_hit is not None:
        return year_hit

    relative_hit = _resolve_relative_days(query, today)
    if relative_hit is not None:
        return relative_hit

    if _DAY_BEFORE_YESTERDAY_RE.search(q_lower):
        return today - timedelta(days=2), "Day before yesterday (2 days ago)"

    if _YESTERDAY_RE.search(q_lower):
        return today - timedelta(days=1), "Yesterday"

    if _TODAY_RE.search(q_lower):
        return today, "Today (explicitly requested)"

    if _PREVIOUS_DAY_RE.search(q_lower):
        latest = get_latest_recorded_date(db, store_code, bills_only=True, before_date=today - timedelta(days=1))
        if latest:
            return latest, f"Latest completed business day ({latest.isoformat()})"
        return today - timedelta(days=1), "Previous operating day"

    if fallback_date is not None:
        return fallback_date, f"Carried over from the previous question ({fallback_date.isoformat()})"

    if _VAGUE_SALES_RE.search(q_lower):
        today_iso = today.isoformat()
        query_filter = {"entry_date": today_iso} if store_code == "ALL" else {"entry_date": today_iso, "store_code": store_code}
        if db[BILLS].count_documents(query_filter) == 0:
            latest = get_latest_recorded_date(db, store_code, bills_only=True, before_date=today - timedelta(days=1))
            if latest:
                return latest, f"No bills logged yet on {today_iso}; showing latest recorded day ({latest.isoformat()})"

    return today, "Current date"


def is_explicit_date_reason(reason: str) -> bool:
    """True when the user named the date themselves (eligible for follow-up carry-over)."""
    return reason.startswith((
        "Explicit date",
        "Explicit holiday",
        "Explicit month",
        "Previous month",
        "Current month",
        "Annual / Full Year",
        "Yesterday",
        "Day before yesterday",
        "Latest completed",
        "Carried over",
    ))


def get_exact_day_granular_kpis(
    db: Database,
    store_code: str,
    query_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Fetch exhaustive KPIs + 4 intra-day time slots + top bills for a specific date."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {
            "error": "ACCESS_DENIED",
            "message": f"Access Restricted: You are authorized only for store '{sec_ctx.store_code}'.",
            "authorized_store": sec_ctx.store_code,
        }

    try:
        details = daily_dashboard_store.get_history_details(db, target_store, query_date)
        kpis = details.get("kpis") or {}
        timeslot_list = details.get("timeslot_breakdown") or []
        timeslot_dict = {
            item.get("time_slot"): item
            for item in timeslot_list
            if isinstance(item, dict) and item.get("time_slot")
        }
        bill_logs = details.get("bill_logs") or []

        # Find peak slot by sales
        peak_slot = max(
            TIME_SLOT_ORDER,
            key=lambda s: float(timeslot_dict.get(s, {}).get("net_sales") or 0.0),
        )
        peak_sales = float(timeslot_dict.get(peak_slot, {}).get("net_sales") or 0.0)

        # Largest bill
        largest_bill = max(
            (float(b.get("net_amount") or 0.0) for b in bill_logs),
            default=0.0,
        )

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "date": query_date.isoformat(),
            "day_name": query_date.strftime("%A"),
            "kpis": {
                "net_sales": float(kpis.get("net_sales") or 0.0),
                "sales_target": float(kpis.get("sales_target") or 0.0),
                "achievement_pct": float(kpis.get("achievement_pct") or 0.0),
                "target_gap": max(0.0, float(kpis.get("sales_target") or 0.0) - float(kpis.get("net_sales") or 0.0)),
                "footfall": int(kpis.get("footfall") or 0),
                "nob": int(kpis.get("nob") or 0),
                "conversion_pct": float(kpis.get("conversion_pct") or 0.0),
                "atv": float(kpis.get("atv") or 0.0),
                "rpv": float(kpis.get("rpv") or 0.0),
                "basket_size": float(kpis.get("basket_size") or 0.0),
            },
            "peak_slot": {
                "slot": peak_slot,
                "net_sales": peak_sales,
                "share_pct": (peak_sales / float(kpis.get("net_sales") or 1.0) * 100) if float(kpis.get("net_sales") or 0.0) > 0 else 0.0,
            },
            "timeslot_breakdown": {
                slot: {
                    "net_sales": float(timeslot_dict.get(slot, {}).get("net_sales") or 0.0),
                    "bills": int(timeslot_dict.get(slot, {}).get("bill_count") or timeslot_dict.get(slot, {}).get("nob") or 0),
                    "footfall": int(timeslot_dict.get(slot, {}).get("footfall") or 0),
                    "atv": float(timeslot_dict.get(slot, {}).get("atv") or 0.0),
                    "conversion_pct": float(timeslot_dict.get(slot, {}).get("conversion_pct") or 0.0),
                }
                for slot in TIME_SLOT_ORDER
            },
            "largest_bill": largest_bill,
            "total_bills_recorded": len(bill_logs),
            "has_records": bool(
                bill_logs or details.get("footfall_logs") or details.get("nob_logs")
                or float(kpis.get("net_sales") or 0.0) > 0
            ),
        }
    except Exception as e:
        logger.error("Error fetching exact day granular KPIs for %s on %s: %s", target_store, query_date, e)
        return {"error": str(e), "store_code": target_store, "date": query_date.isoformat()}


def get_recent_daily_history_table(
    db: Database,
    store_code: str,
    days: int = 7,
    sec_ctx: SecurityContext = None,
    as_of: date | None = None,
) -> dict[str, Any]:
    """Fetch day-by-day table of the N most recent operating days on/before
    `as_of` (no upper bound when None), with totals and daily averages."""
    target_store = store_code.strip().upper()
    if sec_ctx and not sec_ctx.check_store_access(target_store):
        return {
            "error": "ACCESS_DENIED",
            "message": f"Access Restricted: You are authorized only for store '{sec_ctx.store_code}'.",
        }

    try:
        all_history = daily_dashboard_store.list_all_history_dates(db, target_store)
        # Filter only days that have net_sales > 0 or bills > 0
        cutoff = as_of.isoformat() if as_of else None
        recorded_days = [
            row for row in all_history
            if ((row.get("net_sales") or 0.0) > 0 or (row.get("nob") or 0) > 0)
            and (cutoff is None or (row.get("date") or "") <= cutoff)
        ]
        slice_days = recorded_days[:days]

        if not slice_days:
            return {
                "store_code": target_store,
                "days_requested": days,
                "days_found": 0,
                "rows": [],
                "totals": {},
                "averages": {},
            }

        total_sales = sum(float(r.get("net_sales") or 0.0) for r in slice_days)
        total_targets = sum(float(r.get("sales_target") or 0.0) for r in slice_days)
        total_footfall = sum(int(r.get("footfall") or 0) for r in slice_days)
        total_bills = sum(int(r.get("nob") or 0) for r in slice_days)
        n = len(slice_days)

        avg_sales = total_sales / n if n > 0 else 0.0
        avg_target = total_targets / n if n > 0 else 0.0
        avg_footfall = total_footfall / n if n > 0 else 0.0
        avg_bills = total_bills / n if n > 0 else 0.0
        overall_conversion = (total_bills / total_footfall * 100) if total_footfall > 0 else 0.0
        overall_atv = (total_sales / total_bills) if total_bills > 0 else 0.0
        overall_ach = (total_sales / total_targets * 100) if total_targets > 0 else 0.0

        rows = []
        for r in slice_days:
            rows.append({
                "date": r.get("date"),
                "day_name": r.get("day_name"),
                "net_sales": float(r.get("net_sales") or 0.0),
                "sales_target": float(r.get("sales_target") or 0.0),
                "achievement_pct": float(r.get("achievement_pct") or 0.0),
                "footfall": int(r.get("footfall") or 0),
                "bills": int(r.get("nob") or 0),
                "conversion_pct": float(r.get("conversion_pct") or 0.0),
                "atv": float(r.get("atv") or 0.0),
            })

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "days_requested": days,
            "days_found": n,
            "rows": rows,
            "totals": {
                "net_sales": total_sales,
                "sales_target": total_targets,
                "footfall": total_footfall,
                "bills": total_bills,
                "achievement_pct": overall_ach,
            },
            "averages": {
                "daily_sales": avg_sales,
                "daily_target": avg_target,
                "daily_footfall": avg_footfall,
                "daily_bills": avg_bills,
                "conversion_pct": overall_conversion,
                "atv": overall_atv,
            },
        }
    except Exception as e:
        logger.error("Error fetching recent daily history table for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def get_month_to_date_granular_summary(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Calculate Month-To-Date (MTD) cumulative sales, target pacing, and daily required run-rates."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {
            "error": "ACCESS_DENIED",
            "message": f"Access Restricted: You are authorized only for store '{sec_ctx.store_code}'.",
        }

    first_day_of_month = target_date.replace(day=1)
    # Total days in target month
    if target_date.month == 12:
        next_month = target_date.replace(year=target_date.year + 1, month=1, day=1)
    else:
        next_month = target_date.replace(month=target_date.month + 1, day=1)
    total_days_in_month = (next_month - first_day_of_month).days

    curr_today = ist_today()
    is_completed = (target_date.year < curr_today.year) or (
        target_date.year == curr_today.year and target_date.month < curr_today.month
    )
    if is_completed:
        days_elapsed = total_days_in_month
        days_remaining = 0
    else:
        days_elapsed = min(target_date.day, total_days_in_month)
        days_remaining = max(0, total_days_in_month - days_elapsed)

    try:
        all_history = daily_dashboard_store.list_all_history_dates(db, target_store)
        month_prefix = f"{target_date.year:04d}-{target_date.month:02d}"
        
        mtd_rows = [
            r for r in all_history
            if r.get("date", "").startswith(month_prefix) and (is_completed or r.get("date", "") <= target_date.isoformat())
        ]

        mtd_sales = sum(float(r.get("net_sales") or 0.0) for r in mtd_rows)
        mtd_target = sum(float(r.get("sales_target") or 0.0) for r in mtd_rows)
        mtd_footfall = sum(int(r.get("footfall") or 0) for r in mtd_rows)
        mtd_bills = sum(int(r.get("nob") or 0) for r in mtd_rows)
        active_days = len(mtd_rows)

        avg_daily_sales = mtd_sales / active_days if active_days > 0 else 0.0
        ach_pct = (mtd_sales / mtd_target * 100) if mtd_target > 0 else 0.0
        gap = max(0.0, mtd_target - mtd_sales)
        required_daily_run_rate = (gap / days_remaining) if days_remaining > 0 else 0.0

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "month_name": target_date.strftime("%B %Y"),
            "as_of_date": target_date.isoformat(),
            "is_completed": is_completed,
            "days_elapsed": days_elapsed,
            "days_remaining": days_remaining,
            "active_operating_days": active_days,
            "mtd_sales": mtd_sales,
            "mtd_target": mtd_target,
            "achievement_pct": ach_pct,
            "target_gap": gap,
            "avg_daily_sales": avg_daily_sales,
            "required_daily_run_rate": required_daily_run_rate,
            "mtd_footfall": mtd_footfall,
            "mtd_bills": mtd_bills,
            "mtd_atv": (mtd_sales / mtd_bills) if mtd_bills > 0 else 0.0,
            "mtd_conversion": (mtd_bills / mtd_footfall * 100) if mtd_footfall > 0 else 0.0,
        }
    except Exception as e:
        logger.error("Error calculating MTD summary for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def get_year_to_date_granular_summary(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Calculate annual YTD consolidated totals and month-by-month breakdown."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {
            "error": "ACCESS_DENIED",
            "message": f"Access Restricted: You are authorized only for store '{sec_ctx.store_code}'.",
        }

    target_year = target_date.year
    year_prefix = f"{target_year:04d}"

    try:
        all_history = daily_dashboard_store.list_all_history_dates(db, target_store)
        ytd_rows = [
            r for r in all_history
            if r.get("date", "").startswith(year_prefix) and r.get("date", "") <= target_date.isoformat()
        ]

        if not ytd_rows:
            return {
                "store_code": target_store,
                "store_name": store_label(target_store),
                "year": target_year,
                "has_records": False,
                "message": f"No sales records found for year {target_year}.",
            }

        # Monthly breakdown
        from collections import defaultdict
        month_buckets: dict[str, list[dict]] = defaultdict(list)
        for r in ytd_rows:
            m_key = r.get("date", "")[:7]
            month_buckets[m_key].append(r)

        monthly_breakdown = []
        for m_key in sorted(month_buckets.keys()):
            rows = month_buckets[m_key]
            m_date = date.fromisoformat(f"{m_key}-01")
            m_sales = sum(float(x.get("net_sales") or 0.0) for x in rows)
            m_target = sum(float(x.get("sales_target") or 0.0) for x in rows)
            m_ff = sum(int(x.get("footfall") or 0) for x in rows)
            m_bills = sum(int(x.get("nob") or 0) for x in rows)
            m_ach = (m_sales / m_target * 100) if m_target > 0 else 0.0
            m_atv = (m_sales / m_bills) if m_bills > 0 else 0.0
            m_conv = (m_bills / m_ff * 100) if m_ff > 0 else 0.0
            monthly_breakdown.append({
                "month_key": m_key,
                "month_name": m_date.strftime("%B %Y"),
                "net_sales": m_sales,
                "sales_target": m_target,
                "achievement_pct": m_ach,
                "footfall": m_ff,
                "bills": m_bills,
                "atv": m_atv,
                "conversion_pct": m_conv,
                "active_days": len(rows),
            })

        total_sales = sum(m["net_sales"] for m in monthly_breakdown)
        total_target = sum(m["sales_target"] for m in monthly_breakdown)
        total_ff = sum(m["footfall"] for m in monthly_breakdown)
        total_bills = sum(m["bills"] for m in monthly_breakdown)
        total_active_days = sum(m["active_days"] for m in monthly_breakdown)
        total_ach = (total_sales / total_target * 100) if total_target > 0 else 0.0
        overall_atv = (total_sales / total_bills) if total_bills > 0 else 0.0
        overall_conv = (total_bills / total_ff * 100) if total_ff > 0 else 0.0
        best_month = max(monthly_breakdown, key=lambda m: m["net_sales"]) if monthly_breakdown else None

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "year": target_year,
            "as_of_date": target_date.isoformat(),
            "has_records": True,
            "total_sales": total_sales,
            "total_target": total_target,
            "achievement_pct": total_ach,
            "total_gap": max(0.0, total_target - total_sales),
            "total_footfall": total_ff,
            "total_bills": total_bills,
            "overall_atv": overall_atv,
            "overall_conversion": overall_conv,
            "total_active_days": total_active_days,
            "best_month": best_month,
            "monthly_breakdown": monthly_breakdown,
        }
    except Exception as e:
        logger.error("Error calculating YTD annual summary for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def get_best_and_worst_days_in_month(
    db: Database,
    store_code: str,
    target_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Find peak highest sales day and lowest dip day for the store in the given month."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {"error": "ACCESS_DENIED", "message": f"Access Restricted to store {sec_ctx.store_code}."}

    month_prefix = f"{target_date.year:04d}-{target_date.month:02d}"
    try:
        all_history = daily_dashboard_store.list_all_history_dates(db, target_store)
        month_rows = [
            r for r in all_history
            if r.get("date", "").startswith(month_prefix) and (float(r.get("net_sales") or 0.0) > 0)
        ]

        if not month_rows:
            return {"store_code": target_store, "month": month_prefix, "message": "No sales records found for this month."}

        best_day = max(month_rows, key=lambda r: float(r.get("net_sales") or 0.0))
        worst_day = min(month_rows, key=lambda r: float(r.get("net_sales") or 0.0))

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "month": target_date.strftime("%B %Y"),
            "best_day": {
                "date": best_day.get("date"),
                "day_name": best_day.get("day_name"),
                "net_sales": float(best_day.get("net_sales") or 0.0),
                "sales_target": float(best_day.get("sales_target") or 0.0),
                "achievement_pct": float(best_day.get("achievement_pct") or 0.0),
                "bills": int(best_day.get("nob") or 0),
                "footfall": int(best_day.get("footfall") or 0),
                "atv": float(best_day.get("atv") or 0.0),
            },
            "worst_day": {
                "date": worst_day.get("date"),
                "day_name": worst_day.get("day_name"),
                "net_sales": float(worst_day.get("net_sales") or 0.0),
                "sales_target": float(worst_day.get("sales_target") or 0.0),
                "achievement_pct": float(worst_day.get("achievement_pct") or 0.0),
                "bills": int(worst_day.get("nob") or 0),
                "footfall": int(worst_day.get("footfall") or 0),
                "atv": float(worst_day.get("atv") or 0.0),
            },
        }
    except Exception as e:
        logger.error("Error finding peak/dip days for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}


def compare_same_day_prior_weeks(
    db: Database,
    store_code: str,
    query_date: date,
    sec_ctx: SecurityContext,
) -> dict[str, Any]:
    """Compare a given day with the same day of the week 1 week and 2 weeks prior (WoW)."""
    target_store = store_code.strip().upper()
    if not sec_ctx.check_store_access(target_store):
        return {"error": "ACCESS_DENIED", "message": f"Access Restricted to store {sec_ctx.store_code}."}

    d1 = query_date
    d2 = query_date - timedelta(days=7)
    d3 = query_date - timedelta(days=14)

    try:
        def fetch_day(d: date) -> dict[str, Any]:
            kpis = store_kpis(db, target_store, d)
            return {
                "date": d.isoformat(),
                "day_name": d.strftime("%A"),
                "net_sales": float(kpis.get("net_sales") or 0.0),
                "sales_target": float(kpis.get("sales_target") or 0.0),
                "achievement_pct": float(kpis.get("achievement_pct") or 0.0),
                "footfall": int(kpis.get("footfall") or 0),
                "bills": int(kpis.get("nob") or 0),
                "atv": float(kpis.get("atv") or 0.0),
            }

        curr = fetch_day(d1)
        prev_1w = fetch_day(d2)
        prev_2w = fetch_day(d3)

        s_curr = curr["net_sales"]
        s_prev = prev_1w["net_sales"]
        wow_growth = ((s_curr - s_prev) / s_prev * 100) if s_prev > 0 else None

        return {
            "store_code": target_store,
            "store_name": store_label(target_store),
            "current_day": curr,
            "prior_week_same_day": prev_1w,
            "two_weeks_prior_same_day": prev_2w,
            "wow_growth_pct": wow_growth,
        }
    except Exception as e:
        logger.error("Error computing WoW comparison for %s: %s", target_store, e)
        return {"error": str(e), "store_code": target_store}
