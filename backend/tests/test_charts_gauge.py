import config.kpi_thresholds as kt
from src import charts
from src.charts import _gauge_axis_range, gauge_spec


def test_gauge_axis_range_non_reverse_floors_at_zero():
    # ATV/Conversion %/Achievement % can't go negative, so the axis always
    # starts at 0 regardless of the live value or thresholds.
    axis_min, axis_max = _gauge_axis_range(45.0, red_below=80.0, green_at=100.0, reverse=False)
    assert axis_min == 0.0
    assert axis_max > 100.0


def test_gauge_axis_range_reverse_green_zone_has_width():
    # Remaining %'s green cutoff mirrors Achievement %'s strict >100 rule
    # (100 - 100 = 0), which used to leave the green zone exactly
    # zero-width forever (axis min hardcoded to 0, same as green_at) --
    # Remaining % could never show green. The axis min must now sit below
    # green_at so that zone actually has room to draw into.
    axis_min, axis_max = _gauge_axis_range(55.0, red_below=20.0, green_at=0.0, reverse=True)
    assert axis_min < 0.0
    assert axis_max > 20.0


def test_gauge_axis_range_reverse_accommodates_negative_value():
    # Remaining % goes negative once Achievement % passes 100 (over-target).
    # The axis must extend to actually include that value, not clamp it to
    # the same spot as 0.
    value = -30.0
    axis_min, axis_max = _gauge_axis_range(value, red_below=20.0, green_at=0.0, reverse=True)
    assert axis_min <= value
    assert axis_min < axis_max


def test_gauge_spec_reverse_negative_value_lands_in_green_band():
    spec = gauge_spec(-30.0, "Remaining %", 0.0, red_below=20.0, green_at=0.0, suffix="%", reverse=True)
    assert spec["min"] < spec["greenAt"]  # green band [min, greenAt] has real width
    assert spec["min"] <= spec["value"] <= spec["max"]  # the needle actually lands on the dial


def test_gauge_spec_missing_value_is_na():
    assert gauge_spec(None, "Remaining %", 0.0, 20.0, 0.0, reverse=True) == {"kind": "gauge", "title": "Remaining %", "value": None}


def test_gauge_spec_zero_if_missing_parks_needle_at_zero():
    # The Daily Operations gauges pass zero_if_missing=True so a not-logged-yet
    # value renders as a real dial at 0 (matching that page's *OrZero KPI
    # cards) instead of the "N/A" placeholder.
    spec = gauge_spec(None, "ATV", None, 900.0, 1101.0, zero_if_missing=True)
    assert spec["value"] == 0.0
    assert spec["min"] <= 0.0 <= spec["max"]


def test_daily_gauge_wrappers_zero_if_missing():
    # The six charts.*_gauge helpers the daily branch of api/routes_charts.py
    # calls must all honour zero_if_missing.
    for spec in (
        charts.conversion_gauge(None, zero_if_missing=True),
        charts.achievement_gauge(None, zero_if_missing=True),
        charts.remaining_pct_gauge(None, zero_if_missing=True),
        charts.atv_gauge(None, zero_if_missing=True),
        charts.rpv_gauge(None, zero_if_missing=True),
        charts.basket_size_gauge(None, zero_if_missing=True),
    ):
        assert spec["value"] == 0.0
    # ...and still show N/A by default (the DATASET.xlsx-driven gauges).
    assert charts.atv_gauge(None)["value"] is None


def test_gauge_spec_non_reverse_matches_achievement_thresholds():
    spec = gauge_spec(130.0, "Target Achievement %", 100.0, red_below=80.0, green_at=100.0, suffix="%")
    assert spec["min"] == 0.0
    assert spec["redBelow"] == 80.0
    assert spec["greenAt"] == 100.0
    assert spec["value"] == 130.0


def test_atv_gauge_reflects_a_runtime_threshold_override(tmp_path, monkeypatch):
    monkeypatch.setattr(kt, "_OVERRIDES_PATH", tmp_path / "t.json")
    monkeypatch.setattr(kt, "_overrides_cache", None)
    monkeypatch.setattr(kt, "_overrides_mtime", None)

    assert charts.atv_gauge(950.0)["redBelow"] == 900

    kt.set_overrides({"atv": {"red_below": 600, "green_at_or_above": 1300}})
    spec = charts.atv_gauge(950.0)
    assert spec["redBelow"] == 600
    assert spec["greenAt"] == 1300


def test_basket_size_and_rpv_gauges_exist_and_use_their_bands(tmp_path, monkeypatch):
    monkeypatch.setattr(kt, "_OVERRIDES_PATH", tmp_path / "t.json")
    monkeypatch.setattr(kt, "_overrides_cache", None)
    monkeypatch.setattr(kt, "_overrides_mtime", None)
    assert charts.rpv_gauge(550.0)["redBelow"] == kt.get_thresholds("rpv")["red_below"]
    assert charts.basket_size_gauge(3.0)["greenAt"] == kt.get_thresholds("basket_size")["green_at_or_above"]
