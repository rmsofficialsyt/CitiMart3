"""Central paths and business constants for CITIMART Daily Operations.

Deliberately smaller than the Analytics & Forecasting sub-project's copy of
this module: everything that described DATASET.xlsx (DATASET_PATH,
DATASET_CACHE_DIR, REQUIRED_SHEETS, VALID_GST_SLABS, the FILTER_* sidebar
limits) is gone, because this half of the project never opens a workbook --
it reads and writes MongoDB only. TEST_DAILY_DASHBOARD.xlsx and its four
sheet-name constants are gone for the same reason: the xlsx fallback was
retired with the split, so MONGODB_URI is now genuinely required (see
db/session.py).

What stays is what Daily Operations actually uses: the store code table
(validated on every write in src/daily_dashboard_store.py), the four
time-of-day bands, the currency symbol, and a writable cache directory for
src/daily_context.py's weather lookups.
"""
from __future__ import annotations

from datetime import time
from pathlib import Path

# backend/ -- the root of the Python side of this sub-project (config/, src/,
# api/, db/, .cache/, img/ all live directly under it). The sub-project root,
# which additionally holds frontend/, is PROJECT_ROOT.parent.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = PROJECT_ROOT / ".cache"
CACHE_DIR.mkdir(exist_ok=True)

CURRENCY_SYMBOL = "₹"  # INR rupee sign

# Canonical store code -> full store name. Application code validates every
# written store_code against this table (MongoDB has no CHECK-constraint
# equivalent) -- see src/daily_dashboard_store.py::_validate_store. The
# spellings match DATASET.xlsx's STORE column so the two sub-projects still
# agree on what a store is called.
STORE_CODE_TO_NAME = {
    "NM": "CITIMART - NEW MARKET",
    "HB": "CITIMART - HATIBAGAN",
    "CHW": "CITIMART - CHOWRINGHEE",
}
STORE_NAME_TO_CODE = {v: k for k, v in STORE_CODE_TO_NAME.items()}

# The 4 time-of-day bands the daily logs bucket into. These are the literal
# labels used by DATASET.xlsx's TIME WISE FOOTFALL-NOB sheet, kept identical
# here so a Daily Operations export and an Analytics report can be read
# side by side -- do not reword one copy without the other.
TIME_SLOT_ORDER = [
    "11.00 AM - 01.59 PM",
    "02.00 PM - 04.59 PM",
    "05.00 PM - 07.59 PM",
    "08.00 PM - 11.59 PM",
]

# (label, start-minute-of-day inclusive, end-minute-of-day exclusive) for
# each TIME_SLOT_ORDER band, e.g. 10:30 AM = 630, 2:00 PM = 840.
_TIME_SLOT_BANDS = [
    (TIME_SLOT_ORDER[0], 10 * 60 + 30, 14 * 60),
    (TIME_SLOT_ORDER[1], 14 * 60, 17 * 60),
    (TIME_SLOT_ORDER[2], 17 * 60, 20 * 60),
    (TIME_SLOT_ORDER[3], 20 * 60, 24 * 60),
]


def time_slot_for_time(value: time) -> str | None:
    """Buckets a clock time into one of TIME_SLOT_ORDER's 4 bands -- used by
    src/daily_dashboard_store.py to compute a system-generated, non-editable
    Time Slot for each bill/footfall/NOB entry at write time, since the live
    daily log only has a raw clock time per entry. Returns None for a time
    outside all 4 bands (before 10:30 AM) rather than guessing/clamping to the
    nearest one, matching this project's don't-fabricate rule -- an
    early-morning entry genuinely has no time slot rather than a wrong one."""
    minutes = value.hour * 60 + value.minute
    for label, start, end in _TIME_SLOT_BANDS:
        if start <= minutes < end:
            return label
    return None
