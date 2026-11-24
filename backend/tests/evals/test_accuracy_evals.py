"""Numeric-accuracy evals for the Co-Pilot (tests/evals/accuracy_dataset.json).

Two modes:
- **offline** (default, every `pytest` run): no model. Checks that routing,
  date resolution and the data fetched are right, via the deterministic
  answer cards.
- **live** (`CITIMART_LIVE_EVALS=1` plus a `GEMINI_API_KEY`): the real Gemini
  model writes the answer (and routes unmatched questions). On top of the
  offline checks, a reply must pass the numeric grounding check itself, not be
  replaced by the verified fallback card.

    CITIMART_LIVE_EVALS=1 pytest tests/evals/test_accuracy_evals.py -v
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re

import pytest

from config.env import env
from src.chat.coordinator import run_copilot_turn
from src.chat.intent import detect_intent
from src.chat.memory import MESSAGES_COLLECTION
from tests.test_chat_intent import TODAY, _ctx, mock_db  # noqa: F401 - mock_db is a fixture

_DATA = json.loads((Path(__file__).parent / "accuracy_dataset.json").read_text(encoding="utf-8"))
CASES = _DATA["cases"]
LIVE = os.getenv("CITIMART_LIVE_EVALS") == "1"

_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯०१२३४५६७८९", "01234567890123456789")
_NUM = re.compile(r"(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?\s*(lakhs?|lacs?|L\b)?", re.IGNORECASE)


def reply_numbers(text: str) -> list[float]:
    """Every number in a reply, whatever the digit script, grouping or lakh scale."""
    out = []
    for m in _NUM.finditer(text.translate(_DIGITS)):
        value = float(m.group(1).replace(",", "") + (m.group(2) or ""))
        out.append(value * (1e5 if m.group(3) else 1))
    return out


def contains(numbers: list[float], expected: float) -> bool:
    tol = 0.05 if not float(expected).is_integer() else 0.5
    if expected >= 1000:
        tol = max(tol, expected * 0.005)  # "₹3.30 lakh" style rounding
    return any(abs(n - expected) <= tol for n in numbers)


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_accuracy_case(case, mock_db, monkeypatch):
    if LIVE:
        if not env.gemini_api_key:
            pytest.skip("CITIMART_LIVE_EVALS=1 needs GEMINI_API_KEY")
        # client.generate_llm_response refuses real network calls under pytest.
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

    sec = _ctx(None, admin=True) if case["role"] == "admin" else _ctx(case["role"])
    resp = run_copilot_turn(
        db=mock_db, query=case["query"], sec_ctx=sec, target_date=TODAY,
        requested_store="ALL" if case["role"] == "admin" else None, language=case["language"],
    )
    reply = resp.reply
    meta = (mock_db[MESSAGES_COLLECTION].find_one(
        {"session_id": resp.session_id, "role": "assistant"}, sort=[("_id", -1)]) or {}).get("metadata") or {}

    assert resp.target_date == case["expected_date"], f"date resolved to {resp.target_date}"
    if "expected_intent" in case:
        got = meta.get("intent") or detect_intent(case["query"]).primary
        assert got == case["expected_intent"], f"intent {got}"

    nums = reply_numbers(reply)
    missing = [e for e in case["expected_numbers"] if not contains(nums, e)]
    assert not missing, f"missing figures {missing} in reply:\n{reply}"
    leaked = [f for f in case.get("forbidden_numbers", []) if contains(nums, f)]
    assert not leaked, f"forbidden figures {leaked} in reply:\n{reply}"
    for token in case.get("required_tokens", []):
        assert token.lower() in reply.lower(), f"missing {token!r} in reply:\n{reply}"

    if LIVE:
        if meta.get("number_verification") == "failed":
            pytest.fail(f"LLM reply failed the grounding check and was replaced (engine={resp.engine})")
        # Refusals (pre-generation guardrail) never reach the model by design.
        if resp.engine != "citimart-guardrail-engine" and resp.engine != env.gemini_model:
            pytest.fail(f"the model never answered (engine={resp.engine}); check GEMINI_MODEL / API key")
