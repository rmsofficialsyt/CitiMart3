"""Co-Pilot token usage window: metering, persistence, endpoint scoping, limits."""
from __future__ import annotations

from datetime import date

import pytest

from db.models import LLM_USAGE
from src.chat import client as chat_client
from src.chat import usage as llm_usage


# --- meter ------------------------------------------------------------------------------

def test_parse_usage_reads_sdk_and_rest_shapes():
    sdk = type("U", (), {"prompt_token_count": 100, "candidates_token_count": 40,
                         "thoughts_token_count": 5, "cached_content_token_count": 20,
                         "total_token_count": 145})()
    assert llm_usage.parse_usage(sdk) == {"input_tokens": 100, "output_tokens": 40, "thinking_tokens": 5,
                                          "cached_tokens": 20, "total_tokens": 145}
    rest = {"promptTokenCount": 7, "candidatesTokenCount": 3}
    parsed = llm_usage.parse_usage(rest)
    assert parsed["input_tokens"] == 7 and parsed["output_tokens"] == 3
    assert parsed["total_tokens"] == 10  # derived when the API omits it
    assert llm_usage.parse_usage(None)["total_tokens"] == 0


def test_record_without_meter_is_noop_and_meter_sums_calls():
    llm_usage.record({"promptTokenCount": 1})  # no active meter: must not raise
    with llm_usage.metering() as m:
        llm_usage.record({"promptTokenCount": 10, "candidatesTokenCount": 2}, "m1")
        llm_usage.record({"promptTokenCount": 5, "candidatesTokenCount": 1}, "m1")
    assert (m.input_tokens, m.output_tokens, m.llm_calls, m.models) == (15, 3, 2, ["m1"])
    llm_usage.record({"promptTokenCount": 99})  # meter closed
    assert m.input_tokens == 15


def _fake_client(text, finish="STOP"):
    class Cand:
        finish_reason = finish

    meta = type("U", (), {"prompt_token_count": 120, "candidates_token_count": 30,
                          "thoughts_token_count": 0, "cached_content_token_count": 0,
                          "total_token_count": 150})()

    class FakeModels:
        def generate_content(self, model, contents, config):
            return type("R", (), {"text": text, "candidates": [Cand()], "usage_metadata": meta})()

    class FakeClient:
        models = FakeModels()

    return FakeClient()


@pytest.mark.parametrize("finish,expected_text", [("STOP", "ok"), ("MAX_TOKENS", None)])
def test_sdk_call_records_usage_even_when_truncated(monkeypatch, finish, expected_text):
    monkeypatch.setattr(chat_client, "get_genai_client", lambda: _fake_client("ok", finish))
    monkeypatch.setattr(chat_client.env, "gemini_api_key", "test-key")
    with llm_usage.metering() as m:
        assert chat_client.generate_llm_response("q") == expected_text
    assert (m.input_tokens, m.output_tokens, m.llm_calls) == (120, 30, 1)


def test_rest_call_records_usage(monkeypatch):
    class Resp:
        status_code = 200

        def json(self):
            return {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "rest"}]}}],
                    "usageMetadata": {"promptTokenCount": 9, "candidatesTokenCount": 4, "totalTokenCount": 13}}

    import requests
    monkeypatch.setattr(requests, "post", lambda *a, **k: Resp())
    with llm_usage.metering() as m:
        out = chat_client._call_gemini_rest(api_key="k", model="gemini-3.8-flash", prompt="q",
                                            system_instruction=None, conversation_history=None,
                                            temperature=0.0, timeout_sec=1.0)
    assert out == "rest"
    assert (m.input_tokens, m.output_tokens, m.total_tokens) == (9, 4, 13)


# --- limits -----------------------------------------------------------------------------

def test_build_contents_sends_configured_history(monkeypatch):
    history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"} for i in range(30)]
    contents = chat_client.build_contents("now", history)
    texts = [p["text"] for c in contents for p in c["parts"]]
    assert texts[:-1] == [f"m{i}" for i in range(20, 30)]  # default 10
    monkeypatch.setattr(chat_client.env, "chat_history_messages_sent", 4)
    texts = [p["text"] for c in chat_client.build_contents("now", history) for p in c["parts"]]
    assert texts == ["m26", "m27", "m28", "m29", "now"]


def test_chat_input_length_limit(client, nw_headers):
    too_long = client.post("/api/daily/chat", json={"message": "x" * 8001}, headers=nw_headers)
    assert too_long.status_code == 422
    assert "limit is 8000" in too_long.text


# --- persistence + endpoint ------------------------------------------------------------

def _stub_llm(monkeypatch, reply):
    """Replace the coordinator's synthesis call with one that 'spends' tokens."""
    def fake(**kwargs):
        llm_usage.record({"promptTokenCount": 200, "candidatesTokenCount": 50, "totalTokenCount": 250},
                         "gemini-3.8-flash")
        return reply
    monkeypatch.setattr("src.chat.coordinator.generate_llm_response", fake)
    monkeypatch.setattr("src.chat.intent_router.generate_llm_response", lambda **k: None)


def test_turn_returns_and_persists_usage(client, nw_headers, db_session, monkeypatch):
    _stub_llm(monkeypatch, "Hello! How can I help with the store today?")
    resp = client.post("/api/daily/chat", json={"message": "hello"}, headers=nw_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["usage"]["input_tokens"] == 200 and data["usage"]["llm_calls"] >= 1
    assert data["limits"]["context_window"] > 0
    doc = db_session[LLM_USAGE].find_one({"session_id": data["session_id"]})
    assert doc and doc["username"] == "CITIMART - NEW MARKET" and doc["total_tokens"] == 250

    usage = client.get(f"/api/daily/chat/usage?session_id={data['session_id']}", headers=nw_headers).json()
    assert usage["today"]["total_tokens"] == 250 and usage["today"]["turns"] == 1
    assert usage["session"]["total_tokens"] == 250
    assert usage["last_turn"]["input_tokens"] == 200
    assert usage["limits"]["max_input_chars"] == 8000


def test_turn_without_llm_call_writes_nothing(client, nw_headers, db_session, monkeypatch):
    monkeypatch.setattr("src.chat.coordinator.generate_llm_response", lambda **k: None)
    monkeypatch.setattr("src.chat.intent_router.generate_llm_response", lambda **k: None)
    resp = client.post("/api/daily/chat", json={"message": "hello"}, headers=nw_headers)
    assert resp.status_code == 200
    assert resp.json()["usage"]["llm_calls"] == 0
    assert db_session[LLM_USAGE].count_documents({}) == 0


def test_usage_is_scoped_to_caller(client, nw_headers, hb_headers, monkeypatch):
    _stub_llm(monkeypatch, "Hello! How can I help with the store today?")
    sid = client.post("/api/daily/chat", json={"message": "hello"}, headers=nw_headers).json()["session_id"]

    other = client.get(f"/api/daily/chat/usage?session_id={sid}", headers=hb_headers)
    assert other.status_code == 200
    body = other.json()
    assert body["session"] is None  # not their session: null, not 403
    assert body["today"]["total_tokens"] == 0 and body["last_turn"] is None


def test_usage_requires_auth(client):
    assert client.get("/api/daily/chat/usage").status_code == 401
