from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import mongomock
import pytest

import db.engine
import db.session
from db.models import TARGETS, next_id
from src import daily_dashboard_store, daily_midnight_job

IST = ZoneInfo("Asia/Kolkata")


@pytest.fixture()
def midnight_job_db(monkeypatch):
    """finalize_day() (unlike every daily_dashboard_store function) takes no
    `db` parameter -- it's the background job's own entry point, opening its
    own session_scope() per store (see daily_midnight_job.py's docstring on
    why: no per-request Depends() exists for a background asyncio task).
    That means the test can't just hand it a Database directly the way
    tests/test_daily_dashboard_store.py's db_session fixture does -- it has
    to make get_client()/session_scope() actually resolve to the same
    backing store across independent calls, the same way multiple
    session_scope() calls against a real MongoDB instance would all see the
    same data. Monkeypatching db.engine's cached client directly to one
    shared mongomock.MongoClient() (instead of going through MONGODB_URI, as
    the Postgres-era fixture went through DATABASE_URL) is the simplest way
    to get that sharing out of an in-memory mock."""
    client = mongomock.MongoClient()
    monkeypatch.setattr(db.engine, "_client", client)
    db.session.reset_session_factory_for_tests()
    yield client["citimart"]
    db.engine.reset_engine_for_tests()
    db.session.reset_session_factory_for_tests()


def _set_target(db_session, store: str, target_date: date, sales_target: float) -> None:
    db_session[TARGETS].insert_one({
        "_id": next_id(db_session, TARGETS),
        "store_code": store,
        "entry_date": target_date.isoformat(),
        "sales_target": sales_target,
        "net_sales": None,
        "remaining": None,
        "footfall": None,
        "nob": None,
        "atv": None,
        "rpv": None,
        "basket_size": None,
        "conversion_pct": None,
        "achievement_pct": None,
        "reason": None,
    })


def test_seconds_until_next_midnight_just_before():
    now = datetime(2026, 8, 20, 23, 59, 0, tzinfo=IST)
    assert daily_midnight_job._seconds_until_next_midnight(now) == 60.0


def test_seconds_until_next_midnight_at_midnight():
    now = datetime(2026, 8, 20, 0, 0, 0, tzinfo=IST)
    assert daily_midnight_job._seconds_until_next_midnight(now) == 24 * 3600


def test_finalize_day_skips_date_with_no_target_row(midnight_job_db):
    """A date the admin never set a target for is left completely alone. The
    job has no historical data to estimate from any more (DATASET.xlsx lives
    in the other sub-project) and never invents a target -- so no targets row
    appears for 2026-08-21."""
    with db.session.session_scope() as session:
        _set_target(session, "NM", date(2026, 8, 20), 10_000.0)  # only 2026-08-20 has a target row

    daily_midnight_job.finalize_day(date(2026, 8, 21))

    with db.session.session_scope() as session:
        assert daily_dashboard_store.read_store_target(session, "NM", date(2026, 8, 21)) is None
        assert daily_dashboard_store._find_target(session, "NM", date(2026, 8, 21)) is None


def test_finalize_day_runs_even_when_nothing_logged_that_day(midnight_job_db):
    """A target row exists (admin set SALES TARGET) but the manager never
    logged anything that day -- finalize_day should still run safely:
    Footfall/NOB/Net Sales all default to 0.0 (live sums of empty logs, not
    fabricated), no exception."""
    with db.session.session_scope() as session:
        _set_target(session, "NM", date(2026, 8, 20), 10_000.0)

    daily_midnight_job.finalize_day(date(2026, 8, 20))

    with db.session.session_scope() as session:
        kpis = daily_dashboard_store.compute_live_kpis(session, "NM", date(2026, 8, 20))
    assert kpis["sales_target"] == 10_000.0
    assert kpis["footfall"] == 0.0
    assert kpis["nob"] == 0.0


def test_finalize_day_recomputes_net_sales_footfall_and_nob_against_final_logs(midnight_job_db):
    with db.session.session_scope() as session:
        _set_target(session, "NM", date(2026, 8, 20), 10_000.0)
        daily_dashboard_store.add_bill_entry(session, "NM", date(2026, 8, 20), time(11, 0), 1_000.0, 2.0)
        daily_dashboard_store.add_footfall_entry(session, "NM", date(2026, 8, 20), time(11, 0), 50.0)
        daily_dashboard_store.add_nob_entry(session, "NM", date(2026, 8, 20), time(11, 0), 1.0)
        daily_dashboard_store.save_target_entry(session, "NM", date(2026, 8, 20), reason="Opening day.")

        # A bill and a footfall entry are added after the manager's last
        # manual submission -- without the midnight job, the saved snapshot
        # would understate today.
        daily_dashboard_store.add_bill_entry(session, "NM", date(2026, 8, 20), time(18, 0), 2_000.0, 3.0)
        daily_dashboard_store.add_footfall_entry(session, "NM", date(2026, 8, 20), time(18, 0), 30.0)

    daily_midnight_job.finalize_day(date(2026, 8, 20))

    with db.session.session_scope() as session:
        kpis = daily_dashboard_store.compute_live_kpis(session, "NM", date(2026, 8, 20))
    assert kpis["net_sales"] == 3_000.0
    assert kpis["footfall"] == 80.0  # refreshed against both Footfall entries
    assert kpis["nob"] == 1.0
    assert kpis["reason"] == "Opening day."  # untouched (finalize_day passes reason=None)
