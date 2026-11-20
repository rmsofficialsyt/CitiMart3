# CITIMART Daily Operations — Backend Service

![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7.4-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Pytest](https://img.shields.io/badge/Pytest-240%2B%20Passing-success?style=for-the-badge&logo=pytest&logoColor=white)

> **High-Performance Asynchronous REST Engine & Multi-Agent Telemetry Core**  
> Powers real-time store calculations, automated midnight settlements, executive broadcasts, stockout escalations, and trilingual AI copilot intelligence for CITIMART's landmark stores: **New Market (`NM`)**, **Hatibagan (`HB`)**, and **Chowringhee (`CHW`)**.

---

## 📑 Table of Contents
1. [Service Architecture](#-service-architecture)
2. [Technology Stack](#-technology-stack)
3. [REST API Route Directory](#-rest-api-route-directory)
4. [Redis Caching & Session Architecture](#-redis-caching--session-architecture)
5. [Database Architecture & ESR Indexes](#-database-architecture--esr-indexes)
6. [Autonomous AI Copilot Engine](#-autonomous-ai-copilot-engine)
7. [Background Workers & Midnight Finalization](#-background-workers--midnight-finalization)
8. [Structured Logging & Correlation Tracing](#-structured-logging--correlation-tracing)
9. [Environment Configuration (`.env`)](#-environment-configuration-env)
10. [Automated Testing & Pytest Suite](#-automated-testing--pytest-suite)

---

## 🏗️ Service Architecture

The backend is built with FastAPI, utilizing asynchronous non-blocking event loops, connection pooling for MongoDB Atlas and Redis, and strict Pydantic v2 data boundary validation:

```
[ Incoming HTTP Client / Nginx L7 Gateway ]
                     │
                     ▼
             [ FastAPI ASGI App ]
                     │
      ┌──────────────┴──────────────┐
      ▼                             ▼
[ Security & Auth Middleware ]  [ Correlation ID Logger ]
      │
      ▼
[ Router Layer (api/routes_*.py) ]
      ├── /api/auth          (PyJWT, Cookie, Redis Session Registry)
      ├── /api/daily         (Intraday Calculations, Row Logger)
      ├── /api/targets       (Excel Target Parser & Allocator)
      ├── /api/directives    (Executive Broadcasts & Read Receipts)
      ├── /api/requisitions  (Merchandise Shortfall Escalations)
      └── /api/chat          (Multi-Agent Autonomous Copilot)
      │
      ▼
[ Business Domain Logic (src/) ]
      ├── KPI Engine (`kpi_engine.py`, `calculations.py`)
      ├── Report Exporter (`report_generator.py` for XLSX/PDF)
      └── AI Orchestrator (`agent_orchestrator.py`, `anti_hallucination.py`)
      │
      ▼
[ Data Persistence Layer ]
      ├── Redis 7.4 (L2 Hot Cache, Rate Limiters, Revocation Registry)
      └── MongoDB Atlas (Bills, Footfall, NOB, Targets, Directives, Requisitions)
```

---

## 🛠️ Technology Stack

| Layer | Component | Specification |
|:---|:---|:---|
| **Framework** | FastAPI | Async ASGI with starlette routing & OpenAPI 3.1 docs |
| **Runtime** | Python 3.11+ | Native type hints, asyncio event loop |
| **Validation** | Pydantic v2 | Model parsing, constraints, schema enforcement |
| **Database** | MongoDB Atlas / PyMongo | Connection pooled client with compound ESR indexes |
| **In-Memory Cache** | Redis 7.4 | L2 write-evicted caching & distributed sliding-window limiters |
| **Authentication** | PyJWT & Passlib | `HS256` JWTs + rotating `HttpOnly` cookies + Argon2id/PBKDF2 |
| **Background Jobs** | BullMQ & Cron | Midnight settlement & async export generation |
| **Testing** | Pytest & mongomock | 240+ unit, integration, and security tests |

---

## 📡 REST API Route Directory

### 1. Authentication (`api/routes_auth.py`)
* `POST /api/auth/login`: Authenticates store credentials, generates `HS256` Bearer JWT, registers session in Redis, and sets rotating `HttpOnly` refresh cookie.
* `POST /api/auth/refresh`: Validates refresh token cookie against Redis session store and issues a refreshed access token.
* `POST /api/auth/logout`: Revokes active session from Redis and clears the client cookie.
* `GET /api/auth/me`: Returns current authenticated user context, assigned store, and role.

### 2. Daily Operations & Logging (`api/routes_daily.py`)
* `GET /api/daily/stores/{store_id}/summary`: Primary single-fetch dashboard telemetry (Net sales, target, deficit gap, achievement %, ATV, RPV, conversion rate).
* `POST /api/daily/stores/{store_id}/entries`: Records atomic hourly billing and footfall entry with Pydantic validation (10:30 AM – 11:59 PM).
* `PUT /api/daily/stores/{store_id}/entries/{entry_id}`: Inline editing of an existing row.
* `DELETE /api/daily/stores/{store_id}/entries/{entry_id}`: Inline deletion of an erroneously logged row.
* `GET /api/daily/stores/{store_id}/history`: Paginated operational archive across prior dates.
* `POST /api/daily/stores/{store_id}/finalize`: Manually finalizes and seals the operating day.

### 3. Sales Targets (`api/routes_targets.py`)
* `GET /api/targets/{store_id}`: Fetches monthly/weekly target allocation for a given store.
* `POST /api/targets/upload`: Bulk Excel (`.xlsx`) target upload parsed and stored into MongoDB.
* `PUT /api/targets/{store_id}`: Adjusts daily target with manager justification.

### 4. Executive Directives (`api/routes_directives.py`)
* `GET /api/directives`: Retrieves active operational directives filtered by store visibility.
* `POST /api/directives`: Executive broadcast from Raphael Sir with priority level (`Urgent`, `High`, `Normal`).
* `POST /api/directives/{directive_id}/ack`: Records store manager read receipt with timestamp.

### 5. Product Requisitions (`api/routes_requisitions.py`)
* `GET /api/requisitions`: Lists store shortfall tickets with status filtering.
* `POST /api/requisitions`: Creates an out-of-stock merchandise escalation.
* `PATCH /api/requisitions/{req_id}`: Updates requisition status (`Approved`, `Dispatched`, `Fulfilled`).

### 6. AI Copilot (`api/routes_chat.py`)
* `POST /api/chat`: Autonomous conversational copilot endpoint accepting natural language queries in English, Bengali, or Hindi.
* `GET /api/chat/history`: Retrieves recent conversation thread for session continuity.

### 7. Observability & Health
* `GET /api/health`: Health probe reporting MongoDB, Redis, and memory status.
* `GET /metrics`: Prometheus telemetry metrics.

---

## ⚡ Redis Caching & Session Architecture

1. **Write-Evicted Cache Invalidation (PERF-01):**
   - Hot path metrics are cached in Redis under `store:{store_id}:live:{date}`.
   - Any write (`POST`, `PUT`, `DELETE`) immediately purges both Redis cache and local memory cache keys across all load-balanced replicas.
2. **Server-Revocable Session Registry (AUTH-05):**
   - Active tokens are stored under `session:{user_id}:{token_id}` with TTL matching token expiry.
   - On logout or password change, sessions are instantly dropped, blocking any further Bearer token authorization attempts.
3. **Sliding-Window Rate Limiter:**
   - Tracks requests per IP and per account identity over a rolling window.
   - Protects against brute-force attacks and noisy neighbors while allowing legitimate store network bursts.

---

## 🗄️ Database Architecture & ESR Indexes

MongoDB Atlas collections are hardened with **Equality $\to$ Sort $\to$ Range (ESR)** compound indexes to ensure queries run entirely within RAM:

```python
# db/indexes.py
# 1. Bills Collection
db.bills.create_index([("store_id", 1), ("date", 1), ("timestamp", -1)])

# 2. Footfall Collection
db.footfall.create_index([("store_id", 1), ("date", 1), ("hour", 1)])

# 3. NOB (Number of Buyers) Collection
db.nob.create_index([("store_id", 1), ("date", 1), ("timeslot", 1)])

# 4. Targets Collection
db.targets.create_index([("store_id", 1), ("date", -1)])

# 5. Directives Collection
db.directives.create_index([("target_store", 1), ("created_at", -1)])

# 6. Requisitions Collection
db.requisitions.create_index([("store_id", 1), ("status", 1), ("created_at", -1)])
```

---

## 🤖 Autonomous AI Copilot Engine

The AI Copilot (`src/chat/`) is a multi-agent domain assistant tailored for retail floor telemetry:
* **Multi-Lingual Processing:** Translates and responds natively in **English**, **Bengali (বাংলা)**, and **Hindi (हिंदी)**.
* **Context Injector:** Automatically injects today's live sales numbers, target gap, current timeslot, and active directives into the prompt context.
* **Rolling Target Recovery:** Analyzes afternoon/evening deficits and calculates the exact hourly run-rate required to hit closing targets.
* **Anti-Hallucination Gate (`anti_hallucination.py`):** Intercepts model responses, parses any claimed metrics, and cross-checks them against the authoritative Python KPI calculations. Inconsistencies are rejected before reaching the client.

---

## ⏱️ Background Workers & Midnight Finalization

* **Midnight Auto-Seal (`src/cron/midnight_settlement.py`):**
  - Executes nightly at `00:00:00`.
  - Aggregates unfinalized store records for the preceding calendar day.
  - Generates immutable daily closing records in `daily_summary_archive`.
  - Clears transient cache keys.
* **BullMQ Async Job Queue:**
  - Manages heavy tasks (PDF generation, bulk Excel parsing) off the main request thread.

---

## 📝 Structured Logging & Correlation Tracing

* **Correlation IDs:** Middleware extracts or generates an `X-Correlation-ID` header, attaching it to all downstream log entries.
* **Structured Rotating Logs:** Outputs to `logs/` directory:
  - `logs/app.log`: General application debug and info traces.
  - `logs/access.log`: HTTP request/response metrics with status codes and latency.
  - `logs/audit.log`: Administrative actions, password changes, and target adjustments.
  - `logs/error.log`: Exceptions with full stack traces.

---

## ⚙️ Environment Configuration (`.env`)

Create `Daily Operations/backend/.env` with the following parameters:

```env
# Application
APP_ENV=production
DEBUG=false
PORT=8000
HOST=0.0.0.0

# Database & Cache
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/citimart_daily?retryWrites=true&w=majority
REDIS_URL=redis://:strongredispassword@localhost:6379/0

# Security & Tokens
JWT_SECRET=your_super_secret_hs256_key_at_least_32_chars_long
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
COOKIE_SECURE=true
COOKIE_SAMESITE=lax

# Multi-Agent Copilot
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 🧪 Automated Testing & Pytest Suite

The backend boasts a 240+ test suite with comprehensive mock fixtures for MongoDB (`mongomock`) and Redis:

```powershell
# Run the complete test suite
pytest tests/ -v

# Run specific functional suites
pytest tests/test_auth.py -v                # Authentication & JWT security
pytest tests/test_daily_authz.py -v         # Multi-tenant BOLA/IDOR isolation
pytest tests/test_redis_rate_limiter.py -v  # Rate limiting & brute force
pytest tests/test_chat_multi_agent.py -v    # AI Copilot & anti-hallucination

# Run with test coverage report
pytest --cov=api --cov=src tests/
```
