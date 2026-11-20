# CITIMART Daily Operations — System Architecture Specification (ARCHITECTURE)

![Architecture](https://img.shields.io/badge/CITIMART-System%20Architecture-00D26A?style=for-the-badge&logo=diagramsdotnet&logoColor=white)
![Model](https://img.shields.io/badge/Design%20Scope-HLD%20%2B%20LLD%20Complete-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Production%20Hardened-success?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-SPEC--04%20Enforced-red?style=for-the-badge)

> **Authoritative High-Level Design (HLD) & Low-Level Design (LLD) Specification**  
> Covers end-to-end system topology, data flow, MongoDB Atlas BSON schemas, compound ESR indexes, Redis 7.4 key schemas, class hierarchies, sequence diagrams, state machines, and mathematical algorithms for CITIMART's three department stores: **New Market (`NM`)**, **Hatibagan (`HB`)**, and **Chowringhee (`CHW`)**.  
> Governed by [docs/CONSTITUTION.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/CONSTITUTION.md) and [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md).

---

## 📑 Master Architecture Index

### Part I: High-Level Design (HLD)
1. [Executive System Topology & Data Flow](#1-executive-system-topology--data-flow)
2. [Subsystem Boundaries & Responsibility Matrix](#2-subsystem-boundaries--responsibility-matrix)
3. [Horizontal Scaling & Multi-Replica Topology](#3-horizontal-scaling--multi-replica-topology)
4. [Network Security, Edge Routing & TLS Zones](#4-network-security-edge-routing--tls-zones)

### Part II: Low-Level Design (LLD)
5. [Database Architecture & Data Models (MongoDB Atlas)](#5-database-architecture--data-models-mongodb-atlas)
   - [5.1 BSON Document Schemas & Data Dictionaries](#51-bson-document-schemas--data-dictionaries)
   - [5.2 Compound ESR Index Specifications](#52-compound-esr-index-specifications)
6. [Distributed In-Memory Datastore & Cache (Redis 7.4)](#6-distributed-in-memory-datastore--cache-redis-74)
   - [6.1 Redis Key Naming Schema, Data Types & TTLs](#61-redis-key-naming-schema-data-types--ttls)
   - [6.2 Atomic Lua Scripts (Rate Limiting & Token Rotation)](#62-atomic-lua-scripts-rate-limiting--token-rotation)
7. [Component & Class Hierarchy (Object-Oriented Design)](#7-component--class-hierarchy-object-oriented-design)
   - [7.1 Authentication & Session Store (`SessionStore`, `UserStore`)](#71-authentication--session-store-sessionstore-userstore)
   - [7.2 Operational Telemetry Engine (`DailyDashboardStore`)](#72-operational-telemetry-engine-dailydashboardstore)
   - [7.3 Autonomous AI Copilot & Anti-Hallucination Gate](#73-autonomous-ai-copilot--anti-hallucination-gate)
8. [Sequence & Interaction Workflows](#8-sequence--interaction-workflows)
   - [8.1 Multi-Tenant Login & Rotating Token Lifecycle](#81-multi-tenant-login--rotating-token-lifecycle)
   - [8.2 Atomic Hourly Data Entry with Write-Evicted Cache Purge](#82-atomic-hourly-data-entry-with-write-evicted-cache-purge)
   - [8.3 Distributed Midnight Auto-Settlement with Redlock](#83-distributed-midnight-auto-settlement-with-redlock)
9. [Finite State Machines (FSM)](#9-finite-state-machines-fsm)
   - [9.1 Product Shortfall Requisition Lifecycle](#91-product-shortfall-requisition-lifecycle)
   - [9.2 Executive Directive Broadcast & Read Receipt Workflow](#92-executive-directive-broadcast--read-receipt-workflow)
10. [Algorithmic Formulations & Mathematical Specifications](#10-algorithmic-formulations--mathematical-specifications)
   - [10.1 Safe Division & Intraday Metric Formulations](#101-safe-division--intraday-metric-formulations)
   - [10.2 Rolling Target Recovery Run-Rate Algorithm](#102-rolling-target-recovery-run-rate-algorithm)
   - [10.3 Timeslot Boundary Normalization Engine](#103-timeslot-boundary-normalization-engine)
11. [Memory Management, Glibc Tuning & Concurrency Limits](#11-memory-management-glibc-tuning--concurrency-limits)

---

# PART I: HIGH-LEVEL DESIGN (HLD)

## 1. Executive System Topology & Data Flow

The platform employs a decoupled, horizontally scalable multi-tier architecture. Client traffic is received via Nginx L7 reverse proxy, processed by stateless FastAPI backend replicas, coordinated via an in-memory Redis 7.4 cluster, and persisted in MongoDB Atlas:

```
+───────────────────────────────────────────────────────────────────────────────────────────+
│                                     CLIENT SURFACES                                       │
│   Store Floor Terminals (NM, HB, CHW)          Executive Operations Head (Raphael Sir)    │
│   • Hourly Billing/Footfall Row Logger         • Overall Multi-Store Summary Dashboard    │
│   • Live Hero KPI Pacing & Gauges              • Executive Directives Broadcast Channel   │
│   • Stock Shortfall Requisitions               • Monthly Target Allocation & Bulk Upload  │
│   • Trilingual AI Operations Copilot           • One-Click Certified PDF/XLSX Exporter    │
+─────────────────────────────────────────────┬─────────────────────────────────────────────+
                                              │ HTTPS / WSS (Port 443 / 80)
                                              ▼
+───────────────────────────────────────────────────────────────────────────────────────────+
│                                  L7 GATEWAY (Nginx 1.27)                                  │
│   • Least-Connections Load Balancing across dynamic backend replicas (`resolver 127.0.0.11`)│
│   • Edge Abuse Shielding: Rate limiting (200 r/s API, 100 r/s Auth)                       │
│   • Static SPA File Serving (`frontend/dist/`) with HTML5 fallback to `index.html`         │
│   • Security Headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`          │
+─────────────────────────────────────────────┬─────────────────────────────────────────────+
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
+───────────────────────────────────────────+   +───────────────────────────────────────────+
│    BACKEND APP REPLICAS (FastAPI ASGI)    │   │      BULLMQ ASYNC WORKER REPLICAS         │
│   • Sub-10ms Hot-Path Telemetry Engine    │   │   • Python BullMQ Worker Subsystem        │
│   • HS256 JWT Bearer + Cookie Validation  │   │   • Asynchronous PDF Compilation (ReportLab)│
│   • BOLA/IDOR Store Boundary Enforcement  │   │   • Bulk Sales Target Excel Ingestion     │
│   • Multilingual AI Copilot (Gemini API)  │   │   • Automated Midnight Settlement Run     │
│   • Structured Correlated JSON Logger     │   │   • Long-term Audit Log Dispatcher        │
+─────────────────────┬─────────────────────+   +─────────────────────┬─────────────────────+
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
+───────────────────────────────────────────+   +───────────────────────────────────────────+
│        REDIS 7.4 DISTRIBUTED CLUSTER      │   │        MONGODB ATLAS CLOUD CLUSTER        │
│   • Server-Revocable Session Registry     │   │   • Multi-Tenant Collections              │
│   • Sliding-Window Rate Limiters (Lua)    │   │   • Compound ESR RAM Indexes              │
│   • Write-Evicted Versioned L2 Cache      │   │   • ACID Multi-Document Transactions      │
│   • Distributed Redlock (Midnight Lock)   │   │   • Encrypted-at-Rest Storage             │
│   • BullMQ Reliable Task Message Queues   │   │   • Pinned Atlas Connection Pooling       │
+───────────────────────────────────────────+   +───────────────────────────────────────────+
```

---

## 2. Subsystem Boundaries & Responsibility Matrix

| Subsystem | Primary Modules | Technological Foundation | Core Responsibility |
|:---|:---|:---|:---|
| **API Gateway & Routing** | `nginx.conf`, `api/deps.py` | Nginx, Starlette Routing | SSL termination, edge throttling, least-conn backend proxying, static asset delivery. |
| **Identity & Access (IAM)**| `api/auth.py`, `src/session_store.py`, `src/user_store.py` | PyJWT, Argon2id, Redis Hashes | Dual-tier authentication, server-revocable sessions, role-based store boundaries (BOLA prevention). |
| **Telemetry & Calculations**| `api/routes_daily.py`, `src/daily_dashboard_store.py` | FastAPI, Pydantic v2, PyMongo | Intraday KPI processing, write-evicted L2 cache invalidation, unified inline data logging. |
| **Sales Target Management**| `api/routes_targets.py`, `src/targets_store.py` | OpenPyXL, Pandas | Target setting, bulk spreadsheet parsing, day-of-week allocation curves. |
| **Store Operations Suite** | `api/routes_directives.py`, `api/routes_requisitions.py` | PyMongo, BullMQ | Executive alert broadcasts with read receipts; merchandise shortfall requisition tickets. |
| **Autonomous AI Copilot** | `api/routes_chat.py`, `src/chat/*` | Google GenAI SDK, Pydantic | Trilingual conversational intelligence with mathematical anti-hallucination validation gates. |
| **Job Queue & Workers** | `src/queue/*`, `src/daily_midnight_job.py` | BullMQ (Python), Redis AOF | Offloaded async document generation, scheduled midnight freeze, reliable audit streaming. |

---

## 3. Horizontal Scaling & Multi-Replica Topology

Every stateful operational element is externalized into Redis 7.4. Consequently, backend processes remain completely stateless:

```
                                  [ Incoming Network Requests ]
                                                │
                                                ▼
                                    [ Nginx Upstream Group ]
                                      (`least_conn` zone)
                                                │
                      ┌─────────────────────────┼─────────────────────────┐
                      ▼                         ▼                         ▼
             [ Backend Node 1 ]        [ Backend Node 2 ]        [ Backend Node 3 ]
             (Port 8000, 2 Wkrs)       (Port 8000, 2 Wkrs)       (Port 8000, 2 Wkrs)
                      │                         │                         │
                      └─────────────────────────┼─────────────────────────┘
                                                │
                                                ▼
                                   [ Shared Redis 7.4 Cluster ]
                   ├── Session State: `sess:*` (Accessible by all nodes)
                   ├── Rate Limits: `rl:*` (Atomic sliding-window Lua)
                   ├── L2 Cache: `cache:daily:v{ver}:*` (Purged across all nodes)
                   └── Queue Broker: `bull:reports:*`, `bull:audit:*`
```

---

## 4. Network Security, Edge Routing & TLS Zones

```
+───────────────────────────────────────────────────────────────────────────────────────────+
│ ZONE 1: PUBLIC INTERNET (Untrusted External Traffic)                                      │
│ • HTTPS (TLS 1.3 / 1.2) over TCP Port 443; HTTP Port 80 automatically redirects to 443     │
+─────────────────────────────────────────────┬─────────────────────────────────────────────+
                                              │ Ingress TLS
                                              ▼
+───────────────────────────────────────────────────────────────────────────────────────────+
│ ZONE 2: EDGE DMZ (Nginx Reverse Proxy & Load Balancer)                                    │
│ • Drops invalid HTTP methods and oversized payloads (> 11 MB)                             │
│ • Enforces edge rate limits (200 req/s API, 100 req/s Login)                              │
│ • Strips internal debug headers; injects security headers                                 │
+─────────────────────────────────────────────┬─────────────────────────────────────────────+
                                              │ Internal Docker Bridge Network (`citimart_net`)
                                              ▼
+───────────────────────────────────────────────────────────────────────────────────────────+
│ ZONE 3: APPLICATION ISOLATION TIER (FastAPI Backend & Background Workers)                 │
│ • Ports :8000 and internal worker processes are NOT exposed to the host/public interface  │
│ • Container instances execute as unprivileged `appuser` (UID 10001)                       │
+─────────────────────────────────────────────┬─────────────────────────────────────────────+
                                              │ Pinned TLS 1.3 Outbound Connections
                                              ▼
+───────────────────────────────────────────────────────────────────────────────────────────+
│ ZONE 4: MANAGED PERSISTENCE TIER (MongoDB Atlas & Redis Datastores)                       │
│ • IP Access Whitelisting & SCRAM-SHA-256 Authentication                                   │
│ • AES-256 Encryption at Rest & In-Flight TLS Encryption                                   │
+───────────────────────────────────────────────────────────────────────────────────────────+
```

---

# PART II: LOW-LEVEL DESIGN (LLD)

## 5. Database Architecture & Data Models (MongoDB Atlas)

### 5.1 BSON Document Schemas & Data Dictionaries

The database schema is strictly typed via Pydantic v2 domain schemas before persistence into MongoDB BSON collections.

#### 1. Collection: `users`
Stores authenticated operator credentials and role scopes:
```json
{
  "_id": { "$oid": "65f2a1b4c89d2e1f3a4b5c6d" },
  "username": "new_market",
  "display_name": "CITIMART - New Market",
  "role": "manager",
  "store_code": "NM",
  "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$...",
  "legacy_pbkdf2_hash": null,
  "is_active": true,
  "created_at": { "$date": "2026-01-01T00:00:00.000Z" },
  "last_login": { "$date": "2026-11-20T10:32:15.120Z" }
}
```

#### 2. Collection: `bills`
Records timestamped cashier transactions and physical item counts:
```json
{
  "_id": { "$oid": "664b3a1c9e8f7a2d1b0c9e8a" },
  "store_id": "NM",
  "date": "2026-11-20",
  "timestamp": "14:15:00",
  "timeslot": "Slot 2",
  "net_amount": 34850.00,
  "bill_qty": 18,
  "nob": 6,
  "remarks": "Post-lunch promotional counter surge",
  "created_by": "new_market",
  "created_at": { "$date": "2026-11-20T14:15:32.400Z" },
  "updated_at": { "$date": "2026-11-20T14:15:32.400Z" }
}
```

#### 3. Collection: `footfall`
Records customer walk-in counts across store entrance sensors:
```json
{
  "_id": { "$oid": "664b3a2a9e8f7a2d1b0c9e8b" },
  "store_id": "NM",
  "date": "2026-11-20",
  "hour": "14:00",
  "timeslot": "Slot 2",
  "footfall_count": 84,
  "created_by": "new_market",
  "created_at": { "$date": "2026-11-20T14:15:32.410Z" }
}
```

#### 4. Collection: `targets`
Stores daily sales targets and previous year comparative baselines:
```json
{
  "_id": { "$oid": "664b3a359e8f7a2d1b0c9e8c" },
  "store_id": "NM",
  "date": "2026-11-20",
  "month": "2026-11",
  "sales_target": 450000.00,
  "py_sales": 395000.00,
  "updated_by": "admin",
  "updated_at": { "$date": "2026-11-01T09:00:00.000Z" }
}
```

#### 5. Collection: `directives`
Stores executive operational directives dispatched by Raphael Sir:
```json
{
  "_id": { "$oid": "664b3a4f9e8f7a2d1b0c9e8d" },
  "directive_id": "DIR-20261120-01",
  "author": "Raphael Sir",
  "title": "Evening Peak Fitting Room Staffing",
  "message": "All floor supervisors to redeploy 2 counter staff to 2nd floor men's apparel fitting rooms between 5 PM and 8 PM.",
  "priority": "Urgent",
  "target_store": "ALL",
  "acknowledgments": [
    { "store_id": "NM", "user": "new_market", "timestamp": { "$date": "2026-11-20T11:02:14.000Z" } },
    { "store_id": "HB", "user": "hatibagan", "timestamp": { "$date": "2026-11-20T11:05:40.000Z" } }
  ],
  "created_at": { "$date": "2026-11-20T10:45:00.000Z" }
}
```

#### 6. Collection: `requisitions`
Stores merchandise stockout escalation tickets:
```json
{
  "_id": { "$oid": "664b3a629e8f7a2d1b0c9e8e" },
  "req_id": "REQ-NM-20261120-004",
  "store_id": "NM",
  "department": "Men's Ethnic",
  "item_code": "KURTA-SILK-MAROON-42",
  "description": "Silk Festive Kurta Maroon Size 42 (Stockout)",
  "quantity": 25,
  "urgency": "High",
  "status": "Approved",
  "audit_trail": [
    { "status": "Pending", "updated_by": "new_market", "timestamp": { "$date": "2026-11-20T12:30:00.000Z" } },
    { "status": "Approved", "updated_by": "admin", "timestamp": { "$date": "2026-11-20T13:10:00.000Z" } }
  ],
  "created_at": { "$date": "2026-11-20T12:30:00.000Z" }
}
```

---

### 5.2 Compound ESR Index Specifications

All compound indexes strictly satisfy the **Equality $\to$ Sort $\to$ Range (ESR)** design principle to ensure queries execute entirely in RAM with zero disk scans:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              COMPOUND ESR INDEX MATRIX                                      │
├──────────────┬────────────────────────────────────────────┬─────────────┬───────────────────┤
│ Collection   │ Index Keys (ESR Sequence)                  │ Unique / TTL│ Access Pattern    │
├──────────────┼────────────────────────────────────────────┼─────────────┼───────────────────┤
│ `bills`      │ `{"store_id": 1, "date": 1, "timestamp": -1}`│ No       │ Intraday telemetry│
│ `footfall`   │ `{"store_id": 1, "date": 1, "hour": 1}`     │ No          │ Hourly walk-ins   │
│ `targets`    │ `{"store_id": 1, "date": -1}`              │ Unique      │ Target lookup     │
│ `users`      │ `{"username": 1}`                          │ Unique      │ Login credential  │
│ `directives` │ `{"target_store": 1, "created_at": -1}`    │ No          │ Active alerts     │
│ `requisitions`│ `{"store_id": 1, "status": 1, "created_at": -1}`│ No    │ Store shortfall   │
│ `audit_logs` │ `{"store_id": 1, "created_at": -1}`        │ No          │ Compliance audit  │
└──────────────┴────────────────────────────────────────────┴─────────────┴───────────────────┘
```

---

## 6. Distributed In-Memory Datastore & Cache (Redis 7.4)

### 6.1 Redis Key Naming Schema, Data Types & TTLs

Every key persisted in Redis carries an explicit prefix, dedicated data structure, and deterministic TTL policy:

| Key Pattern | Redis Data Structure | TTL | Eviction / Invalidation Rule | Purpose |
|:---|:---|:---|:---|:---|
| `sess:{sid}` | **Hash** | 15 Minutes | Explicit refresh or logout revocation | Active JWT session registry (`user_id`, `role`, `store_id`). |
| `user_sess:{user}` | **Set** | 7 Days | Pop on session expiry; drop on `logout-all` | User active session ID set for concurrent session management. |
| `rt:{token_hash}` | **String** | 7 Days | Single-use rotation; immediate drop | Rotating refresh token pointing to active session ID. |
| `rt_used:{token_hash}` | **String** | 60 Seconds | Auto-evict via TTL | Reuse detection flag; triggers account lockout if presented twice. |
| `rl:{scope}:{id}` | **Sorted Set** | 60 Seconds | Sliding window pruning | IP and user sliding-window rate limit counters. |
| `cache:daily:v{v}:{store}:{date}` | **String (JSON)** | 10 Minutes | **Write-Evicted** (cleared on version bump) | Cached `/api/daily/live` aggregated payload. |
| `cache:daily:ver` | **String (Int)** | Permanent | Incremented via `INCR` on any write | Global cache version number. |
| `weather:kolkata:{date}` | **String (JSON)** | 6 Hours | Natural TTL expiry | Kolkata weather context cache. |
| `auth:user:{username}` | **String (JSON)** | 5 Minutes | Dropped on password update | Read-through cached user authentication record. |
| `lock:midnight:{date}` | **String** | 300 Seconds | Released after run completion | Distributed Redlock ensuring single midnight finalization. |

---

### 6.2 Atomic Lua Scripts (Rate Limiting & Token Rotation)

#### 1. Sliding-Window Rate Limiter (`src/queue/lua/limit_sliding_window.lua`)
Executes atomic sorted-set additions, expired timestamp pruning, and cardinality counting:
```lua
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clear_before = now - window

redis.call('ZREMRANGEBYSCORE', key, 0, clear_before)
local current_count = redis.call('ZCARD', key)

if current_count < limit then
    redis.call('ZADD', key, now, now .. '-' .. math.random(1000, 9999))
    redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
    return {1, limit - current_count - 1}
else
    return {0, 0}
end
```

#### 2. Refresh Token Rotation with Reuse Detection (`src/queue/lua/rotate_token.lua`)
Detects replay attacks and rotates refresh tokens atomically:
```lua
local old_token_key = KEYS[1]
local used_token_key = KEYS[2]
local new_token_key = KEYS[3]
local sid = ARGV[1]
local ttl = tonumber(ARGV[2])

if redis.call('EXISTS', used_token_key) == 1 then
    -- Token reuse detected! Revoke session immediately
    redis.call('DEL', 'sess:' .. sid)
    return -1
end

if redis.call('GET', old_token_key) ~= sid then
    return 0
end

redis.call('DEL', old_token_key)
redis.call('SET', used_token_key, sid, 'EX', 60)
redis.call('SET', new_token_key, sid, 'EX', ttl)
return 1
```

---

## 7. Component & Class Hierarchy (Object-Oriented Design)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            COMPONENT CLASS HIERARCHY                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  class SessionStore                                                         │
│  ├── create_session(user_context: UserContext) -> SessionModel              │
│  ├── validate_session(sid: str) -> bool                                     │
│  ├── rotate_refresh_token(old_token: str) -> Tuple[str, str]                │
│  └── revoke_session(sid: str) -> None                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  class DailyDashboardStore                                                  │
│  ├── get_store_summary(store_id: str, date: date) -> LiveSummaryPayload      │
│  ├── log_hourly_entry(store_id: str, entry: EntryCreateSchema) -> EntryId   │
│  ├── update_hourly_entry(entry_id: str, entry: EntryUpdateSchema) -> None   │
│  ├── delete_hourly_entry(entry_id: str) -> None                             │
│  └── _bump_cache_version() -> int                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  class AntiHallucinationValidator                                           │
│  ├── extract_numerical_claims(llm_response: str) -> List[MetricClaim]       │
│  ├── verify_claims(claims: List[MetricClaim], actual: LiveSummaryPayload)   │
│  └── sanitize_response(llm_response: str, actual: LiveSummaryPayload) -> str│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Sequence & Interaction Workflows

### 8.1 Multi-Tenant Login & Rotating Token Lifecycle

```
[ Store Manager Terminal ]         [ FastAPI Router ]          [ Redis Session Store ]       [ MongoDB Atlas ]
            │                              │                              │                          │
            ├── 1. POST /api/auth/login ──►│                              │                          │
            │   (username, password)       ├── 2. Fetch User Record ────────────────────────────────►│
            │                              │◄── 3. Return Hash (Argon2id) ───────────────────────────┤
            │                              │
            │                              ├── 4. Verify Hash (Passlib)   │                          │
            │                              │
            │                              ├── 5. Register Session ──────►│                          │
            │                              │      (`sess:<sid>`, 15m)     │                          │
            │                              ├── 6. Store Refresh Token ───►│                          │
            │                              │      (`rt:<token>`, 7d)      │                          │
            │◄── 7. HTTP 200 OK ───────────┤                              │                          │
            │    Set-Cookie: citimart_rt   │                              │                          │
            │    Body: { access_token }    │                              │                          │
```

---

### 8.2 Atomic Hourly Data Entry with Write-Evicted Cache Purge

```
[ Floor Terminal ]            [ FastAPI Backend ]           [ MongoDB Atlas ]           [ Redis Cluster ]
        │                              │                            │                           │
        ├── 1. POST /api/daily/entries►│                            │                           │
        │   (Bills, Footfall, Time)    ├── 2. Validate Constraints  │                           │
        │                              │      (10:30 - 23:59 IST)   │                           │
        │                              │                            │                           │
        │                              ├── 3. Insert BSON Entry ───►│                           │
        │                              │◄── 4. Insert Confirmed ────┤                           │
        │                              │                                                        │
        │                              ├── 5. Bump Cache Version (`INCR cache:daily:ver`) ─────►│
        │                              │      (Invalidates L2 cache across all replicas)        │
        │◄── 6. HTTP 201 Created ──────┤                                                        │
```

---

### 8.3 Distributed Midnight Auto-Settlement with Redlock

```
[ Worker Replica 1 ]          [ Worker Replica 2 ]          [ Redis Lock ]              [ MongoDB Atlas ]
         │                             │                           │                            │
         ├── 1. 00:00:00 IST Trigger   │                           │                            │
         ├── 2. SET lock:midnight NX ─────────────────────────────►│                            │
         │   (Acquires Lock)           ├── 3. SET lock:midnight NX►│                            │
         │                             │   (Rejected - Exit)       │                            │
         │                             │                           │                            │
         ├── 4. Query Unsealed Shift Data for Yesterday ───────────────────────────────────────►│
         │◄── 5. Return Aggregated Bills, Footfall, and Target ─────────────────────────────────┤
         │                                                         │                            │
         ├── 6. Compute Final ATV, RPV, Basket Size, Conversion %  │                            │
         ├── 7. Insert into `daily_summary_archive` ───────────────────────────────────────────►│
         ├── 8. Release Lock ─────────────────────────────────────►│                            │
```

---

## 9. Finite State Machines (FSM)

### 9.1 Product Shortfall Requisition Lifecycle

```
                     ┌───────────────────────┐
                     │   PENDING APPROVAL    │ ◄── Store Manager Submits Shortfall
                     └───────────┬───────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │ Admin Review                  │ Admin Rejection
                 ▼                               ▼
       ┌───────────────────┐           ┌───────────────────┐
       │     APPROVED      │           │     REJECTED      │ (Terminal State)
       └─────────┬─────────┘           └───────────────────┘
                 │
                 │ Warehouse Dispatch
                 ▼
       ┌───────────────────┐
       │    DISPATCHED     │
       └─────────┬─────────┘
                 │
                 │ Floor Manager Physical Intake Receipt
                 ▼
       ┌───────────────────┐
       │     FULFILLED     │ (Terminal State)
       └───────────────────┘
```

---

### 9.2 Executive Directive Broadcast & Read Receipt Workflow

```
       ┌───────────────────┐
       │  DRAFT DIRECTIVE  │ (Raphael Sir Composes Directive)
       └─────────┬─────────┘
                 │ Broadcast Dispatch
                 ▼
       ┌───────────────────┐
       │  ACTIVE BROADCAST │ ──► Displayed as Urgent Banner on Target Store Dashboards
       └─────────┬─────────┘
                 │
                 │ Manager Clicks "Acknowledge" Button
                 ▼
       ┌───────────────────┐
       │   ACKNOWLEDGED    │ ──► Appends `{ store_id, user, timestamp }` to Directive Record
       └───────────────────┘
```

---

## 10. Algorithmic Formulations & Mathematical Specifications

### 10.1 Safe Division & Intraday Metric Formulations

To guarantee zero `ZeroDivisionError` crashes on retail floors:

$$\text{safe\_divide}(a, b, \text{default} = 0.0) = \begin{cases} \frac{a}{b} & \text{if } b \ne 0 \text{ and } b \text{ is not null} \\ \text{default} & \text{otherwise} \end{cases}$$

Using `safe_divide`, intraday performance is computed as:
$$\text{Target Achievement \%} = \text{safe\_divide}(\text{Net Sales}, \text{Allocated Target}) \times 100$$
$$\text{Average Transaction Value (ATV)} = \text{safe\_divide}(\text{Net Sales}, \text{NOB})$$
$$\text{Revenue Per Visitor (RPV)} = \text{safe\_divide}(\text{Net Sales}, \text{Total Footfall})$$
$$\text{Conversion Rate \%} = \text{safe\_divide}(\text{NOB}, \text{Total Footfall}) \times 100$$
$$\text{Basket Size (UPT)} = \text{safe\_divide}(\text{Total Units Sold}, \text{NOB})$$

---

### 10.2 Rolling Target Recovery Run-Rate Algorithm

When a store is in a deficit gap at 4:00 PM or 8:00 PM, the AI Copilot executes the recovery run-rate algorithm:

```python
def compute_recovery_run_rate(net_sales: float, target: float, current_time: str) -> dict:
    remaining_gap = max(0.0, target - net_sales)
    if remaining_gap <= 0.0:
        return {"status": "achieved", "required_hourly_run_rate": 0.0}

    # Closing time is fixed at 23:59 (approx 12.0 hours total from 12:00)
    current_hour = int(current_time.split(":")[0])
    current_minute = int(current_time.split(":")[1])
    remaining_hours = max(0.5, (23 - current_hour) + ((60 - current_minute) / 60.0))

    required_hourly_sales = remaining_gap / remaining_hours

    return {
        "status": "deficit",
        "deficit_gap": remaining_gap,
        "remaining_hours": round(remaining_hours, 2),
        "required_hourly_run_rate": round(required_hourly_sales, 2),
        "target_hourly_bills": math.ceil(required_hourly_sales / 2500.0) # Using historical ATV baseline
    }
```

---

### 10.3 Timeslot Boundary Normalization Engine

Timestamps resolve into standardized slots via integer-minute arithmetic:

```python
def resolve_timeslot(timestamp_str: str) -> str:
    """
    Normalizes HH:MM string to the four store timeslot bands:
    - 10:30 to 13:59: Slot 1 (Morning)
    - 14:00 to 16:59: Slot 2 (Afternoon)
    - 17:00 to 19:59: Slot 3 (Evening)
    - 20:00 to 23:59: Slot 4 (Night)
    """
    parts = timestamp_str.split(":")
    total_minutes = int(parts[0]) * 60 + int(parts[1])

    if 630 <= total_minutes <= 839:
        return "Slot 1"
    elif 840 <= total_minutes <= 1019:
        return "Slot 2"
    elif 1020 <= total_minutes <= 1199:
        return "Slot 3"
    elif 1200 <= total_minutes <= 1439:
        return "Slot 4"
    else:
        raise ValueError("Timestamp outside store operating hours (10:30 to 23:59).")
```

---

## 11. Memory Management, Glibc Tuning & Concurrency Limits

During high-concurrency login bursts across store cashier terminals:
1. **Argon2id Concurrency Gate:** Heavy password hashing is throttled to a maximum of 4 concurrent worker threads to prevent process memory exhaustion.
2. **Glibc Arena Optimization:** Container execution environments set:
   ```bash
   export MALLOC_MMAP_THRESHOLD_=131072
   export MALLOC_ARENA_MAX=2
   ```
   This prevents glibc memory retention spikes, ensuring container memory remains under 250 MiB per worker replica under high load.
