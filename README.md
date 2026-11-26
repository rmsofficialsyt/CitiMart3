# CITIMART™ Daily Operations Portal

![CITIMART](https://img.shields.io/badge/CITIMART-Daily%20Operations-00D26A?style=for-the-badge&logo=shopify&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.2-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB%20Atlas-Multi--Tenant-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7.4%20Cluster-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-L7%20Gateway-009639?style=for-the-badge&logo=nginx&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Multi--Replica-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/Tests-240%2B%20Passing-success?style=for-the-badge&logo=pytest&logoColor=white)

> **Enterprise Real-Time Retail Floor Operations, Intraday KPI Pacing & Multi-Tenant Store Management Platform**  
> Serving CITIMART's three landmark department stores in Kolkata: **New Market (`NM`)**, **Hatibagan (`HB`)**, and **Chowringhee (`CHW`)**, alongside the **Executive Central Directorate (`ADMIN`)**.  
> Live Deployment: [citi-mart3.vercel.app](https://citi-mart3.vercel.app) · Release: `v1.0.0`  
> Governed by [docs/CONSTITUTION.md](./docs/CONSTITUTION.md), [docs/SPEC.md](./docs/SPEC.md), and [Production-grade-Security-checks-spec-check.md](../Production-grade-Security-checks-spec-check.md).

---

## 📑 Table of Contents
1. [What This Project Was & Why It Was Built](#-what-this-project-was--why-it-was-built)
2. [Personas & Store Footprint](#-personas--store-footprint)
3. [System Architecture & Data Flow](#-system-architecture--data-flow)
4. [Granular Functional Modules](#-granular-functional-modules)
   - [Live Intraday KPI Engine & Formula Glossary](#1-live-intraday-kpi-engine--formula-glossary)
   - [Intraday Timeslot Pacing (4 Trading Bands)](#2-intraday-timeslot-pacing-4-trading-bands)
   - [Manual Data Logger & Midnight Auto-Finalize](#3-manual-data-logger--midnight-auto-finalize)
   - [Sales Target Matrix & Rolling Adjustment Policy](#4-sales-target-matrix--rolling-adjustment-policy)
   - [External Context Signals (Weather, Holidays & Elections)](#5-external-context-signals-weather-holidays--elections)
   - [Store Governance, Executive Directives & Requisitions](#6-store-governance-executive-directives--requisitions)
   - [Stocks & Staff Management](#7-stocks--staff-management)
   - [Autonomous Multi-Agent AI Copilot](#8-autonomous-multi-agent-ai-copilot)
   - [Certified PDF & Excel Report Exporter](#9-certified-pdf--excel-report-exporter)
5. [Multi-Tenant Security & Isolation (SPEC-04)](#-multi-tenant-security--isolation-spec-04)
6. [High Performance & Concurrency Standards](#-high-performance--concurrency-standards)
7. [Repository Directory Layout](#-repository-directory-layout)
8. [Local Development Quickstart](#-local-development-quickstart)
9. [Production Docker Compose Stack](#-production-docker-compose-stack)
10. [Automated Verification & Quality Gates](#-automated-verification--quality-gates)
11. [Master Documentation Index](#-master-documentation-index)

---

## 📖 What This Project Was & Why It Was Built

### The Legacy Problem
Before this portal existed, CITIMART's floor operations across its three Kolkata department stores relied on **end-of-day Excel workbooks**, manual paper tally sheets, and fragmented phone/WhatsApp updates:
- Store managers logged bills, footfall, and buyer counts locally and compiled spreadsheets only **after** closing.
- Executive leadership had **zero intraday visibility**—by the time a store's shortfall was discovered, the trading day was already lost and no floor intervention (staff reallocation, promo push, or stock replenishment) was possible.
- Target adjustments, stockout escalations, and executive directives lived in disconnected chat threads with no audit trail, no read receipts, and no standardized KPI definitions.

### What It Became
**CITIMART™ Daily Operations Portal** replaced that entire manual workbook pipeline with a **zero-workbook-dependency, real-time operational operating system** backed by MongoDB Atlas and Redis:
- **Immediate Intraday Feedback:** Every bill, footfall, or NOB (Number of Buyers) entry logged on the retail floor immediately recomputes live KPIs and pacing curves against admin-allocated daily targets.
- **Contextualized Variance:** Rather than showing raw misses in isolation, the dashboard pairs live trading numbers with **Kolkata weather (Open-Meteo)**, **West Bengal public holidays**, **ECI election dates**, and **day-type classifications** so managers can explain *why* footfall or conversion dipped.
- **Strict Multi-Tenant Isolation:** Each store manager sees and mutates **only** their own store's data, while the central administrator monitors all three stores individually and via a blended **Overall Stores Summary**.
- **Sibling Product Boundary:** Historical multi-year POS slicing (357,000+ rows) and Prophet/XGBoost forecasting live in the decoupled sibling subproject (`Analytics and Forecasting/`). `Daily Operations` is strictly focused on **live trading-day execution, governance, and reporting**.

---

## 🏢 Personas & Store Footprint

There is **no self-signup**. The system operates with four fixed operational identities:

| Identifier | Account / Persona | Landmark / Scope | Primary Responsibilities |
|:---|:---|:---|:---|
| **`NM`** | `CITIMART - NEW MARKET` | Lindsay Street (Heritage Flagship) | Logs today's footfall, bills, NOB, and remarks (`10:30–23:59`); monitors live `NM` KPIs; raises stock requisitions; exports `NM` reports. |
| **`HB`** | `CITIMART - HATIBAGAN` | North Kolkata (Traditional Hub) | Logs today's floor metrics (`10:30–23:59`); tracks `HB` timeslot pacing; acknowledges executive directives; exports `HB` reports. |
| **`CHW`** | `CITIMART - CHOWRINGHEE` | Central Business District (Metro Anchor) | Logs today's floor metrics (`10:30–23:59`); monitors `CHW` conversion & ATV; manages requisitions; exports `CHW` reports. |
| **`ADMIN`** | `ADMINISTRATOR` | Executive Central Directorate | Sets monthly Sales Target grids; monitors all 3 stores + blended **Overall Stores Summary**; tunes KPI status bands; dispatches directives; can impersonate any store via **"View as Store Manager"** (`switched_from` JWT claim). Logs no floor data. |

---

## 🏗️ System Architecture & Data Flow

The platform uses a decoupled microservice topology designed for sub-10ms cached reads, burst-resilient store logins, and horizontal replica scaling:

```
                                  [ Store Managers / Central Executives ]
                                                    │
                                                    ▼
                                         [ Nginx L7 Gateway (:80) ]
                                    (Rate Limiting & Micro-Caching)
                                                    │
                           ┌────────────────────────┴────────────────────────┐
                           ▼                                                 ▼
             [ Frontend React 19 SPA (:5173) ]             [ FastAPI App Replicas (:8000) ]
             ├── Tailwind v4 Design System                 ├── Least-Connections Load Balanced
             ├── TanStack Query L1 Cache                   ├── HS256 Bearer JWT + HttpOnly Refresh
             ├── Recharts & Plotly Visualizations          ├── Argon2id Auth + Pydantic v2 Gate
             └── Route-Level Code Splitting                └── BullMQ Worker Offloading
                                                                             │
                                                    ┌────────────────────────┴────────────────────────┐
                                                    ▼                                                 ▼
                                     [ Redis 7.4 Cluster (:6379) ]                   [ MongoDB Atlas Cluster ]
                                     ├── Server-Revocable Sessions                    ├── Multi-Tenant Collections
                                     ├── Distributed Rate Limiters                    ├── Compound ESR Indexes
                                     ├── Write-Evicted Hot Caching                    ├── Audit & Directive Logs
                                     └── Midnight Settlement & PDF Jobs               └── Strict store_id Filtering
```

---

## 🌟 Granular Functional Modules

### 1. Live Intraday KPI Engine & Formula Glossary
All KPIs are recomputed dynamically from atomic MongoDB logs on read—no manual "recalculate" step is needed:

| KPI | Formula / Definition | Operational Meaning |
|:---|:---|:---|
| **Net Sales** | `Σ bill_net_amount` | Total realized revenue logged across bills for the day. |
| **Bill Quantity** | `Σ bill_qty` | Total item units sold across all logged bills. |
| **Footfall** | `Σ footfall_entries` | Total visitor walk-ins recorded on the floor. |
| **NOB (Number of Buyers)** | `Σ nob_entries` | Total distinct buyers (tracked independently of footfall and bills). |
| **ATV (Average Transaction Value)** | `Net Sales ÷ NOB` | Average spend per buyer. |
| **RPV (Revenue Per Visitor)** | `Net Sales ÷ Footfall` | Revenue yield per store walk-in. |
| **Basket Size** | `Bill Quantity ÷ NOB` | Average units purchased per buyer. |
| **Conversion %** | `(NOB ÷ Footfall) × 100` | Percentage of walk-ins who completed a purchase. |
| **Achievement %** | `(Net Sales ÷ Sales Target) × 100` | Progress toward the admin-allocated daily target. |
| **Remaining / Remaining %** | `Target − Net Sales` / `100 − Achievement %` | Monetary and percentage shortfall remaining to hit target. |

- **Null/Zero Denominator Safety:** Ratios without a denominator yet (e.g., no target set or zero footfall) are treated as unknown in the engine and displayed as `0` on the live dashboard.
- **Admin-Editable KPI Threshold Bands:** Status badges color-code health across all cards and six live gauges:
  - 🟢 **Emerald (`> 100%`):** Target Achieved / Surpassed.
  - ⚪ **Slate (`95% – 99.9%`):** On-Pace Baseline.
  - 🟡 **Amber (`85% – 94.9%`):** At-Risk Pacing Alert.
  - 🔴 **Rose (`< 85%`):** Critical Floor Deficit.

### 2. Intraday Timeslot Pacing (4 Trading Bands)
Trading activity is bucketed into 4 standardized intraday windows (`10:30 AM – 11:59 PM`) to visualize hourly rush curves and Footfall vs. NOB conversion:
1. **Slot 1 — Morning:** `10:30 AM – 01:59 PM` (Opening rush, early shoppers)
2. **Slot 2 — Afternoon:** `02:00 PM – 04:59 PM` (Mid-day & post-lunch traffic)
3. **Slot 3 — Evening:** `05:00 PM – 07:59 PM` (Prime retail rush, peak conversion)
4. **Slot 4 — Night:** `08:00 PM – 11:59 PM` (Closing purchases & billing consolidation)

### 3. Manual Data Logger & Midnight Auto-Finalize
- **Today-Only & Operating-Window Guard:** Store managers can only log entries for **today** between **10:30 AM and 11:59 PM** (backfilling past days through manual entry is blocked).
- **Atomic Inline Operations:** Log, edit, or delete individual Footfall, Bill Details (`bill_time`, `net_amount`, `bill_qty`, `nob`), and Remarks rows inline with immediate validation.
- **Update vs. Final Submission:** Both persist to MongoDB immediately; Final Submission adds a confirmation dialog for end-of-shift sign-off.
- **Midnight Auto-Finalize (`00:00 IST`):** A scheduled job/worker automatically snapshots every store's day at midnight even if a manager did not click Final Submission.
- **Staff Handbook:** Step-by-step floor guide in [MANUAL_DATA_ENTRY_GUIDE.md](./MANUAL_DATA_ENTRY_GUIDE.md).

### 4. Sales Target Matrix & Rolling Adjustment Policy
- **Admin Target Grid:** Administrators enter daily targets per store or bulk-upload via Excel (`≤ 10 MB`), supporting flexible `DD-MM-YYYY` date formats.
- **Rolling Target Adjustment Policy:** Automatically tracks target carry-forward/recovery rules (policy inception date `16.09.2026`, excluding prior dates).
- **Overall Stores Summary:** Admin view sums raw totals across `NM`, `HB`, and `CHW` and recomputes blended ratios accurately (never averaging averages).

### 5. External Context Signals (Weather, Holidays & Elections)
- Fetches **live Kolkata weather (Open-Meteo)**, **West Bengal public holidays**, **ECI election dates**, and **Day Type** (`Weekend` / `Mid-Week` / `Regular`).
- All external lookups degrade gracefully—if an upstream API is unreachable, the card displays `"unavailable"` without ever breaking dashboard rendering.

### 6. Store Governance, Executive Directives & Requisitions
- **Executive Directives:** Central Admin broadcasts urgent floor directives to specific stores or all stores with manager read-receipt timestamps.
- **Product Shortfall Requisitions:** Store managers escalate out-of-stock sizes and high-demand items with urgency (`Urgent`, `High`, `Normal`) and lifecycle tracking (`Pending`, `Approved`, `Dispatched`, `Fulfilled`).
- **Governance & Legal Suite:** Widescreen landing footer with About, Terms of Use, and Privacy Policy modals.

### 7. Stocks & Staff Management
- Integrated production modules for tracking store-level **stock levels** and **staff rosters/management** (`routes_stocks.py`, `routes_staff.py`).

### 8. Autonomous Multi-Agent AI Copilot
- **Trilingual Support:** Understands and responds in **English**, **Bengali (বাংলা)**, and **Hindi (हिंदी)**.
- **Multi-Agent Architecture:** Intent classification and routing across specialized agents (`coordinator.py`, `intent_router.py`, `forecasting_agent.py`) with session memory.
- **MongoDB-Grounded Anti-Hallucination:** Queries live MongoDB Atlas aggregates and Redis cache, validating every cited figure against the authoritative KPI engine before responding, with smart linkification and an integrated Business Calculator modal.

### 9. Certified PDF & Excel Report Exporter
- Exports per-store `.xlsx` spreadsheets and presentation-ready `.pdf` executive briefs for a single day, date range, or all recorded days.
- Short reports stream synchronously; multi-day PDFs with rasterized pacing charts offload to **BullMQ background workers** with tabular fallbacks to prevent HTTP timeouts.

---

## 🔒 Multi-Tenant Security & Isolation (SPEC-04)

1. **Strict Store Boundary Enforcement (BOLA/IDOR Prevention):**
   - Store-scoped endpoints enforce `require_store_access(store_id, current_user)`:
     ```python
     if current_user.role != "admin" and current_user.store_id != store_id:
         raise HTTPException(status_code=403, detail="Access denied to requested store telemetry")
     ```
   - MongoDB queries inject `{"store_id": store_id}` at the database layer, including requisitions and directives.
2. **Dual-Tier Token Authentication (AUTH-05):**
   - **Password Hashing:** Argon2id with concurrency capping (`PASSWORD_HASH_CONCURRENCY`) to protect process memory during login bursts.
   - **Access Token:** Short-lived `HS256` JWT (≤ 15 minutes) via `Authorization: Bearer <token>`.
   - **Refresh Token:** Rotating, server-revocable token stored in an `HttpOnly`, `SameSite=Strict` cookie and tracked in the Redis session registry. Users can list and revoke active sessions; `POST /api/auth/logout` revokes immediately across all replicas.
3. **Defense-in-Depth Rate Limiting & Audit Logging:**
   - **Nginx Edge Shield:** 200 req/s general ceiling, 100 req/s login ceiling.
   - **Redis Sliding-Window Limiter:** Exponential backoff after failed login attempts per IP and per account.
   - **Audit Trail:** Logins, logouts, admin-to-store switches, and target uploads are recorded in the audit log.
4. **Mandatory Security Headers:**
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`

---

## ⚡ High Performance & Concurrency Standards

- **Sub-10ms Hot Path:** `/api/daily/live` resolves in 1–10 ms via Redis L2 caching (`PERF-01`).
- **Write-Evicted Cache Invalidation:** Any mutation to bills, footfall, NOB, or targets immediately evicts corresponding Redis and local cache keys across all replicas.
- **MongoDB ESR Compound Indexing (Equality → Sort → Range):**
  ```python
  db.bills.create_index([("store_id", 1), ("date", 1), ("timestamp", -1)])
  db.footfall.create_index([("store_id", 1), ("date", 1), ("hour", 1)])
  db.targets.create_index([("store_id", 1), ("date", -1)])
  ```
- **Zero-Waterfall Initial Load:** The primary dashboard hydrates KPIs, timeslot curves, context signals, directives, and user state in one composite request.

---

## 📂 Repository Directory Layout

```
Daily Operations/
├── backend/                  # FastAPI ASGI service (:8000)
│   ├── api/                  # Modular REST routes (auth, daily, charts, chat, directives, requisitions, staff, stocks, targets)
│   ├── config/               # Environment validation, settings, logging & KPI thresholds
│   ├── db/                   # MongoDB Atlas lifecycle, Redis client & ESR indexes
│   ├── scripts/              # User seeding, password rotation & admin CLI tools
│   ├── src/                  # KPI engine, AI copilot, BullMQ worker, rate limiter, PDF/XLSX renderers
│   ├── tests/                # Pytest test suite (240+ unit, authz, redis, chat & mock tests)
│   ├── app.py                # FastAPI entrypoint, security middleware & static SPA fallback
│   └── requirements.txt      # Python dependencies
├── frontend/                 # React 19 + Vite 8 + TypeScript 6 SPA (:5173)
│   ├── src/
│   │   ├── api/              # Axios/fetch clients with automatic token refresh
│   │   ├── components/       # Hero cards, gauges, pacing charts, inline logger, AI copilot, calculator
│   │   ├── lib/              # Types, translations (EN/BN/HI) & formatting utilities
│   │   └── pages/            # Landing, Login, StoreDailyDashboard, OverallStoresSummary, History, Targets, Stocks, Staff
│   ├── package.json          # Node dependencies & npm scripts
│   └── vite.config.ts        # Vite bundling & dev proxy
├── nginx/                    # L7 API gateway & reverse proxy (:80, :443)
├── docs/                     # 26+ Architectural specs, LLD, PRD, security & testing guides
├── logs/                     # Structured rotated runtime logs (app, access, audit, worker)
├── docker-compose.yml        # Multi-replica Docker stack (Backend, Worker, Nginx, Redis)
├── MANUAL_DATA_ENTRY_GUIDE.md# Floor manager data entry handbook
└── README.md                 # This document
```

---

## 🚀 Local Development Quickstart

### Prerequisites
- **Python 3.11+**
- **Node.js 18+ & npm**
- **MongoDB Atlas** URI (or local MongoDB)
- **Redis 7.4+** (optional for single-process dev; required for multi-replica sessions & BullMQ)

### 1. Backend Setup
```powershell
cd "Daily Operations/backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1       # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env               # Populate MONGO_URI, JWT_SECRET, REDIS_URL, etc.
uvicorn app:app --reload --port 8000
```

### 2. Frontend Setup
```powershell
cd "Daily Operations/frontend"
npm install
npm run dev                        # Dev server on http://localhost:5173
```

---

## 🐳 Production Docker Compose Stack

Deploys 3 load-balanced FastAPI replicas, 2 BullMQ background workers, Redis 7.4, and Nginx:

```powershell
cd "Daily Operations"
docker compose --env-file ./backend/.env up --build -d --scale backend=3 --scale worker=2
docker compose ps
docker compose logs -f
```

---

## 🧪 Automated Verification & Quality Gates

Every change must pass CITIMART's 5 Quality Gates before committing:

```powershell
# Gate 1 & 2: Frontend Typecheck & Production Bundle
cd "Daily Operations/frontend"
npm run build                      # Runs tsc -b && vite build

# Gate 3: Linting
npm run lint                       # Runs oxlint

# Gate 4: Backend Automated Pytest Suite
cd "../backend"
python -m pytest -q                # 240+ tests across authz, daily, chat, and redis

# Gate 5: Security & Secret Audit
git status                         # Ensure zero .env or credential leaks
```

---

## 📚 Master Documentation Index

| Document | Focus Area & Description |
|:---|:---|
| [docs/CONSTITUTION.md](./docs/CONSTITUTION.md) | Platform core bylaws, architectural laws & non-negotiables |
| [docs/PRODUCT.md](./docs/PRODUCT.md) | Product overview, problem statement, personas & KPI glossary |
| [docs/SPEC.md](./docs/SPEC.md) | SPEC-01: Live Daily Operations Portal technical specification |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System topology, data flows & Low-Level Design (LLD) |
| [docs/SECURITY.md](./docs/SECURITY.md) | Security baseline, OWASP protections & BOLA/IDOR controls |
| [docs/AUTH.md](./docs/AUTH.md) | Authentication lifecycle, Argon2id, HS256 JWT & Redis sessions |
| [docs/AUTHENTICATION-SECURITY.md](./docs/AUTHENTICATION-SECURITY.md) | Session tracking & distributed brute-force mitigation |
| [docs/DATABASE.md](./docs/DATABASE.md) | MongoDB Atlas schemas, ESR compound indexes & migrations |
| [docs/APIS.md](./docs/APIS.md) | Complete REST API contract inventory & payload schemas |
| [docs/TESTING.md](./docs/TESTING.md) | Pytest fixtures, mongomock harness & coverage standards |
| [docs/CODE-REVIEW.md](./docs/CODE-REVIEW.md) | Multi-dimensional quality & anti-slop review checklist |
| [docs/GITHUB-WORKFLOW.md](./docs/GITHUB-WORKFLOW.md) | Git branching, conventional commits & 5-Gate push rules |
| [MANUAL_DATA_ENTRY_GUIDE.md](./MANUAL_DATA_ENTRY_GUIDE.md) | Floor manager handbook for logging bills, footfall & NOB |

---

*CITIMART™ Operations Engineering • Confidential & Proprietary*
