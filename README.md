# CITIMART™ Daily Operations Portal

![CITIMART Logo](https://img.shields.io/badge/CITIMART-Daily%20Operations-00D26A?style=for-the-badge&logo=shopify&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.0+-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB%20Atlas-Ready-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7.4%20Cluster-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-L7%20Gateway-009639?style=for-the-badge&logo=nginx&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Multi--Replica-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/Tests-240%2B%20Passing-success?style=for-the-badge&logo=pytest&logoColor=white)

> **Enterprise Real-Time Retail Floor Operations, Live Intraday KPI Pacing & Store Management Platform**  
> Serving CITIMART's three landmark department stores in Kolkata: **New Market (`NM`)**, **Hatibagan (`HB`)**, and **Chowringhee (`CHW`)**.  
> Governed by [docs/CONSTITUTION.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/CONSTITUTION.md), [docs/SPEC.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/SPEC.md), and [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md).

---

## 📑 Table of Contents
1. [Executive Overview](#-executive-overview)
2. [Department Store Footprint](#-department-store-footprint)
3. [System Architecture](#-system-architecture)
4. [Core Functional Modules](#-core-functional-modules)
   - [Live Intraday KPI Engine & Hero Cards](#1-live-intraday-kpi-engine--hero-cards)
   - [Intraday Timeslot Pacing](#2-intraday-timeslot-pacing)
   - [Manual Data Logger & Inline Row Operations](#3-manual-data-logger--inline-row-operations)
   - [Store Governance & Executive Directives](#4-store-governance--executive-directives)
   - [Product Shortfall Requisitions](#5-product-shortfall-requisitions)
   - [Autonomous Multi-Agent AI Copilot](#6-autonomous-multi-agent-ai-copilot)
   - [Certified Multi-Format Report Exporter](#7-certified-multi-format-report-exporter)
5. [Multi-Tenant Security & Isolation (SPEC-04)](#-multi-tenant-security--isolation-spec-04)
6. [High Performance & Concurrency Standards](#-high-performance--concurrency-standards)
7. [Repository Directory Layout](#-repository-directory-layout)
8. [Local Development Quickstart](#-local-development-quickstart)
9. [Production Docker Compose Stack](#-production-docker-compose-stack)
10. [Automated Verification & Quality Gates](#-automated-verification--quality-gates)
11. [Master Documentation Index](#-master-documentation-index)

---

## 🏢 Executive Overview

**CITIMART Daily Operations** is a production-grade operational platform that replaces legacy paper workbooks, uncoordinated messaging channels, and delayed end-of-day tallying with an instantaneous, synchronized operating system. 

Store managers on the retail floor record hourly bill counts, footfall, and buyer metrics directly into an inline data table. In parallel, executive leadership monitors real-time sales pacing, broadcasts urgent floor directives, manages out-of-stock merchandise escalations, and queries the operational copilot in natural language (English, Bengali, and Hindi).

### Landmark Department Store Footprint

| Store Identifier | Department Store Landmark | Primary Operating Hours | Historical Archetype | Target Profile |
|:---|:---|:---|:---|:---|
| **`NM`** | **New Market** (Lindsay Street) | 10:30 AM – 11:59 PM | Heritage Flagship | High Footfall / Premium Apparel |
| **`HB`** | **Hatibagan** (North Kolkata) | 10:30 AM – 11:59 PM | Traditional Hub | Volume Retail / Festive Spikes |
| **`CHW`** | **Chowringhee** (Central Business District) | 10:30 AM – 11:59 PM | Modern Metro Anchor | High ATV / Corporate Footprint |
| **`ADMIN`** | **Executive Central Directorate** | 24/7 Monitoring | Centralized Governance | Cross-Store Telemetry & Directives |

---

## 🏗️ System Architecture

The platform follows a decoupled, resilient micro-service topology optimized for sub-10ms operational queries, high-throughput store network bursts, and zero cross-store data leakage:

```
                                  [ Store Managers / Central Executives ]
                                                    │
                                                    ▼
                                         [ Nginx L7 Gateway (:80) ]
                                    (Rate Limiting & Micro-Caching)
                                                    │
                           ┌────────────────────────┴────────────────────────┐
                           ▼                                                 ▼
             [ Frontend React 18 SPA (:5173) ]             [ FastAPI App Replicas (:8000) ]
             ├── Tailwind v4 Design System                 ├── Least-Connections Load Balanced
             ├── TanStack Query L1 Cache                   ├── HS256 Bearer JWT + Cookie Auth
             └── Tabular Numerics & Charts                 └── Pydantic v2 Schema Gate
                                                                             │
                                                    ┌────────────────────────┴────────────────────────┐
                                                    ▼                                                 ▼
                                     [ Redis 7.4 Cluster (:6379) ]                   [ MongoDB Atlas Cluster ]
                                     ├── Server-Revocable Sessions                    ├── Multi-Tenant Collections
                                     ├── Distributed Rate Limiters                    ├── Compound ESR Indexes
                                     └── Write-Evicted Hot Caching                    └── Strict Tenant Filter Queries
```

---

## 🌟 Core Functional Modules

### 1. Live Intraday KPI Engine & Hero Cards
* **Formulaic Precision:** Computes live metrics from atomic hourly bills, footfall, and NOB logs:
  $$\text{Target Achievement \%} = \left(\frac{\text{Net Sales}}{\text{Allocated Target}}\right) \times 100$$
  $$\text{Deficit Gap} = \max(0, \text{Allocated Target} - \text{Net Sales})$$
  $$\text{ATV (Average Transaction Value)} = \frac{\text{Net Sales}}{\text{Total Bills}}$$
  $$\text{RPV (Revenue Per Visitor)} = \frac{\text{Net Sales}}{\text{Total Footfall}}$$
  $$\text{Conversion Rate} = \left(\frac{\text{NOB (Number of Buyers)}}{\text{Total Footfall}}\right) \times 100$$
  $$\text{Basket Size} = \frac{\text{Quantity Sold}}{\text{Total Bills}}$$
* **Threshold Badges:** Visual indicators dynamically color-code health:
  * 🟢 **Emerald ($\ge 100\%$):** Target Achieved / Surpassed.
  * ⚪ **Slate ($95\% - 99.9\%$):** On-Pace Baseline.
  * 🟡 **Amber ($85\% - 94.9\%$):** At-Risk Pacing Alert.
  * 🔴 **Rose ($< 85\%$):** Critical Floor Deficit.

### 2. Intraday Timeslot Pacing
Operational activity is bucketed into 4 normalized operational windows reflecting department store customer traffic curves:
1. **Slot 1 (Morning):** `10:30 AM – 01:59 PM` (Opening rush, early shoppers)
2. **Slot 2 (Afternoon):** `02:00 PM – 04:59 PM` (Mid-day shopping, post-lunch traffic)
3. **Slot 3 (Evening):** `05:00 PM – 07:59 PM` (Prime retail rush, peak conversion)
4. **Slot 4 (Night):** `08:00 PM – 11:59 PM` (Closing purchases, billing consolidation)

### 3. Manual Data Logger & Inline Row Operations
* **Strict Operating Window:** Entry timestamps are constrained between **10:30 AM and 11:59 PM**.
* **Atomic Inline Actions:** Floor staff can log, edit, or delete hourly entries inline with instant client rollback on validation failures.
* **Input Boundary Protection:** Enforces non-negative sales numbers, positive integer footfall, and valid department codes.
* **Automatic Midnight Settlement:** Nightly BullMQ background worker freezes uncommitted entries at `00:00`, generating immutable daily snapshots.
* **On-Floor Staff Guide:** Step-by-step instructions available in [MANUAL_DATA_ENTRY_GUIDE.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/MANUAL_DATA_ENTRY_GUIDE.md).

### 4. Store Governance & Executive Directives
* **Broadcast Channel:** Executive Operations Head (Raphael Sir) can dispatch urgent directives to individual stores or broadcast system-wide.
* **Read Receipts & Accountability:** Tracks read receipts with timestamp and manager identity for compliance audit trails.

### 5. Product Shortfall Requisitions
* **Merchandise Stockout Escalations:** Floor managers register out-of-stock sizes, stockouts, and high-demand product requests.
* **Priority Routing:** Categorized by urgency (`Urgent`, `High`, `Normal`) with real-time status tracking (`Pending`, `Approved`, `Dispatched`, `Fulfilled`).

### 6. Autonomous Multi-Agent AI Copilot
* **Trilingual Natural Language Understanding:** Communicates fluently in **English**, **Bengali (বাংলা)**, and **Hindi (हिंदी)**.
* **Domain Context Grounding:** Queries real-time MongoDB Atlas aggregates and Redis cache rather than speculative generation.
* **Anti-Hallucination Guardrails:** Validates computed numbers against authoritative KPI engine outputs before rendering.
* **Rolling Target Recovery:** Analyzes historical shortfall patterns and recommends intraday catch-up pacing targets.

### 7. Certified Multi-Format Report Exporter
* **One-Click Export:** Generates certified operational spreadsheets (`.xlsx`) and presentation-ready executive briefs (`.pdf`).
* **Parallel Headless Rasterization:** Renders pacing charts server-side with graceful tabular fallbacks to prevent timeouts.

---

## 🔒 Multi-Tenant Security & Isolation (SPEC-04)

1. **Strict Store Boundary Enforcement (BOLA/IDOR Prevention):**
   - Store managers are authenticated to exactly one store identity (`NM`, `HB`, or `CHW`).
   - Every store-scoped endpoint enforces `require_store_access(store_id, current_user)`:
     ```python
     if current_user.role != "admin" and current_user.store_id != store_id:
         raise HTTPException(status_code=403, detail="Access denied to requested store telemetry")
     ```
   - Queries strictly inject `{"store_id": store_id}` at the MongoDB collection layer.
2. **Dual-Tier Token Authentication (AUTH-05):**
   - **Access Token:** Short-lived `HS256` JWT ($\le 15$ minutes) passed via `Authorization: Bearer <token>`.
   - **Refresh Token:** Long-lived, server-revocable rotating token stored in a secure `HttpOnly`, `SameSite=Strict` cookie and indexed in the Redis session registry.
   - **Instant Server-Side Revocation:** `POST /api/auth/logout` invalidates the active Redis session key across all load-balanced replicas.
3. **Defense-in-Depth Rate Limiting:**
   - **Nginx Edge Shield:** 200 req/s general ceiling, 100 req/s login ceiling.
   - **Redis Sliding-Window Limiter:** 5 failed attempts per IP / account triggers automatic exponential backoff.
4. **Mandatory Security Headers:**
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`

---

## ⚡ High Performance & Concurrency Standards

* **Sub-10ms Hot Path:** Critical `/api/daily/live` dashboard responses resolve in 1–10 ms via Redis L2 caching.
* **Write-Evicted Cache Invalidation (PERF-01):** Any write to bills, footfall, or targets immediately purges the corresponding Redis keys across all backend replicas.
* **MongoDB ESR Compound Indexing:**
  ```python
  # Equality -> Sort -> Range
  db.bills.create_index([("store_id", 1), ("date", 1), ("timestamp", -1)])
  db.footfall.create_index([("store_id", 1), ("date", 1), ("hour", 1)])
  db.targets.create_index([("store_id", 1), ("date", -1)])
  ```
* **Zero Waterfall Client Loads:** The initial dashboard view hydrates all required KPIs, timeslot curves, directives, and user state in a single composite HTTP payload.

---

## 📂 Repository Directory Layout

```
Daily Operations/
├── backend/                  # FastAPI ASGI service (:8000)
│   ├── api/                  # Modular REST route handlers (auth, daily, directives, requisitions, chat)
│   ├── config/               # Settings, environment validation & KPI thresholds
│   ├── db/                   # MongoDB Atlas connection lifecycle & ESR indexes
│   ├── scripts/              # User seeding, password rotation, and admin CLI tools
│   ├── src/                  # KPI calculation engine, AI copilot, PDF/XLSX exporters
│   ├── tests/                # Pytest test suite (240+ unit, auth, redis, and mock tests)
│   ├── app.py                # FastAPI entrypoint & middleware configuration
│   └── requirements.txt      # Python dependencies
├── frontend/                 # React 18 + Vite + TypeScript SPA (:5173)
│   ├── src/
│   │   ├── components/       # Hero cards, pacing charts, inline logger, dialogs, drawers
│   │   ├── context/          # Auth context, user identity & store state
│   │   ├── services/         # Axios API client with automatic token injection
│   │   └── types/            # TypeScript interfaces & API response schemas
│   ├── package.json          # Node dependencies & npm scripts
│   ├── tailwind.config.ts    # Tailwind CSS v4 design tokens
│   └── vite.config.ts        # Vite bundling & development proxy rules
├── nginx/                    # L7 API gateway & reverse proxy (:80, :443)
│   ├── nginx.conf            # Upstream load balancing, rate limiting & micro-caching
│   └── README.md             # Nginx configuration & operation guide
├── docs/                     # 26 Architectural specifications, security checklists & PRDs
│   ├── reference-artifacts/  # Visual layouts and reference specs
│   └── README.md             # Master documentation catalog
├── logs/                     # Structured rotating runtime logs (app, access, audit, worker)
│   └── README.md             # Logging architecture & retention guide
├── docker-compose.yml        # Multi-replica Docker stack (Backend, Worker, Nginx, Redis)
├── MANUAL_DATA_ENTRY_GUIDE.md# Staff operational data entry handbook
└── README.md                 # Master operational README (this document)
```

---

## 🚀 Local Development Quickstart

### Prerequisites
* **Python 3.11+**
* **Node.js 18+ & npm**
* **MongoDB Atlas** connection string
* **Redis 7.4+** (local or via Docker)

### 1. Backend Setup
```powershell
# Navigate to backend directory
cd "Daily Operations/backend"

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1    # On Linux/macOS: source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env            # Ensure MONGO_URI, JWT_SECRET, and REDIS_URL are populated

# Launch local development server
uvicorn app:app --reload --port 8000
```

### 2. Frontend Setup
```powershell
# In a new terminal, navigate to frontend directory
cd "Daily Operations/frontend"

# Install node packages
npm install

# Start Vite development server
npm run dev
# Application available at http://localhost:5173
```

---

## 🐳 Production Docker Compose Stack

The production topology deploys 3 load-balanced backend replicas, 2 dedicated BullMQ background workers, a Redis 7.4 cluster, and an Nginx reverse proxy:

```powershell
# Navigate to Daily Operations root
cd "Daily Operations"

# Launch multi-replica stack with automatic backend scaling
docker compose --env-file ./backend/.env up --build -d --scale backend=3 --scale worker=2

# Inspect running container cluster
docker compose ps

# Follow centralized live logs
docker compose logs -f
```

---

## 🧪 Automated Verification & Quality Gates

Every code change must satisfy CITIMART's 5 Quality Gates before committing:

```powershell
# Gate 1 & 2: Frontend Typecheck and Bundle Build
cd "Daily Operations/frontend"
npm run build                    # Executes `tsc -b` and `vite build`

# Gate 3: Linting & Code Hygiene
npm run lint

# Gate 4: Backend Automated Pytest Suite
cd "../backend"
pytest tests/ -v                 # Runs 240+ tests across auth, daily, chat, and redis

# Gate 5: Security & Secret Audit
git status                       # Verify zero credential or .env leaks
```

---

## 📚 Master Documentation Index

Comprehensive technical documentation is maintained in the [`docs/`](./docs) directory:

| Specification Document | Focus Area & Description |
|:---|:---|
| [docs/CONSTITUTION.md](./docs/CONSTITUTION.md) | Platform core bylaws, architecture rules, and non-negotiables |
| [docs/SPEC.md](./docs/SPEC.md) | SPEC-01: Live Daily Operations Portal technical specifications |
| [docs/SECURITY.md](./docs/SECURITY.md) | Security baseline, OWASP protections, and encryption standards |
| [docs/AUTH.md](./docs/AUTH.md) | Authentication lifecycle, JWT HS256, and cookie refresh flows |
| [docs/AUTHENTICATION-SECURITY.md](./docs/AUTHENTICATION-SECURITY.md) | Deep dive into session tracking and brute-force mitigation |
| [docs/DATABASE.md](./docs/DATABASE.md) | MongoDB Atlas schema definitions, ESR indexes, and migration plans |
| [docs/APIS.md](./docs/APIS.md) | Complete REST API contract catalog and payload schemas |
| [docs/TESTING.md](./docs/TESTING.md) | Test engineering standards, fixtures, and coverage criteria |
| [docs/CODE-REVIEW.md](./docs/CODE-REVIEW.md) | Multi-dimensional quality and anti-slop review checklist |
| [docs/GITHUB-WORKFLOW.md](./docs/GITHUB-WORKFLOW.md) | 7-phase Git lifecycle, conventional commits, and push gates |
| [MANUAL_DATA_ENTRY_GUIDE.md](./MANUAL_DATA_ENTRY_GUIDE.md) | Layman's handbook for floor managers logging bills and footfall |

---

*CITIMART™ Operations Engineering • Confidential & Proprietary*
