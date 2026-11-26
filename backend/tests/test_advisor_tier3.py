"""Advisor Tier 3: drivers, explain, brief, re-plan, what-if, outcomes, Co-Pilot."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

import pytest

from db.models import ADVISOR_ACTIONS, TARGETS
from src import daily_dashboard_store as store_db
from src.advisor import engine, outcomes
from src.advisor.brief import build_brief, store_review
from src.advisor.drivers import decompose
from src.advisor.explain import explain_day
from src.advisor.replan import build_replan
from src.advisor.whatif import simulate
from src.chat.intent import detect_intent
from src.chat.state import SecurityContext
from src.chat.tools.advisor_tools import explain_day as explain_tool
from src.chat.tools.advisor_tools import network_brief

TODAY = date(2026, 11, 24)  # Tuesday, Guru Nanak's Jayanti
SLOT_TIMES = (time(12, 0), time(15, 0), time(18, 0), time(21, 0))


def _ist(hh: int, mm: int, d: date = TODAY) -> datetime:
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=engine.IST)


def _day(db, d, sales, footfall, nob, store="NM", t=time(12, 0)):
    store_db.add_bill_entry(db, store, d, t, sales, 2)
    store_db.add_footfall_entry(db, store, d, t, footfall)
    store_db.add_nob_entry(db, store, d, t, nob)


def _baseline(db, store="NM", weeks=3, sales=50000, footfall=100, nob=50):
    for w in range(1, weeks + 1):
        _day(db, TODAY - timedelta(weeks=w), sales, footfall, nob, store)


# ---------------------------------------------------------------- drivers

def test_decomposition_terms_sum_exactly_to_the_gap():
    base = {"net_sales": 50000, "footfall": 100, "nob": 50}
    cur = {"net_sales": 43200, "footfall": 80, "nob": 48}
    d = decompose(cur, base)
    assert d["delta_sales"] == pytest.approx(-6800)
    assert sum(x["amount"] for x in d["drivers"]) == pytest.approx(-6800)
    by = {x["driver"]: x for x in d["drivers"]}
    assert by["traffic"]["change_pct"] == pytest.approx(-20)
    assert by["conversion"]["amount"] > 0 and by["traffic"]["amount"] < 0


def test_decomposition_refuses_zero_terms():
    assert decompose({"net_sales": 100, "footfall": 0, "nob": 1}, {"net_sales": 1, "footfall": 1, "nob": 1}) is None
    assert decompose({"net_sales": 100, "footfall": 10, "nob": 1}, None) is None


def test_review_without_baseline_has_no_drivers(db_session):
    _day(db_session, TODAY, 30000, 60, 30)
    r = store_review(db_session, "NM", TODAY)
    assert r["baseline"] is None and r["drivers"] == [] and r["verdict"] == "no_target"


# ---------------------------------------------------------------- explain

def test_explain_traffic_driven_miss(db_session):
    _baseline(db_session)
    store_db.set_store_target(db_session, "NM", TODAY, 50000)
    _day(db_session, TODAY, 30000, 60, 30)  # same conversion and ATV, 40% less traffic

    ex = explain_day(db_session, "NM", TODAY, now=_ist(23, 59) + timedelta(minutes=1))
    assert ex["review"]["verdict"] == "missed"
    first = ex["reasons"][0]
    assert first["id"] == "traffic_down" and first["impact"] == pytest.approx(-20000)
    assert "holiday" in {r["id"] for r in ex["reasons"]}


def test_explain_short_staffed(db_session):
    _baseline(db_session)
    for w in range(1, 4):
        for i in range(4):
            db_session["staff_attendance"].insert_one({"store_code": "NM", "date": (TODAY - timedelta(weeks=w)).isoformat(),
                                                      "staff_id": f"S{i}", "status": "PRESENT"})
    db_session["staff_attendance"].insert_one({"store_code": "NM", "date": TODAY.isoformat(), "staff_id": "S0", "status": "PRESENT"})
    _day(db_session, TODAY, 30000, 60, 30)
    ex = explain_day(db_session, "NM", TODAY, now=_ist(20, 0))
    short = next(r for r in ex["reasons"] if r["id"] == "short_staffed")
    assert short["evidence"] == {"present": 1, "usual": 4}


def test_explain_route_scoped_and_date_checked(client, nw_headers, monkeypatch):
    monkeypatch.setattr("api.routes_advisor.ist_now", lambda: _ist(15, 0))
    ok = client.get("/api/advisor/explain", params={"store": "NM", "date": TODAY.isoformat()}, headers=nw_headers)
    assert ok.status_code == 200 and "reasons" in ok.json()
    assert client.get("/api/advisor/explain", params={"store": "HB", "date": TODAY.isoformat()},
                      headers=nw_headers).status_code == 403
    future = (TODAY + timedelta(days=1)).isoformat()
    assert client.get("/api/advisor/explain", params={"store": "NM", "date": future},
                      headers=nw_headers).status_code == 400


# ---------------------------------------------------------------- brief

def test_brief_reviews_yesterday_and_orders_weakest_first(db_session):
    y = TODAY - timedelta(days=1)
    for store, sales in (("NM", 9000), ("HB", 4000), ("CHW", 7000)):
        store_db.set_store_target(db_session, store, y, 10000)
        _day(db_session, y, sales, 50, 20, store)
    b = build_brief(db_session, ["NM", "HB", "CHW"], TODAY, "morning")
    assert b["review_date"] == y.isoformat() and b["watch_date"] == TODAY.isoformat()
    assert [s["store"] for s in b["stores"]] == ["HB", "CHW", "NM"]
    assert b["network"]["achievement_pct"] == pytest.approx(66.666, rel=1e-3)
    nm = next(s for s in b["stores"] if s["store"] == "NM")
    assert {"no_target", "holiday"} <= {w["id"] for w in nm["watch_outs"]}  # today has no target; Guru Nanak Jayanti


def test_brief_route_is_admin_only(client, nw_headers, admin_headers):
    assert client.get("/api/advisor/brief", headers=nw_headers).status_code == 403
    r = client.get("/api/advisor/brief", params={"kind": "evening"}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["kind"] == "evening" and len(r.json()["stores"]) == 3
    assert client.get("/api/advisor/brief", params={"kind": "noon"}, headers=admin_headers).status_code == 422


def test_brief_payload_mirrors_the_brief(db_session):
    from src.advisor.brief_report import build_brief_payload

    y = TODAY - timedelta(days=1)
    _baseline(db_session)
    for w in range(1, 4):  # baseline for yesterday's weekday too
        _day(db_session, y - timedelta(weeks=w), 50000, 100, 50)
    store_db.set_store_target(db_session, "NM", y, 50000)
    _day(db_session, y, 30000, 60, 30)
    payload = build_brief_payload(build_brief(db_session, ["NM"], TODAY, "morning"))
    types = [b.type for b in payload.blocks]
    assert types[:3] == ["title", "kpi_grid", "table"]
    overview = payload.blocks[2]
    assert overview.rows[0]["Result"] == "Target missed" and overview.rows[0]["Achievement %"] == "60.0%"
    drivers = next(b for b in payload.blocks if b.type == "table" and "drivers" in b.title)
    assert drivers.rows[0]["Driver"] == "Fewer shoppers came in" and drivers.rows[0]["Impact"] == "−₹20,000.00"
    watch = next(b for b in payload.blocks if b.type == "text" and "watch-outs" in (b.heading or ""))
    assert "Holiday (Guru Nanak's Jayanti)" in watch.text


def test_brief_pdf_route(client, admin_headers, nw_headers, db_session):
    assert client.get("/api/advisor/brief/pdf", headers=nw_headers).status_code == 403
    assert client.get("/api/advisor/brief/pdf", params={"kind": "noon"}, headers=admin_headers).status_code == 422
    r = client.get("/api/advisor/brief/pdf", params={"kind": "evening"}, headers=admin_headers)
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert 'filename="citimart-evening-brief-' in r.headers["content-disposition"]
    assert db_session["audit_logs"].count_documents({"action": "advisor_brief_export"}) == 1


def test_brief_pdf_render_failure_is_generic(client, admin_headers, monkeypatch):
    def boom(_brief):
        raise RuntimeError("internal path /secret")

    monkeypatch.setattr("api.routes_advisor.render_brief_pdf", boom)
    r = client.get("/api/advisor/brief/pdf", headers=admin_headers)
    assert r.status_code == 500 and "secret" not in r.text


def _seed_slot_history(db, store="NM"):
    """3 past Tuesdays: ₹1000/2000/3000/4000 per slot, 100 footfall + 50 NOB per slot."""
    for w in range(1, 4):
        d = TODAY - timedelta(weeks=w)
        for t, amount in zip(SLOT_TIMES, (1000, 2000, 3000, 4000)):
            _day(db, d, amount, 100, 50, store, t=t)


def test_midday_brief_judges_pace_and_completed_slots_only(db_session):
    _seed_slot_history(db_session)
    store_db.set_store_target(db_session, "NM", TODAY, 10000)
    _day(db_session, TODAY, 500, 50, 25, t=time(12, 0))  # slot 1 done: half the usual traffic
    _day(db_session, TODAY, 200, 30, 10, t=time(15, 0))  # slot 2 still running at 15:30

    b = build_brief(db_session, ["NM"], TODAY, "midday", now=_ist(15, 30))
    nm = b["stores"][0]
    assert b["review_date"] == b["watch_date"] == TODAY.isoformat() and b["as_of"].startswith("2026-11-24T15:30")
    assert nm["verdict"] == "in_progress"  # never "missed" mid-day
    pace = nm["pace"]
    assert pace["expected_achievement_pct"] == pytest.approx(20.0)  # learned curve, halfway through slot 2
    # 7% done vs 20% expected: more than PACE_BEHIND_PP (10 pp) behind.
    assert pace["status"] == "behind" and pace["pace_gap_pp"] == pytest.approx(7.0 - 20.0)
    assert pace["projected_close"] == pytest.approx(700 / 0.2)
    # Drivers compare the completed slot only (₹500 vs a usual ₹1000), not the half day vs a full day.
    assert nm["slots_compared"] == ["11.00 AM - 01.59 PM"]
    assert nm["baseline"]["net_sales"] == pytest.approx(1000)
    assert nm["vs_baseline_pct"] == pytest.approx(-50.0)
    assert nm["drivers"][0]["driver"] == "traffic"
    assert sum(d["amount"] for d in nm["drivers"]) == pytest.approx(-500)
    assert b["network"]["projected_achievement_pct"] == pytest.approx(35.0)


def test_midday_before_any_slot_completes_has_no_drivers(db_session):
    _seed_slot_history(db_session)
    store_db.set_store_target(db_session, "NM", TODAY, 10000)
    _day(db_session, TODAY, 500, 50, 25, t=time(11, 0))
    nm = build_brief(db_session, ["NM"], TODAY, "midday", now=_ist(12, 0))["stores"][0]
    assert nm["slots_compared"] == [] and nm["baseline"] is None and nm["drivers"] == []


def test_midday_route_today_only(client, admin_headers, monkeypatch):
    monkeypatch.setattr("api.routes_advisor.ist_now", lambda: _ist(15, 30))
    r = client.get("/api/advisor/brief", params={"kind": "midday"}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["kind"] == "midday"
    past = {"kind": "midday", "date": (TODAY - timedelta(days=1)).isoformat()}
    assert client.get("/api/advisor/brief", params=past, headers=admin_headers).status_code == 400
    assert client.get("/api/advisor/brief/pdf", params=past, headers=admin_headers).status_code == 400
    pdf = client.get("/api/advisor/brief/pdf", params={"kind": "midday"}, headers=admin_headers)
    assert pdf.status_code == 200 and 'filename="citimart-midday-brief-' in pdf.headers["content-disposition"]


def test_midday_chat_falls_back_to_evening_for_past_days(db_session, monkeypatch):
    monkeypatch.setattr("src.chat.tools.advisor_tools.ist_now", lambda: _ist(15, 30))
    admin = SecurityContext(user_id="a", store_code=None, is_admin=True, allowed_stores=["NM", "HB", "CHW", "ALL"])
    assert network_brief(db_session, TODAY - timedelta(days=1), "midday", admin)["kind"] == "evening"
    assert detect_intent("midday brief please").primary == "brief"


def test_chat_brief_for_manager_is_own_store_only(db_session):
    mgr = SecurityContext(user_id="u", store_code="NM", allowed_stores=["NM"])
    b = network_brief(db_session, TODAY, "morning", mgr)
    assert [s["store"] for s in b["stores"]] == ["NM"]


# ---------------------------------------------------------------- replan

def test_replan_spreads_remaining_need_and_never_writes(db_session):
    month = date(2026, 11, 1)
    for i in range(30):
        store_db.set_store_target(db_session, "NM", month + timedelta(days=i), 1000)
    for i in range(23):
        store_db.add_bill_entry(db_session, "NM", month + timedelta(days=i), time(12, 0), 800, 1)
    before = list(db_session[TARGETS].find({}, {"_id": 0, "entry_date": 1, "sales_target": 1}))

    plan = build_replan(db_session, "NM", month, TODAY)
    assert plan["available"] and plan["weighting"] == "weekday"
    assert plan["still_needed"] == pytest.approx(30000 - 23 * 800)
    assert [r["date"] for r in plan["rows"]][0] == TODAY.isoformat() and len(plan["rows"]) == 7
    assert sum(r["recommended_target"] for r in plan["rows"]) == pytest.approx(11600)
    assert list(db_session[TARGETS].find({}, {"_id": 0, "entry_date": 1, "sales_target": 1})) == before


def test_replan_without_targets_or_after_month(db_session):
    assert build_replan(db_session, "NM", date(2026, 11, 1), TODAY)["reason"] == "no_targets"
    store_db.set_store_target(db_session, "NM", date(2026, 10, 5), 1000)
    assert build_replan(db_session, "NM", date(2026, 10, 1), TODAY)["reason"] == "month_over"


def test_replan_route_admin_only_and_validated(client, nw_headers, admin_headers):
    assert client.get("/api/advisor/replan", params={"store": "NM", "month": "2026-11"},
                      headers=nw_headers).status_code == 403
    assert client.get("/api/advisor/replan", params={"store": "NM", "month": "2026-13"},
                      headers=admin_headers).status_code == 422
    assert client.get("/api/advisor/replan", params={"store": "NM", "month": "2026-11"},
                      headers=admin_headers).status_code == 200


# ---------------------------------------------------------------- what-if

def _seed_pace(db):
    for w in range(1, 4):
        for t, amount in zip(SLOT_TIMES, (1000, 2000, 3000, 4000)):
            store_db.add_bill_entry(db, "NM", TODAY - timedelta(weeks=w), t, amount, 2)


def test_whatif_scales_only_the_rest_of_the_day(db_session):
    _seed_pace(db_session)
    store_db.set_store_target(db_session, "NM", TODAY, 10000)
    _day(db_session, TODAY, 500, 30, 1)  # conversion 3.33%, ATV 500

    base = simulate(db_session, "NM", TODAY, 0, 0, 0, now=_ist(15, 30))
    assert base["day"]["base_close"] == pytest.approx(2500) and base["day"]["scenario_close"] == pytest.approx(2500)
    s = simulate(db_session, "NM", TODAY, 0, 500, 0, now=_ist(15, 30))  # ATV doubled
    assert s["multiplier"] == pytest.approx(2.0)
    assert s["day"]["scenario_close"] == pytest.approx(500 + 2000 * 2)
    assert s["day"]["scenario_achievement_pct"] == pytest.approx(45.0)


def test_whatif_needs_live_conversion_and_open_day(db_session):
    assert simulate(db_session, "NM", TODAY, 5, 0, 0, now=_ist(12, 0))["reason"] == "no_conversion_or_atv"
    assert simulate(db_session, "NM", TODAY - timedelta(days=1), 5, 0, 0, now=_ist(12, 0))["available"] is False


def test_whatif_route_rejects_out_of_range_levers(client, nw_headers):
    p = {"store": "NM", "date": TODAY.isoformat(), "conversion_pp": 99}
    assert client.get("/api/advisor/whatif", params=p, headers=nw_headers).status_code == 422
    p = {"store": "HB", "date": TODAY.isoformat()}
    assert client.get("/api/advisor/whatif", params=p, headers=nw_headers).status_code == 403


def test_advisor_rate_limit(client, nw_headers, monkeypatch):
    from src import rate_limiter

    monkeypatch.setattr(rate_limiter.advisor_limiter, "max_requests", 2)
    monkeypatch.setattr(rate_limiter.advisor_limiter._local, "max_requests", 2)  # Redis-less test mode
    p = {"store": "NM", "date": TODAY.isoformat()}
    codes = [client.get("/api/advisor/whatif", params=p, headers=nw_headers).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


# ---------------------------------------------------------------- outcomes

def test_outcome_scores_the_slot_after_the_tick(db_session):
    day = date(2026, 11, 17)
    for w in range(1, 5):  # slot 2 conversion 50% on prior Tuesdays
        store_db.add_footfall_entry(db_session, "NM", day - timedelta(weeks=w), time(15, 0), 40)
        store_db.add_nob_entry(db_session, "NM", day - timedelta(weeks=w), time(15, 0), 20)
    store_db.add_footfall_entry(db_session, "NM", day, time(15, 0), 40)
    store_db.add_nob_entry(db_session, "NM", day, time(15, 0), 30)  # 75%
    # Ticked at 12:30 IST (= 07:00 UTC) -> scored on the 2 PM slot.
    db_session[ADVISOR_ACTIONS].insert_one({"store_code": "NM", "entry_date": day.isoformat(), "action_key": "conversion_low",
                                            "done": True, "done_at": datetime(2026, 11, 17, 7, 0, tzinfo=timezone.utc).isoformat()})
    stats = outcomes.outcome_stats(db_session, "NM", TODAY, _ist(12, 0))
    c = stats["conversion_low"]
    assert (c["trials"], c["wins"], c["ranked"]) == (1, 1, False)
    assert c["avg_lift_pct"] == pytest.approx(50.0)


def test_tick_in_last_slot_is_not_scored(db_session):
    db_session[ADVISOR_ACTIONS].insert_one({"store_code": "NM", "entry_date": "2026-11-17", "action_key": "task2",
                                            "done": True, "done_at": "2026-11-17T16:00:00+00:00"})  # 21:30 IST
    assert outcomes.outcome_stats(db_session, "NM", TODAY, _ist(12, 0)) == {}


def test_ranked_actions_float_up_by_win_rate():
    checklist = [{"action_key": k} for k in ("task1", "task2", "task3")]
    stats = {"task2": {"ranked": True, "win_rate_pct": 40.0}, "task3": {"ranked": True, "win_rate_pct": 80.0},
             "task1": {"ranked": False, "win_rate_pct": 100.0}}
    assert [c["action_key"] for c in engine._rank_checklist(checklist, stats)] == ["task3", "task2", "task1"]


# ---------------------------------------------------------------- Co-Pilot

@pytest.mark.parametrize("q, intent", [
    ("why did we miss target yesterday?", "explain_day"),
    ("what went wrong today", "explain_day"),
    ("give me the morning brief", "brief"),
    ("evening debrief please", "brief"),
    ("why is conversion low", "coaching"),
])
def test_new_intents(q, intent):
    assert detect_intent(q).primary == intent


def test_explain_tool_denies_other_store(db_session):
    mgr = SecurityContext(user_id="u", store_code="NM", allowed_stores=["NM"])
    assert explain_tool(db_session, "HB", TODAY, mgr)["error"] == "ACCESS_DENIED"
    assert explain_tool(db_session, "ALL", TODAY, mgr)["error"] == "STORE_REQUIRED"


def test_copilot_explain_card_without_llm(db_session, monkeypatch):
    from src.chat.coordinator import run_copilot_turn

    monkeypatch.setattr("src.chat.coordinator.generate_llm_response", lambda *a, **k: None)
    _baseline(db_session)
    store_db.set_store_target(db_session, "NM", TODAY, 50000)
    _day(db_session, TODAY, 30000, 60, 30)
    mgr = SecurityContext(user_id="u", store_code="NM", allowed_stores=["NM"])
    resp = run_copilot_turn(db_session, "why did we miss target today?", mgr, target_date=TODAY)
    assert "advisor_agent" in resp.subagents_executed
    assert "Fewer shoppers came in" in resp.reply and "20,000.00" in resp.reply
