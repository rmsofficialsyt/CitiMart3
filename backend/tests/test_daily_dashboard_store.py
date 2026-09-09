from datetime import date, time

import pytest

from db.models import TARGETS, next_id
from src import daily_dashboard_store


def _set_target(db_session, store: str, target_date: date, sales_target: float) -> None:
    """Test-only helper that writes a minimal SALES TARGET row directly. The
    admin-facing path is daily_dashboard_store.set_store_target (exercised in
    tests/test_targets.py); this stays a bare insert so these tests don't
    also pull in set_store_target's snapshot refresh."""
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


def test_read_store_target_existing_row(db_session):
    _set_target(db_session, "NM", date(2026, 8, 20), 2_000_000.0)

    assert daily_dashboard_store.read_store_target(db_session, "NM", date(2026, 8, 20)) == 2_000_000.0


def test_read_store_target_missing_date_returns_none(db_session):
    assert daily_dashboard_store.read_store_target(db_session, "NM", date(2026, 8, 20)) is None


def test_read_target_for_stores_sums_and_skips_missing(db_session):
    _set_target(db_session, "NM", date(2026, 8, 20), 2_000_000.0)
    _set_target(db_session, "HB", date(2026, 8, 20), 1_500_000.0)

    assert daily_dashboard_store.read_target_for_stores(db_session, ["NM", "HB", "CHW"], date(2026, 8, 20)) == 3_500_000.0


def test_add_bill_entry_then_list(db_session):
    entry = daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(11, 30), 500.0, 2.0)
    assert entry["net_amount"] == 500.0
    assert entry["bill_time"] == "11:30"

    entries = daily_dashboard_store.list_bill_entries(db_session, "NM", date(2026, 8, 20))
    assert len(entries) == 1
    assert entries[0]["net_amount"] == 500.0


def test_list_bill_entries_sorted_by_time_and_scoped_to_date(db_session):
    daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(15, 0), 100.0, 1.0)
    daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 200.0, 2.0)
    daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 21), time(9, 0), 999.0, 9.0)

    entries = daily_dashboard_store.list_bill_entries(db_session, "NM", date(2026, 8, 20))
    assert [e["net_amount"] for e in entries] == [200.0, 100.0]


def test_bills_scoped_to_store_in_shared_table(db_session):
    """BILLS is one shared table across all 3 stores (not one table per
    store) -- listing/summing must filter by store_code, and update/delete
    must refuse to touch a row that belongs to a different store even if
    the raw row id is passed in."""
    nw_entry = daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(10, 0), 100.0, 1.0)
    hb_entry = daily_dashboard_store.add_bill_entry(db_session, "HB", date(2026, 8, 20), time(11, 0), 200.0, 2.0)

    assert [e["net_amount"] for e in daily_dashboard_store.list_bill_entries(db_session, "NM", date(2026, 8, 20))] == [100.0]
    assert [e["net_amount"] for e in daily_dashboard_store.list_bill_entries(db_session, "HB", date(2026, 8, 20))] == [200.0]
    assert daily_dashboard_store.sum_bill_log(db_session, "NM", date(2026, 8, 20)) == (100.0, 1.0)
    assert daily_dashboard_store.sum_bill_log(db_session, "HB", date(2026, 8, 20)) == (200.0, 2.0)

    # Wrong store for the row -- must be refused, not silently act on it.
    assert daily_dashboard_store.update_bill_entry(db_session, "HB", nw_entry["row"], time(12, 0), 999.0, 9.0) is None
    assert daily_dashboard_store.delete_bill_entry(db_session, "HB", nw_entry["row"]) is False
    assert daily_dashboard_store.list_bill_entries(db_session, "NM", date(2026, 8, 20))[0]["net_amount"] == 100.0

    assert daily_dashboard_store.delete_bill_entry(db_session, "HB", hb_entry["row"]) is True
    assert daily_dashboard_store.list_bill_entries(db_session, "HB", date(2026, 8, 20)) == []


def test_delete_bill_entry(db_session):
    entry = daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 100.0, 1.0)
    assert daily_dashboard_store.delete_bill_entry(db_session, "NM", entry["row"]) is True
    assert daily_dashboard_store.list_bill_entries(db_session, "NM", date(2026, 8, 20)) == []
    assert daily_dashboard_store.delete_bill_entry(db_session, "NM", entry["row"]) is False


def test_update_bill_entry_corrects_row_in_place(db_session):
    entry = daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 100.0, 1.0)
    updated = daily_dashboard_store.update_bill_entry(db_session, "NM", entry["row"], time(12, 30), 250.0, 3.0)
    assert updated == {
        "row": entry["row"],
        "date": "2026-08-20",
        "bill_time": "12:30",
        "net_amount": 250.0,
        "bill_quantity": 3.0,
        "time_slot": "11.00 AM - 01.59 PM",
    }

    entries = daily_dashboard_store.list_bill_entries(db_session, "NM", date(2026, 8, 20))
    assert len(entries) == 1
    assert entries[0]["net_amount"] == 250.0
    assert entries[0]["bill_time"] == "12:30"


def test_update_bill_entry_missing_row_returns_none(db_session):
    assert daily_dashboard_store.update_bill_entry(db_session, "NM", 99, time(9, 0), 100.0, 1.0) is None


def test_sum_bill_log_defaults_to_zero_not_none(db_session):
    assert daily_dashboard_store.sum_bill_log(db_session, "NM", date(2026, 8, 20)) == (0.0, 0.0)


# ---------------------------------------------------------------------------
# Footfall/NOB time-wise logs -- two separate, structurally identical logs;
# these tests exercise the shared generic implementation through both
# public wrapper sets to make sure neither log leaks into the other.
# ---------------------------------------------------------------------------

def test_add_footfall_entry_then_list(db_session):
    entry = daily_dashboard_store.add_footfall_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 12.0)
    assert entry["footfall"] == 12.0
    assert entry["time"] == "11:00"

    entries = daily_dashboard_store.list_footfall_entries(db_session, "NM", date(2026, 8, 20))
    assert len(entries) == 1
    assert entries[0]["footfall"] == 12.0


def test_add_nob_entry_then_list(db_session):
    entry = daily_dashboard_store.add_nob_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 3.0)
    assert entry["nob"] == 3.0

    entries = daily_dashboard_store.list_nob_entries(db_session, "NM", date(2026, 8, 20))
    assert len(entries) == 1
    assert entries[0]["nob"] == 3.0


def test_sum_footfall_log_and_sum_nob_log_default_to_zero_and_stay_independent(db_session):
    assert daily_dashboard_store.sum_footfall_log(db_session, "NM", date(2026, 8, 20)) == 0.0
    assert daily_dashboard_store.sum_nob_log(db_session, "NM", date(2026, 8, 20)) == 0.0

    daily_dashboard_store.add_footfall_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 10.0)
    daily_dashboard_store.add_footfall_entry(db_session, "NM", date(2026, 8, 20), time(15, 0), 8.0)
    daily_dashboard_store.add_footfall_entry(db_session, "NM", date(2026, 8, 21), time(9, 0), 99.0)
    daily_dashboard_store.add_nob_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 2.0)

    # Footfall's total is unaffected by NOB entries and vice versa -- the two
    # logs are fully separate, not derived from each other.
    assert daily_dashboard_store.sum_footfall_log(db_session, "NM", date(2026, 8, 20)) == 18.0
    assert daily_dashboard_store.sum_nob_log(db_session, "NM", date(2026, 8, 20)) == 2.0


def test_delete_and_update_footfall_entry(db_session):
    entry = daily_dashboard_store.add_footfall_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 10.0)
    updated = daily_dashboard_store.update_footfall_entry(db_session, "NM", entry["row"], time(12, 0), 15.0)
    assert updated == {"row": entry["row"], "date": "2026-08-20", "time": "12:00", "footfall": 15.0, "time_slot": "11.00 AM - 01.59 PM"}

    assert daily_dashboard_store.delete_footfall_entry(db_session, "NM", entry["row"]) is True
    assert daily_dashboard_store.list_footfall_entries(db_session, "NM", date(2026, 8, 20)) == []
    assert daily_dashboard_store.delete_footfall_entry(db_session, "NM", entry["row"]) is False
    assert daily_dashboard_store.update_footfall_entry(db_session, "NM", 99, time(9, 0), 5.0) is None


def test_delete_and_update_nob_entry(db_session):
    entry = daily_dashboard_store.add_nob_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 2.0)
    updated = daily_dashboard_store.update_nob_entry(db_session, "NM", entry["row"], time(12, 0), 4.0)
    assert updated == {"row": entry["row"], "date": "2026-08-20", "time": "12:00", "nob": 4.0, "time_slot": "11.00 AM - 01.59 PM"}

    assert daily_dashboard_store.delete_nob_entry(db_session, "NM", entry["row"]) is True
    assert daily_dashboard_store.list_nob_entries(db_session, "NM", date(2026, 8, 20)) == []
    assert daily_dashboard_store.delete_nob_entry(db_session, "NM", entry["row"]) is False
    assert daily_dashboard_store.update_nob_entry(db_session, "NM", 99, time(9, 0), 5.0) is None


def test_compute_live_kpis_no_target_row_yet(db_session):
    daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 500.0, 2.0)
    daily_dashboard_store.add_footfall_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 20.0)
    daily_dashboard_store.add_nob_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 1.0)

    kpis = daily_dashboard_store.compute_live_kpis(db_session, "NM", date(2026, 8, 20))
    assert kpis["net_sales"] == 500.0
    assert kpis["footfall"] == 20.0  # live sum of today's Footfall log
    assert kpis["nob"] == 1.0  # live sum of today's NOB log
    assert kpis["sales_target"] is None
    assert kpis["achievement_pct"] is None
    assert kpis["remaining_pct"] is None
    assert kpis["atv"] == 500.0


def test_compute_live_kpis_all_stores_blends_raw_totals(db_session):
    d = date(2026, 8, 20)
    _set_target(db_session, "NM", d, 10_000.0)
    _set_target(db_session, "HB", d, 30_000.0)
    # CHW: no target set -> its sales_target is None, combined target = 40_000.
    daily_dashboard_store.add_bill_entry(db_session, "NM", d, time(11, 0), 1_000.0, 2.0)
    daily_dashboard_store.add_bill_entry(db_session, "HB", d, time(11, 0), 3_000.0, 6.0)
    daily_dashboard_store.add_nob_entry(db_session, "NM", d, time(11, 0), 2.0)
    daily_dashboard_store.add_nob_entry(db_session, "HB", d, time(11, 0), 6.0)

    result = daily_dashboard_store.compute_live_kpis_all_stores(db_session, d)
    combined = result["combined"]
    assert set(result["per_store"]) == {"NM", "HB", "CHW"}
    assert combined["net_sales"] == 4_000.0
    assert combined["bill_quantity"] == 8.0
    assert combined["nob"] == 8.0
    assert combined["sales_target"] == 40_000.0
    assert combined["achievement_pct"] == 10.0  # 4_000 / 40_000
    assert combined["atv"] == 500.0  # 4_000 / 8, re-derived from the summed totals
    assert result["per_store"]["CHW"]["net_sales"] == 0.0


def test_compute_live_kpis_all_stores_target_none_when_none_set(db_session):
    result = daily_dashboard_store.compute_live_kpis_all_stores(db_session, date(2026, 8, 20))
    assert result["combined"]["sales_target"] is None
    assert result["combined"]["achievement_pct"] is None


def test_compute_live_kpis_dynamic_net_sales_before_save_entry(db_session):
    _set_target(db_session, "NM", date(2026, 8, 20), 10_000.0)
    daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 1_000.0, 2.0)

    kpis = daily_dashboard_store.compute_live_kpis(db_session, "NM", date(2026, 8, 20))
    assert kpis["net_sales"] == 1_000.0
    assert kpis["sales_target"] == 10_000.0
    assert kpis["achievement_pct"] == 10.0
    assert kpis["remaining_pct"] == 90.0
    assert kpis["footfall"] == 0.0  # no entries yet -- live sum default, not fabricated

    daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(12, 0), 500.0, 1.0)
    kpis2 = daily_dashboard_store.compute_live_kpis(db_session, "NM", date(2026, 8, 20))
    assert kpis2["net_sales"] == 1_500.0  # grows without any Save Entry


def test_save_target_entry_writes_snapshot_and_preserves_target(db_session):
    _set_target(db_session, "NM", date(2026, 8, 20), 10_000.0)
    for _ in range(5):
        daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 200.0, 2.0)
    daily_dashboard_store.add_footfall_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 100.0)
    daily_dashboard_store.add_nob_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 5.0)

    result = daily_dashboard_store.save_target_entry(db_session, "NM", date(2026, 8, 20), reason="Heavy rain.")
    assert result["net_sales"] == 1_000.0
    assert result["footfall"] == 100.0  # live sum of the Footfall log, not a caller-supplied number
    assert result["nob"] == 5.0  # live sum of the NOB log
    assert result["atv"] == 200.0
    assert result["conversion_pct"] == 5.0
    assert result["achievement_pct"] == 10.0
    assert result["reason"] == "Heavy rain."
    assert result["sales_target"] == 10_000.0  # untouched, admin-set

    kpis = daily_dashboard_store.compute_live_kpis(db_session, "NM", date(2026, 8, 20))
    assert kpis["footfall"] == 100.0
    assert kpis["nob"] == 5.0
    assert kpis["reason"] == "Heavy rain."


def test_save_target_entry_creates_row_when_missing(db_session):
    result = daily_dashboard_store.save_target_entry(db_session, "NM", date(2026, 8, 20))
    assert result["sales_target"] is None
    assert result["achievement_pct"] is None
    assert result["footfall"] == 0.0
    assert result["nob"] == 0.0


def test_save_target_entry_optional_reason_not_overwritten_when_omitted(db_session):
    _set_target(db_session, "NM", date(2026, 8, 20), 10_000.0)

    daily_dashboard_store.save_target_entry(db_session, "NM", date(2026, 8, 20), reason="Election day.")
    result = daily_dashboard_store.save_target_entry(db_session, "NM", date(2026, 8, 20), reason=None)
    assert result["reason"] is None  # save_target_entry doesn't echo back a reason it wasn't given

    kpis = daily_dashboard_store.compute_live_kpis(db_session, "NM", date(2026, 8, 20))
    assert kpis["reason"] == "Election day."  # but the row was left alone


def test_set_kpi_override_overlays_computed_value(db_session):
    _set_target(db_session, "NM", date(2026, 8, 20), 10_000.0)
    daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 200.0, 2.0)
    daily_dashboard_store.add_nob_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 1.0)

    computed = daily_dashboard_store.compute_live_kpis(db_session, "NM", date(2026, 8, 20))
    assert computed["atv"] == 200.0
    assert computed["overridden"] == []

    daily_dashboard_store.set_kpi_override(db_session, "NM", date(2026, 8, 20), "atv", 555.0)
    kpis = daily_dashboard_store.compute_live_kpis(db_session, "NM", date(2026, 8, 20))
    assert kpis["atv"] == 555.0
    assert kpis["overridden"] == ["atv"]
    assert kpis["net_sales"] == 200.0  # raw log sums are never touched


def test_achievement_override_rederives_remaining(db_session):
    _set_target(db_session, "NM", date(2026, 8, 20), 10_000.0)
    daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 1_000.0, 2.0)

    daily_dashboard_store.set_kpi_override(db_session, "NM", date(2026, 8, 20), "achievement_pct", 40.0)
    kpis = daily_dashboard_store.compute_live_kpis(db_session, "NM", date(2026, 8, 20))
    assert kpis["achievement_pct"] == 40.0
    assert kpis["remaining_pct"] == 60.0
    assert kpis["remaining"] == 6_000.0  # 10_000 - 10_000 * 0.40


def test_clear_kpi_override_reverts_to_computed(db_session):
    _set_target(db_session, "NM", date(2026, 8, 20), 10_000.0)
    daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 200.0, 2.0)
    daily_dashboard_store.add_nob_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 1.0)

    daily_dashboard_store.set_kpi_override(db_session, "NM", date(2026, 8, 20), "atv", 555.0)
    daily_dashboard_store.clear_kpi_override(db_session, "NM", date(2026, 8, 20), "atv")

    kpis = daily_dashboard_store.compute_live_kpis(db_session, "NM", date(2026, 8, 20))
    assert kpis["atv"] == 200.0
    assert kpis["overridden"] == []


def test_set_kpi_override_creates_target_row_when_missing(db_session):
    kpis = daily_dashboard_store.set_kpi_override(db_session, "NM", date(2026, 8, 20), "conversion_pct", 62.0)
    assert kpis["conversion_pct"] == 62.0
    assert kpis["sales_target"] is None  # row created, but no fabricated target


def test_set_kpi_override_rejects_non_overridable_field(db_session):
    with pytest.raises(ValueError):
        daily_dashboard_store.set_kpi_override(db_session, "NM", date(2026, 8, 20), "net_sales", 5.0)


def test_save_target_entry_persists_overridden_snapshot(db_session):
    _set_target(db_session, "NM", date(2026, 8, 20), 10_000.0)
    daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 200.0, 2.0)
    daily_dashboard_store.add_nob_entry(db_session, "NM", date(2026, 8, 20), time(11, 0), 1.0)
    daily_dashboard_store.set_kpi_override(db_session, "NM", date(2026, 8, 20), "atv", 555.0)

    daily_dashboard_store.save_target_entry(db_session, "NM", date(2026, 8, 20), None)
    row = db_session[TARGETS].find_one({"store_code": "NM", "entry_date": "2026-08-20"})
    assert row["atv"] == 555.0  # snapshot the report reads matches the dashboard
