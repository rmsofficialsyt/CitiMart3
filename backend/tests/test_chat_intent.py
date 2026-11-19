"""Regression tests for copilot routing: every preset chip must reach its own
data and its own answer card, in English, Bengali and Hindi.

PRESETS mirrors PROMPT_PRESETS in frontend/src/components/AiChatbot.tsx
(hand-copied -- update both when a preset's wording changes). Before
src/chat/intent.py, several of these silently answered a different question:
the 7-day table and WoW were never fetched, the peak-day preset got the MTD
card, and "today's target vs actual" got a Target Adjustment card.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from mongomock import MongoClient

from config.settings import TIME_SLOT_ORDER
from db.models import BILLS, FOOTFALL, NOB, TARGETS
from src import daily_dashboard_store
from src.chat import client as chat_client
from src.chat.coordinator import run_copilot_turn
from src.chat.intent import detect_intent
from src.chat.memory import MESSAGES_COLLECTION, SessionMemoryStore
from src.chat.state import SecurityContext
from src.chat.tools.history_tools import clear_calendar_cache, resolve_query_target_date

PRESETS = [
    ('en', 'hist_yesterday', 'day_kpis', "Show yesterday's complete sales report including net sales, target achievement %, footfall, conversion %, ATV, and 4-time-slot breakdown."),
    ('en', 'hist_7days', 'history_n_days', 'Show a day-by-day table of our past 7 operating days with net sales, targets, footfall, bills, ATV, and overall daily averages.'),
    ('en', 'hist_mtd', 'mtd', 'Calculate our Month-To-Date (MTD) cumulative sales, active days, achievement %, and required daily run-rate for the rest of the month.'),
    ('en', 'hist_peak_day', 'peak_dip', 'What was our highest sales peak day and lowest sales dip day this month, and what were the contributing factors?'),
    ('en', 'hist_wow', 'wow', 'Compare our performance against the same day of the week 1 week and 2 weeks ago (Week-over-Week momentum).'),
    ('en', 'hist_wow_v2', 'wow', 'Compare our performance against the same weekday last week and two weeks ago (Week-over-Week momentum).'),
    ('en', 'target_7d', 'target_adjust', 'Calculate our 7-day rolling target adjustment (At = Tt + Ct). Show original target, carry-forward, adjusted target, and remaining balance.'),
    ('en', 'target_sim', 'target_simulate', 'Simulate rolling deficit recovery across 7-day vs 14-day vs 30-day windows. Which recovery pace is safest for our store?'),
    ('en', 'sales_today', 'day_kpis', 'How is our store performing against target today? Show net sales, target gap, and achievement %.'),
    ('en', 'sales_yoy', 'yoy', 'What is our YoY growth comparing current operating performance against the previous year same day?'),
    ('en', 'sales_bills', 'bills', 'What is our highest single bill, average ticket size, and recent billing stream today?'),
    ('en', 'conv_boost', 'coaching', 'Suggest 3 proven floor-level tactics to increase customer conversion rate above 70%.'),
    ('en', 'atv_lift', 'coaching', 'How can cashiers and sales staff actively push Average Transaction Value (ATV) above ₹1,800 and basket size above 2.8?'),
    ('en', 'peak_evening', 'surge', 'What is the priority checklist for floor supervisors during the primary evening peak surge (5 PM - 8 PM)?'),
    ('en', 'market_weather', 'weather', 'What is the live Kolkata weather and rain probability today, and how will it impact afternoon and evening footfall in New Market, Hatibagan, and Chowringhee?'),
    ('en', 'market_festivals', 'market', 'What upcoming Kolkata festivals, weekend dates, and wedding season surges should we prepare inventory and extra staff for?'),
    ('en', 'bench_ranking', 'ranking', 'Compare live sales, target achievement, and ATV across New Market, Hatibagan, and Chowringhee.'),
    ('en', 'stock_req', 'requisitions', 'Show the latest product requisition slips, pending stock demands, and urgent items.'),
    ('en', 'sop_directives', 'directives', 'What are the latest operational directives and urgent announcements from the Operational Head (Raphael Sir)?'),
    ('en', 'formula_all', 'formula', 'Show the complete mathematical formulas for Conversion %, ATV, Basket Size, SPH, and Tally Growth %.'),
    ('bn', 'hist_yesterday', 'day_kpis', 'গতকালের সম্পূর্ণ সেলস রিপোর্ট দিন—যার মধ্যে নেট সেলস, টার্গেট অর্জন, ফুটফল, কনভার্সন %, ATV এবং ৪টি সময়ভিত্তিক স্লটের হিসেব থাকবে।'),
    ('bn', 'hist_7days', 'history_n_days', 'বিগত ৭ দিনের দৈনিক সেলস, টার্গেট, ফুটফল, বিল সংখ্যা ও ATV সম্বলিত একটি টেবিল এবং দৈনিক গড় দেখান।'),
    ('bn', 'hist_mtd', 'mtd', 'চলতি মাসের MTD মোট সেলস, সক্রিয় দিন, অর্জন % এবং বাকি দিনগুলির জন্য প্রয়োজনীয় দৈনিক রান-রেট হিসেব করুন।'),
    ('bn', 'hist_peak_day', 'peak_dip', 'এই মাসে আমাদের স্টোরের সর্বোচ্চ সেলসের দিন (পিক ডে) এবং সর্বনিম্ন সেলসের দিন কোনটি ছিল এবং তার মেট্রিক্স কী?'),
    ('bn', 'target_7d', 'target_adjust', 'আমাদের ৭ দিনের রোলিং টার্গেট অ্যাডজাস্টমেন্ট (At = Tt + Ct) হিসেব করুন। মূল টার্গেট, ক্যারি-ফরোয়ার্ড এবং সমন্বিত টার্গেট দেখান।'),
    ('bn', 'target_sim', 'target_simulate', '৭ দিন, ১৪ দিন এবং ৩০ দিনের রোলিং ডেফিসিট রিকভারি উইন্ডোর তুলনা করুন। আমাদের স্টোরের জন্য কোনটি সবচেয়ে নিরাপদ?'),
    ('bn', 'sales_today', 'day_kpis', 'আজকের সেলস, টার্গেট গ্যাপ এবং অর্জন শতাংশের বিস্তারিত হিসেব দিন।'),
    ('bn', 'sales_yoy', 'yoy', 'পূর্ববর্তী বছরের একই দিনের তুলনায় বর্তমান সেলসের ট্যালি গ্রোথ পেস কত শতাংশ?'),
    ('bn', 'sales_bills', 'bills', 'আজকের সর্বোচ্চ একক বিল, গড় টিকিট সাইজ ও সাম্প্রতিক বিলিং স্ট্রিম দেখান।'),
    ('bn', 'conv_boost', 'coaching', 'আমাদের স্টোরের কনভার্সন রেট ৭০%+ এ নিয়ে যেতে ৩টি কার্যকর ফ্লোর স্ট্র্যাটেজি কী?'),
    ('bn', 'atv_lift', 'coaching', 'ক্যাশ ডেস্কে ক্রস-সেলিং বাড়িয়ে কীভাবে ATV ₹১,৮০০+ এবং বাস্কেট সাইজ ২.৮+ এ নিয়ে যাওয়া যায়?'),
    ('bn', 'peak_evening', 'surge', 'সন্ধ্যার প্রধান পিক আওয়ারে (৫টা থেকে ৮টা) ফ্লোর সুপারভাইজারদের অগ্রাধিকারমূলক করণীয় কী?'),
    ('bn', 'market_weather', 'weather', 'আজ কলকাতার লাইভ আবহাওয়া ও বৃষ্টির সম্ভাবনা কেমন এবং এটি নিউ মার্কেট, হাতিবাগান ও চৌরঙ্গীর ফুটফলে কী প্রভাব ফেলবে?'),
    ('bn', 'bench_ranking', 'ranking', 'নিউ মার্কেট, হাতিবাগান ও চৌরঙ্গী—৩টি স্টোরের লাইভ সেলস ও অ্যাচিভমেন্ট তুলনা দেখান।'),
    ('bn', 'stock_req', 'requisitions', 'সাম্প্রতিক প্রোডাক্ট রিকুইজিশন স্লিপ ও অপেক্ষমাণ জরুরি পণ্যের তালিকা দেখান।'),
    ('bn', 'sop_directives', 'directives', 'রাফায়েল স্যারের সাম্প্রতিক সক্রিয় নির্দেশাবলী ও জরুরি নোটিশগুলো কী কী?'),
    ('bn', 'formula_all', 'formula', 'Conversion %, ATV, Basket Size, SPH এবং Tally Growth গণনার অফিসিয়াল সূত্রগুলো দেখান।'),
    ('hi', 'hist_yesterday', 'day_kpis', 'कल की पूरी बिक्री रिपोर्ट दें, जिसमें नेट सेल्स, टारगेट अचीवमेंट %, फुटफॉल, कन्वर्शन दर, ATV और ४-टाइम स्लॉट ब्रेकडाउन शामिल हो।'),
    ('hi', 'hist_7days', 'history_n_days', 'पिछले 7 दिनों की दैनिक बिक्री, टारगेट, फुटफॉल, बिल और ATV की तालिका और कुल औसत दिखाएं।'),
    ('hi', 'hist_mtd', 'mtd', 'इस महीने की MTD कुल बिक्री, सक्रिय दिन, अचीवमेंट % और शेष दिनों के लिए आवश्यक दैनिक रन-रेट बताएं।'),
    ('hi', 'hist_peak_day', 'peak_dip', 'इस महीने हमारे स्टोर का सबसे ज्यादा बिक्री वाला दिन (पीक डे) और सबसे कम बिक्री वाला दिन कौन सा था?'),
    ('hi', 'target_7d', 'target_adjust', 'हमारी 7-दिवसीय रोलिंग टारगेट एडजस्टमेंट (At = Tt + Ct) की गणना करें और मूल लक्ष्य, कैरी-फॉरवर्ड व नया लक्ष्य दिखाएं।'),
    ('hi', 'target_sim', 'target_simulate', '7 दिन, 14 दिन और 30 दिन की डेफिसिट रिकवरी विंडो का तुलनात्मक सिमुलेशन दिखाएं।'),
    ('hi', 'sales_today', 'day_kpis', 'आज की बिक्री, टारगेट गैप और अचीवमेंट प्रतिशत की पूरी रिपोर्ट बताएं।'),
    ('hi', 'sales_yoy', 'yoy', 'पिछले वर्ष के समान दिन के मुकाबले वर्तमान शुद्ध बिक्री की टैली ग्रोथ क्या है?'),
    ('hi', 'sales_bills', 'bills', 'आज का सबसे बड़ा सिंगल बिल, औसत टिकट साइज और हालिया बिलिंग स्ट्रीम बताएं।'),
    ('hi', 'conv_boost', 'coaching', 'स्टोर का कन्वर्शन रेट 70%+ रखने और कस्टमर ड्रॉप कम करने के 3 मुख्य तरीके बताएं।'),
    ('hi', 'atv_lift', 'coaching', 'कैशियर द्वारा क्रॉस-सेलिंग करके एवरेज टिकट साइज ₹1,800+ और बास्केट साइज 2.8+ कैसे ले जाएं?'),
    ('hi', 'peak_evening', 'surge', 'शाम के मुख्य पीक ऑवर्स (5 PM से 8 PM) के दौरान फ्लोर मैनेजमेंट की चेकलिस्ट क्या है?'),
    ('hi', 'market_weather', 'weather', 'आज कोलकाता का मौसम और बारिश का पूर्वानुमान क्या है, और यह न्यू मार्केट, हाथीबागान व चौरंगी के फुटफॉल को कैसे प्रभावित करेगा?'),
    ('hi', 'bench_ranking', 'ranking', 'न्यू मार्केट, हाथीबागान और चौरंगी तीनों स्टोर्स की लाइव बिक्री और अचीवमेंट की तुलना करें।'),
    ('hi', 'stock_req', 'requisitions', 'हालिया प्रोडक्ट रिक्विजिशन स्लिप्स, पेंडिंग स्टॉक डिमांड और अर्जेंट आइटम्स की सूची दिखाएं।'),
    ('hi', 'sop_directives', 'directives', 'राफेल सर के एक्टिव ऑपरेशनल निर्देश और सेल्स टारगेट्स क्या हैं?'),
    ('hi', 'formula_all', 'formula', 'कन्वर्शन रेट, ATV, बास्केट साइज, SPH और टैली ग्रोथ के आधिकारिक फॉर्मूले बताएं।'),
]

# Heading of the English fallback card each primary intent must produce.
EN_CARD_HEADING = {
    "day_kpis": "Detailed Operations Report",
    "history_n_days": "Operating Days — Performance History",
    "mtd": "Month-To-Date (MTD) Pacing",
    "peak_dip": "Monthly Peak & Low Performance",
    "wow": "Week-over-Week (WoW) Comparison",
    "target_adjust": "Retail Target Adjustment & Rolling Recovery",
    "target_simulate": "Deficit Recovery Simulation",
    "yoy": "YoY Historical Tally Growth",
    "bills": "Billing —",
    "coaching": "Floor Playbook",
    "surge": "Floor Playbook",
    "weather": "Kolkata Market Context",
    "market": "Kolkata Market Context",
    "ranking": "Cross-store network rankings are restricted",  # NM manager
    "requisitions": "requisition",
    "directives": "Directives",
    "formula": "KPI Mathematical Formulas",
}

TODAY = date(2026, 11, 18)  # last day with data in the fixture


def _ctx(store: str | None = "NM", admin: bool = False) -> SecurityContext:
    return SecurityContext(
        user_id="admin1" if admin else f"user_{store}",
        username="admin" if admin else f"manager_{store}",
        role="admin" if admin else "store_manager",
        store_code=store,
        is_admin=admin,
        allowed_stores=["NM", "HB", "CHW", "ALL"] if admin else [store],
    )


@pytest.fixture
def mock_db(monkeypatch):
    # The dashboard L1 cache is process-global and not keyed by database, so
    # another test's mongomock figures for the same store+date could be served.
    daily_dashboard_store.invalidate_dashboard_cache()
    clear_calendar_cache()
    # No network in tests: stub the weather / web-search sources.
    monkeypatch.setattr("src.chat.agents.market_intel_agent.live_web_search",
                        lambda *a, **k: [{"title": "Stub signal", "snippet": "stub", "url": ""}])
    monkeypatch.setattr("src.daily_context.get_weather", lambda d: None)

    db = MongoClient()["citimart_intent_test"]
    for store, scale in (("NM", 1.0), ("HB", 0.5)):
        for i in range(9):  # 2026-11-10 .. 2026-11-18
            d_iso = (date(2026, 11, 10) + timedelta(days=i)).isoformat()
            db[BILLS].insert_many([
                {"store_code": store, "entry_date": d_iso, "bill_time": "12:30", "time_slot": TIME_SLOT_ORDER[0],
                 "net_amount": scale * (100000.0 + i * 10000.0), "bill_quantity": 100 + i},
                {"store_code": store, "entry_date": d_iso, "bill_time": "18:45", "time_slot": TIME_SLOT_ORDER[2],
                 "net_amount": scale * 150000.0, "bill_quantity": 150},
            ])
            db[FOOTFALL].insert_one({"store_code": store, "entry_date": d_iso, "entry_time": "12:00",
                                     "time_slot": TIME_SLOT_ORDER[0], "footfall": 600})
            db[NOB].insert_one({"store_code": store, "entry_date": d_iso, "entry_time": "12:00",
                                "time_slot": TIME_SLOT_ORDER[0], "nob": 250})
            db[TARGETS].insert_one({"store_code": store, "entry_date": d_iso, "sales_target": scale * 300000.0})
    yield db
    daily_dashboard_store.invalidate_dashboard_cache()
    clear_calendar_cache()


# --- intent detection ----------------------------------------------------------

@pytest.mark.parametrize("lang,preset_id,expected,prompt", PRESETS, ids=[f"{p[0]}-{p[1]}" for p in PRESETS])
def test_every_preset_routes_to_its_intent(lang, preset_id, expected, prompt):
    assert detect_intent(prompt).primary == expected


def test_collisions_that_used_to_misroute():
    # "Compare" in the WoW preset must not become a network ranking.
    assert detect_intent("Compare our performance against the same day last week").primary == "wow"
    # "this month" in the peak-day preset must not become MTD.
    assert detect_intent("Best day and worst day this month?").primary == "peak_dip"
    # A date like "14 Nov" is not a 14-day recovery window.
    r = detect_intent("Target adjustment for 14 Nov")
    assert r.primary == "target_adjust" and r.window_days is None
    assert detect_intent("Rolling recovery over a 14 day window").window_days == 14
    # "past N days" captures N.
    assert detect_intent("show the last 14 operating days").history_days == 14
    # Hindi "कल" (yesterday) must not match inside "कलेक्शन" (collection).
    d, _ = resolve_query_target_date(MongoClient()["x"], "NM", "आज का कलेक्शन", default_date=TODAY)
    assert d == TODAY
    # "शामिल" (included) is not "शाम" (evening).
    assert detect_intent("4-टाइम स्लॉट ब्रेकडाउन शामिल हो").primary != "surge"


# --- end-to-end: every EN preset gets its own card ---------------------------------

@pytest.mark.parametrize(
    "preset_id,expected,prompt",
    [(p[1], p[2], p[3]) for p in PRESETS if p[0] == "en"],
    ids=[p[1] for p in PRESETS if p[0] == "en"],
)
def test_every_en_preset_returns_its_own_card(mock_db, preset_id, expected, prompt):
    resp = run_copilot_turn(db=mock_db, query=prompt, sec_ctx=_ctx("NM"), target_date=TODAY, language="en")
    assert resp.engine == "citimart-multi-agent-domain-engine"  # LLM stubbed out in conftest
    assert EN_CARD_HEADING[expected].lower() in resp.reply.lower(), resp.reply[:300]
    if expected in ("target_adjust", "target_simulate"):
        assert "target_adjust_agent" in resp.subagents_executed
    else:
        # The target agent no longer runs (and hijacks the answer) by default.
        assert "target_adjust_agent" not in resp.subagents_executed


def test_history_table_uses_requested_n_days(mock_db):
    resp = run_copilot_turn(db=mock_db, query="Show the past 5 days sales table", sec_ctx=_ctx("NM"),
                            target_date=TODAY, language="en")
    assert "Last 5 Operating Days" in resp.reply
    assert resp.reply.count("| 2026-11-") == 5


def test_peak_day_preset_reports_real_best_and_worst(mock_db):
    resp = run_copilot_turn(db=mock_db, query=PRESETS[3][3], sec_ctx=_ctx("NM"), target_date=TODAY, language="en")
    # NM sales grow every day in the fixture: best = 18 Nov, worst = 10 Nov.
    best = resp.reply.index("Highest Sales Peak Day")
    assert "2026-11-18" in resp.reply[best:best + 200]
    assert "2026-11-10" in resp.reply[resp.reply.index("Lowest Sales Dip Day"):]


# --- dates ------------------------------------------------------------------------

def test_explicit_today_with_no_entries_is_not_swapped_for_another_day(mock_db):
    today = date(2026, 11, 19)  # nothing logged yet
    resp = run_copilot_turn(db=mock_db, query="How are today's sales against target?", sec_ctx=_ctx("NM"),
                            target_date=today, language="en")
    assert resp.target_date == "2026-11-19"
    assert "No sales (bills), footfall or NOB have been logged" in resp.reply
    assert "2026-11-18" in resp.reply  # points at the latest recorded day instead of faking it


def test_vague_sales_question_falls_back_to_latest_day_and_says_so(mock_db):
    d, reason = resolve_query_target_date(mock_db, "NM", "show sales performance", default_date=date(2026, 11, 19))
    assert d == date(2026, 11, 18)
    assert "No bills logged yet" in reason


def test_yoy_vs_query_still_parses_explicit_dates(mock_db):
    d, _ = resolve_query_target_date(mock_db, "NM", "YoY: 08.10.2026 vs 08.10.2025", default_date=TODAY)
    assert d == date(2026, 10, 8)


def test_follow_up_keeps_previous_explicit_date(mock_db):
    sec = _ctx("NM")
    first = run_copilot_turn(db=mock_db, query="Sales report for 2026-11-12", sec_ctx=sec, target_date=TODAY, language="en")
    assert first.target_date == "2026-11-12"
    follow = run_copilot_turn(db=mock_db, query="and what about the bills?", sec_ctx=sec, target_date=TODAY,
                              session_id=first.session_id, language="en")
    assert follow.target_date == "2026-11-12"
    assert "Billing" in follow.reply and "(2026-11-12)" in follow.reply


# --- ALL store (admin Overall Summary) ------------------------------------------------

def test_admin_all_store_gets_combined_figures(mock_db):
    resp = run_copilot_turn(db=mock_db, query="Show today's sales report", sec_ctx=_ctx(None, admin=True),
                            target_date=TODAY, requested_store="ALL", language="en")
    # NM 330,000 + HB 165,000 on 18 Nov (blended, not zero).
    assert "₹495,000.00" in resp.reply
    assert "All Stores" in resp.reply


def test_admin_ranking_lists_all_stores(mock_db):
    resp = run_copilot_turn(db=mock_db, query=PRESETS[16][3], sec_ctx=_ctx(None, admin=True),
                            target_date=TODAY, requested_store="ALL", language="en")
    assert "Consolidated 3-Store Kolkata Network Benchmark" in resp.reply
    reply = resp.reply.upper()
    assert reply.index("NEW MARKET") < reply.index("HATIBAGAN")  # NM sold more on 18 Nov


# --- sessions --------------------------------------------------------------------------

def test_restored_transcript_alternates_even_with_equal_timestamps(mock_db):
    sec = _ctx("NM")
    sid = SessionMemoryStore.get_or_create_session(mock_db, None, sec, "NM", "t")
    # Legacy rows: user + assistant share one timestamp, assistant inserted first.
    mock_db[MESSAGES_COLLECTION].insert_many([
        {"session_id": sid, "role": "user", "content": "q1", "timestamp": "2026-11-18T10:00:00+00:00"},
        {"session_id": sid, "role": "assistant", "content": "a1", "timestamp": "2026-11-18T10:00:00+00:00"},
    ])
    for i in range(2, 31):
        SessionMemoryStore.append_messages(mock_db, sid, f"q{i}", f"a{i}")
    msgs = SessionMemoryStore.get_full_transcript(mock_db, sid, sec)
    assert len(msgs) == 60  # not capped at the 20-message LLM window
    assert [m["role"] for m in msgs] == ["user", "assistant"] * 30
    assert [m["content"] for m in msgs[:4]] == ["q1", "a1", "q2", "a2"]
    assert len(SessionMemoryStore.get_history(mock_db, sid, sec)) == 20


def test_session_list_filters_by_store_and_session_not_reused_across_stores(mock_db):
    admin = _ctx(None, admin=True)
    nm_sid = SessionMemoryStore.get_or_create_session(mock_db, None, admin, "NM", "t")
    hb_sid = SessionMemoryStore.get_or_create_session(mock_db, None, admin, "HB", "t")
    assert [s["session_id"] for s in SessionMemoryStore.list_user_sessions(mock_db, admin, store_code="HB")] == [hb_sid]
    # Continuing the NM session while looking at HB starts a fresh HB session.
    assert SessionMemoryStore.get_or_create_session(mock_db, nm_sid, admin, "HB", "t") != nm_sid
    assert SessionMemoryStore.get_or_create_session(mock_db, nm_sid, admin, "NM", "t") == nm_sid


def test_session_routes_full_transcript_and_store_filter(client, nw_headers):
    sid = None
    for i in range(12):  # 24 messages > the 20-message LLM window
        r = client.post("/api/daily/chat", json={"message": f"sales report {i}", "session_id": sid,
                                                  "store_code": "NM", "date_str": "2026-10-09"}, headers=nw_headers)
        assert r.status_code == 200
        sid = r.json()["session_id"]
    msgs = client.get(f"/api/daily/chat/sessions/{sid}", headers=nw_headers).json()["messages"]
    assert len(msgs) == 24
    assert msgs[0]["content"] == "sales report 0" and msgs[0]["role"] == "user"
    listed = client.get("/api/daily/chat/sessions?store_code=NM", headers=nw_headers).json()["sessions"]
    assert sid in [s["session_id"] for s in listed]
    # A manager may not list another store's sessions.
    assert client.get("/api/daily/chat/sessions?store_code=HB", headers=nw_headers).status_code == 403


# --- LLM client -------------------------------------------------------------------------

def test_llm_contents_keep_conversation_history():
    contents = chat_client.build_contents(
        "and footfall?",
        [
            {"role": "user", "content": "sales on 12 Nov?"},
            {"role": "assistant", "content": "Net Sales ₹2,00,000"},
        ],
    )
    assert [c["role"] for c in contents] == ["user", "model", "user"]
    assert contents[-1]["parts"][-1]["text"] == "and footfall?"
    assert contents[0]["parts"][0]["text"] == "sales on 12 Nov?"


def test_generate_content_receives_history(monkeypatch):
    captured = {}

    class FakeModels:
        def generate_content(self, model, contents, config):
            captured["contents"] = contents
            return type("R", (), {"text": "ok"})()

    class FakeClient:
        models = FakeModels()

        class interactions:  # noqa: N801 - mimic SDK attribute
            @staticmethod
            def create(**kwargs):
                raise AttributeError("no interactions api")

    monkeypatch.setattr(chat_client, "get_genai_client", lambda: FakeClient())
    out = chat_client.generate_llm_response(
        "and footfall?", system_instruction="sys",
        conversation_history=[{"role": "user", "content": "q"}, {"role": "assistant", "content": "a"}],
    )
    assert out == "ok"
    assert [c["role"] for c in captured["contents"]] == ["user", "model", "user"]
