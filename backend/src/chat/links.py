"""Navigation links, source links and follow-up suggestions for a Co-Pilot reply.

Everything here is deterministic and built from what the turn already
resolved (intent, store, date, the sub-agents' data) -- the model never writes
a link, so it cannot invent one. App hrefs use the SPA's URL scheme
(`/app?store=&view=&date=`, see frontend/src/lib/appLinks.ts); the frontend
still applies its own role guards when it opens one, and every API behind the
page re-checks access, so a link is a convenience, never an authorisation.
"""
from __future__ import annotations

from datetime import date
from typing import Any
from urllib.parse import urlencode, urlparse

from config.settings import STORE_CODE_TO_NAME
from src.chat.state import SecurityContext

MAX_SOURCES = 3
_LABEL_MAX = 70
# Web-search hosts that are placeholders, not real pages (web_tools' offline fallback).
_BLOCKED_SOURCE_HOSTS = frozenset({"citimart.internal"})

# Intents whose answer is about one store's recorded day(s).
_DATA_INTENTS = frozenset({
    "day_kpis", "timeslot", "history_n_days", "mtd", "year_summary", "peak_dip",
    "wow", "yoy", "bills", "target_adjust", "target_simulate",
})


def _store_id(store_code: str) -> str:
    code = (store_code or "").strip().upper()
    return "overall" if code == "ALL" else code.lower()


def app_href(store_code: str, view: str, day: date | None = None) -> str:
    params = {"store": _store_id(store_code), "view": view}
    if day is not None:
        params["date"] = day.isoformat()
    return "/app?" + urlencode(params)


def _store_name(store_code: str) -> str:
    code = (store_code or "").upper()
    return "All Stores" if code == "ALL" else STORE_CODE_TO_NAME.get(code, code)


def _web_results(subagent_data: dict[str, Any]) -> list[dict[str, Any]]:
    market = subagent_data.get("market_intel_agent")
    if not isinstance(market, dict):
        return []
    out: list[dict[str, Any]] = []
    for key in ("weather_signals", "festival_signals"):
        if isinstance(market.get(key), list):
            out.extend(market[key])
    signals = market.get("market_signals")
    if isinstance(signals, dict) and isinstance(signals.get("signals"), list):
        out.extend(signals["signals"])
    return [r for r in out if isinstance(r, dict)]


def _source_links(subagent_data: dict[str, Any]) -> list[dict[str, str]]:
    links: list[dict[str, str]] = []
    seen: set[str] = set()
    for r in _web_results(subagent_data):
        url = str(r.get("url") or "").strip()
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            continue
        if parsed.hostname in _BLOCKED_SOURCE_HOSTS or url in seen:
            continue
        seen.add(url)
        label = str(r.get("title") or parsed.hostname).strip() or parsed.hostname
        if len(label) > _LABEL_MAX:
            label = label[: _LABEL_MAX - 1].rstrip() + "…"
        links.append({"kind": "source", "label": label, "href": url})
        if len(links) >= MAX_SOURCES:
            break
    return links


def build_links(
    intent: str,
    active_store: str,
    active_date: date,
    sec_ctx: SecurityContext,
    subagent_data: dict[str, Any],
    today: date,
) -> list[dict[str, str]]:
    """App navigation chips plus external sources for one reply."""
    store = (active_store or "").strip().upper()
    # Never hand a manager a link to a store they cannot open.
    if not sec_ctx.is_admin:
        store = (sec_ctx.store_code or "").strip().upper()
    if store != "ALL" and store not in STORE_CODE_TO_NAME:
        return _source_links(subagent_data)

    links: list[dict[str, str]] = []

    def add(label: str, href: str) -> None:
        if all(link["href"] != href for link in links):
            links.append({"kind": "app", "label": label, "href": href})

    name = _store_name(store)
    if intent in _DATA_INTENTS:
        add(f"History · {name} · {active_date.isoformat()}", app_href(store, "history", active_date))
        if active_date == today:
            add(f"Live Dashboard · {name}", app_href(store, "dashboard"))
    if intent in ("mtd", "target_adjust", "target_simulate") and sec_ctx.is_admin and store != "ALL":
        add(f"Sales Target · {name}", app_href(store, "target"))
    if intent == "requisitions":
        add(f"Requisitions · {name}", app_href(store, "requisition"))
    if intent == "ranking" and sec_ctx.is_admin:
        add("Overall Stores Summary", app_href("ALL", "dashboard"))

    return links + _source_links(subagent_data)


_SUGGESTIONS: dict[str, dict[str, list[str]]] = {
    "day_kpis": {
        "en": ["Compare with the same day last week", "Show the past 7 days", "Tips to improve conversion"],
        "bn": ["গত সপ্তাহের একই দিনের সাথে তুলনা করো", "গত ৭ দিনের বিক্রি দেখাও", "কনভার্সন বাড়ানোর উপায়"],
        "hi": ["पिछले हफ्ते के इसी दिन से तुलना करो", "पिछले 7 दिन की बिक्री दिखाओ", "कन्वर्शन बढ़ाने के उपाय"],
    },
    "history_n_days": {
        "en": ["Best and worst day this month", "Month-to-date pacing", "Show the past 14 days"],
        "bn": ["এই মাসের সেরা ও সবচেয়ে খারাপ দিন", "মাসের শুরু থেকে এখন পর্যন্ত বিক্রি", "গত ১৪ দিনের বিক্রি দেখাও"],
        "hi": ["इस महीने का सबसे अच्छा और सबसे खराब दिन", "महीने की अब तक की बिक्री", "पिछले 14 दिन की बिक्री दिखाओ"],
    },
    "mtd": {
        "en": ["Best and worst day this month", "Spread the shortfall over 14 days", "Show the past 7 days"],
        "bn": ["এই মাসের সেরা ও সবচেয়ে খারাপ দিন", "ঘাটতি ১৪ দিনে ভাগ করো", "গত ৭ দিনের বিক্রি দেখাও"],
        "hi": ["इस महीने का सबसे अच्छा और सबसे खराब दिन", "कमी को 14 दिनों में बाँटो", "पिछले 7 दिन की बिक्री दिखाओ"],
    },
    "target_adjust": {
        "en": ["Compare 7 vs 14 vs 30-day recovery", "Month-to-date pacing"],
        "bn": ["৭, ১৪ ও ৩০ দিনের রিকভারি তুলনা করো", "মাসের শুরু থেকে এখন পর্যন্ত বিক্রি"],
        "hi": ["7, 14 और 30 दिन की रिकवरी की तुलना करो", "महीने की अब तक की बिक्री"],
    },
    "target_simulate": {
        "en": ["Month-to-date pacing", "Tips to close the target gap"],
        "bn": ["মাসের শুরু থেকে এখন পর্যন্ত বিক্রি", "টার্গেট ঘাটতি পূরণের উপায়"],
        "hi": ["महीने की अब तक की बिक्री", "टारगेट की कमी पूरी करने के उपाय"],
    },
    "peak_dip": {
        "en": ["Show the past 7 days", "Month-to-date pacing"],
        "bn": ["গত ৭ দিনের বিক্রি দেখাও", "মাসের শুরু থেকে এখন পর্যন্ত বিক্রি"],
        "hi": ["पिछले 7 दिन की बिक्री दिखाओ", "महीने की अब तक की बिक्री"],
    },
    "weather": {
        "en": ["Peak-hour preparation tips", "Upcoming festivals in Kolkata"],
        "bn": ["পিক আওয়ারের প্রস্তুতির উপায়", "কলকাতার আসন্ন উৎসব"],
        "hi": ["पीक ऑवर की तैयारी के उपाय", "कोलकाता के आने वाले त्योहार"],
    },
    "coaching": {
        "en": ["Show today's sales report", "Peak-hour preparation tips"],
        "bn": ["আজকের সেলস রিপোর্ট দেখাও", "পিক আওয়ারের প্রস্তুতির উপায়"],
        "hi": ["आज की बिक्री रिपोर्ट दिखाओ", "पीक ऑवर की तैयारी के उपाय"],
    },
}


def follow_up_suggestions(intent: str, language: str) -> list[str]:
    """Short, clickable next questions for this intent, in the chat language."""
    by_lang = _SUGGESTIONS.get(intent)
    if not by_lang:
        return []
    return list(by_lang.get(language, by_lang["en"]))
