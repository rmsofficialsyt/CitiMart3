# GEMINI.md — Daily Operations Suite

> **Production Security Mandate:** All endpoints, schema mutations, and authorization logic must comply with [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md) and [docs/specs/CONSTITUTION.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/docs/specs/CONSTITUTION.md).

Guidance for Google DeepMind Antigravity and Gemini CLI agents working inside `Daily Operations/`.

---

## 1. Sub-Project Scope & Role

`Daily Operations/` is the **live, mission-critical operational system** used on the retail sales floor by the Central Admin and the Store Managers of the three Kolkata department stores:
- **New Market (`NM`)**
- **Hatibagan (`HB`)**
- **Chowringhee (`CHW`)**

### Core Workflows
1. **Hourly Sales & Footfall Entry:** Store staff enter hourly bill counts, net sales, footfall, and NOB across operational time slots.
2. **Real-time Live KPI Dashboard:** Immediate tracking of Net Sales, Target Achievement %, Footfall, Average Transaction Value (ATV), Units Per Transaction (UPT), and Conversion Rate.
3. **Monthly Sales Target Allocation:** Admin sets store targets per day/month.
4. **Shift End & Midnight Settlement:** Daily finalization of numbers, PDF/Excel generation, and audit trail generation.

> [!IMPORTANT]
> **Zero-Workbook Rule:** There is NO `DATASET.xlsx` and NO Pandas data-loading layer in this sub-project. Every metric is read from and written to **MongoDB Atlas** and **Redis** at request time.

---

## 2. Distributed High-Concurrency Architecture

To support horizontal scaling, sub-10ms hot-path latency, and seamless handling of 1,000+ concurrent store logins, the system uses a distributed multi-tier architecture:

```
[ Client Browser / Store Terminals ]
                 │
                 ▼
     [ Nginx L7 Gateway / Load Balancer ] (:80)
     ├── Serves pre-built React/Vite SPA static assets
     ├── Enforces connection limits & bursts
     └── Upstream reverse-proxy to backend replicas
                 │
                 ├──► [ FastAPI Backend Replica 1 ] (:8000)
                 ├──► [ FastAPI Backend Replica 2 ] (:8000)
                 └──► [ FastAPI Backend Replica 3 ] (:8000)
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       [ Redis 7.4 Cluster ]           [ MongoDB Atlas ]
       ├── Redis Session Registry      ├── daily_bills
       ├── Distributed Rate Limiter    ├── daily_footfall
       ├── L2 Dashboard Cache          ├── daily_targets
       ├── BullMQ Job Queues           ├── users
       └── Distributed Locks           └── audit_logs
               ▲
               │
       [ BullMQ Worker Replicas ]
       └── Asynchronous PDF/XLSX export, audit trails & midnight jobs
```

### Key Architectural Components

1. **Redis Session Registry (AUTH-05):**
   - Access tokens are short-lived JWTs ($\le 900$s).
   - Refresh tokens are server-revocable, rotating HttpOnly cookies tracked in Redis (`session:<session_id>`).
   - Logging out invalidates the session in Redis instantly across all backend replicas.
2. **Distributed Sliding-Window Rate Limiter:**
   - Evaluated via Redis atomic pipelines.
   - Smoothly handles 1,000+ concurrent logins from shared store NAT gateways while aggressively throttling credential stuffing and account brute force.
3. **L2 Dashboard Cache with Zero-Staleness Write Eviction (PERF-01):**
   - Live KPI dashboard reads hit the Redis L2 cache, returning in **1–10 ms**.
   - Any write (e.g. bill or footfall submission) immediately evicts the store's cache key across all replicas.
4. **Distributed Midnight Lock:**
   - Co-ordinated via Redis distributed locks (`redlock` pattern) so only one replica executes the midnight settlement run.
5. **BullMQ Background Workers:**
   - Heavy operations (PDF report compilation via ReportLab, Excel workbook generation, external notifications) run asynchronously off the API path.

---

## 3. Security & Multi-Tenant Isolation (BOLA/IDOR Prevention)

1. **Store-Level Isolation:**
   - Store Managers must strictly be confined to their assigned store:
     - `manager_nm` $\to$ New Market (`NM`) only
     - `manager_hb` $\to$ Hatibagan (`HB`) only
     - `manager_chw` $\to$ Chowringhee (`CHW`) only
     - `admin` $\to$ Global access
   - All store-scoped routes must enforce:
     ```python
     require_store_access(store_code, current_user)
     ```
2. **Database Query Tenant Guard:**
   - Queries must always include `{"store_id": store_code}`. Never rely solely on client-supplied parameters.
3. **Admin Enpoints:**
   - System settings, user provisioning, and target overrides require `require_admin`.

---

## 4. Single Environment Configuration Policy

> [!CAUTION]
> **Strict Rule:** There is strictly **ONE** authoritative environment file: `Daily Operations/backend/.env`.
> Do NOT create a duplicate `.env` file at `Daily Operations/.env`.

- `backend/config/env.py` binds to `backend/.env` directly.
- Docker Compose loads environment variables via `--env-file ./backend/.env`:
  ```powershell
  docker compose --env-file ./backend/.env up -d
  ```

---

## 5. Development, Testing & Docker Commands

### Run Backend Locally
```powershell
# From Daily Operations/backend:
cd "Daily Operations/backend"
..\..\.venv\Scripts\activate

# Run tests (240 unit & integration tests with mongomock)
python -m pytest -q

# Run single test file
python -m pytest tests/test_daily_dashboard_store.py -q

# Run local FastAPI dev server
uvicorn app:app --reload --port 8000
```

### Run Frontend Locally
```powershell
# From Daily Operations/frontend:
cd "Daily Operations/frontend"
npm install
npm run dev                  # Dev server on :5173
npm run build                # TypeScript typecheck (tsc -b) & bundle
npm run lint                 # Linting (oxlint)
```

### Run Distributed Docker Stack
```powershell
# Build frontend and start Redis + Backend replicas + Worker + Nginx
cd "Daily Operations"
(cd frontend && npm run build)
docker compose --env-file ./backend/.env up --build -d --scale backend=3 --scale worker=2
```

---

## 6. Shared Contracts with Analytics and Forecasting

The following modules in `backend/` are exact contracts shared with `Analytics and Forecasting/backend/`:
- `src/theme.py`: Neon color definitions (`HEX_REMAP`).
- `config/kpi_thresholds.py`: KPI status alert bands (Red/Yellow/Green).
- `config/settings.py`: Store codes (`NM`, `HB`, `CHW`) and `TIME_SLOT_ORDER`.
- `src/formatting.py`: Display formatters.

Always keep both copies in sync.

