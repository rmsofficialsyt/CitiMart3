"""PDF export of the network morning brief / evening debrief.

Lays ``brief.build_brief``'s output onto the shared report block model
(``src/reports/models.py``) and renders it with the same PDF renderer the
per-store daily report uses -- no figures are re-derived here, so the PDF
always matches the on-screen brief. Text-and-table only (no charts), so it
never depends on Kaleido/Chrome being available.
"""
from __future__ import annotations

from datetime import datetime

from src.chat.context_builder import inr
from src.reports.models import KpiGridBlock, KpiItem, ReportMeta, ReportPayload, TableBlock, TextBlock, TitleBlock

_TITLES = {"morning": "Morning Brief", "midday": "Midday Brief", "evening": "Evening Debrief"}
_VERDICT = {"hit": "Target hit", "missed": "Target missed", "in_progress": "In progress",
            "no_target": "No target set", "no_data": "Nothing logged"}
_PACE = {"behind": "Behind pace", "ahead": "Ahead of pace", "on_pace": "On pace", "target_hit": "Target hit",
         "no_pace_curve": "No pace curve yet", "no_target": "No target set", "no_data": "Nothing logged"}
_DRIVER = {
    ("traffic", "down"): "Fewer shoppers came in", ("traffic", "up"): "More shoppers came in",
    ("conversion", "down"): "Fewer visitors bought", ("conversion", "up"): "More visitors bought",
    ("atv", "down"): "Smaller bills (ATV down)", ("atv", "up"): "Bigger bills (ATV up)",
}
_WATCH = {
    "no_target": "No sales target set", "holiday": "Holiday", "election": "Election day", "rain": "Rain expected",
    "weekend": "Weekend", "stock_out": "Items out of stock", "attendance_missing": "Attendance not marked",
}


def _money(v: float | None) -> str:
    return "—" if v is None else inr(float(v))


def _pct(v: float | None, signed: bool = False) -> str:
    if v is None:
        return "—"
    return f"{v:+.1f}%" if signed else f"{v:.1f}%"


def _signed_money(v: float) -> str:
    return f"{'+' if v >= 0 else '−'}{inr(abs(v))}"


def _watch_text(w: dict) -> str:
    label = _WATCH.get(w["id"], w["id"])
    ev = w.get("evidence") or {}
    if ev.get("name"):
        return f"{label} ({ev['name']})"
    if ev.get("label"):
        return f"{label} ({ev['label']})"
    if ev.get("count") is not None:
        return f"{label} ({ev['count']})"
    return label


def _top_driver(s: dict) -> str:
    if not s["drivers"]:
        return "—"
    d = s["drivers"][0]
    return f"{_DRIVER[(d['driver'], 'down' if d['amount'] < 0 else 'up')]} ({_signed_money(d['amount'])})"


def build_brief_payload(brief: dict) -> ReportPayload:
    kind = brief["kind"]
    midday = kind == "midday"
    title = _TITLES.get(kind, "Evening Debrief")
    net = brief["network"]
    network_items = [
        KpiItem(label="Net Sales" + (" so far" if midday else ""), value=_money(net["net_sales"])),
        KpiItem(label="Sales Target", value=_money(net["sales_target"])),
        KpiItem(label="Achievement %", value=_pct(net["achievement_pct"])),
    ]
    if midday:
        network_items += [
            KpiItem(label="Projected Close", value=_money(net.get("projected_close"))),
            KpiItem(label="Projected Achievement %", value=_pct(net.get("projected_achievement_pct"))),
        ]
    if midday:
        overview = TableBlock(
            title="Stores (furthest behind pace first)",
            columns=["Store", "Pace", "Net Sales", "Target", "Achievement %", "Expected Now", "Projected Close", "Top driver"],
            rows=[{
                "Store": s["store_name"],
                "Pace": _PACE.get(s["pace"]["status"], s["pace"]["status"]),
                "Net Sales": _money(s["net_sales"]),
                "Target": _money(s["sales_target"]),
                "Achievement %": _pct(s["achievement_pct"]),
                "Expected Now": _pct(s["pace"]["expected_achievement_pct"]),
                "Projected Close": _money(s["pace"]["projected_close"]),
                "Top driver": _top_driver(s),
            } for s in brief["stores"]],
        )
    else:
        overview = TableBlock(
            title="Stores (weakest first)",
            columns=["Store", "Result", "Net Sales", "Target", "Achievement %", "vs Usual", "Top driver"],
            rows=[{
                "Store": s["store_name"],
                "Result": _VERDICT.get(s["verdict"], s["verdict"]),
                "Net Sales": _money(s["net_sales"]),
                "Target": _money(s["sales_target"]),
                "Achievement %": _pct(s["achievement_pct"]),
                "vs Usual": _pct(s["vs_baseline_pct"], signed=True),
                "Top driver": _top_driver(s),
            } for s in brief["stores"]],
        )
    blocks: list = [
        TitleBlock(text=f"CITIMART {title} — review of {brief['review_date']}"),
        KpiGridBlock(heading="Network", items=network_items),
        overview,
    ]

    for s in brief["stores"]:
        blocks.append(KpiGridBlock(heading=s["store_name"], items=[
            KpiItem(label="Net Sales", value=_money(s["net_sales"])),
            KpiItem(label="Sales Target", value=_money(s["sales_target"])),
            KpiItem(label="Achievement %", value=_pct(s["achievement_pct"]), status=s["achievement_status"]),
            KpiItem(label="Conversion %", value=_pct(s["conversion_pct"])),
            KpiItem(label="ATV", value=_money(s["atv"])),
        ]))
        # A driver that moved less than ₹1 explains nothing (same rule as explain.py).
        drivers = [d for d in s["drivers"] if abs(d["amount"]) >= 1]
        if drivers:
            days = (s["baseline"] or {}).get("days_used")
            scope = f" (completed slots: {', '.join(s['slots_compared'])})" if midday and s.get("slots_compared") else ""
            blocks.append(TableBlock(
                title=f"{s['store_name']} — drivers vs the usual {days} same weekdays{scope}",
                columns=["Driver", "Impact", "Change", "This day", "Usual"],
                rows=[{
                    "Driver": _DRIVER[(d["driver"], "down" if d["amount"] < 0 else "up")],
                    "Impact": _signed_money(d["amount"]),
                    "Change": _pct(d["change_pct"], signed=True),
                    "This day": _pct(d["current"] * 100) if d["driver"] == "conversion"
                    else _money(d["current"]) if d["driver"] == "atv" else f"{d['current']:,.0f}",
                    "Usual": _pct(d["baseline"] * 100) if d["driver"] == "conversion"
                    else _money(d["baseline"]) if d["driver"] == "atv" else f"{d['baseline']:,.0f}",
                } for d in drivers],
            ))
        elif midday and not s.get("slots_compared"):
            blocks.append(TextBlock(text=f"{s['store_name']}: no time slot has finished yet, so there is nothing to compare."))
        else:
            blocks.append(TextBlock(text=f"{s['store_name']}: not enough same-weekday history to attribute this day."))
        watch = s.get("watch_outs") or []
        blocks.append(TextBlock(
            heading=f"{s['store_name']} — watch-outs for "
                    + ("the rest of today" if midday else brief["watch_date"]),
            text=", ".join(_watch_text(w) for w in watch) if watch else "None.",
        ))

    scope = (f"All stores | Today so far, as of {brief['as_of'][11:16]} IST" if midday and brief.get("as_of")
             else f"All stores | Review: {brief['review_date']} | Watch-outs: {brief['watch_date']}")
    meta = ReportMeta(
        title=f"{title} {brief['review_date']}",
        generated_at=datetime.now().strftime("%d.%m.%Y %H:%M:%S"),
        filters_summary_text=scope,
        workbook_note="Figures are live Daily Operations data (MongoDB), not DATASET.xlsx.",
    )
    return ReportPayload(meta=meta, blocks=blocks)


def render_payload(payload: ReportPayload) -> bytes:
    """Draw the blocks *in order*. ``renderers/pdf.render`` is laid out for the
    per-store daily report (first KPI grid only; a first table of <= 4 rows is
    treated as the time-slot table and the rest dropped) and is a shared copy
    with the Analytics sub-project, so the brief reuses its styles and table
    helpers instead of changing it."""
    import io

    from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.units import cm

    from src.reports.fonts import FONT
    from src.reports.renderers import pdf as base  # local: renderer imports are heavy

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=(base.PAGE_WIDTH, base.PAGE_HEIGHT), topMargin=1.0 * cm,
                            bottomMargin=1.2 * cm, leftMargin=1.2 * cm, rightMargin=1.2 * cm, title=payload.meta.title,
                            initialFontName=FONT)
    logo = [Image(str(base._LOGO_PATH), width=4.8 * cm, height=1.6 * cm)] if base._LOGO_PATH.exists() else []
    header = Table([[logo, [
        Paragraph(payload.meta.title, base._H1),
        Spacer(1, 0.1 * cm),
        Paragraph(f"<b>Generated:</b> {payload.meta.generated_at} &nbsp;|&nbsp; {payload.meta.filters_summary_text}", base._ITALIC),
    ]]], colWidths=[5.2 * cm, base.USABLE_WIDTH - 5.2 * cm])
    header.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), FONT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                ("LINEBELOW", (0, 0), (-1, -1), 1.5, colors.HexColor("#1e3a8a"))]))
    story = [header, Spacer(1, 0.2 * cm)]

    for block in payload.blocks:
        if isinstance(block, TitleBlock):
            continue  # the header already carries the title
        if isinstance(block, KpiGridBlock):
            parts = [Paragraph(f"<b>{block.heading}</b>", base._H2)] if block.heading else []
            story.append(KeepTogether([*parts, base._kpi_grid_table(block)]))
        elif isinstance(block, TableBlock):
            story.append(KeepTogether([Paragraph(f"<b>{block.title}</b>", base._H2),
                                       base._data_table(block.columns, block.rows)]))
        elif isinstance(block, TextBlock):
            parts = [Paragraph(f"<b>{block.heading}</b>", base._H2)] if block.heading else []
            story.append(KeepTogether([*parts, Paragraph(block.text, base._BODY)]))
        story.append(Spacer(1, 0.15 * cm))

    decorate = base._page_decoration(payload)
    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
    return buffer.getvalue()


def render_brief_pdf(brief: dict) -> tuple[bytes, str]:
    filename = f"citimart-{brief['kind']}-brief-{brief['review_date']}.pdf"
    return render_payload(build_brief_payload(brief)), filename
