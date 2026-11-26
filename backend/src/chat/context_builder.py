"""Context engineering for the Co-Pilot's LLM synthesis step.

The model used to receive the sub-agents' raw JSON. That had three accuracy
problems this module fixes:

1. The tools coerce a missing value to 0.0 (`float(x or 0.0)`), so a day with
   no admin-set target arrived as `achievement_pct: 0.0`, and the model would
   report "0% achieved" instead of "target not set". `build_fact_sheet`
   re-derives "not available" from the inputs (target 0 -> achievement N/A,
   footfall 0 -> conversion/RPV N/A, NOB 0 -> ATV/basket N/A), mirroring
   `daily_dashboard_store`'s own `safe_divide` rule rather than inventing one.
2. The model had to do its own arithmetic (gaps, remaining %), which is where
   LLM figures go wrong. Derived numbers are computed here, once.
3. Units were implicit. Every money value is pre-formatted ₹ (Indian
   grouping) and every percentage carries "%", so the model copies text.

`allowed_numbers` exposes every number present in the facts (raw and derived)
for the post-generation verifier in `hooks/anti_hallucination_hook.py`.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any, Iterator

from config import kpi_thresholds

if TYPE_CHECKING:
    from src.chat.intent import IntentResult

NA = "NOT AVAILABLE"

# Same definitions as frontend/src/lib/format.ts DAILY_KPI_FORMULAS and
# daily_dashboard_store.compute_live_kpis (safe_divide -> None on a zero denominator).
KPI_GLOSSARY = """KPI DEFINITIONS (official; use exactly these, never other formulas):
- Net Sales = SUM(Net Amount) of the day's bill log (₹)
- Sales Target = admin-set daily target (₹); if not set, Achievement % / Remaining are not available
- Remaining (target gap) = Sales Target − Net Sales (₹)
- Footfall = SUM of logged footfall entries; NOB (number of bills / transactions) = SUM of logged NOB entries
- Bill Quantity = SUM(Bill Quantity) of the bill log (units sold)
- ATV (Average Transaction Value) = Net Sales ÷ NOB (₹)
- RPV (Revenue per Visitor) = Net Sales ÷ Footfall (₹)
- Basket Size (UPB) = Bill Quantity ÷ NOB (units)
- Conversion % = NOB ÷ Footfall × 100
- Achievement % = Net Sales ÷ Sales Target × 100; Remaining % = 100 − Achievement %
- Rolling target adjustment: Adjusted Target A(t) = Original Target T(t) + Carry-Forward C(t);
  the unachieved balance is spread over a 7, 14 or 30-day recovery window
- Status bands (red / yellow / green) come from FACTS "*_status" lines; never assign a band yourself
"""

_MONEY_KEY = re.compile(
    r"(sales|target|amount|gap|^remaining$|remaining_signed|surplus_over_target|atv|rpv|run_rate|bill_value|max_single_bill|largest_bill|daily_sales)"
)
_PCT_KEY = re.compile(r"(_pct$|^conversion|_conversion$|share_pct|growth)")
_NUM_IN_TEXT = re.compile(r"\d+(?:\.\d+)?")

_STATUS_FNS = {
    "atv": kpi_thresholds.atv_status,
    "rpv": kpi_thresholds.rpv_status,
    "conversion_pct": kpi_thresholds.conversion_status,
    "basket_size": kpi_thresholds.basket_size_status,
    "achievement_pct": kpi_thresholds.achievement_status,
}


def inr(value: float) -> str:
    """₹ with Indian digit grouping (1,24,500.50)."""
    neg = value < 0
    whole, frac = f"{abs(value):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups) + "," + tail
    return f"{'-' if neg else ''}₹{whole}.{frac}"


def _is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _unavailable_keys(d: dict[str, Any]) -> dict[str, str]:
    """Keys of one flat KPI dict whose 0.0 really means 'cannot be computed'."""
    out: dict[str, str] = {}

    def zero(k: str) -> bool:
        return k in d and _is_num(d[k]) and d[k] == 0

    target_keys = [k for k in d if k in ("sales_target", "mtd_target", "daily_target")]
    if target_keys and all(zero(k) for k in target_keys):
        for k in (*target_keys, "achievement_pct", "target_gap", "remaining_pct",
                  "required_daily_run_rate"):
            if k in d:
                out[k] = "target not set by admin"
    footfall_key = next((k for k in ("footfall", "mtd_footfall") if k in d), None)
    if footfall_key and zero(footfall_key):
        for k in ("conversion_pct", "mtd_conversion", "rpv"):
            if k in d:
                out[k] = "no footfall logged"
    nob_key = next((k for k in ("nob", "bills", "mtd_bills") if k in d), None)
    if nob_key and zero(nob_key):
        for k in ("atv", "mtd_atv", "basket_size"):
            if k in d:
                out[k] = "no bills (NOB) logged"
    return out


def _derived(d: dict[str, Any], na: dict[str, str]) -> dict[str, float]:
    """Numbers an answer commonly needs but the tools don't return."""
    extra: dict[str, float] = {}
    sales = d.get("net_sales", d.get("mtd_sales"))
    target = d.get("sales_target", d.get("mtd_target"))
    if _is_num(sales) and _is_num(target) and target > 0:
        extra["remaining_signed"] = target - sales  # negative = target exceeded
        if "achievement_pct" in d and _is_num(d["achievement_pct"]):
            extra["remaining_pct"] = 100 - d["achievement_pct"]
        if sales > target:
            extra["surplus_over_target"] = sales - target
    return {k: v for k, v in extra.items() if k not in na and k not in d}


def _fmt(key: str, value: Any) -> str:
    if _is_num(value):
        if _PCT_KEY.search(key):
            return f"{value:.1f}%"
        if _MONEY_KEY.search(key):
            return inr(float(value))
        if isinstance(value, float) and not value.is_integer():
            return f"{value:.2f}"
        return str(int(value)) if isinstance(value, float) else str(value)
    return str(value)


def _walk(node: Any, path: str) -> Iterator[str]:
    if isinstance(node, dict):
        if "error" in node:
            yield f"{path} = {NA} ({node.get('message') or node['error']})"
            return
        na = _unavailable_keys(node)
        for k, v in node.items():
            if v is None or v == "" or v == [] or v == {}:
                continue
            p = f"{path}.{k}" if path else str(k)
            if k in na:
                yield f"{p} = {NA} ({na[k]})"
                continue
            if isinstance(v, (dict, list)):
                yield from _walk(v, p)
                continue
            yield f"{p} = {_fmt(k, v)}"
            fn = _STATUS_FNS.get(k)
            if fn and _is_num(v):
                yield f"{p}_status = {fn(float(v))}"
        for k, v in _derived(node, na).items():
            yield f"{path}.{k} = {_fmt(k, v)}"
    elif isinstance(node, list):
        for i, item in enumerate(node[:60]):
            yield from _walk(item, f"{path}[{i}]")
    elif node is not None:
        yield f"{path} = {node}"


def _dedupe(subagent_data: dict[str, Any]) -> dict[str, Any]:
    """`kpis` repeats most of `exact_day_kpis.kpis`; keep only what it adds."""
    data = dict(subagent_data)
    db_ops = data.get("db_ops_agent")
    if isinstance(db_ops, dict):
        db_ops = dict(db_ops)
        exact = (db_ops.get("exact_day_kpis") or {}).get("kpis")
        live = db_ops.get("kpis")
        if isinstance(exact, dict) and isinstance(live, dict) and "error" not in live:
            keep = {k: v for k, v in live.items() if k not in exact or k in ("footfall", "nob", "sales_target")}
            db_ops["kpis"] = keep
        db_ops.pop("agent", None)
        data["db_ops_agent"] = db_ops
    return data


_NO_FACT_INTENTS = frozenset({"greeting", "help", "formula"})
_SLOT_KEYS = ("timeslot_breakdown", "peak_slot")


def prune_facts_for_intent(subagent_data: dict[str, Any], intent: "IntentResult") -> dict[str, Any]:
    """Copy of `subagent_data` holding only the facts this intent's answer needs.

    Used for the LLM's FACTS block only. Never mutates its input: the caller
    keeps passing the full `subagent_data` to `allowed_numbers`, the
    anti-hallucination audit and `build_links`, so pruning can only make the
    prompt shorter, never make a grounded figure look ungrounded.
    """
    primary = intent.primary
    if primary in _NO_FACT_INTENTS:
        return {}

    data = dict(subagent_data)
    db_ops = data.get("db_ops_agent")
    if not isinstance(db_ops, dict):
        return data

    if primary == "day_kpis" and intent.requested_metrics and "timeslots" not in intent.requested_metrics:
        # A focused lookup ("net sales only") must not be able to leak the slot table.
        edk = db_ops.get("exact_day_kpis")
        if isinstance(edk, dict) and any(k in edk for k in _SLOT_KEYS):
            db_ops = dict(db_ops)
            db_ops["exact_day_kpis"] = {k: v for k, v in edk.items() if k not in _SLOT_KEYS}
            data["db_ops_agent"] = db_ops
    elif primary in ("coaching", "surge"):
        # Advice needs the day's headline KPIs, not the per-slot / largest-bill detail;
        # the coach tactics and surge facts live in their own agents' keys, kept whole.
        data["db_ops_agent"] = {k: db_ops[k] for k in ("kpis",) if k in db_ops}
    return data


def build_fact_sheet(subagent_data: dict[str, Any]) -> str:
    """Labelled one-fact-per-line view of everything the sub-agents fetched."""
    if not subagent_data:
        return "(no data was fetched for this question)"
    lines = list(_walk(_dedupe(subagent_data), ""))
    na_lines = [ln for ln in lines if f"= {NA}" in ln]
    head = ""
    if na_lines:
        head = "NOT AVAILABLE (say 'not recorded / not set', never estimate):\n" + "\n".join(
            f"- {ln}" for ln in na_lines
        ) + "\n\n"
    return head + "\n".join(ln for ln in lines if f"= {NA}" not in ln)


def allowed_numbers(subagent_data: dict[str, Any], *extra_text: str) -> set[float]:
    """Every number a grounded reply may legitimately contain."""
    nums: set[float] = set()

    def add(v: float) -> None:
        nums.add(round(float(v), 4))

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            na = _unavailable_keys(node)
            for k, v in node.items():
                if k not in na:
                    visit(v)
            for v in _derived(node, na).values():
                add(v)
                add(abs(v))
        elif isinstance(node, list):
            for item in node:
                visit(item)
        elif _is_num(node):
            add(node)
            add(abs(node))
            if 0 <= node <= 100:
                add(100 - node)  # remaining % / complement of any percentage
        elif isinstance(node, str):
            for m in _NUM_IN_TEXT.findall(node):
                add(float(m))

    visit(subagent_data)
    for text in extra_text:
        for m in _NUM_IN_TEXT.findall(text.replace(",", "")):
            add(float(m))
    return nums
