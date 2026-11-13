# CITIMART Daily Operations — System Architecture (ARCHITECTURE)

**Architecture Model:** REST API (shared state in Redis when scaled out) + MongoDB Atlas Persistent Store + React SPA  
**Deployment:** Split Architecture (Vercel Frontend + Render Backend), or the self-hosted Docker stack in §3

---

## 1. System Topology & Data Flow

```
+-------------------------------------------------------------------------------+
|                                CLIENT SURFACES                                |
|   +-----------------------------------------------------------------------+   |
|   | Desktop & Floor Terminals: Store Managers (NM, HB, CHW) & Admin       |   |
|   | - Landing Page Account Picker                                         |   |
|   | - Live Store Dashboard & Glossy Gauges                                |   |
|   | - Manual Bill/Footfall Entry Grid & History View                      |   |
|   | - Product Requisitions & Executive Directives Modal                   |   |
|   | - Multilingual AI Operations Copilot Drawer                           |   |
|   +------------------------------------+----------------------------------+   |
+----------------------------------------|--------------------------------------+
                                         | HTTPS (Bearer Token)
                                         v
+-------------------------------------------------------------------------------+
|                            VERCEL EDGE NETWORK                                |
|   - Serves Static React Assets (HTML, CSS, JS, Fonts)                         |
|   - Rewrites /api/* -> https://citimart3-kolx.onrender.com/api/*             |
|   - Injects Edge Security Headers (nosniff, DENY, Referrer-Policy)            |
+----------------------------------------|--------------------------------------+
                                         | HTTPS Proxy Hop
                                         v
+-------------------------------------------------------------------------------+
|                         RENDER BACKEND SERVICE (FastAPI)                      |
|   +------------------------------------+----------------------------------+   |
|   | SecurityHeadersMiddleware -> GZipMiddleware -> CORSMiddleware         |   |
|   +------------------------------------+----------------------------------+   |
|   | api/auth.py: JWT verify + live-session check (Redis) & RBAC Guard     |   |
|   | src/rate_limiter.py: Redis Lua sliding window (in-process fallback)   |   |
|   +-------------------+----------------+------------------+---------------+   |
|                       |                |                  |                   |
|                       v                v                  v                   |
|   +-----------------------+  +------------------+  +----------------------+   |
|   | Live Dashboard Store  |  | Directives Store |  | Requisitions Store  |   |
|   | (Real-Time Aggregate) |  | (Broadcast Alert)|  | (Inventory Demands)  |   |
|   +-----------------------+  +------------------+  +----------------------+   |
+----------------------------------------|--------------------------------------+
                                         | TLS Connection Pool
                                         v
+-------------------------------------------------------------------------------+
|                           MONGODB ATLAS CLOUD CLUSTER                         |
|   Collections: users, bills, footfall, nob, targets, requisitions, directives |
+-------------------------------------------------------------------------------+
```

---

## 2. Component Design & Roles

### 2.1 Authentication & Authorization Subsystem
- `api/auth.py`: Verifies the HS256 access JWT and that its `sid` session is still live; mints access tokens.
- `api/routes_auth.py`: login / refresh / logout / logout-all / sessions / switch-account.
- `src/session_store.py`: server-side session registry + rotating refresh tokens (Redis or in-process).
- `src/user_store.py`: Argon2id/PBKDF2 verify, transparent upgrade, Redis user read-through cache.
- `src/audit.py`: security audit events → `audit_logs`.

### 2.2 Operational Data Subsystem
- `src/daily_dashboard_store.py`: Central engine for real-time aggregation, manual entry mutations, and historical archive queries. Read cache is L1 (process) + L2 (Redis), invalidated by a Redis version counter bumped on every write, so a write on one replica is visible on every other replica's next read.
- `src/daily_midnight_job.py`: finalizes each store's day at 00:00 **IST**, behind a Redis `NX` lock so any number of replicas/workers run it once per date.
- `src/report_jobs.py`: asynchronous report jobs (BullMQ `reports` queue), owner-checked.

---

## 3. Horizontal Scaling (Redis + BullMQ + Nginx)

Everything that used to be per-process state now lives in Redis when `REDIS_URL` is
set, which is what makes `WEB_CONCURRENCY > 1` and multiple replicas correct:

| State | Without `REDIS_URL` | With `REDIS_URL` |
|---|---|---|
| Sessions / refresh tokens | in-process dict (1 worker only) | `sess:*`, `user_sess:*`, `rt:*`, `rt_used:*` |
| Rate limits | in-process sliding window | atomic Lua sorted-set window `rl:*` |
| Dashboard cache | in-process TTL dict | L1 + versioned L2 `cache:daily:v{n}:*` |
| Weather cache | `.cache/weather_cache.json` | `weather:kolkata:{date}` |
| Login user lookup | MongoDB every time | `auth:user:{username}` (5 min) |
| Midnight finalize | runs in every process | `lock:midnight:{run}:{date}` NX lock |

Every app key carries a TTL (Redis runs `noeviction` for BullMQ), except the single
`cache:daily:ver` counter.

`docker-compose.yml` runs: `redis` (7.4, AOF, `noeviction`, password, not published),
`backend` (scale with `--scale backend=N`, default 2 workers each), `worker`
(`python -m src.queue.worker`; reports, audit events, midnight scheduler; scale with
`--scale worker=M`) and `nginx` (`least_conn` over Docker DNS with `resolve`, keepalive
upstreams, edge rate limits, 11 MB body cap, serves `frontend/dist`). MongoDB stays external.

Verified locally with 3 backend replicas + 2 workers (Nov 2026): zero stale reads across
replicas after writes, logout/revocation effective on every replica, audit events
persisted by the workers, no OOM after the hashing/glibc fixes. Absolute latency numbers
from that run reflect the developer laptop's Docker VM (a bare FastAPI app did ~100 req/s
there), not production capacity.

**Memory sizing note:** each worker idles at ~200 MB and each concurrent Argon2id hash
adds 19 MiB. The image pins `MALLOC_MMAP_THRESHOLD_` / `MALLOC_ARENA_MAX` (without them
glibc retained >1 GiB per worker during a login burst and the containers were OOM-killed).

### 2.3 Intelligent Copilot Subsystem
- `api/routes_chat.py`: Ingests live store context, formats multi-lingual prompt, calls Gemini 2.5 Flash API with fallback to local rule-based intelligence engine.
