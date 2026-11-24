"""Co-Pilot reply links (src/chat/links.py): store scoping, admin gating, source filtering."""
from __future__ import annotations

from datetime import date

from src.chat.coordinator import run_copilot_turn
from src.chat.links import MAX_SOURCES, app_href, build_links, follow_up_suggestions
from src.chat.memory import SessionMemoryStore
from tests.test_chat_intent import TODAY, _ctx, mock_db  # noqa: F401 - mock_db is a fixture

DAY = date(2026, 11, 18)


def _hrefs(links, kind="app"):
    return [link["href"] for link in links if link["kind"] == kind]


def test_app_href_format():
    assert app_href("NM", "history", DAY) == "/app?store=nm&view=history&date=2026-11-18"
    assert app_href("ALL", "dashboard") == "/app?store=overall&view=dashboard"


def test_manager_never_gets_another_stores_link():
    links = build_links("day_kpis", "HB", DAY, _ctx("NM"), {}, today=TODAY)
    hrefs = _hrefs(links)
    assert hrefs and all("store=nm" in h for h in hrefs)


def test_data_intent_links_history_and_live_dashboard_today():
    assert _hrefs(build_links("day_kpis", "NM", DAY, _ctx("NM"), {}, today=DAY)) == [
        "/app?store=nm&view=history&date=2026-11-18",
        "/app?store=nm&view=dashboard",
    ]
    # A past day gets no "live" dashboard link.
    assert len(_hrefs(build_links("day_kpis", "NM", DAY, _ctx("NM"), {}, today=date(2026, 11, 24)))) == 1


def test_sales_target_link_is_admin_only():
    admin = _hrefs(build_links("mtd", "HB", DAY, _ctx(None, admin=True), {}, today=TODAY))
    manager = _hrefs(build_links("mtd", "NM", DAY, _ctx("NM"), {}, today=TODAY))
    assert "/app?store=hb&view=target" in admin
    assert not any("view=target" in h for h in manager)


def test_all_stores_maps_to_overall():
    hrefs = _hrefs(build_links("ranking", "ALL", DAY, _ctx(None, admin=True), {}, today=TODAY))
    assert hrefs == ["/app?store=overall&view=dashboard"]


def test_advice_intent_has_no_app_links():
    assert build_links("coaching", "NM", DAY, _ctx("NM"), {}, today=TODAY) == []


def test_sources_keep_only_real_http_urls_capped():
    results = [
        {"title": "Fallback", "url": "https://citimart.internal/market-intelligence"},
        {"title": "Script", "url": "javascript:alert(1)"},
        {"title": "No scheme", "url": "example.com/x"},
        {"title": "A", "url": "https://a.example/1"},
        {"title": "A again", "url": "https://a.example/1"},
        {"title": "B" * 200, "url": "http://b.example/"},
        {"title": "C", "url": "https://c.example/"},
        {"title": "D", "url": "https://d.example/"},
    ]
    data = {"market_intel_agent": {"festival_signals": results}}
    sources = [link for link in build_links("market", "NM", DAY, _ctx("NM"), data, today=TODAY)
               if link["kind"] == "source"]
    assert [s["href"] for s in sources] == ["https://a.example/1", "http://b.example/", "https://c.example/"]
    assert len(sources) == MAX_SOURCES
    assert len(sources[1]["label"]) <= 70


def test_suggestions_follow_language_and_fall_back_to_english():
    assert follow_up_suggestions("day_kpis", "bn")[0].startswith("গত")
    assert follow_up_suggestions("day_kpis", "xx") == follow_up_suggestions("day_kpis", "en")
    assert follow_up_suggestions("greeting", "en") == []


def test_turn_returns_and_persists_links(mock_db, monkeypatch):
    monkeypatch.setattr("src.chat.coordinator.generate_llm_response", lambda **k: None)
    sec = _ctx("NM")
    resp = run_copilot_turn(db=mock_db, query="Sales report for 2026-11-18", sec_ctx=sec,
                            target_date=TODAY, language="en")
    assert "/app?store=nm&view=history&date=2026-11-18" in _hrefs(resp.links)
    assert resp.suggestions
    meta = SessionMemoryStore.get_last_assistant_metadata(mock_db, resp.session_id, sec)
    assert meta["links"] == resp.links and meta["suggestions"] == resp.suggestions
