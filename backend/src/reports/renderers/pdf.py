"""PDF renderer via ReportLab in Landscape A4 layout.

Produces a polished, executive-ready dashboard in 1 page for single-day reports,
and cleanly paginated multi-page documents for multi-day date ranges.
Includes CITIMART branding, KPI summary banner, dashboard-matching gauge dials,
sales breakdown chart, and formatted tabular logs.
"""
from __future__ import annotations

import io
import logging
from concurrent.futures import ThreadPoolExecutor

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

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

logger = logging.getLogger(__name__)

_LOGO_PATH = PROJECT_ROOT / "img" / "logo" / "CitiMart_logo_2.png"

PAGE_WIDTH, PAGE_HEIGHT = landscape(A4)
USABLE_WIDTH = PAGE_WIDTH - 2.4 * cm  # ~27.3 cm / 774 pt

_STYLES = getSampleStyleSheet()
_H1 = ParagraphStyle("H1", parent=_STYLES["Heading1"], fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=colors.HexColor("#1e3a8a"))
_H2 = ParagraphStyle("H2", parent=_STYLES["Heading2"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=colors.HexColor("#1e3a8a"), spaceBefore=8, spaceAfter=4)
_BODY = ParagraphStyle("Body", parent=_STYLES["BodyText"], fontName="Helvetica", fontSize=8, leading=10, textColor=colors.HexColor("#1e293b"))
_ITALIC = ParagraphStyle("Italic", parent=_BODY, fontName="Helvetica-Oblique", fontSize=7.5, leading=9.5, textColor=colors.HexColor("#64748b"))
_TH_STYLE = ParagraphStyle("TH", fontName="Helvetica-Bold", fontSize=7, leading=8.5, textColor=colors.white, alignment=1)
_TD_NUM_STYLE = ParagraphStyle("TD_Num", fontName="Helvetica", fontSize=7, leading=8.5, textColor=colors.HexColor("#0f172a"), alignment=2)
_TD_CENTER_STYLE = ParagraphStyle("TD_Center", fontName="Helvetica", fontSize=7, leading=8.5, textColor=colors.HexColor("#1e293b"), alignment=1)
_TD_LEFT_STYLE = ParagraphStyle("TD_Left", fontName="Helvetica", fontSize=7, leading=8.5, textColor=colors.HexColor("#1e293b"), alignment=0)
_KPI_LABEL = ParagraphStyle("KpiLabel", fontName="Helvetica-Bold", fontSize=7, leading=8.5, textColor=colors.HexColor("#1e3a8a"), alignment=1)
_KPI_VAL = ParagraphStyle("KpiVal", fontName="Helvetica-Bold", fontSize=9.5, leading=11.5, textColor=colors.HexColor("#0f172a"), alignment=1)

_COLUMN_BASE_WIDTHS: dict[str, float] = {
    "Date": 1.8 * cm,
    "Store": 1.3 * cm,
    "Time Slot": 2.8 * cm,
    "Sales Target": 1.8 * cm,
    "Net Sales": 1.8 * cm,
    "Remaining": 1.8 * cm,
    "Bill Quantity (units sold)": 2.4 * cm,
    "Footfall": 1.4 * cm,
    "Transactions (NOB)": 1.8 * cm,
    "ATV": 1.4 * cm,
    "RPV": 1.4 * cm,
    "Conversion %": 1.6 * cm,
    "Achievement %": 1.6 * cm,
    "Remaining %": 1.6 * cm,
    "Remarks": 2.6 * cm,
}

_NUMERIC_COLS = {
    "Sales Target", "Net Sales", "Remaining", "Bill Quantity (units sold)",
    "Footfall", "Transactions (NOB)", "ATV", "RPV", "Conversion %",
    "Achievement %", "Remaining %", "Value", "Current Value", "Target"
}


def _kpi_grid_table(block: KpiGridBlock) -> Table:
    """Renders KPI items as a sleek multi-column horizontal scorecard banner across full page width."""
    items = block.items
    if not items:
        return Table([[]])

    cols = min(5, len(items))
    rows_data = []
    chunk_labels = []
    chunk_vals = []

    for idx, item in enumerate(items):
        lbl = Paragraph(f"<b>{item.label}</b>", _KPI_LABEL)
        val = Paragraph(f"<b>{item.value}</b>", _KPI_VAL)
        chunk_labels.append(lbl)
        chunk_vals.append(val)
        if len(chunk_labels) == cols or idx == len(items) - 1:
            while len(chunk_labels) < cols:
                chunk_labels.append(Paragraph("", _KPI_LABEL))
                chunk_vals.append(Paragraph("", _KPI_VAL))
            rows_data.append(chunk_labels)
            rows_data.append(chunk_vals)
            chunk_labels = []
            chunk_vals = []

    col_w = USABLE_WIDTH / cols
    table = Table(rows_data, colWidths=[col_w] * cols)
    t_style = [
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    for r in range(0, len(rows_data), 2):
        t_style.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#f1f5f9")))
        t_style.append(("BACKGROUND", (0, r + 1), (-1, r + 1), colors.white))

    table.setStyle(TableStyle(t_style))
    return table


def _data_table(columns: list[str], rows: list[dict]) -> Table:
    """Formats wide tabular rows into landscape table with proportional MS-Excel style columns and aligned data."""
    if not columns:
        return Table([[]])

    # Calculate proportional column widths
    raw_widths = [_COLUMN_BASE_WIDTHS.get(col, 2.0 * cm) for col in columns]
    total_raw = sum(raw_widths)
    scale = USABLE_WIDTH / total_raw if total_raw > 0 else 1.0
    col_widths = [w * scale for w in raw_widths]

    header_row = [Paragraph(f"<b>{col}</b>", _TH_STYLE) for col in columns]
    data = [header_row]

    for row in rows:
        row_cells = []
        for col in columns:
            val = row.get(col)
            cell_str = "" if val is None else str(val)
            if col in _NUMERIC_COLS:
                p_style = _TD_NUM_STYLE
            elif col in ("Date", "Time Slot", "Store"):
                p_style = _TD_CENTER_STYLE
            else:
                p_style = _TD_LEFT_STYLE
            row_cells.append(Paragraph(cell_str, p_style))
        data.append(row_cells)

    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    return table


def _page_decoration(payload: ReportPayload):
    def _draw(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#64748b"))
        note = f"{payload.meta.workbook_note} | CITIMART © All Rights Reserved."
        canvas.drawString(1.2 * cm, 0.7 * cm, note)
        canvas.drawRightString(PAGE_WIDTH - 1.2 * cm, 0.7 * cm, f"Page {doc.page}")
        canvas.restoreState()

    return _draw


def _rasterize_visual_block(block: ChartBlock | GaugeBlock) -> bytes | None:
    try:
        if isinstance(block, ChartBlock):
            return fig_dict_to_png(block.figure, width=1100, height=450)
        if isinstance(block, GaugeBlock):
            return gauge_spec_to_png(block.spec, width=650, height=420)
    except Exception as exc:
        logger.warning("Visual rasterization failed for block: %s", exc)
        return None
    return None


def render(payload: ReportPayload) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        topMargin=1.0 * cm,
        bottomMargin=1.2 * cm,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        title=payload.meta.title,
    )

    # Pre-render visuals concurrently
    visual_blocks = [(i, b) for i, b in enumerate(payload.blocks) if isinstance(b, (ChartBlock, GaugeBlock))]
    rendered_images: dict[int, bytes | None] = {}
    if visual_blocks:
        with ThreadPoolExecutor(max_workers=min(len(visual_blocks), 7)) as pool:
            futures = {pool.submit(_rasterize_visual_block, b): idx for idx, b in visual_blocks}
            for fut in futures:
                idx = futures[fut]
                try:
                    rendered_images[idx] = fut.result()
                except Exception:
                    rendered_images[idx] = None

    story = []

    # MS-Office Header with Logo on Left and Title/Metadata on Right
    header_left = []
    if _LOGO_PATH.exists():
        header_left.append(Image(str(_LOGO_PATH), width=4.8 * cm, height=1.6 * cm))

    header_right = [
        Paragraph(payload.meta.title, _H1),
        Spacer(1, 0.1 * cm),
        Paragraph(f"<b>Generated:</b> {payload.meta.generated_at} &nbsp;|&nbsp; <b>Filters:</b> {payload.meta.filters_summary_text}", _ITALIC),
    ]

    header_table = Table([[header_left, header_right]], colWidths=[5.2 * cm, USABLE_WIDTH - 5.2 * cm])
    header_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LINEBELOW", (0, 0), (-1, -1), 1.5, colors.HexColor("#1e3a8a")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(header_table)
    story.append(Spacer(1, 0.2 * cm))

    # Identify blocks
    kpi_block = next((b for b in payload.blocks if isinstance(b, KpiGridBlock)), None)
    gauge_blocks = [(idx, b) for idx, b in enumerate(payload.blocks) if isinstance(b, GaugeBlock)]
    chart_block = next(((idx, b) for idx, b in enumerate(payload.blocks) if isinstance(b, ChartBlock)), None)
    text_blocks = [b for b in payload.blocks if isinstance(b, TextBlock)]
    table_blocks = [b for b in payload.blocks if isinstance(b, TableBlock)]

    # Check if this is a single day report (table has <= 4 time slot rows)
    is_single_day = False
    if table_blocks and len(table_blocks[0].rows) <= 4:
        is_single_day = True

    # 1. Executive KPI Summary Scorecard
    if kpi_block:
        if kpi_block.heading:
            story.append(Paragraph(f"<b>{kpi_block.heading}</b>", _H2))
        story.append(_kpi_grid_table(kpi_block))
        story.append(Spacer(1, 0.2 * cm))

    # 2. Performance Gauges
    if gauge_blocks:
        story.append(Paragraph("<b>Store Performance Gauges</b>", _H2))
        gauge_cells = []
        row_cells = []
        # In single-day report, use compact gauge height so entire dashboard fits on 1 page
        gauge_h = 2.7 * cm if is_single_day else 3.2 * cm
        for g_idx, g_block in gauge_blocks:
            png = rendered_images.get(g_idx)
            if png:
                img_flow = Image(io.BytesIO(png), width=USABLE_WIDTH / 3.05, height=gauge_h)
                row_cells.append(img_flow)
            else:
                title = str(g_block.spec.get("title", "Gauge"))
                val = g_block.spec.get("value")
                val_str = f"{g_block.spec.get('prefix', '')}{val if val is not None else 'N/A'}{g_block.spec.get('suffix', '')}"
                row_cells.append(Paragraph(f"<b>{title}:</b> {val_str}", _BODY))

            if len(row_cells) == 3:
                gauge_cells.append(row_cells)
                row_cells = []
        if row_cells:
            while len(row_cells) < 3:
                row_cells.append(Paragraph("", _BODY))
            gauge_cells.append(row_cells)

        gauge_table = Table(gauge_cells, colWidths=[USABLE_WIDTH / 3] * 3)
        gauge_table.setStyle(
            TableStyle(
                [
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        story.append(gauge_table)
        story.append(Spacer(1, 0.15 * cm))

    # 3. For single day report: include today's Time Slot Performance Table on Page 1!
    if is_single_day and table_blocks:
        story.append(Paragraph("<b>Today's Time Slot Performance Summary</b>", _H2))
        story.append(_data_table(table_blocks[0].columns, table_blocks[0].rows))
        story.append(Spacer(1, 0.15 * cm))

        # Context line at bottom of Page 1
        for tb in text_blocks:
            if tb.heading:
                story.append(Paragraph(f"<b>{tb.heading}</b>", _H2))
            story.append(Paragraph(tb.text, _BODY))
            story.append(Spacer(1, 0.1 * cm))

    # 4. For multi-day report: show chart on Page 1, then PageBreak for full detailed tables
    elif not is_single_day:
        if chart_block:
            c_idx, c_b = chart_block
            story.append(Paragraph(f"<b>{c_b.title}</b>", _H2))
            c_png = rendered_images.get(c_idx)
            if c_png:
                story.append(Image(io.BytesIO(c_png), width=USABLE_WIDTH, height=5.2 * cm))
            story.append(Spacer(1, 0.2 * cm))

        for tb in text_blocks:
            if tb.heading:
                story.append(Paragraph(f"<b>{tb.heading}</b>", _H2))
            story.append(Paragraph(tb.text, _BODY))
            story.append(Spacer(1, 0.15 * cm))

        if table_blocks:
            story.append(PageBreak())
            for tbl in table_blocks:
                story.append(Paragraph(f"<b>{tbl.title}</b>", _H2))
                story.append(_data_table(tbl.columns, tbl.rows))
                story.append(Spacer(1, 0.3 * cm))

    # 5. Handle any secondary or analytical blocks if present
    for b in payload.blocks:
        if isinstance(b, (TitleBlock, KpiGridBlock, GaugeBlock, ChartBlock, TextBlock, TableBlock)):
            continue
        if isinstance(b, FiltersSummaryBlock):
            story.append(Paragraph(b.heading, _H2))
            story.append(Paragraph(b.text, _BODY))
        elif isinstance(b, DataQualityBlock):
            story.append(Paragraph(b.heading, _H2))
            if b.items:
                story.append(ListFlowable([ListItem(Paragraph(item, _BODY)) for item in b.items], bulletType="bullet"))
        elif isinstance(b, ForecastSummaryBlock):
            story.append(Paragraph(b.heading, _H2))
            story.append(_data_table(["Metric", "Value"], [{"Metric": i.label, "Value": i.value} for i in b.items]))

    decorate = _page_decoration(payload)
    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
    return buffer.getvalue()
