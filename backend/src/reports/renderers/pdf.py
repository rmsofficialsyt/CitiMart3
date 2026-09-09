"""PDF renderer via ReportLab (per the master spec's explicit "use best
module like ReportLab" instruction) -- Platypus flowables so long tables
paginate automatically, with a canvas-level page decoration for page
numbers, CITIMART branding, and the "results based on the currently loaded
workbook" footer on every page.
"""
from __future__ import annotations

import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from config.settings import PROJECT_ROOT
from src.reports.chart_image import fig_dict_to_png, gauge_spec_to_png
from src.reports.models import (
    ChartBlock,
    DataQualityBlock,
    FiltersSummaryBlock,
    ForecastSummaryBlock,
    GaugeBlock,
    KpiGridBlock,
    ReportPayload,
    TableBlock,
    TextBlock,
    TitleBlock,
)

_LOGO_PATH = PROJECT_ROOT / "img" / "logo" / "CitiMart_logo_2.png"

_STYLES = getSampleStyleSheet()
_H1 = ParagraphStyle("H1", parent=_STYLES["Heading1"], textColor=colors.HexColor("#1e3a8a"))
_H2 = ParagraphStyle("H2", parent=_STYLES["Heading2"], textColor=colors.HexColor("#1e3a8a"), spaceBefore=14)
_BODY = _STYLES["BodyText"]
_ITALIC = ParagraphStyle("Italic", parent=_BODY, fontName="Helvetica-Oblique", fontSize=9, textColor=colors.HexColor("#475569"))

_TABLE_STYLE = TableStyle(
    [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]
)


def _data_table(columns: list[str], rows: list[dict]) -> Table:
    data = [columns] + [[("" if row.get(c) is None else str(row.get(c))) for c in columns] for row in rows]
    table = Table(data, repeatRows=1, hAlign="LEFT")
    table.setStyle(_TABLE_STYLE)
    return table


def _page_decoration(payload: ReportPayload):
    def _draw(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#64748b"))
        canvas.drawString(2 * cm, 1.2 * cm, payload.meta.workbook_note)
        canvas.drawRightString(A4[0] - 2 * cm, 1.2 * cm, f"Page {doc.page}")
        canvas.restoreState()

    return _draw


def render(payload: ReportPayload) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=2 * cm, bottomMargin=2.2 * cm, leftMargin=2 * cm, rightMargin=2 * cm,
        title=payload.meta.title,
    )

    story = []
    if _LOGO_PATH.exists():
        story.append(Image(str(_LOGO_PATH), width=4 * cm, height=4 * cm * 0.4))
        story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph(payload.meta.title, _H1))
    story.append(Paragraph(f"Generated: {payload.meta.generated_at}", _ITALIC))
    story.append(Paragraph(f"Filters: {payload.meta.filters_summary_text}", _ITALIC))
    story.append(Spacer(1, 0.6 * cm))

    for block in payload.blocks:
        if isinstance(block, TitleBlock):
            continue
        if isinstance(block, TextBlock):
            if block.heading:
                story.append(Paragraph(block.heading, _H2))
            story.append(Paragraph(block.text, _BODY))
        elif isinstance(block, FiltersSummaryBlock):
            story.append(Paragraph(block.heading, _H2))
            story.append(Paragraph(block.text, _BODY))
        elif isinstance(block, KpiGridBlock):
            if block.heading:
                story.append(Paragraph(block.heading, _H2))
            story.append(_data_table(["KPI", "Value"], [{"KPI": i.label, "Value": i.value} for i in block.items]))
        elif isinstance(block, ChartBlock):
            story.append(Paragraph(block.title, _H2))
            png = fig_dict_to_png(block.figure, width=1000, height=500)
            story.append(Image(io.BytesIO(png), width=16 * cm, height=8 * cm))
        elif isinstance(block, GaugeBlock):
            title = str(block.spec.get("title", "Gauge"))
            story.append(Paragraph(title, _H2))
            png = gauge_spec_to_png(block.spec, width=700, height=500)
            story.append(Image(io.BytesIO(png), width=10 * cm, height=7.1 * cm))
        elif isinstance(block, TableBlock):
            story.append(Paragraph(block.title, _H2))
            story.append(_data_table(block.columns, block.rows))
        elif isinstance(block, DataQualityBlock):
            story.append(Paragraph(block.heading, _H2))
            if block.items:
                story.append(ListFlowable([ListItem(Paragraph(item, _BODY)) for item in block.items], bulletType="bullet"))
            else:
                story.append(Paragraph("No data-quality warnings.", _BODY))
        elif isinstance(block, ForecastSummaryBlock):
            story.append(Paragraph(block.heading, _H2))
            story.append(_data_table(["Metric", "Value"], [{"Metric": i.label, "Value": i.value} for i in block.items]))
            if block.note:
                story.append(Paragraph(block.note, _ITALIC))
        story.append(Spacer(1, 0.4 * cm))

    decorate = _page_decoration(payload)
    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
    return buffer.getvalue()
