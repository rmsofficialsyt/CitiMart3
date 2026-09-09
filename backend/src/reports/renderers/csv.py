"""CSV renderer -- the flattest format, so it's the only one that
deliberately drops chart/gauge blocks (a chart has no place in a flat table)
rather than trying to force an image or its underlying series into a cell.
KPI/data-quality/forecast items become simple label/value rows; each
TableBlock becomes its own section. One file, multiple sections separated by
a blank line and a "# <heading>" marker row, same utf-8-sig BOM encoding
src/tables.py's dataframe_to_csv_bytes already uses so ₹ renders correctly
in Excel.
"""
from __future__ import annotations

import csv
import io

from src.reports.models import DataQualityBlock, ForecastSummaryBlock, KpiGridBlock, ReportPayload, TableBlock, TextBlock, TitleBlock


def render(payload: ReportPayload) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    writer.writerow([payload.meta.title])
    writer.writerow(["Generated", payload.meta.generated_at])
    writer.writerow(["Filters", payload.meta.filters_summary_text])
    writer.writerow([])

    for block in payload.blocks:
        if isinstance(block, TitleBlock):
            continue
        writer.writerow([])
        if isinstance(block, TextBlock):
            writer.writerow([f"# {block.heading or 'Notes'}"])
            writer.writerow([block.text])
        elif isinstance(block, KpiGridBlock):
            writer.writerow([f"# {block.heading or 'KPI Summary'}"])
            for item in block.items:
                writer.writerow([item.label, item.value])
        elif isinstance(block, ForecastSummaryBlock):
            writer.writerow([f"# {block.heading}"])
            for item in block.items:
                writer.writerow([item.label, item.value])
            if block.note:
                writer.writerow([block.note])
        elif isinstance(block, DataQualityBlock):
            writer.writerow([f"# {block.heading}"])
            for item in block.items:
                writer.writerow([item])
        elif isinstance(block, TableBlock):
            writer.writerow([f"# {block.title}"])
            writer.writerow(block.columns)
            for row in block.rows:
                writer.writerow([row.get(col, "") for col in block.columns])
        # ChartBlock/GaugeBlock/FiltersSummaryBlock: charts have no flat-CSV
        # representation (documented above); filters are already in the
        # header, so skipped here to avoid repeating it per block.

    writer.writerow([])
    writer.writerow([payload.meta.workbook_note])
    return buffer.getvalue().encode("utf-8-sig")
