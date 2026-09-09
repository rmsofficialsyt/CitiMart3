"""A store manager can only ever touch their own store's Daily Operations
data; the admin can touch any. Authorization happens before the DB lookup, so
a wrong store+row pairing 403s rather than 404s (no found/not-found leak)."""
from __future__ import annotations

from src import daily_dashboard_store


def _add_hb_bill(db_session):
    from datetime import date, time
    return daily_dashboard_store.add_bill_entry(db_session, "HB", date(2026, 8, 20), time(11, 30), 500.0, 2.0)


def test_manager_reads_own_store(client, nw_headers):
    r = client.get("/api/daily/bill-log", params={"store": "NM", "date": "2026-08-20"}, headers=nw_headers)
    assert r.status_code == 200


def test_manager_cannot_read_other_store(client, nw_headers):
    r = client.get("/api/daily/bill-log", params={"store": "HB", "date": "2026-08-20"}, headers=nw_headers)
    assert r.status_code == 403


def test_admin_reads_any_store(client, admin_headers):
    for store in ("NM", "HB", "CHW"):
        r = client.get("/api/daily/bill-log", params={"store": store, "date": "2026-08-20"}, headers=admin_headers)
        assert r.status_code == 200


def test_manager_cannot_write_other_store(client, nw_headers, db_session):
    r = client.post(
        "/api/daily/bill-log",
        json={"store": "HB", "date": "2026-08-20", "bill_time": "12:00", "net_amount": 100, "bill_quantity": 1},
        headers=nw_headers,
    )
    assert r.status_code == 403
    # nothing was written
    from datetime import date
    assert daily_dashboard_store.list_bill_entries(db_session, "HB", date(2026, 8, 20)) == []


def test_manager_cannot_edit_other_store_row_403_not_404(client, nw_headers, db_session):
    hb_row = _add_hb_bill(db_session)["row"]
    r = client.put(
        "/api/daily/bill-log",
        json={"store": "HB", "row": hb_row, "bill_time": "12:00", "net_amount": 1, "bill_quantity": 1},
        headers=nw_headers,
    )
    assert r.status_code == 403  # authz before lookup


def test_unknown_store_code_is_400(client, admin_headers):
    r = client.get("/api/daily/bill-log", params={"store": "ZZ", "date": "2026-08-20"}, headers=admin_headers)
    assert r.status_code == 400


def test_daily_routes_require_auth(client):
    assert client.get("/api/daily/bill-log", params={"store": "NM", "date": "2026-08-20"}).status_code == 401


def test_daily_live_overall_admin_only(client, admin_headers, nw_headers):
    ok = client.get("/api/daily/live/overall", params={"date": "2026-08-20"}, headers=admin_headers)
    assert ok.status_code == 200
    body = ok.json()
    assert body["store"] == "ALL"
    assert set(body["per_store"]) == {"NM", "HB", "CHW"}
    assert "achievement_pct" in body["kpis"]

    forbidden = client.get("/api/daily/live/overall", params={"date": "2026-08-20"}, headers=nw_headers)
    assert forbidden.status_code == 403


def test_daily_live_carries_day_type_context(client, nw_headers):
    r = client.get("/api/daily/live", params={"store": "NM", "date": "2026-08-21"}, headers=nw_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["day_type"] in ("Weekend", "Mid-Week", "Regular")
    # No workbook in this sub-project, so no same-day-last-year matrix rides
    # along any more -- the key must be gone, not present-but-null, so the
    # frontend never renders an empty comparison card for it.
    assert "previous_year" not in body


def test_manager_cannot_override_other_store_kpi(client, nw_headers, db_session):
    from datetime import date
    r = client.put(
        "/api/daily/kpi-override",
        json={"store": "HB", "date": "2026-08-20", "field": "atv", "value": 555},
        headers=nw_headers,
    )
    assert r.status_code == 403
    assert daily_dashboard_store.compute_live_kpis(db_session, "HB", date(2026, 8, 20))["overridden"] == []


def test_kpi_override_rejects_non_overridable_field(client, nw_headers):
    r = client.put(
        "/api/daily/kpi-override",
        json={"store": "NM", "date": "2026-08-20", "field": "net_sales", "value": 1},
        headers=nw_headers,
    )
    assert r.status_code == 400


def test_kpi_override_round_trip(client, nw_headers):
    put = client.put(
        "/api/daily/kpi-override",
        json={"store": "NM", "date": "2026-08-20", "field": "atv", "value": 777},
        headers=nw_headers,
    )
    assert put.status_code == 200
    assert put.json()["kpis"]["atv"] == 777
    assert put.json()["overridden"] == ["atv"]

    cleared = client.delete(
        "/api/daily/kpi-override",
        params={"store": "NM", "date": "2026-08-20", "field": "atv"},
        headers=nw_headers,
    )
    assert cleared.status_code == 200
    assert cleared.json()["overridden"] == []


def test_manager_cannot_export_other_store_report(client, nw_headers):
    r = client.get("/api/daily/report", params={"store": "HB", "format": "xlsx"}, headers=nw_headers)
    assert r.status_code == 403


def test_daily_report_unknown_format_is_400(client, nw_headers):
    r = client.get("/api/daily/report", params={"store": "NM", "format": "docx"}, headers=nw_headers)
    assert r.status_code == 400
