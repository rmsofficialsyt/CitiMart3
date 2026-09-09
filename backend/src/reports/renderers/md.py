"""Markdown renderer -- a single self-contained .md file, chart/gauge images
inlined as base64 data URIs (no external asset files to lose track of),
matching the static "print" fidelity every visual format shares (see
src/reports/models.py's module docstring).
"""
from __future__ import annotations

import base64

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


def _md_table(columns: list[str], rows: list[dict]) -> str:
    if not columns:
        return "_No rows._\n"
    header = "| " + " | ".join(columns) + " |"
    sep = "| " + " | ".join("---" for _ in columns) + " |"
    lines = [header, sep]
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(col, "")) for col in columns) + " |")
    return "\n".join(lines) + "\n"


def _image_markdown(alt: str, png_bytes: bytes) -> str:
    b64 = base64.b64encode(png_bytes).decode("ascii")
    return f"![{alt}](data:image/png;base64,{b64})\n"


def render(payload: ReportPayload) -> bytes:
    lines: list[str] = [f"# {payload.meta.title}", "", f"_Generated: {payload.meta.generated_at}_", ""]

    for block in payload.blocks:
        if isinstance(block, TitleBlock):
            continue
        if isinstance(block, TextBlock):
            if block.heading:
                lines.append(f"## {block.heading}")
            lines.append(block.text)
        elif isinstance(block, FiltersSummaryBlock):
            lines.append(f"## {block.heading}")
            lines.append(block.text)
        elif isinstance(block, KpiGridBlock):
            if block.heading:
                lines.append(f"## {block.heading}")
            lines.append(_md_table(["KPI", "Value"], [{"KPI": i.label, "Value": i.value} for i in block.items]))
        elif isinstance(block, ChartBlock):
            lines.append(f"## {block.title}")
            lines.append(_image_markdown(block.title, fig_dict_to_png(block.figure)))
        elif isinstance(block, GaugeBlock):
            title = str(block.spec.get("title", "Gauge"))
            lines.append(f"## {title}")
            lines.append(_image_markdown(title, gauge_spec_to_png(block.spec)))
        elif isinstance(block, TableBlock):
            lines.append(f"## {block.title}")
            lines.append(_md_table(block.columns, block.rows))
        elif isinstance(block, DataQualityBlock):
            lines.append(f"## {block.heading}")
            lines.extend(f"- {item}" for item in block.items)
        elif isinstance(block, ForecastSummaryBlock):
            lines.append(f"## {block.heading}")
            lines.append(_md_table(["Metric", "Value"], [{"Metric": i.label, "Value": i.value} for i in block.items]))
            if block.note:
                lines.append(f"_{block.note}_")
        lines.append("")

    lines.append("---")
    lines.append(f"_{payload.meta.workbook_note}_")
    return "\n".join(lines).encode("utf-8")
