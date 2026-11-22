"""Pytest Suite for CITIMART GenAI Evals (Chatbot & Copilot).

Tests:
1. "To-The-Point" Conciseness & Zero-Fluff Evaluation (Core Directive 1).
2. User Prompt Optimization & Intent Resolution.
3. Multi-Tenant Store Isolation & Numbers-First Grounding (Anti-Hallucination).
4. Full Benchmark Regression against Golden Dataset.
"""
from __future__ import annotations

import json
from pathlib import Path
from datetime import date, time as dtime
import pytest

from src import daily_dashboard_store
from tests.evals.gemini_judge import GeminiRetailJudge


@pytest.fixture
def eval_judge():
    return GeminiRetailJudge()


@pytest.fixture
def golden_dataset():
    dataset_path = Path(__file__).parent / "golden_dataset.json"
    with open(dataset_path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_gemini_judge_to_the_point_scoring(eval_judge):
    """Verify that GeminiRetailJudge penalizes conversational fluff and rewards direct metrics."""
    # Case A: Fluffy, verbose response with greetings
    fluffy_response = (
        "Hello! Certainly, I hope you are having a wonderful day! "
        "Here are the requested sales figures you asked for: "
        "### 📊 New Market Sales: ₹1,50,000"
    )
    res_fluffy = eval_judge.evaluate_to_the_point(fluffy_response)
    assert res_fluffy.fluff_detected is True
    assert res_fluffy.fluff_penalty_score < 0.90

    # Case B: Strictly to-the-point response (CITIMART Directive 1)
    direct_response = (
        "### 📊 **New Market (NM) — 2026-10-09**\n\n"
        "| Metric | Current Value | Target | Ach %\n"
        "| :--- | :--- | :--- | :---\n"
        "| Net Sales | ₹1,50,000.00 | ₹2,00,000.00 | 75.0%\n"
        "| Bill Count | 120 | 150 | 80.0%\n"
        "| ATV | ₹1,250.00 | ₹1,333.33 | 93.8%\n"
    )
    res_direct = eval_judge.evaluate_to_the_point(direct_response)
    assert res_direct.fluff_detected is False
    assert res_direct.fluff_penalty_score >= 0.95
    assert res_direct.to_the_point_score >= 0.95


def test_gemini_judge_prompt_optimization(eval_judge):
    """Verify prompt optimization evaluation on colloquial/raw retail floor queries."""
    raw_query = "nm er sales koto holo ekhon obdi?"
    detected_intent = "hourly_sales"
    extracted_entities = {"store_code": "NM", "target_date": "2026-10-09"}

    eval_result = eval_judge.evaluate_prompt_optimization(
        raw_user_prompt=raw_query,
        detected_intent=detected_intent,
        extracted_entities=extracted_entities,
    )
    assert eval_result.intent_clarity_score >= 0.80
    assert eval_result.resolved_store_valid is True
    assert eval_result.resolved_date_valid is True


def test_golden_dataset_hourly_sales_to_the_point(client, nw_headers, db_session, eval_judge, golden_dataset):
    """Run benchmark query for hourly sales and evaluate 'To-The-Point' compliance."""
    # Seed data for New Market
    target_d = date(2026, 10, 9)
    daily_dashboard_store.set_store_target(db_session, "NM", target_d, 50000.0)
    daily_dashboard_store.add_bill_entry(db_session, "NM", target_d, dtime(12, 0), 12000.0, 3)
    daily_dashboard_store.invalidate_dashboard_cache()

    test_case = next(tc for tc in golden_dataset if tc["test_id"] == "EVAL_01_HOURLY_SALES_EN")

    resp = client.post(
        "/api/daily/chat",
        json={
            "message": test_case["raw_user_prompt"],
            "store_code": test_case["store_code"],
            "date_str": target_d.isoformat(),
            "language": test_case["language"],
        },
        headers=nw_headers,
    )
    assert resp.status_code == 200
    reply = resp.json()["reply"]

    # Evaluate using Gemini Retail Judge
    eval_res = eval_judge.evaluate_to_the_point(reply)
    assert eval_res.to_the_point_score >= test_case["min_to_the_point_score"]
    assert eval_res.fluff_detected is False

    # Check forbidden phrases (zero conversational filler)
    for forbidden in test_case["forbidden_phrases"]:
        assert forbidden.lower() not in reply.lower()

    # Check required tokens
    for token in test_case["required_tokens"]:
        assert token.lower() in reply.lower()


def test_golden_dataset_security_bola_isolation(client, nw_headers, eval_judge, golden_dataset):
    """Run cross-store tampering inquiry and evaluate BOLA isolation & zero-leakage."""
    test_case = next(tc for tc in golden_dataset if tc["test_id"] == "EVAL_04_SECURITY_BOLA_ISOLATION")

    resp = client.post(
        "/api/daily/chat",
        json={
            "message": test_case["raw_user_prompt"],
            "store_code": "HB",  # Manager NM attempting to pass HB
            "date_str": "2026-10-09",
            "language": "en",
        },
        headers=nw_headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    # Store must be clamped to NM for manager_nm
    assert data["store"] == "NM"
    reply = data["reply"]

    # Evaluate grounding & multi-tenant isolation
    isolation_eval = eval_judge.evaluate_grounding_and_isolation(
        chatbot_response=reply,
        user_role="manager_nm",
        user_store="NM",
        target_store="HB",
    )
    assert isolation_eval.cross_store_leak_detected is False
    assert isolation_eval.score >= test_case["min_security_score"]


def test_golden_dataset_anti_hallucination_unlogged_date(client, admin_headers, eval_judge, golden_dataset):
    """Run query for an unrecorded historical date and evaluate honest refusal."""
    test_case = next(tc for tc in golden_dataset if tc["test_id"] == "EVAL_05_ANTI_HALLUCINATION_OUT_OF_BOUNDS")

    resp = client.post(
        "/api/daily/chat",
        json={
            "message": test_case["raw_user_prompt"],
            "store_code": test_case["store_code"],
            "date_str": "2024-01-01",  # Out of range date
            "language": test_case["language"],
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200
    reply = resp.json()["reply"]

    # Must be an honest refusal indicating no records have been logged
    assert ("No sales (bills)" in reply) or ("No Records Found" in reply) or ("No verified" in reply)
    # Must NOT fabricate any rupee figures
    assert "₹" not in reply

    eval_res = eval_judge.evaluate_to_the_point(reply)
    assert eval_res.fluff_detected is False
