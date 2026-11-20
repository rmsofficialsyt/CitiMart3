# CITIMART Daily Operations — Product Requirements Document (PRD)

![PRD](https://img.shields.io/badge/CITIMART-Product%20Requirements-00D26A?style=for-the-badge&logo=readme&logoColor=white)
![Status](https://img.shields.io/badge/Status-Approved%20for%20Production-success?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-3.2.0-blue?style=for-the-badge)

> **Official Product Requirements Document for CITIMART Live Floor Operations**  
> Covers retail operational objectives, user personas, functional specifications, and non-functional requirements for **New Market (`NM`)**, **Hatibagan (`HB`)**, and **Chowringhee (`CHW`)**.

---

## 📑 Requirements Directory
1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [Product Goals & Success Metrics](#2-product-goals--success-metrics)
3. [User Personas & Core Journeys](#3-user-personas--core-journeys)
4. [Functional Requirements Catalog](#4-functional-requirements-catalog)
5. [Non-Functional & Operational Requirements](#5-non-functional--operational-requirements)

---

## 1. Executive Summary & Problem Statement

Historically, CITIMART store managers recorded daily footfall and sales receipts in paper workbooks or unstructured messaging channels. This created severe operational inefficiencies:
* Executive leadership possessed zero real-time visibility into intraday sales pace.
* Floor managers lacked immediate awareness of deficit gaps, missing evening catch-up opportunities.
* Merchandise shortages were communicated casually, leading to unfulfilled high-demand inventory.
* Footfall-to-buyer conversion ratios could not be calculated until hours after closing.

**Solution:** The CITIMART Daily Operations Platform provides an integrated, real-time operating system delivering sub-second KPI updates, unified row logging, executive broadcasts, and trilingual AI copilot assistance.

---

## 2. Product Goals & Success Metrics

* **Intraday Visibility:** $100\%$ of active store registers submit hourly figures within 15 minutes of observation.
* **Hot-Path Speed:** Sub-10ms response latency on live dashboard endpoints via Redis L2 caching.
* **Zero Cross-Store IDOR:** $100\%$ enforcement of store isolation at API and database layers.
* **Operational Continuity:** Automated midnight settlement ensures zero uncommitted or lost shift logs.

---

## 3. User Personas & Core Journeys

### Persona 1: Floor Store Manager (e.g., New Market Manager)
* **Goal:** Monitor shift sales, record hourly footfall, close daily deficit gaps, and request restocks.
* **Journey:** Logs in at 10:30 AM $\to$ Records hourly receipts $\to$ Inspects live pacing chart $\to$ Queries AI Copilot in Bengali for evening surge strategy $\to$ Submits product requisition $\to$ Finalizes shift at 10:30 PM.

### Persona 2: Executive Directorate (Raphael Sir)
* **Goal:** Monitor all 3 stores simultaneously, dispatch urgent floor directives, and allocate monthly sales targets.
* **Journey:** Opens executive dashboard $\to$ Compares NM, HB, and CHW pacing $\to$ Broadcasts urgent directive to a lagging store $\to$ Uploads next month's sales targets via bulk Excel upload.

---

## 4. Functional Requirements Catalog

| Requirement ID | Module | Specification Summary |
|:---|:---|:---|
| **FR-01: Identity & Role Selection** | Authentication | 4-card role selector landing screen leading to credential validation and JWT issuance. |
| **FR-02: Live Daily Dashboard** | Telemetry | Hero card displaying Net Sales, Target, Gap, Achievement %, ATV, RPV, and 4-slot pacing chart. |
| **FR-03: Unified Manual Logger** | Data Entry | Consolidated table for inline logging, editing, and deletion of hourly bills and footfall. |
| **FR-04: Executive Directives** | Governance | Admin broadcast modal for dispatching high-priority operational instructions with read receipts. |
| **FR-05: Product Requisitions** | Inventory | Stockout size request workflow with priority flags (`Urgent`, `High`, `Normal`). |
| **FR-06: Trilingual AI Copilot** | Intelligence | Natural language retail assistant answering queries in English, Bengali, and Hindi. |
| **FR-07: Certified Multi-Export** | Reporting | One-click certified Excel (`.xlsx`) and PDF (`.pdf`) report generation. |

---

## 5. Non-Functional & Operational Requirements

* **Performance:** Sub-10ms response times for cached dashboard reads; sub-50ms for uncached writes.
* **Availability:** $99.9\%$ operational uptime during store hours (10:30 AM to 11:59 PM).
* **Security:** Strict compliance with [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md) and OWASP Top 10 standards.
