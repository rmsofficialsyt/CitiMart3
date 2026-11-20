# CITIMART Daily Operations System — Technical Specification (SPEC)

![Specification](https://img.shields.io/badge/CITIMART-Technical%20Specification-00D26A?style=for-the-badge&logo=probot&logoColor=white)
![Version](https://img.shields.io/badge/Spec%20Version-3.2.0-blue?style=for-the-badge)
![Compliance](https://img.shields.io/badge/Compliance-SPEC--01%20Certified-success?style=for-the-badge)

> **Exhaustive System Specification for Real-Time Retail Floor Operations & Management**  
> Serving CITIMART's three flagship department stores in Kolkata: **New Market (`NM`)**, **Hatibagan (`HB`)**, and **Chowringhee (`CHW`)**.  
> Governed by [docs/CONSTITUTION.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/CONSTITUTION.md) and [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md).

---

## 📑 Specification Index
1. [Platform Scope & System Archetype](#1-platform-scope--system-archetype)
2. [Operating Windows & Timeslot Mapping](#2-operating-windows--timeslot-mapping)
3. [Intraday Retail Metric Engine](#3-intraday-retail-metric-engine)
4. [Unified Manual Logger Specification](#4-unified-manual-logger-specification)
5. [Autonomous Multilingual AI Copilot Specification](#5-autonomous-multilingual-ai-copilot-specification)
6. [Store Governance & Requisitions Engine](#6-store-governance--requisitions-engine)
7. [Certified Export Engine](#7-certified-export-engine)

---

## 1. Platform Scope & System Archetype

Unlike the Historical Analytics module, Daily Operations is a **transactional, write-heavy, multi-tenant RBAC platform**:
* **Real-time Database Persistence:** All operational records read from and write to **MongoDB Atlas** and **Redis**.
* **Zero Workbook Rule:** The system operates without `DATASET.xlsx` dependencies.
* **Strict Tenant Boundary:** Enforces server-side `require_store_access(store_code, current_user)` preventing cross-store BOLA/IDOR vulnerabilities.

---

## 2. Operating Windows & Timeslot Mapping

Department store operating hours in Kolkata strictly span **10:30 AM to 11:59 PM**:

```
10:30 AM ─────────────────────────────────────────────────────────────► 11:59 PM
  │                      │                      │                     │
  ▼                      ▼                      ▼                     ▼
┌──────────────────────┬──────────────────────┬─────────────────────┬─────────────────────┐
│ Slot 1 (Morning)     │ Slot 2 (Afternoon)   │ Slot 3 (Evening)    │ Slot 4 (Night)      │
│ 10:30 AM – 01:59 PM  │ 02:00 PM – 04:59 PM  │ 05:00 PM – 07:59 PM │ 08:00 PM – 11:59 PM │
├──────────────────────┼──────────────────────┼─────────────────────┼─────────────────────┤
│ • Setup & Prep       │ • Mid-Day Shopping   │ • Prime Retail Peak │ • Night Closing Rush│
│ • Early Walk-ins     │ • Fitting Rooms      │ • High Conversion   │ • EOD Reconciliation│
└──────────────────────┴──────────────────────┴─────────────────────┴─────────────────────┘
```

---

## 3. Intraday Retail Metric Engine

The backend calculations engine computes live retail ratios:

| Operational Metric | Mathematical Formulation | Unit | Threshold Baseline |
|:---|:---|:---|:---|
| **Target Achievement %** | $(\text{Net Sales} / \text{Allocated Target}) \times 100$ | `%` | $\ge 100\%$ (Emerald) |
| **Deficit Gap** | $\max(0, \text{Allocated Target} - \text{Net Sales})$ | `₹` (INR) | `₹ 0` at target |
| **Average Transaction Value (ATV)** | $\text{Net Sales} / \text{NOB}$ | `₹` / Buyer | Store specific |
| **Revenue Per Visitor (RPV)** | $\text{Net Sales} / \text{Footfall}$ | `₹` / Visitor | Store specific |
| **Basket Size (UPT)** | $\text{Quantity Sold} / \text{NOB}$ | Units / Buyer | $\ge 2.5$ units |
| **Conversion Rate** | $(\text{NOB} / \text{Footfall}) \times 100$ | `%` | $\ge 12\%$ |

---

## 4. Unified Manual Logger Specification

* **Atomic Row Management:** Managers log bills, footfall, and NOB in a single consolidated row per timestamp.
* **Inline Mutability:** Provides atomic inline edit and delete capabilities.
* **Midnight Settlement:** Automatic background cron job finalizes uncommitted shift logs at `00:00:00`.
* **Floor Handbook:** Full operational guidance defined in [MANUAL_DATA_ENTRY_GUIDE.md](../../MANUAL_DATA_ENTRY_GUIDE.md).

---

## 5. Autonomous Multilingual AI Copilot Specification

* **Natural Language Processor:** Converses natively in **English**, **Bengali (বাংলা)**, and **Hindi (हिंदी)**.
* **Contextual Grounding:** Automatically queries live MongoDB aggregates and Redis hot cache for current day metrics.
* **Anti-Hallucination Gate (`anti_hallucination.py`):** Intercepts and mathematically verifies any numeric claims before delivering them to the UI.

---

## 6. Store Governance & Requisitions Engine

* **Executive Directives:** High-priority operational broadcast channel with timestamped manager read receipts.
* **Product Shortfall Requisitions:** Stockout logging workflow with 4 transition states: `Pending Approval`, `Approved`, `Dispatched`, and `Fulfilled`.

---

## 7. Certified Export Engine

* **Spreadsheet Export (`.xlsx`):** Multi-sheet operational summaries generated with OpenPyXL.
* **Executive Briefs (`.pdf`):** Certified vector documents with rasterized pacing charts compiled via ReportLab.
