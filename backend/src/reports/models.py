"""Shared block model for the report-export feature (README's "Phase C").

One dashboard tab's report is a flat, ordered list of `Block`s -- built and
edited entirely client-side (frontend/src/lib/reportTypes.ts is the TS
mirror of this exact shape), then POSTed here once, already final. This
module and every renderer under `renderers/` never re-derive data from
DATASET.xlsx or re-call chart/table builders -- they only lay out whatever
the browser already fetched and the user already edited. That's what keeps
"8 formats x 7 report-able tabs" from becoming an 8x7 combinatorial mess:
every renderer only has to know how to draw ~9 block *types*, never which
tab a block came from.

KPI/data-quality/forecast blocks carry already-formatted display strings
(`KpiItem.value` is `"₹12,345.00"`, not `12345.0`), matching how
frontend/src/lib/format.ts already formats these values for on-screen
display -- so a renderer never needs its own copy of the currency/percent
formatting rules, and never needs to know the full shape of
`DataQualityProfile`/`ForecastBundle`, just "a list of labelled lines".

`ChartBlock.figure` is the raw Plotly figure JSON dict the frontend already
fetched via `GET /api/charts/{chart_id}` (see src/charts.py's `_fig_to_dict`)
-- `chart_image.fig_dict_to_png` rasterizes it for the static formats.
`GaugeBlock.spec` is the exact `GaugeSpec` shape `GET /api/charts/{gauge_id}`
already returns (src/charts.py's `gauge_spec()`: kind/title/value/target/
min/max/redBelow/greenAt/reverse/suffix/prefix) -- rasterizing it reuses the
same thresholds without needing config/kpi_thresholds.py again.
"""
from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class TitleBlock(BaseModel):
    type: Literal["title"] = "title"
    text: str


class TextBlock(BaseModel):
    type: Literal["text"] = "text"
    heading: str | None = None
    text: str


class FiltersSummaryBlock(BaseModel):
    type: Literal["filters_summary"] = "filters_summary"
    heading: str = "Selected Filters"
    text: str


class KpiItem(BaseModel):
    label: str
    value: str
    status: Literal["red", "yellow", "green"] | None = None


class KpiGridBlock(BaseModel):
    type: Literal["kpi_grid"] = "kpi_grid"
    heading: str | None = None
    items: list[KpiItem]


class ChartBlock(BaseModel):
    type: Literal["chart"] = "chart"
    title: str
    figure: dict


class GaugeBlock(BaseModel):
    type: Literal["gauge"] = "gauge"
    spec: dict


class TableBlock(BaseModel):
    type: Literal["table"] = "table"
    title: str
    columns: list[str]
    rows: list[dict]


class DataQualityBlock(BaseModel):
    type: Literal["data_quality"] = "data_quality"
    heading: str = "Data Quality Warnings"
    items: list[str]


class ForecastSummaryBlock(BaseModel):
    type: Literal["forecast_summary"] = "forecast_summary"
    heading: str
    items: list[KpiItem]
    note: str | None = None


Block = Annotated[
    Union[
        TitleBlock,
        TextBlock,
        FiltersSummaryBlock,
        KpiGridBlock,
        ChartBlock,
        GaugeBlock,
        TableBlock,
        DataQualityBlock,
        ForecastSummaryBlock,
    ],
    Field(discriminator="type"),
]


class ReportMeta(BaseModel):
    title: str
    generated_at: str
    filters_summary_text: str
    workbook_note: str = "Results are based on the currently loaded workbook (DATASET.xlsx)."


class ReportPayload(BaseModel):
    meta: ReportMeta
    blocks: list[Block]
