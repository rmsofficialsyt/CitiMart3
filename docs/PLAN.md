# CITIMART Daily Operations — Engineering Implementation Plan (PLAN)

![Plan](https://img.shields.io/badge/CITIMART-Engineering%20Plan-00D26A?style=for-the-badge&logo=buffer&logoColor=white)
![Status](https://img.shields.io/badge/Status-Completed%20&%20Maintained-success?style=for-the-badge)
![Deployment](https://img.shields.io/badge/Deployment-Split%20Topology-purple?style=for-the-badge)

> **Architectural Milestones, Technical Implementation Roadmap & Deployment Plan**  
> Governed by [docs/CONSTITUTION.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/CONSTITUTION.md) and [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md).

---

## 📑 Engineering Implementation Blueprint
1. [Architectural Milestones & Deliverables](#1-architectural-milestones--deliverables)
2. [Data Layer & Persistence Plan](#2-data-layer--persistence-plan)
3. [Security & Access Control Implementation](#3-security--access-control-implementation)
4. [Deployment & Rollout Topology](#4-deployment--rollout-topology)
5. [Verification & Maintenance Protocol](#5-verification--maintenance-protocol)

---

## 1. Architectural Milestones & Deliverables

```
Phase 1: Persistence & Schema Hardening [COMPLETED]
         ├── MongoDB Atlas collections: bills, footfall, nob, targets, directives, requisitions
         └── Compound ESR indexing: (store_id, date, timestamp), (username)

Phase 2: Authentication & Multi-Tenant Security [COMPLETED]
         ├── Argon2id password hashing & PBKDF2 automatic upgrade
         ├── Dual-tier token architecture: HS256 JWTs + rotating HttpOnly cookies
         └── Server-revocable session registry in Redis 7.4 (AUTH-05)

Phase 3: Live KPI Store & Manual Entry Engine [COMPLETED]
         ├── Sub-10ms write-evicted L2 cache in Redis
         ├── Unified row logger with atomic edit and delete actions
         └── Automated midnight finalization background worker

Phase 4: Store Operations & Executive Governance [COMPLETED]
         ├── Out-of-stock merchandise requisition tickets
         ├── Executive directives broadcast engine with read receipts
         └── Cross-store comparative benchmark summary

Phase 5: Autonomous Multilingual AI Copilot [COMPLETED]
         ├── Trilingual natural language engine (English, Bengali, Hindi)
         ├── Real-time MongoDB context injection
         └── Mathematical anti-hallucination verification gate

Phase 6: High-Concurrency & L7 Gateway [COMPLETED]
         ├── Nginx reverse proxy with dynamic Docker DNS resolution
         ├── Sliding-window rate limiters on login and chat
         └── Full 240+ test automated pytest verification suite
```

---

## 2. Data Layer & Persistence Plan

* **MongoDB Atlas Replica Set:** Primary transactional store hosted in AWS/GCP Mumbai region.
* **Redis 7.4 Cluster:** Fast-path session storage, distributed rate limit tracking, write-evicted L2 cache, and distributed locks.
* **Compound ESR Indexing:** All queries execute in RAM with zero disk-scan bottlenecks.

---

## 3. Security & Access Control Implementation

* **Multi-Tenant Store Boundary:** Every store route strictly enforces `require_store_access(store_code, current_user)`.
* **Zero Secret Commits:** Secrets reside strictly in `backend/.env`.
* **Defense-in-Depth Rate Limiting:** Nginx edge limiter (200 r/s) + Redis sliding-window limiter (5 attempts per IP/account).

---

## 4. Deployment & Rollout Topology

* **Production Frontend:** Deployed to Vercel global CDN with transparent `/api/*` reverse-proxy rewrites.
* **Production Backend:** Containerized FastAPI ASGI instances on Render with automated horizontal scaling.
* **On-Premise / Self-Hosted Alternative:** Multi-replica Docker Compose stack (`docker compose --scale backend=3 --scale worker=2`).

---

## 5. Verification & Maintenance Protocol

* **Automated Regression Suite:** 240+ pytest tests executed before any commit or release.
* **Frontend Typechecking:** TypeScript strict build (`tsc -b && vite build`) executed on all UI modifications.
* **Continuous Monitoring:** Centralized structured logs in `logs/` stamped with `X-Correlation-ID`.
