# CITIMART Daily Operations — Engineering Implementation Plan (PLAN)

**Project Code:** CITIMART-OPS-2026  
**Status:** In Production  
**Deployment Model:** Split (Vercel Frontend + Render Backend + MongoDB Atlas)

---

## 1. Architectural Milestones

```
Phase 1: Database Migration & Schema Design [COMPLETED]
         ├── Migration from Postgres/Supabase to MongoDB Atlas
         ├── Collections: users, bills, footfall, nob, targets, requisitions, directives
         └── Compound indexes: (store, date), (username)

Phase 2: Authentication & RBAC Engine [COMPLETED]
         ├── PBKDF2-HMAC-SHA256 password hashing (600,000 iterations)
         ├── Local HS256 JWT bearer token issuance & stateless verification
         └── Password-less admin account switching ("View as Store Manager")

Phase 3: Live KPI Store & Manual Entry Engine [COMPLETED]
         ├── Real-time aggregation pipeline (daily_dashboard_store.py)
         ├── Consolidated timestamp row management (bills + footfall + NOB)
         └── Automated midnight finalizer background job (daily_midnight_job.py)

Phase 4: Store Operations Suite [COMPLETED]
         ├── Product requisitions workflow (requisitions_store.py)
         ├── Executive directives broadcast engine (directives_store.py)
         └── Multi-store comparative benchmark summary

Phase 5: AI Operations Copilot [COMPLETED]
         ├── Dual engine: Google Gemini Flash + Granular Domain Rule Engine
         ├── Multi-lingual support: English, Bengali, Hindi
         └── Live MongoDB context injection

Phase 6: Production Hardening & Security Compliance [COMPLETED]
         ├── Production-grade security spec check implementation
         ├── HTTP Security Headers (WEB-02, WEB-04)
         ├── Rate limiting on auth and chat (API-02)
         └── Upload safety limits (API-03 / INP-06)
```

---

## 2. Engineering Roadmap & Release Management
- **Pre-flight Testing:** Automated regression suite (162 tests) executed on all updates.
- **Rollout Strategy:** Zero-downtime rolling deploys on Render backend and Vercel edge CDN.
