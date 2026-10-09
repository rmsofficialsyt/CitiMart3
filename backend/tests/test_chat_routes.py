"""Tests for CITIMART AI Chatbot & Operations Copilot route."""
from __future__ import annotations


def test_chat_copilot_yoy_query(client, nw_headers):
    resp = client.post(
        "/api/daily/chat",
        json={
            "message": "What is our YoY growth comparing 08.10.2026 vs 08.10.2025?",
            "store_code": "NM",
            "date_str": "2026-10-09",
            "language": "en",
        },
        headers=nw_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data
    assert "08.10.2026" in data["reply"] or "08.10.2025" in data["reply"]
    assert data["store"] == "NM"


def test_chat_copilot_bengali_and_hindi(client, nw_headers):
    resp_bn = client.post(
        "/api/daily/chat",
        json={
            "message": "আজকের সেলস ও টার্গেট হিসেব দিন",
            "store_code": "NM",
            "date_str": "2026-10-09",
            "language": "bn",
        },
        headers=nw_headers,
    )
    assert resp_bn.status_code == 200
    assert "সেলস" in resp_bn.json()["reply"]

    resp_hi = client.post(
        "/api/daily/chat",
        json={
            "message": "आज की बिक्री और टारगेट बताइए",
            "store_code": "NM",
            "date_str": "2026-10-09",
            "language": "hi",
        },
        headers=nw_headers,
    )
    assert resp_hi.status_code == 200
    assert "बिक्री" in resp_hi.json()["reply"] or "टारगेट" in resp_hi.json()["reply"]


def test_chat_copilot_formula_query(client, nw_headers):
    resp = client.post(
        "/api/daily/chat",
        json={
            "message": "Show all KPI formulas",
            "store_code": "NM",
            "date_str": "2026-10-09",
            "language": "en",
        },
        headers=nw_headers,
    )
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    assert "Conversion Rate" in reply
    assert "ATV" in reply
