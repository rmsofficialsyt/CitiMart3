"""XML renderer -- a structured *data* document, not a visual layout (see
src/reports/models.py's module docstring). Chart/gauge blocks are
represented by their underlying data series (whatever x/y/labels/values
arrays each Plotly trace carries), not an image -- XML here is for a system
to consume, not for a person to look at.
"""
from __future__ import annotations

from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom

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

_SERIES_KEYS = ("x", "y", "labels", "values", "theta", "r")


def _add_meta(root: Element, payload: ReportPayload) -> None:
    meta = SubElement(root, "meta")
    SubElement(meta, "title").text = payload.meta.title
    SubElement(meta, "generatedAt").text = payload.meta.generated_at
    SubElement(meta, "filters").text = payload.meta.filters_summary_text
    SubElement(meta, "workbookNote").text = payload.meta.workbook_note


def _add_chart_series(chart_el: Element, figure: dict) -> None:
    for trace in figure.get("data", []):
        trace_el = SubElement(chart_el, "trace", {"type": str(trace.get("type", "unknown"))})
        if trace.get("name"):
            trace_el.set("name", str(trace["name"]))
        for key in _SERIES_KEYS:
            values = trace.get(key)
            if not values:
                continue
            series_el = SubElement(trace_el, key)
            for value in values:
                SubElement(series_el, "v").text = "" if value is None else str(value)


def render(payload: ReportPayload) -> bytes:
    root = Element("report")
    _add_meta(root, payload)
    blocks_el = SubElement(root, "blocks")

    for block in payload.blocks:
        if isinstance(block, TitleBlock):
            SubElement(blocks_el, "title").text = block.text
        elif isinstance(block, TextBlock):
            el = SubElement(blocks_el, "text")
            if block.heading:
                el.set("heading", block.heading)
            el.text = block.text
        elif isinstance(block, FiltersSummaryBlock):
            SubElement(blocks_el, "filtersSummary").text = block.text
        elif isinstance(block, KpiGridBlock):
            grid_el = SubElement(blocks_el, "kpiGrid")
            if block.heading:
                grid_el.set("heading", block.heading)
            for item in block.items:
                item_el = SubElement(grid_el, "kpi", {"label": item.label, "value": item.value})
                if item.status:
                    item_el.set("status", item.status)
        elif isinstance(block, ChartBlock):
            chart_el = SubElement(blocks_el, "chart", {"title": block.title})
            _add_chart_series(chart_el, block.figure)
        elif isinstance(block, GaugeBlock):
            spec = block.spec
            SubElement(
                blocks_el,
                "gauge",
                {
                    "title": str(spec.get("title", "")),
                    "value": "" if spec.get("value") is None else str(spec["value"]),
                    "target": "" if spec.get("target") is None else str(spec["target"]),
                },
            )
        elif isinstance(block, TableBlock):
            table_el = SubElement(blocks_el, "table", {"title": block.title})
            for row in block.rows:
                row_el = SubElement(table_el, "row")
                for col in block.columns:
                    cell_el = SubElement(row_el, "cell", {"column": col})
                    value = row.get(col)
                    cell_el.text = "" if value is None else str(value)
        elif isinstance(block, DataQualityBlock):
            dq_el = SubElement(blocks_el, "dataQuality", {"heading": block.heading})
            for item in block.items:
                SubElement(dq_el, "warning").text = item
        elif isinstance(block, ForecastSummaryBlock):
            fc_el = SubElement(blocks_el, "forecastSummary", {"heading": block.heading})
            for item in block.items:
                SubElement(fc_el, "metric", {"label": item.label, "value": item.value})
            if block.note:
                SubElement(fc_el, "note").text = block.note

    rough = tostring(root, encoding="utf-8")
    return minidom.parseString(rough).toprettyxml(indent="  ", encoding="utf-8")
