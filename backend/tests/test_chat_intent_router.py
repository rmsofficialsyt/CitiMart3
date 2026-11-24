"""LLM intent-router fallback (src/chat/intent_router.py) and the relative-date
rules added to history_tools.resolve_query_target_date. No network: the
model call is monkeypatched."""
from __future__ import annotations

from datetime import date
import json

from google.genai import types
import pytest

from src.chat import intent_router
from src.chat.coordinator import run_copilot_turn
from src.chat.intent import detect_intent
from src.chat.memory import MESSAGES_COLLECTION
from src.chat.tools.history_tools import _resolve_relative_days, is_explicit_date_reason
from tests.test_chat_intent import TODAY, _ctx, mock_db  # noqa: F401 - mock_db is a fixture

UNMATCHED = "how have things been going over the fortnight for us"


def _fake_router(payload, calls=None):
    def fake(**kwargs):
        if calls is not None:
            calls.append(kwargs)
        return payload if isinstance(payload, str) else json.dumps(payload)
    return fake


def test_query_really_is_unmatched_by_regex():
    r = detect_intent(UNMATCHED)
    assert (r.matched, r.source, r.primary) == (False, "default", "day_kpis")


def test_schema_is_valid_gemini_schema():
    schema = types.Schema.model_validate(intent_router.INTENT_SCHEMA)
    assert "history_n_days" in schema.properties["intent"].enum
    assert "timeslot" not in schema.properties["intent"].enum


def test_regex_match_never_calls_the_model(monkeypatch):
    calls = []
    monkeypatch.setattr(intent_router, "generate_llm_response", _fake_router({"intent": "mtd"}, calls))
    q = "Show the past 5 days sales table"
    assert intent_router.route_intent(q, detect_intent(q)).primary == "history_n_days"
    assert calls == []


def test_unmatched_query_uses_structured_llm_intent(monkeypatch):
    calls = []
    monkeypatch.setattr(intent_router, "generate_llm_response",
                        _fake_router({"intent": "history_n_days", "history_days": 14, "window_days": 30}, calls))
    r = intent_router.route_intent(UNMATCHED, detect_intent(UNMATCHED))
    assert (r.primary, r.history_days, r.window_days, r.source) == ("history_n_days", 14, None, "llm")
    assert calls[0]["response_schema"] is intent_router.INTENT_SCHEMA
    assert calls[0]["temperature"] == 0.0


@pytest.mark.parametrize("bad", ["not json", json.dumps({"intent": "delete_everything"}), json.dumps([1, 2]), ""])
def test_invalid_router_output_keeps_default(monkeypatch, bad):
    monkeypatch.setattr(intent_router, "generate_llm_response", _fake_router(bad))
    r = intent_router.route_intent(UNMATCHED, detect_intent(UNMATCHED))
    assert (r.primary, r.source) == ("day_kpis", "default")


def test_out_of_range_numbers_are_dropped(monkeypatch):
    monkeypatch.setattr(intent_router, "generate_llm_response",
                        _fake_router({"intent": "target_simulate", "window_days": 9, "history_days": 500}))
    r = intent_router.route_intent(UNMATCHED, detect_intent(UNMATCHED))
    assert (r.primary, r.window_days, r.history_days) == ("target_simulate", None, None)


def test_one_word_and_disabled_flag_skip_the_model(monkeypatch):
    calls = []
    monkeypatch.setattr(intent_router, "generate_llm_response", _fake_router({"intent": "mtd"}, calls))
    intent_router.route_intent("ok", detect_intent("ok"))
    monkeypatch.setattr(intent_router.env, "chat_llm_intent_fallback", False)
    intent_router.route_intent(UNMATCHED, detect_intent(UNMATCHED))
    assert calls == []


def test_routed_intent_drives_the_data_fetched(mock_db, monkeypatch):
    monkeypatch.setattr(intent_router, "generate_llm_response",
                        _fake_router({"intent": "history_n_days", "history_days": 3}))
    resp = run_copilot_turn(db=mock_db, query=UNMATCHED, sec_ctx=_ctx("NM"), target_date=TODAY, language="en")
    meta = mock_db[MESSAGES_COLLECTION].find_one(
        {"session_id": resp.session_id, "role": "assistant"})["metadata"]
    assert (meta["intent"], meta["intent_source"]) == ("history_n_days", "llm")
    # The 3-day table: 2026-11-16..18 net sales.
    for figure in ("330,000", "320,000", "310,000"):
        assert figure in resp.reply


# --- relative dates ---------------------------------------------------------------------

WED = date(2026, 11, 18)


@pytest.mark.parametrize("query,expected", [
    ("sales last Saturday", date(2026, 11, 14)),
    ("Saturday's sales", date(2026, 11, 14)),
    ("how did Saturday do against target", date(2026, 11, 14)),
    ("last wednesday", date(2026, 11, 11)),
    ("net sales 3 days ago", date(2026, 11, 15)),
    ("a week ago", date(2026, 11, 11)),
    ("two weeks ago", date(2026, 11, 4)),
    ("গত শনিবারের সেলস", date(2026, 11, 14)),
    ("৩ দিন আগে বিক্রি", date(2026, 11, 15)),
    ("पिछले शनिवार की बिक्री", date(2026, 11, 14)),
    ("2 हफ्ते पहले", date(2026, 11, 4)),
])
def test_relative_dates_resolve(query, expected):
    hit = _resolve_relative_days(query, WED)
    assert hit is not None and hit[0] == expected
    assert is_explicit_date_reason(hit[1])  # follow-ups keep this date


@pytest.mark.parametrize("query", [
    "Wednesday sales",                       # today's weekday without "last": today handling
    "next Saturday plan",                    # future
    "same weekday last week and two weeks ago",  # WoW comparison stays anchored on today
    "Show today's sales",
])
def test_relative_dates_leave_other_queries_alone(query):
    assert _resolve_relative_days(query, WED) is None
