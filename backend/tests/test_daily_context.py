from datetime import date

from src import daily_context


def test_day_type_buckets_the_week_three_ways():
    assert daily_context.day_type(date(2026, 9, 5)) == "Weekend"   # Saturday
    assert daily_context.day_type(date(2026, 9, 6)) == "Weekend"   # Sunday
    assert daily_context.day_type(date(2026, 9, 2)) == "Mid-Week"  # Wednesday
    assert daily_context.day_type(date(2026, 9, 3)) == "Mid-Week"  # Thursday
    assert daily_context.day_type(date(2026, 9, 1)) == "Regular"   # Tuesday
    assert daily_context.day_type(date(2026, 9, 4)) == "Regular"   # Friday


def test_module_carries_no_workbook_backed_helpers():
    """Guard against the DATASET.xlsx-backed helpers being reintroduced here.
    previous_year_same_day (the same-day-last-year matrix) and
    suggested_daily_target (the midnight job's historical-median estimate)
    both needed the historical workbook, which this sub-project doesn't have
    -- they belong to Analytics & Forecasting now."""
    assert not hasattr(daily_context, "previous_year_same_day")
    assert not hasattr(daily_context, "suggested_daily_target")


def test_get_holiday_name_recognises_west_bengal_holiday():
    # Pohela Boishakh (Bengali New Year) is a West Bengal regional holiday,
    # not a national one -- confirms the subdiv="WB" calendar is active,
    # not just the generic national "IN" calendar.
    assert daily_context.get_holiday_name(date(2026, 4, 15)) == "Pohela Boishakh"


def test_get_holiday_name_returns_none_for_ordinary_day():
    assert daily_context.get_holiday_name(date(2026, 2, 10)) is None


def test_get_election_info_flags_declared_poll_and_counting_days():
    assert "Lok Sabha" in daily_context.get_election_info(date(2024, 5, 13))
    assert "counting" in daily_context.get_election_info(date(2024, 6, 4))
    assert "WB Assembly" in daily_context.get_election_info(date(2021, 3, 27))


def test_get_election_info_returns_none_for_ordinary_day():
    assert daily_context.get_election_info(date(2026, 2, 10)) is None
