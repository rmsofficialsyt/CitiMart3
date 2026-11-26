"""PDF fonts with a real ₹ glyph.

ReportLab's built-in Helvetica uses WinAnsi encoding, which has no U+20B9
INDIAN RUPEE SIGN -- every "₹" in a PDF printed as a box. DejaVu Sans (bundled
under ``assets/fonts/``, license in ``LICENSE_DEJAVU``) has it, plus the
minus sign and dashes. ReportLab embeds only the glyphs actually used, so a
report grows by tens of KB, not by the font files' size.

``FONT`` / ``FONT_BOLD`` / ``FONT_ITALIC`` are the names renderers pass to
ParagraphStyle / TableStyle / canvas.setFont. The family is registered so
``<b>``/``<i>`` markup inside a Paragraph picks the matching TTF. If the
files are missing (a broken deploy), it logs once and falls back to
Helvetica: exports keep working, only the ₹ glyph degrades.

Shared contract: this file is identical in both sub-projects'
``src/reports/fonts.py`` -- change both.
"""
from __future__ import annotations

import logging

from reportlab.lib.fonts import addMapping
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from config.settings import PROJECT_ROOT

logger = logging.getLogger(__name__)

FONT_DIR = PROJECT_ROOT / "assets" / "fonts"
FAMILY = "CitimartSans"
_FILES = {
    FAMILY: "DejaVuSans.ttf",
    f"{FAMILY}-Bold": "DejaVuSans-Bold.ttf",
    f"{FAMILY}-Oblique": "DejaVuSans-Oblique.ttf",
    f"{FAMILY}-BoldOblique": "DejaVuSans-BoldOblique.ttf",
}


def _register() -> bool:
    try:
        for name, filename in _FILES.items():
            if name not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / filename)))
        # (family, bold, italic) -> face, so <b>/<i> inside Paragraphs resolve.
        addMapping(FAMILY, 0, 0, FAMILY)
        addMapping(FAMILY, 1, 0, f"{FAMILY}-Bold")
        addMapping(FAMILY, 0, 1, f"{FAMILY}-Oblique")
        addMapping(FAMILY, 1, 1, f"{FAMILY}-BoldOblique")
        return True
    except Exception:  # noqa: BLE001 -- a missing font must never break an export
        logger.warning("PDF font files not found in %s; falling back to Helvetica (no ₹ glyph).", FONT_DIR, exc_info=True)
        return False


UNICODE_FONTS = _register()
FONT = FAMILY if UNICODE_FONTS else "Helvetica"
FONT_BOLD = f"{FAMILY}-Bold" if UNICODE_FONTS else "Helvetica-Bold"
FONT_ITALIC = f"{FAMILY}-Oblique" if UNICODE_FONTS else "Helvetica-Oblique"
