"""Admin-only SALES TARGET entry -- src/daily_dashboard_store.set_store_target
/ list_store_targets and the /api/targets routes (api/routes_targets.py).

The admin is the source of truth for the figure: set_store_target overwrites
an existing value (contrast auto_assign_target_if_missing, which only fills a
gap) and refreshes that day's KPI snapshot on every write. The routes are
mounted admin-only -- a store manager never reaches them.
"""
from __future__ import annotations

import io
from datetime import date, time

import openpyxl

from src import daily_dashboard_store


def _targets_workbook(rows: list[tuple]) -> bytes:
    """A 2-column (Date, Sales Target) .xlsx as bytes, header row included."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Date", "Sales Target"])
    for row in rows:
        ws.append(list(row))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# store layer
# ---------------------------------------------------------------------------


def test_set_store_target_creates_row(db_session):
    daily_dashboard_store.set_store_target(db_session, "NM", date(2026, 8, 20), 2_000_000.0)
    assert daily_dashboard_store.read_store_target(db_session, "NM", date(2026, 8, 20)) == 2_000_000.0


def test_set_store_target_overwrites_existing(db_session):
    daily_dashboard_store.set_store_target(db_session, "NM", date(2026, 8, 20), 2_000_000.0)
    daily_dashboard_store.set_store_target(db_session, "NM", date(2026, 8, 20), 3_500_000.0)
    assert daily_dashboard_store.read_store_target(db_session, "NM", date(2026, 8, 20)) == 3_500_000.0


def test_set_store_target_none_clears(db_session):
    daily_dashboard_store.set_store_target(db_session, "NM", date(2026, 8, 20), 2_000_000.0)
    daily_dashboard_store.set_store_target(db_session, "NM", date(2026, 8, 20), None)
    assert daily_dashboard_store.read_store_target(db_session, "NM", date(2026, 8, 20)) is None


def test_set_store_target_refreshes_snapshot(db_session):
    d = date(2026, 8, 20)
    daily_dashboard_store.add_bill_entry(db_session, "NM", d, time(12, 0), 500_000.0, 10.0)
    daily_dashboard_store.set_store_target(db_session, "NM", d, 1_000_000.0)

    entries = daily_dashboard_store.list_store_targets(db_session, "NM")
    assert len(entries) == 1
    assert entries[0]["date"] == "2026-08-20"
    assert entries[0]["sales_target"] == 1_000_000.0
    assert entries[0]["net_sales"] == 500_000.0
    assert entries[0]["achievement_pct"] == 50.0


def test_set_store_target_negative_rejected(db_session):
    import pytest

    with pytest.raises(ValueError):
        daily_dashboard_store.set_store_target(db_session, "NM", date(2026, 8, 20), -1.0)


def test_list_store_targets_sorted_and_scoped(db_session):
    daily_dashboard_store.set_store_target(db_session, "NM", date(2026, 8, 21), 2.0)
    daily_dashboard_store.set_store_target(db_session, "NM", date(2026, 8, 20), 1.0)
    daily_dashboard_store.set_store_target(db_session, "HB", date(2026, 8, 20), 9.0)

    nw = daily_dashboard_store.list_store_targets(db_session, "NM")
    assert [e["date"] for e in nw] == ["2026-08-20", "2026-08-21"]
    assert [e["sales_target"] for e in nw] == [1.0, 2.0]


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------


def test_put_and_get_target_round_trip(client, admin_headers):
    put = client.put(
        "/api/targets",
        json={"store": "NM", "date": "2026-08-20", "sales_target": 2_000_000},
        headers=admin_headers,
    )
    assert put.status_code == 200
    assert put.json()["sales_target"] == 2_000_000.0

    got = client.get("/api/targets", params={"store": "NM"}, headers=admin_headers)
    assert got.status_code == 200
    assert got.json()["entries"] == [
        {"date": "2026-08-20", "sales_target": 2_000_000.0, "net_sales": 0.0, "achievement_pct": 0.0}
    ]


def test_delete_target_clears_it(client, admin_headers):
    client.put("/api/targets", json={"store": "NM", "date": "2026-08-20", "sales_target": 5}, headers=admin_headers)
    deleted = client.delete("/api/targets", params={"store": "NM", "date": "2026-08-20"}, headers=admin_headers)
    assert deleted.status_code == 200
    got = client.get("/api/targets", params={"store": "NM"}, headers=admin_headers)
    assert got.json()["entries"][0]["sales_target"] is None


def test_bulk_targets(client, admin_headers, db_session):
    r = client.post(
        "/api/targets/bulk",
        json={
            "store": "HB",
            "rows": [
                {"date": "2026-08-20", "sales_target": 100},
                {"date": "2026-08-21", "sales_target": 200},
                {"date": "2026-08-22", "sales_target": 300},
            ],
        },
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["applied"] == 3
    assert daily_dashboard_store.read_store_target(db_session, "HB", date(2026, 8, 22)) == 300.0


def test_bulk_empty_rows_is_400(client, admin_headers):
    r = client.post("/api/targets/bulk", json={"store": "HB", "rows": []}, headers=admin_headers)
    assert r.status_code == 400


def test_negative_target_is_400(client, admin_headers):
    r = client.put(
        "/api/targets",
        json={"store": "NM", "date": "2026-08-20", "sales_target": -5},
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_unknown_store_is_400(client, admin_headers):
    r = client.get("/api/targets", params={"store": "ZZ"}, headers=admin_headers)
    assert r.status_code == 400


def test_targets_require_auth(client):
    assert client.get("/api/targets", params={"store": "NM"}).status_code == 401


def test_manager_cannot_read_targets(client, nw_headers):
    assert client.get("/api/targets", params={"store": "NM"}, headers=nw_headers).status_code == 403


def test_manager_cannot_write_targets(client, nw_headers, db_session):
    r = client.put(
        "/api/targets",
        json={"store": "NM", "date": "2026-08-20", "sales_target": 1},
        headers=nw_headers,
    )
    assert r.status_code == 403
    assert daily_dashboard_store.read_store_target(db_session, "NM", date(2026, 8, 20)) is None


# ---------------------------------------------------------------------------
# Excel bulk upload (POST /api/targets/upload)
# ---------------------------------------------------------------------------


def test_upload_targets_applies_every_row(client, admin_headers, db_session):
    content = _targets_workbook([("2026-09-01", 100), ("2026-09-02", 200), ("2026-09-03", None)])
    r = client.post(
        "/api/targets/upload",
        params={"store": "NM"},
        files={"file": ("targets.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["applied"] == 3
    assert daily_dashboard_store.read_store_target(db_session, "NM", date(2026, 9, 1)) == 100.0
    assert daily_dashboard_store.read_store_target(db_session, "NM", date(2026, 9, 3)) is None  # blank clears


def test_upload_targets_accepts_real_date_cells(client, admin_headers, db_session):
    content = _targets_workbook([(date(2026, 9, 10), 4242)])
    r = client.post(
        "/api/targets/upload",
        params={"store": "HB"},
        files={"file": ("t.xlsx", content, "application/octet-stream")},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert daily_dashboard_store.read_store_target(db_session, "HB", date(2026, 9, 10)) == 4242.0


def test_upload_targets_negative_is_400(client, admin_headers):
    content = _targets_workbook([("2026-09-01", -5)])
    r = client.post(
        "/api/targets/upload",
        params={"store": "NM"},
        files={"file": ("t.xlsx", content, "application/octet-stream")},
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_upload_targets_bad_date_is_400(client, admin_headers):
    content = _targets_workbook([("not-a-date", 5)])
    r = client.post(
        "/api/targets/upload",
        params={"store": "NM"},
        files={"file": ("t.xlsx", content, "application/octet-stream")},
        headers=admin_headers,
    )
    assert r.status_code == 400


def test_upload_targets_manager_forbidden(client, nw_headers):
    content = _targets_workbook([("2026-09-01", 5)])
    r = client.post(
        "/api/targets/upload",
        params={"store": "NM"},
        files={"file": ("t.xlsx", content, "application/octet-stream")},
        headers=nw_headers,
    )
    assert r.status_code == 403
