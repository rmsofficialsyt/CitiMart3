"""Sales driver decomposition (Advisor Tier 3).

Net Sales = Footfall × Conversion × ATV, with Conversion = NOB ÷ Footfall and
ATV = Net Sales ÷ NOB (the same definitions ``compute_live_kpis`` uses). The
gap between a day and its baseline is split into the three terms by
log-share, which is exact (the three amounts always sum to ΔSales) and does
not depend on the order the terms are taken in:

    ln(S1/S0) = ln(F1/F0) + ln(C1/C0) + ln(A1/A0)
    term_k    = ΔS × ln(k1/k0) / ln(S1/S0)

The baseline is the *mean* of the store's last few same weekdays (means, not
medians, so S0 = F0·C0·A0 still holds). Fewer than ``MIN_BASELINE_DAYS``
usable days, or a zero anywhere in the identity, returns ``None``.
"""
from __future__ import annotations

import math
from datetime import date

from pymongo.database import Database

from src.advisor.history import FIELDS, day_totals, mean_or_none, prior_same_weekdays, slot_facts
from src.kpi_engine import safe_divide

BASELINE_WEEKS = 4
MIN_BASELINE_DAYS = 2
DRIVERS = ("traffic", "conversion", "atv")


def slots_totals(day: dict, slots: list[str] | None) -> dict[str, float]:
    """Totals over ``slots`` only (all slots when None)."""
    if slots is None:
        return day_totals(day)
    return {f: sum(day[s][f] for s in slots) for f in FIELDS}


def day_baseline(db: Database, store: str, day: date, weeks: int = BASELINE_WEEKS,
                 slots: list[str] | None = None) -> dict | None:
    """Mean of the last same weekdays; restricted to ``slots`` for a part-day
    comparison (the midday brief compares completed slots with the same slots)."""
    if slots is not None and not slots:
        return None
    dates = prior_same_weekdays(day, weeks)
    facts = slot_facts(db, store, min(dates), max(dates))
    totals = [slots_totals(facts[d.isoformat()], slots) for d in dates if d.isoformat() in facts]
    totals = [t for t in totals if t["net_sales"] > 0 and t["footfall"] > 0 and t["nob"] > 0]
    if len(totals) < MIN_BASELINE_DAYS:
        return None
    base = {k: mean_or_none([t[k] for t in totals]) for k in ("net_sales", "footfall", "nob", "bill_quantity")}
    base["days_used"] = len(totals)
    return base


def _components(net_sales: float | None, footfall: float | None, nob: float | None) -> dict | None:
    conv = safe_divide(nob, footfall)
    atv = safe_divide(net_sales, nob)
    if not net_sales or not footfall or not conv or not atv:
        return None
    return {"traffic": float(footfall), "conversion": conv, "atv": atv, "sales": float(net_sales)}


def decompose(current: dict, baseline: dict | None) -> dict | None:
    """``current``/``baseline`` carry net_sales, footfall, nob. Returns
    {delta_sales, change_pct, drivers: [{driver, amount, change_pct}]} with
    drivers ordered by size of impact."""
    if baseline is None:
        return None
    c1 = _components(current.get("net_sales"), current.get("footfall"), current.get("nob"))
    c0 = _components(baseline.get("net_sales"), baseline.get("footfall"), baseline.get("nob"))
    if c1 is None or c0 is None:
        return None
    delta = c1["sales"] - c0["sales"]
    log_total = math.log(c1["sales"] / c0["sales"])
    drivers = []
    for name in DRIVERS:
        log_k = math.log(c1[name] / c0[name])
        # Equal sales (log_total == 0): no gap to split; each term is zero.
        amount = delta * log_k / log_total if abs(log_total) > 1e-12 else 0.0
        drivers.append({"driver": name, "amount": amount, "change_pct": (c1[name] / c0[name] - 1) * 100,
                        "current": c1[name], "baseline": c0[name]})
    drivers.sort(key=lambda d: -abs(d["amount"]))
    return {"delta_sales": delta, "change_pct": (c1["sales"] / c0["sales"] - 1) * 100, "drivers": drivers}
