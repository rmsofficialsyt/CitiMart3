"""PPTX renderer via python-pptx: a title slide, then one slide per block
(KPI grid as a table, chart/gauge as an embedded image, data table as a
table capped to a readable row count, data-quality/forecast as bullets).
CITIMART branding (logo) appears on the title slide.
"""
from __future__ import annotations

import io

from pptx import Presentation
from pptx.util import Inches, Pt

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
_MAX_TABLE_ROWS = 15


def _title_slide(prs: Presentation, payload: ReportPayload):
    slide = prs.slides.add_slide(prs.slide_layouts[0])
    slide.shapes.title.text = payload.meta.title
    subtitle = slide.placeholders[1] if len(slide.placeholders) > 1 else None
    if subtitle is not None:
        subtitle.text = f"Generated: {payload.meta.generated_at}\nFilters: {payload.meta.filters_summary_text}"
    if _LOGO_PATH.exists():
        slide.shapes.add_picture(str(_LOGO_PATH), Inches(0.3), Inches(0.3), height=Inches(0.9))


def _bullet_slide(prs: Presentation, heading: str, lines: list[str]):
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = heading
    body = slide.placeholders[1].text_frame
    body.clear()
    if not lines:
        body.text = "—"
        return
    body.text = lines[0]
    for line in lines[1:]:
        p = body.add_paragraph()
        p.text = line


def _image_slide(prs: Presentation, heading: str, png_bytes: bytes):
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    slide.shapes.title.text = heading
    slide.shapes.add_picture(io.BytesIO(png_bytes), Inches(0.7), Inches(1.4), width=Inches(8.5))


def _table_slide(prs: Presentation, heading: str, columns: list[str], rows: list[dict]):
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    slide.shapes.title.text = heading
    shown = rows[:_MAX_TABLE_ROWS]
    n_rows, n_cols = len(shown) + 1, max(len(columns), 1)
    table_shape = slide.shapes.add_table(n_rows, n_cols, Inches(0.5), Inches(1.4), Inches(9), Inches(0.4 * n_rows))
    table = table_shape.table
    for idx, col in enumerate(columns):
        cell = table.cell(0, idx)
        cell.text = str(col)
        cell.text_frame.paragraphs[0].font.bold = True
        cell.text_frame.paragraphs[0].font.size = Pt(12)
    for r, row in enumerate(shown, start=1):
        for c, col in enumerate(columns):
            value = row.get(col)
            table.cell(r, c).text = "" if value is None else str(value)
    if len(rows) > _MAX_TABLE_ROWS:
        note = slide.shapes.add_textbox(Inches(0.5), Inches(1.4 + 0.4 * n_rows), Inches(9), Inches(0.4))
        note.text_frame.text = f"Showing {_MAX_TABLE_ROWS} of {len(rows)} rows."


def render(payload: ReportPayload) -> bytes:
    prs = Presentation()
    _title_slide(prs, payload)

    for block in payload.blocks:
        if isinstance(block, TitleBlock):
            continue
        if isinstance(block, TextBlock):
            _bullet_slide(prs, block.heading or "Notes", [block.text])
        elif isinstance(block, FiltersSummaryBlock):
            _bullet_slide(prs, block.heading, [block.text])
        elif isinstance(block, KpiGridBlock):
            _table_slide(prs, block.heading or "KPI Summary", ["KPI", "Value"], [{"KPI": i.label, "Value": i.value} for i in block.items])
        elif isinstance(block, ChartBlock):
            _image_slide(prs, block.title, fig_dict_to_png(block.figure))
        elif isinstance(block, GaugeBlock):
            title = str(block.spec.get("title", "Gauge"))
            _image_slide(prs, title, gauge_spec_to_png(block.spec))
        elif isinstance(block, TableBlock):
            _table_slide(prs, block.title, block.columns, block.rows)
        elif isinstance(block, DataQualityBlock):
            _bullet_slide(prs, block.heading, block.items or ["No data-quality warnings."])
        elif isinstance(block, ForecastSummaryBlock):
            _table_slide(prs, block.heading, ["Metric", "Value"], [{"Metric": i.label, "Value": i.value} for i in block.items])

    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()
