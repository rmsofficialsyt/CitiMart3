"""PDF exports embed a font with a real ₹ glyph (src/reports/fonts.py).

Helvetica (ReportLab's built-in) has no U+20B9, so any Helvetica text run in
a report turns "₹" into a box. These tests fail if a renderer reintroduces it.
"""
from __future__ import annotations

from reportlab.pdfbase import pdfmetrics

from src.reports import fonts
from src.reports.models import DataQualityBlock, FiltersSummaryBlock, ForecastSummaryBlock, KpiGridBlock, KpiItem, ReportMeta, ReportPayload, TableBlock, TextBlock, TitleBlock
from src.reports.renderers import pdf

RUPEE = "₹"


def _payload() -> ReportPayload:
    return ReportPayload(
        meta=ReportMeta(title="Font check ₹", generated_at="25.11.2026 12:00:00", filters_summary_text="Store: NM"),
        blocks=[
            TitleBlock(text="Font check"),
            KpiGridBlock(heading="KPIs", items=[KpiItem(label="Net Sales", value="₹1,23,000.00")]),
            TableBlock(title="Rows", columns=["Date", "Net Sales"], rows=[{"Date": "2026-11-24", "Net Sales": "₹500"}]),
            TextBlock(heading="Note", text="Gap −₹2,000 — check"),
            # Every non-visual block type: each has its own font default to override
            # (list bullets, filter summary, forecast table + note).
            FiltersSummaryBlock(text="Stores: NM · ₹ values"),
            DataQualityBlock(items=["₹0.00 bills excluded."]),
            ForecastSummaryBlock(heading="Forecast", items=[KpiItem(label="Next 30 days", value="₹11,40,000")], note="₹ note"),
        ],
    )


def test_bundled_font_has_the_rupee_glyph():
    assert fonts.UNICODE_FONTS, f"font files missing from {fonts.FONT_DIR}"
    for name in (fonts.FONT, fonts.FONT_BOLD, fonts.FONT_ITALIC):
        assert ord(RUPEE) in pdfmetrics.getFont(name).face.charToGlyph, name


def test_pdf_embeds_unicode_font_and_no_helvetica():
    content = pdf.render(_payload())
    assert content.startswith(b"%PDF")
    # Embedded under the TTF's own PostScript name, not the registration alias.
    assert b"DejaVuSans" in content
    assert b"Helvetica" not in content


def test_brief_pdf_uses_the_rupee_sign():
    from src.advisor.brief_report import render_payload

    content = render_payload(_payload())
    assert b"DejaVuSans" in content and b"Helvetica" not in content
