"""Grounding tests for the Co-Pilot's LLM step (no network, no real model).

Covers the context-engineering fact sheet (`src/chat/context_builder.py`),
the post-generation numeric verifier (`AntiHallucinationHook.find_ungrounded_numbers`),
and the client's thinking-budget / truncation / history-tagging behaviour.
"""
from __future__ import annotations

from config.env import env
from src.chat import client as chat_client
from src.chat.context_builder import NA, allowed_numbers, build_fact_sheet, inr
from src.chat.coordinator import run_copilot_turn
from src.chat.hooks.anti_hallucination_hook import AntiHallucinationHook
from tests.test_chat_intent import TODAY, _ctx, mock_db  # noqa: F401 - mock_db is a fixture

find_bad = AntiHallucinationHook.find_ungrounded_numbers


# --- fact sheet -----------------------------------------------------------------------

def test_inr_uses_indian_grouping():
    assert inr(999) == "₹999.00"
    assert inr(124500.5) == "₹1,24,500.50"
    assert inr(12345678) == "₹1,23,45,678.00"
    assert inr(-1500) == "-₹1,500.00"


def test_fact_sheet_marks_unset_target_and_zero_denominators_not_available():
    data = {"db_ops_agent": {"exact_day_kpis": {"kpis": {
        "net_sales": 50000.0, "sales_target": 0.0, "achievement_pct": 0.0, "target_gap": 0.0,
        "footfall": 0, "nob": 0, "conversion_pct": 0.0, "atv": 0.0, "rpv": 0.0, "basket_size": 0.0,
    }}}}
    sheet = build_fact_sheet(data)
    head, _, body = sheet.partition("\n\n")
    assert head.startswith("NOT AVAILABLE")
    for key in ("achievement_pct", "sales_target", "conversion_pct", "atv", "rpv", "basket_size"):
        assert f".{key} = {NA}" in head, key
    assert "net_sales = ₹50,000.00" in body
    # A 0.0 that means "not computable" must not be offered as a valid figure.
    assert "achievement_pct = 0.0%" not in sheet


def test_fact_sheet_formats_units_status_and_derived_values():
    data = {"db_ops_agent": {"exact_day_kpis": {"kpis": {
        "net_sales": 270000.0, "sales_target": 300000.0, "achievement_pct": 90.0,
        "footfall": 600, "nob": 250, "conversion_pct": 41.6667, "atv": 1080.0,
    }}}}
    sheet = build_fact_sheet(data)
    assert "achievement_pct = 90.0%" in sheet
    assert "achievement_pct_status = " in sheet
    assert "atv = ₹1,080.00" in sheet
    assert "conversion_pct = 41.7%" in sheet
    assert "remaining_signed = ₹30,000.00" in sheet
    assert "remaining_pct = 10.0%" in sheet


def test_fact_sheet_reports_tool_errors():
    sheet = build_fact_sheet({"db_ops_agent": {"bills": {"error": "ACCESS_DENIED", "message": "restricted"}}})
    assert f"db_ops_agent.bills = {NA} (restricted)" in sheet


def test_fact_sheet_dedupes_live_kpis():
    data = {"db_ops_agent": {
        "exact_day_kpis": {"kpis": {"net_sales": 1000.0, "atv": 100.0, "footfall": 20, "nob": 10}},
        "kpis": {"net_sales": 1000.0, "atv": 100.0, "bill_quantity": 25.0, "footfall": 20, "nob": 10},
    }}
    sheet = build_fact_sheet(data)
    assert "db_ops_agent.kpis.net_sales" not in sheet
    assert "db_ops_agent.kpis.bill_quantity = 25" in sheet


# --- numeric verifier -------------------------------------------------------------------

ALLOWED = allowed_numbers({"k": {"net_sales": 124500.37, "achievement_pct": 83.04, "footfall": 410, "nob": 236}})


def test_verifier_accepts_grounded_figures_in_any_format():
    assert find_bad("Net sales ₹1,24,500.37 (83.0%), footfall 410, NOB 236.", ALLOWED) == []
    assert find_bad("Net sales Rs 124,500 and 83% achieved", ALLOWED) == []
    assert find_bad("বিক্রি ₹১,২৪,৫০০ এবং ফুটফল ৪১০", ALLOWED) == []
    assert find_bad("₹1.25 lakh in sales", ALLOWED) == []
    assert find_bad("Remaining 17.0% of target", ALLOWED) == []  # 100 - achievement


def test_verifier_ignores_dates_times_and_small_counts():
    text = "On 2026-11-20, from 10:30 AM to 1:30 PM and 5 PM - 8 PM, 3 actions over a 14-day window."
    assert find_bad(text, ALLOWED) == []


def test_verifier_flags_fabricated_figures():
    assert find_bad("Net sales were ₹1,30,000 with 450 visitors.", ALLOWED) == ["₹1,30,000", "450"]
    assert find_bad("Conversion was 62.5%", ALLOWED) == ["62.5%"]


# --- coordinator wiring -----------------------------------------------------------------

def test_grounded_llm_reply_is_kept(mock_db, monkeypatch):
    captured = {}

    def fake_llm(**kwargs):
        captured.update(kwargs)
        return "**New Market - 2026-11-18: ₹3,30,000.00 net sales, 110.0% of target.** Footfall 600, NOB 250."

    monkeypatch.setattr("src.chat.coordinator.generate_llm_response", fake_llm)
    resp = run_copilot_turn(db=mock_db, query="Sales report for 2026-11-18", sec_ctx=_ctx("NM"),
                            target_date=TODAY, language="en")
    assert resp.reply.startswith("**New Market - 2026-11-18")
    assert resp.engine == env.gemini_model
    sys = captured["system_instruction"]
    assert "## FACTS" in sys and "net_sales = ₹3,30,000.00" in sys
    assert "KPI DEFINITIONS" in sys
    assert captured["temperature"] == 0.0


def test_fabricated_llm_reply_falls_back_to_domain_card(mock_db, monkeypatch):
    monkeypatch.setattr("src.chat.coordinator.generate_llm_response",
                        lambda **k: "New Market sold ₹4,10,000 on 2026-11-18 with 720 visitors.")
    resp = run_copilot_turn(db=mock_db, query="Sales report for 2026-11-18", sec_ctx=_ctx("NM"),
                            target_date=TODAY, language="en")
    assert resp.engine == "citimart-domain-engine (verified fallback)"
    assert "4,10,000" not in resp.reply


def test_advice_reply_is_not_number_checked(mock_db, monkeypatch):
    captured = {}

    def fake_llm(**kwargs):
        captured.update(kwargs)
        return "- Greet within 10 seconds\n- Push add-ons to lift ATV above ₹1,800"

    monkeypatch.setattr("src.chat.coordinator.generate_llm_response", fake_llm)
    resp = run_copilot_turn(db=mock_db, query="Suggest 3 proven floor-level tactics to increase customer conversion rate above 70%.",
                            sec_ctx=_ctx("NM"), target_date=TODAY, language="en")
    assert "₹1,800" in resp.reply
    assert captured["temperature"] == 0.4


# --- client -----------------------------------------------------------------------------

def test_build_contents_tags_previous_answers_with_their_date():
    contents = chat_client.build_contents("and footfall?", [
        {"role": "user", "content": "sales on 12 Nov?"},
        {"role": "assistant", "content": "Net Sales ₹2,00,000",
         "meta": {"store_code": "NM", "target_date": "2026-11-12"}},
    ])
    assert contents[1]["parts"][0]["text"].startswith("[earlier answer about store=NM, date=2026-11-12]")


def test_thinking_budget_rules(monkeypatch):
    monkeypatch.setattr(chat_client.env, "llm_thinking_budget", 0)
    assert chat_client._thinking_budget("gemini-2.5-flash") == 0
    assert chat_client._thinking_budget("gemini-2.5-pro") == 128
    assert chat_client._thinking_budget("gemini-2.0-flash") is None
    monkeypatch.setattr(chat_client.env, "llm_thinking_budget", -1)
    assert chat_client._thinking_budget("gemini-2.5-flash") is None


def test_gemini3_uses_thinking_level(monkeypatch):
    monkeypatch.setattr(chat_client.env, "llm_thinking_budget", 0)
    assert chat_client._thinking_budget("gemini-3.8-flash") is None
    assert chat_client._thinking_level("gemini-3.8-flash") == "LOW"
    assert chat_client._thinking_level("gemini-3-pro") == "LOW"
    assert chat_client._thinking_level("gemini-2.5-flash") is None
    monkeypatch.setattr(chat_client.env, "llm_thinking_budget", -1)
    assert chat_client._thinking_level("gemini-3.8-flash") is None


def test_truncated_response_returns_none(monkeypatch):
    class Cand:
        finish_reason = "MAX_TOKENS"

    class FakeModels:
        def generate_content(self, model, contents, config):
            return type("R", (), {"text": "| Date | Net Sa", "candidates": [Cand()]})()

    class FakeClient:
        models = FakeModels()

    monkeypatch.setattr(chat_client, "get_genai_client", lambda: FakeClient())
    monkeypatch.setattr(chat_client, "_call_gemini_rest", lambda **k: "should not be called")
    monkeypatch.setattr(chat_client.env, "gemini_api_key", "test-key")
    assert chat_client.generate_llm_response("q", system_instruction="s") is None


# --- fail-fast / cooldown -------------------------------------------------------------

class _ApiError(Exception):
    def __init__(self, code):
        super().__init__(f"HTTP {code}")
        self.code = code


def _client_raising(exc, calls):
    class FakeModels:
        def generate_content(self, model, contents, config):
            calls.append(config)
            raise exc

    class FakeClient:
        models = FakeModels()

    return FakeClient()


def test_overload_skips_rest_retry_and_cools_down(monkeypatch):
    calls, rest_calls = [], []
    monkeypatch.setattr(chat_client, "get_genai_client", lambda: _client_raising(_ApiError(503), calls))
    monkeypatch.setattr(chat_client, "_call_gemini_rest", lambda **k: rest_calls.append(k) or "rest")
    monkeypatch.setattr(chat_client.env, "gemini_api_key", "test-key")
    monkeypatch.setattr(chat_client.env, "gemini_fallback_models", "")

    assert chat_client.generate_llm_response("q", system_instruction="s") is None
    assert rest_calls == []  # the same API would just answer 503 again
    assert chat_client.llm_in_cooldown()
    # While cooling down, no network call is made at all.
    assert chat_client.generate_llm_response("q2", system_instruction="s") is None
    assert len(calls) == 1


def test_overloaded_primary_falls_back_to_next_model(monkeypatch):
    """A 503 on the primary must not switch the LLM off while a sibling serves."""
    seen = []

    class FakeModels:
        def generate_content(self, model, contents, config):
            seen.append(model)
            if model == "primary-m":
                raise _ApiError(503)
            return type("R", (), {"text": f"answer from {model}", "candidates": []})()

    monkeypatch.setattr(chat_client, "get_genai_client", lambda: type("C", (), {"models": FakeModels()})())
    monkeypatch.setattr(chat_client, "_call_gemini_rest", lambda **k: "should not be called")
    monkeypatch.setattr(chat_client.env, "gemini_api_key", "test-key")
    monkeypatch.setattr(chat_client.env, "gemini_model", "primary-m")
    monkeypatch.setattr(chat_client.env, "gemini_fallback_models", "backup-m, primary-m")

    assert chat_client.generate_llm_response("q") == "answer from backup-m"
    assert chat_client.llm_in_cooldown("primary-m") and not chat_client.llm_in_cooldown()
    # Next call skips the cooling primary entirely.
    assert chat_client.generate_llm_response("q2") == "answer from backup-m"
    assert seen == ["primary-m", "backup-m", "backup-m"]


def test_quota_and_timeout_trip_cooldown(monkeypatch):
    monkeypatch.setattr(chat_client.env, "gemini_api_key", "test-key")
    monkeypatch.setattr(chat_client, "_call_gemini_rest", lambda **k: "rest")

    monkeypatch.setattr(chat_client, "get_genai_client", lambda: _client_raising(_ApiError(429), []))
    assert chat_client.generate_llm_response("q") is None and chat_client.llm_in_cooldown()

    chat_client.reset_llm_cooldown()
    ReadTimeout = type("ReadTimeout", (Exception,), {})
    monkeypatch.setattr(chat_client, "get_genai_client", lambda: _client_raising(ReadTimeout(), []))
    assert chat_client.generate_llm_response("q") is None and chat_client.llm_in_cooldown()


def test_non_api_sdk_error_still_uses_rest(monkeypatch):
    monkeypatch.setattr(chat_client.env, "gemini_api_key", "test-key")
    monkeypatch.setattr(chat_client, "get_genai_client", lambda: _client_raising(TypeError("sdk bug"), []))
    monkeypatch.setattr(chat_client, "_call_gemini_rest", lambda **k: "rest answer")
    assert chat_client.generate_llm_response("q") == "rest answer"
    assert not chat_client.llm_in_cooldown()


def test_sdk_is_called_with_a_single_attempt(monkeypatch):
    calls = []

    class FakeModels:
        def generate_content(self, model, contents, config):
            calls.append(config)
            return type("R", (), {"text": "ok"})()

    monkeypatch.setattr(chat_client, "get_genai_client", lambda: type("C", (), {"models": FakeModels()})())
    monkeypatch.setattr(chat_client.env, "gemini_api_key", "test-key")
    assert chat_client.generate_llm_response("q") == "ok"
    retry = getattr(calls[0].http_options, "retry_options", None)
    if retry is not None:
        assert retry.attempts == 1
