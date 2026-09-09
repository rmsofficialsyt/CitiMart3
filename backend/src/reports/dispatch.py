"""Format -> renderer lookup for api/routes_reports.py. Adding a 9th format
later is a one-line addition here plus a new renderers/<format>.py exposing
render(payload) -> bytes -- no other file needs to change."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from src.reports.models import ReportPayload
from src.reports.renderers import csv as csv_renderer
from src.reports.renderers import docx as docx_renderer
from src.reports.renderers import html as html_renderer
from src.reports.renderers import md as md_renderer
from src.reports.renderers import pdf as pdf_renderer
from src.reports.renderers import pptx as pptx_renderer
from src.reports.renderers import xlsx as xlsx_renderer
from src.reports.renderers import xml as xml_renderer


@dataclass(frozen=True)
class FormatSpec:
    render: Callable[[ReportPayload], bytes]
    content_type: str
    extension: str


RENDERERS: dict[str, FormatSpec] = {
    "pdf": FormatSpec(pdf_renderer.render, "application/pdf", "pdf"),
    "pptx": FormatSpec(pptx_renderer.render, "application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"),
    "docx": FormatSpec(docx_renderer.render, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
    "xlsx": FormatSpec(xlsx_renderer.render, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    "csv": FormatSpec(csv_renderer.render, "text/csv", "csv"),
    "md": FormatSpec(md_renderer.render, "text/markdown", "md"),
    "html": FormatSpec(html_renderer.render, "text/html", "html"),
    "xml": FormatSpec(xml_renderer.render, "application/xml", "xml"),
}
