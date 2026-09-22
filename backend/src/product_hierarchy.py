"""Product hierarchy extractor and manager for CITIMART Requisitions.

Parses 'Unique Division,Section, Department.xlsx' and merges dynamic custom
categories registered by managers/admins in MongoDB.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List

import openpyxl
from pymongo.database import Database

from config.settings import PROJECT_ROOT
from db.models import CUSTOM_CATEGORIES

logger = logging.getLogger(__name__)

# Search paths for the Excel file
_EXCEL_CANDIDATE_PATHS = [
    PROJECT_ROOT.parent.parent / "Unique Division,Section, Department.xlsx",
    PROJECT_ROOT.parent / "Unique Division,Section, Department.xlsx",
    PROJECT_ROOT / "Unique Division,Section, Department.xlsx",
    Path.cwd() / "Unique Division,Section, Department.xlsx",
    Path.cwd().parent / "Unique Division,Section, Department.xlsx",
    Path.cwd().parent.parent / "Unique Division,Section, Department.xlsx",
]

_CACHED_HIERARCHY: Dict[str, Dict[str, List[str]]] | None = None
_CACHED_RAW_LINES: List[Dict[str, str]] | None = None


def _clean_str(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()


def load_base_hierarchy() -> tuple[Dict[str, Dict[str, List[str]]], List[Dict[str, str]]]:
    """Parse Unique Division,Section, Department.xlsx into:
    1. Nested dictionary tree: { Division: { Section: [Department, ...] } }
    2. List of ordered row dicts: [{ division, section, department, label, raw }, ...]
    """
    global _CACHED_HIERARCHY, _CACHED_RAW_LINES
    if _CACHED_HIERARCHY is not None and _CACHED_RAW_LINES is not None:
        return _CACHED_HIERARCHY, _CACHED_RAW_LINES

    tree: Dict[str, Dict[str, List[str]]] = {}
    raw_lines: List[Dict[str, str]] = []
    excel_path: Path | None = None

    for candidate in _EXCEL_CANDIDATE_PATHS:
        if candidate.is_file():
            excel_path = candidate
            break

    if not excel_path:
        logger.warning("Unique Division,Section, Department.xlsx not found at candidate paths: %s", _EXCEL_CANDIDATE_PATHS)
        _CACHED_HIERARCHY = tree
        _CACHED_RAW_LINES = raw_lines
        return tree, raw_lines

    try:
        wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
        ws = wb.active
        if ws is None:
            return tree, raw_lines

        # Rows start at 1. Row 1 has headers: DIVISION, SECTION, DEPARTMENT
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row or len(row) < 3:
                continue
            div = _clean_str(row[0])
            sec = _clean_str(row[1])
            dep = _clean_str(row[2])

            if not div or not sec or not dep:
                continue

            if div not in tree:
                tree[div] = {}
            if sec not in tree[div]:
                tree[div][sec] = []
            if dep not in tree[div][sec]:
                tree[div][sec].append(dep)

            raw_lines.append({
                "division": div,
                "section": sec,
                "department": dep,
                "label": f"{div} ➔ {sec} ➔ {dep}",
                "raw": f"{div} -> {sec} -> {dep}",
            })

        wb.close()
        logger.info("Successfully loaded %d lines (%d divisions) from %s", len(raw_lines), len(tree), excel_path.name)
    except Exception as exc:
        logger.error("Error reading %s: %s", excel_path, exc)

    _CACHED_HIERARCHY = tree
    _CACHED_RAW_LINES = raw_lines
    return tree, raw_lines


def get_merged_hierarchy(db: Database | None = None) -> Dict[str, Any]:
    """Returns separate unique lists of divisions, sections, departments,
    the complete list of lines (713+), alongside the nested hierarchy tree and metadata.
    """
    base_tree, base_lines = load_base_hierarchy()
    
    # Deep copy base tree keys/values so we can merge custom additions without mutating base
    merged: Dict[str, Dict[str, List[str]]] = {}
    for div, secs in base_tree.items():
        merged[div] = {}
        for sec, deps in secs.items():
            merged[div][sec] = list(deps)

    custom_lines: List[Dict[str, str]] = []
    if db is not None:
        try:
            custom_docs = db[CUSTOM_CATEGORIES].find({})
            for doc in custom_docs:
                div = _clean_str(doc.get("division"))
                sec = _clean_str(doc.get("section"))
                dep = _clean_str(doc.get("department"))

                if not div:
                    continue
                if div not in merged:
                    merged[div] = {}

                if sec:
                    if sec not in merged[div]:
                        merged[div][sec] = []
                    if dep and dep not in merged[div][sec]:
                        merged[div][sec].append(dep)

                if div and sec and dep:
                    custom_lines.append({
                        "division": div,
                        "section": sec,
                        "department": dep,
                        "label": f"{div} ➔ {sec} ➔ {dep}",
                        "raw": f"{div} -> {sec} -> {dep}",
                    })
        except Exception as exc:
            logger.warning("Could not merge custom categories from DB: %s", exc)

    all_divisions = sorted(merged.keys())
    all_sections_set = set()
    all_departments_set = set()
    dept_meta: Dict[str, Dict[str, str]] = {}
    sec_meta: Dict[str, List[str]] = {}

    for div, secs in merged.items():
        for sec, deps in secs.items():
            if sec:
                all_sections_set.add(sec)
                sec_meta.setdefault(sec, [])
                if div not in sec_meta[sec]:
                    sec_meta[sec].append(div)
            for dep in deps:
                if dep:
                    all_departments_set.add(dep)
                    if dep not in dept_meta:
                        dept_meta[dep] = {"division": div, "section": sec}

    all_sections = sorted(all_sections_set)
    all_departments = sorted(all_departments_set)

    # Combine base lines and unique custom lines
    seen_combinations = {f"{l['division']}|{l['section']}|{l['department']}" for l in base_lines}
    all_lines = list(base_lines)
    for cl in custom_lines:
        key = f"{cl['division']}|{cl['section']}|{cl['department']}"
        if key not in seen_combinations:
            seen_combinations.add(key)
            all_lines.append(cl)

    return {
        "tree": merged,
        "divisions": all_divisions,
        "sections": all_sections,
        "departments": all_departments,
        "lines": all_lines,
        "dept_meta": dept_meta,
        "sec_meta": sec_meta,
        "total_divisions": len(all_divisions),
        "total_sections": len(all_sections),
        "total_departments": len(all_departments),
        "total_lines": len(all_lines),
    }


def register_custom_category(db: Database, division: str, section: str, department: str) -> None:
    """Store custom category additions in the database so they appear in future lookups."""
    div = _clean_str(division)
    sec = _clean_str(section)
    dep = _clean_str(department)

    if not div:
        return

    base, _ = load_base_hierarchy()
    # If it's already in base hierarchy, no need to store in DB
    if div in base and sec in base[div] and dep in base[div][sec]:
        return

    db[CUSTOM_CATEGORIES].update_one(
        {"division": div, "section": sec, "department": dep},
        {"$set": {"division": div, "section": sec, "department": dep}},
        upsert=True,
    )
