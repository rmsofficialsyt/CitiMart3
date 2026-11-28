"""Fail-closed store scoping tests (spec US-0) across requisitions, stocks, and staff."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.auth import CurrentUser, resolve_store_scope
from tests.conftest import make_token

SCOPED_READ_ROUTES = [
    "/api/daily/requisitions",
    "/api/daily/requisitions/export/xlsx",
    "/api/daily/stocks/summary",
    "/api/daily/stocks/inventory",
    "/api/daily/stocks/movements",
    "/api/daily/stocks/transfers",
    "/api/daily/staff/summary",
    "/api/daily/staff/members",
]


def test_resolve_store_scope_unit():
    admin = CurrentUser(sub="a", username="admin", role="admin", store_code=None)
    assert resolve_store_scope(admin, None) is None
    assert resolve_store_scope(admin, "") is None
    assert resolve_store_scope(admin, "ALL") is None
    assert resolve_store_scope(admin, "nm") == "NM"

    mgr_hb = CurrentUser(sub="m1", username="mgr_hb", role="manager", store_code="HB")
    assert resolve_store_scope(mgr_hb, None) == "HB"
    assert resolve_store_scope(mgr_hb, "ALL") == "HB"
    assert resolve_store_scope(mgr_hb, "HB") == "HB"


@pytest.mark.parametrize("path", SCOPED_READ_ROUTES)
def test_storeless_manager_gets_403(client: TestClient, path: str):
    token = make_token("manager", None, "orphan_mgr")
    res = client.get(f"{path}?store_code=NM", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.parametrize("path", SCOPED_READ_ROUTES)
def test_hb_manager_requesting_nm_gets_403(client: TestClient, path: str):
    token = make_token("manager", "HB", "mgr_hb")
    res = client.get(f"{path}?store_code=NM", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.parametrize("path", SCOPED_READ_ROUTES)
def test_admin_all_and_specific_store_succeed(client: TestClient, path: str):
    admin_token = make_token("admin", None, "admin")
    headers = {"Authorization": f"Bearer {admin_token}"}
    assert client.get(f"{path}?store_code=ALL", headers=headers).status_code == 200
    assert client.get(f"{path}?store_code=NM", headers=headers).status_code == 200
