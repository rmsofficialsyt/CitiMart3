"""Runtime-editable KPI status thresholds (config/kpi_thresholds.py's
_DEFAULTS + file-backed overlay). Every test isolates the on-disk overrides
file into a tmp path so nothing touches the real config/kpi_thresholds.local.json."""
import json

import pytest

import config.kpi_thresholds as kt


@pytest.fixture(autouse=True)
def isolated_overrides(tmp_path, monkeypatch):
    path = tmp_path / "kpi_thresholds.local.json"
    monkeypatch.setattr(kt, "_OVERRIDES_PATH", path)
    monkeypatch.setattr(kt, "_overrides_cache", None)
    monkeypatch.setattr(kt, "_overrides_mtime", None)
    yield path


def test_defaults_passthrough_when_no_override_file():
    assert kt.get_thresholds("atv") == kt._DEFAULTS["atv"]
    assert kt.atv_status(1200) == kt.STATUS_GREEN
    assert kt.atv_status(800) == kt.STATUS_RED


def test_set_overrides_merges_and_persists(isolated_overrides):
    effective = kt.set_overrides({"atv": {"red_below": 700}})
    assert effective["effective"]["atv"] == {"red_below": 700.0, "green_at_or_above": 1100}
    assert effective["overrides"] == {"atv": {"red_below": 700.0}}
    assert isolated_overrides.exists()
    # green_at_or_above kept its default -- partial patch
    assert kt.get_thresholds("atv")["green_at_or_above"] == 1100


def test_status_reflects_an_override():
    assert kt.atv_status(800) == kt.STATUS_RED
    kt.set_overrides({"atv": {"red_below": 750}})
    assert kt.atv_status(800) == kt.STATUS_YELLOW  # 800 is now above the lowered red line


def test_mtime_cache_invalidation(isolated_overrides):
    assert kt.get_thresholds("rpv")["red_below"] == 500
    isolated_overrides.write_text(json.dumps({"rpv": {"red_below": 111}}), "utf-8")
    # a fresh stat().st_mtime differs from the cached None -> cache refreshes
    assert kt.get_thresholds("rpv")["red_below"] == 111


def test_corrupt_file_is_ignored(isolated_overrides):
    isolated_overrides.write_text("{ not json", "utf-8")
    assert kt.get_thresholds("atv") == kt._DEFAULTS["atv"]


def test_validation_rejects_inverted_band():
    with pytest.raises(kt.ThresholdValidationError):
        kt.set_overrides({"atv": {"red_below": 1200, "green_at_or_above": 1100}})


def test_validation_rejects_negative_unknown_key_and_unknown_kpi():
    with pytest.raises(kt.ThresholdValidationError):
        kt.set_overrides({"atv": {"red_below": -5}})
    with pytest.raises(kt.ThresholdValidationError):
        kt.set_overrides({"atv": {"green_above": 1200}})  # atv uses green_at_or_above
    with pytest.raises(kt.ThresholdValidationError):
        kt.set_overrides({"footfall": {"red_below": 1}})


def test_achievement_uses_strict_green_above_key():
    kt.set_overrides({"achievement": {"green_above": 120}})
    assert kt.achievement_status(120) == kt.STATUS_YELLOW  # strict '>'
    assert kt.achievement_status(121) == kt.STATUS_GREEN


def test_reset_overrides_all_and_single():
    kt.set_overrides({"atv": {"red_below": 700}, "rpv": {"red_below": 300}})
    kt.reset_overrides("atv")
    assert kt.get_thresholds("atv") == kt._DEFAULTS["atv"]
    assert kt.get_thresholds("rpv")["red_below"] == 300
    kt.reset_overrides()
    assert kt.effective_thresholds()["overrides"] == {}


def test_api_get_put_delete_round_trip(client, admin_headers):
    r = client.get("/api/kpi-thresholds", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["effective"]["atv"] == {"red_below": 900, "green_at_or_above": 1100}

    r = client.put("/api/kpi-thresholds", headers=admin_headers, json={"atv": {"red_below": 800}})
    assert r.status_code == 200
    assert r.json()["effective"]["atv"]["red_below"] == 800

    r = client.put("/api/kpi-thresholds", headers=admin_headers, json={"atv": {"red_below": 2000, "green_at_or_above": 1100}})
    assert r.status_code == 422

    r = client.delete("/api/kpi-thresholds", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["overrides"] == {}
