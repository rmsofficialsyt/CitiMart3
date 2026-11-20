# CITIMART Daily Operations — Technology Stack Specification (TECH-STACKS)

![Stack](https://img.shields.io/badge/CITIMART-Technology%20Stack-00D26A?style=for-the-badge&logo=stackshare&logoColor=white)
![Version](https://img.shields.io/badge/Stack%20Version-2026.3-blue?style=for-the-badge)
![Topology](https://img.shields.io/badge/Topology-Multi--Tier%20Distributed-purple?style=for-the-badge)

> **Exhaustive Technical Stack & Dependency Specification**  
> Covers runtime environments, libraries, database engines, distributed message brokers, and infrastructure specifications.

---

## 📑 Stack Component Catalog
1. [Backend Service Technologies](#1-backend-service-technologies)
2. [Frontend Application Technologies](#2-frontend-application-technologies)
3. [Infrastructure & Distributed Systems](#3-infrastructure--distributed-systems)
4. [Testing & Quality Assurance Stack](#4-testing--quality-assurance-stack)

---

## 1. Backend Service Technologies

| Component | Selected Technology | Version | Purpose in Architecture |
|:---|:---|:---|:---|
| **Runtime** | Python | `3.11+` | Asynchronous non-blocking runtime with native type hints |
| **API Framework** | FastAPI | `0.115+` | High-throughput REST API with automatic OpenAPI 3.1 generation |
| **ASGI Server** | Uvicorn / Gunicorn | `0.30+` | Production ASGI worker management |
| **Schema Validation** | Pydantic | `v2.8+` | Runtime type validation, constraints, and JSON schema parsing |
| **Database Driver** | PyMongo | `4.8+` | MongoDB Atlas client with pooled TCP connections |
| **In-Memory Cache** | redis-py (with hiredis) | `5.2.1` | High-speed C-optimized Redis driver for sessions & rate limits |
| **Job Queue** | BullMQ (Python) | `2.14.0` | Asynchronous queue producer and worker framework |
| **Auth & Crypto** | PyJWT & argon2-cffi | `2.10` / `23.1` | `HS256` token signing & Argon2id password hashing (`AUTH-02`) |
| **Spreadsheet Engine** | OpenPyXL | `3.1.5` | Parsing uploaded sales targets & rendering `.xlsx` reports |
| **Document Engine** | ReportLab & Kaleido | `4.2` / `1.3` | Certified PDF compilation and headless chart rasterization |
| **AI LLM Gateway** | Google GenAI SDK | `1.0+` | Multilingual retail intelligence copilot |

---

## 2. Frontend Application Technologies

| Component | Selected Technology | Version | Purpose in Architecture |
|:---|:---|:---|:---|
| **View Engine** | React | `18.3.1` | Component-driven declarative user interface |
| **Language** | TypeScript | `5.5+` | Compile-time type checking and contract safety |
| **Bundler & HMR** | Vite | `5.0+` / `8.2+` | Sub-second Hot Module Replacement and production bundling |
| **CSS System** | Tailwind CSS | `v4.0` | Utility-first design tokens with high-contrast palette |
| **Server State** | TanStack React Query | `v5.0` | Cache invalidation, background refetching & optimistic updates |
| **Client State** | React Context API | Native | Store tenant context, auth token injection & profile state |
| **Iconography** | Lucide React | `0.400+` | Lightweight tree-shakable SVG icon components |
| **Data Visualization**| Plotly.js & Recharts | Latest | Glossy circular gauges & 4-timeslot pacing charts |
| **Toast Alerts** | Sonner | Latest | Non-intrusive operational notification toasts |

---

## 3. Infrastructure & Distributed Systems

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DISTRIBUTED INFRASTRUCTURE                            │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ Layer                │ Technology           │ Operational Specification     │
├──────────────────────┼──────────────────────┼───────────────────────────────┤
│ Reverse Proxy & L7   │ Nginx 1.27+          │ Least-conn load balancing     │
│ Database             │ MongoDB Atlas        │ M0/M10 replica set (Mumbai)   │
│ In-Memory Datastore  │ Redis 7.4 Cluster    │ Sessions, rate limits, caches │
│ Frontend CDN         │ Vercel Edge Network  │ Global CDN + /api/* proxy     │
│ Backend Hosting      │ Render Web Services  │ Containerized Linux instances │
│ Container Orchestrator│ Docker Compose      │ Multi-replica local & staging │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
```

---

## 4. Testing & Quality Assurance Stack

* **Test Framework:** `pytest 9.1+`
* **In-Memory Database Mock:** `mongomock 4.3+` (executes database tests with zero network latency)
* **In-Memory Redis Mock:** `fakeredis 2.26+` with `lupa 2.6+` (executes Lua rate limiting and token rotation scripts in-memory)
* **HTTP Test Transport:** `httpx 0.28+` TestClient
* **Frontend Typechecker:** `tsc -b` (TypeScript build compiler)
* **Frontend Linter:** `oxlint` / ESLint
