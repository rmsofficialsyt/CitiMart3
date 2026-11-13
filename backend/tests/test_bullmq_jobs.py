"""BullMQ-backed jobs: report job API + IDOR, audit delivery, midnight lock,
worker handlers. The queue transport itself is stubbed (enqueue captured);
the handlers the worker runs are exercised for real against mongomock."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import date, time

import pytest

from config.auth_users import DEFAULT_PASSWORDS
from config.env import env
from db.models import AUDIT_LOGS
from src import daily_dashboard_store, daily_midnight_job
from src.queue import AUDIT_QUEUE, REPORTS_QUEUE


@pytest.fixture()
def enqueued(monkeypatch, fake_redis):
    """BullMQ 'enabled', with the transport replaced by a recorder."""
    calls: list[dict] = []

    def fake_enqueue(queue_name, job_name, data, *, job_id=None, opts=None, wait=True, timeout=3.0):
        calls.append({"queue": queue_name, "name": job_name, "data": data, "job_id": job_id})
        return job_id or "auto-1"

    monkeypatch.setattr(env, "bullmq_enabled", True)
    monkeypatch.setattr(env, "redis_url", "redis://fake")
    monkeypatch.setattr("src.queue.bullmq_client.enqueue", fake_enqueue)
    return calls


@pytest.fixture()
def worker_db(db_session, monkeypatch):
    """Point the worker handlers' session_scope() at the test database."""

    @contextmanager
    def scope():
        yield db_session

    monkeypatch.setattr("db.session.session_scope", scope)
    return db_session


def test_report_job_round_trip_and_owner_only_access(client, nw_headers, hb_headers, admin_headers, enqueued, worker_db):
    daily_dashboard_store.add_bill_entry(worker_db, "NM", date(2026, 11, 13), time(11, 0), 1200.0, 3)
    created = client.post("/api/daily/report/jobs", headers=nw_headers, json={"store": "NM", "format": "xlsx"})
    assert created.status_code == 202
    job_id = created.json()["job_id"]
    assert enqueued[-1]["queue"] == REPORTS_QUEUE and enqueued[-1]["job_id"] == job_id

    status = client.get(f"/api/daily/report/jobs/{job_id}", headers=nw_headers)
    assert status.json() == {"job_id": job_id, "status": "waiting"}
    # another store's manager AND the admin get "not found", not "forbidden"
    assert client.get(f"/api/daily/report/jobs/{job_id}", headers=hb_headers).status_code == 404
    assert client.get(f"/api/daily/report/jobs/{job_id}", headers=admin_headers).status_code == 404

    from src.queue.worker import _handle_report

    assert _handle_report(enqueued[-1]["data"])["status"] == "completed"
    done = client.get(f"/api/daily/report/jobs/{job_id}", headers=nw_headers)
    assert done.status_code == 200
    assert done.content[:2] == b"PK"  # xlsx is a zip
    assert "attachment" in done.headers["content-disposition"]


def test_manager_cannot_enqueue_another_stores_report(client, nw_headers, enqueued):
    resp = client.post("/api/daily/report/jobs", headers=nw_headers, json={"store": "HB", "format": "pdf"})
    assert resp.status_code == 403
    assert enqueued == []


def test_report_jobs_503_when_bullmq_disabled(client, nw_headers):
    resp = client.post("/api/daily/report/jobs", headers=nw_headers, json={"store": "NM", "format": "xlsx"})
    assert resp.status_code == 503


def test_unknown_job_is_404(client, nw_headers, enqueued):
    assert client.get("/api/daily/report/jobs/does-not-exist", headers=nw_headers).status_code == 404


def test_audit_written_directly_when_bullmq_disabled(client, db_session):
    client.post("/api/auth/login", json={"username": "ADMINISTRATOR", "password": "nope"})
    client.post("/api/auth/login", json={"username": "ADMINISTRATOR", "password": DEFAULT_PASSWORDS["ADMINISTRATOR"]})
    events = list(db_session[AUDIT_LOGS].find({}, {"_id": 0}))
    assert [e["action"] for e in events] == ["login_failed", "login_success"]
    assert all(e["ts"].endswith("+00:00") and e["ip"] for e in events)
    assert not any("nope" in str(e) for e in events)  # LOG-02: no password


def test_audit_goes_through_queue_when_enabled(client, db_session, enqueued):
    client.post("/api/auth/login", json={"username": "ADMINISTRATOR", "password": DEFAULT_PASSWORDS["ADMINISTRATOR"]})
    audit_jobs = [c for c in enqueued if c["queue"] == AUDIT_QUEUE]
    assert [c["name"] for c in audit_jobs] == ["login_success"]
    assert db_session[AUDIT_LOGS].count_documents({}) == 0  # the worker persists it


def test_worker_audit_handler_persists(worker_db):
    from src.audit import build_event
    from src.queue.worker import _handle_audit

    _handle_audit(build_event("logout", username="ADMINISTRATOR", ip="10.0.0.1", result="success"))
    assert worker_db[AUDIT_LOGS].find_one({"action": "logout"})["username"] == "ADMINISTRATOR"


def test_midnight_finalize_runs_once_across_processes(fake_redis, monkeypatch):
    ran: list[date] = []
    monkeypatch.setattr(daily_midnight_job, "finalize_day", lambda d: ran.append(d))
    run, target = date(2026, 11, 14), date(2026, 11, 13)
    assert daily_midnight_job.finalize_day_once(run, target) is True
    assert daily_midnight_job.finalize_day_once(run, target) is False  # replica / worker #2
    assert daily_midnight_job.finalize_day_once(date(2026, 11, 15), target) is True  # next night
    assert ran == [target, target]
    assert fake_redis.ttl(f"lock:midnight:{run.isoformat()}:{target.isoformat()}") > 0


def test_midnight_without_redis_still_runs(monkeypatch):
    ran: list[date] = []
    monkeypatch.setattr(daily_midnight_job, "finalize_day", lambda d: ran.append(d))
    assert daily_midnight_job.finalize_day_once(date(2026, 11, 14), date(2026, 11, 13)) is True
    assert ran == [date(2026, 11, 13)]


def test_worker_midnight_handler(fake_redis, monkeypatch):
    from src.queue.worker import _handle_midnight

    monkeypatch.setattr(daily_midnight_job, "finalize_day", lambda d: None)
    data = {"run_date": "2026-11-14", "target_date": "2026-11-13"}
    assert _handle_midnight(data) == {"ran": True}
    assert _handle_midnight(data) == {"ran": False}


def test_health_reports_redis(client, fake_redis):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["redis"] == "ok"
