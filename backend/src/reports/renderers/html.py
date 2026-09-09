"""HTML renderer -- a single self-contained file (inline CSS, base64 chart
images and logo, no external assets or a live Plotly.js bundle) so it opens
identically anywhere and prints the same way every other format renders
(see src/reports/models.py's module docstring). The in-browser preview's own
"Print" button (frontend/src/pages/ReportBuilder.tsx) reuses the browser's
native print dialog against a similar stylesheet -- this renderer is the
downloadable, standalone version of that same look.
"""
from __future__ import annotations

import base64
import html as html_escape

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

_STYLE = """
body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; max-width: 960px; margin: 2rem auto; padding: 0 1.5rem; }
header { display: flex; align-items: center; gap: 1rem; border-bottom: 3px solid #1e3a8a; padding-bottom: 1rem; margin-bottom: 1.5rem; }
header img { height: 48px; }
h1 { font-size: 1.5rem; margin: 0; }
.meta { color: #475569; font-size: 0.85rem; margin-top: 1.5rem; }
section { margin: 1.75rem 0; }
section h2 { font-size: 1.1rem; border-left: 4px solid #1e3a8a; padding-left: 0.6rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
th, td { border: 1px solid #cbd5e1; padding: 0.4rem 0.6rem; text-align: left; }
th { background: #f1f5f9; }
img.chart { max-width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; }
ul.dq { padding-left: 1.2rem; }
.status-red { color: #dc2626; font-weight: 600; }
.status-yellow { color: #b45309; font-weight: 600; }
.status-green { color: #16a34a; font-weight: 600; }
footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #cbd5e1; font-size: 0.75rem; color: #64748b; }
@media print { body { margin: 0; } section { page-break-inside: avoid; } }
"""


def _e(text: str) -> str:
    return html_escape.escape(str(text))


def _img_tag(png_bytes: bytes, alt: str) -> str:
    b64 = base64.b64encode(png_bytes).decode("ascii")
    return f'<img class="chart" alt="{_e(alt)}" src="data:image/png;base64,{b64}" />'


def _table_html(columns: list[str], rows: list[dict]) -> str:
    head = "".join(f"<th>{_e(c)}</th>" for c in columns)
    body = "".join(
        "<tr>" + "".join(f"<td>{_e(row.get(c, ''))}</td>" for c in columns) + "</tr>" for row in rows
    )
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def render(payload: ReportPayload) -> bytes:
    sections: list[str] = []
    for block in payload.blocks:
        if isinstance(block, TitleBlock):
            continue
        if isinstance(block, TextBlock):
            heading = f"<h2>{_e(block.heading)}</h2>" if block.heading else ""
            sections.append(f"<section>{heading}<p>{_e(block.text)}</p></section>")
        elif isinstance(block, FiltersSummaryBlock):
            sections.append(f"<section><h2>{_e(block.heading)}</h2><p>{_e(block.text)}</p></section>")
        elif isinstance(block, KpiGridBlock):
            heading = f"<h2>{_e(block.heading)}</h2>" if block.heading else ""
            rows = "".join(
                f'<tr><td>{_e(i.label)}</td><td class="status-{i.status}">{_e(i.value)}</td></tr>' if i.status
                else f"<tr><td>{_e(i.label)}</td><td>{_e(i.value)}</td></tr>"
                for i in block.items
            )
            sections.append(f"<section>{heading}<table><tbody>{rows}</tbody></table></section>")
        elif isinstance(block, ChartBlock):
            img = _img_tag(fig_dict_to_png(block.figure), block.title)
            sections.append(f"<section><h2>{_e(block.title)}</h2>{img}</section>")
        elif isinstance(block, GaugeBlock):
            title = str(block.spec.get("title", "Gauge"))
            img = _img_tag(gauge_spec_to_png(block.spec), title)
            sections.append(f"<section><h2>{_e(title)}</h2>{img}</section>")
        elif isinstance(block, TableBlock):
            sections.append(f"<section><h2>{_e(block.title)}</h2>{_table_html(block.columns, block.rows)}</section>")
        elif isinstance(block, DataQualityBlock):
            items = "".join(f"<li>{_e(item)}</li>" for item in block.items)
            sections.append(f'<section><h2>{_e(block.heading)}</h2><ul class="dq">{items}</ul></section>')
        elif isinstance(block, ForecastSummaryBlock):
            table = _table_html(["Metric", "Value"], [{"Metric": i.label, "Value": i.value} for i in block.items])
            note = f"<p><em>{_e(block.note)}</em></p>" if block.note else ""
            sections.append(f"<section><h2>{_e(block.heading)}</h2>{table}{note}</section>")

    logo_tag = ""
    if _LOGO_PATH.exists():
        logo_b64 = base64.b64encode(_LOGO_PATH.read_bytes()).decode("ascii")
        logo_tag = f'<img src="data:image/png;base64,{logo_b64}" alt="CitiMart" />'

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>{_e(payload.meta.title)}</title>
<style>{_STYLE}</style>
</head>
<body>
<header>
{logo_tag}
<div>
<h1>{_e(payload.meta.title)}</h1>
<div class="meta">Generated: {_e(payload.meta.generated_at)}</div>
</div>
</header>
{''.join(sections)}
<footer>{_e(payload.meta.workbook_note)}</footer>
</body>
</html>""".encode("utf-8")
