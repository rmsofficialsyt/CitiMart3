# CITIMART Daily Operations — Engineering Constitution (CONSTITUTION)

![Constitution](https://img.shields.io/badge/CITIMART-Constitution-00D26A?style=for-the-badge&logo=shield&logoColor=white)
![Status](https://img.shields.io/badge/Status-Binding%20Bylaws-blue?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-Strict%20Enforcement-red?style=for-the-badge)

> **Preamble:** This document codifies the immutable constitutional laws governing all architectural decisions, code changes, and operational protocols for the **CITIMART Daily Operations** platform. Every engineer, contributor, and autonomous AI agent must adhere strictly to these bylaws without exception.

---

## 📑 Table of Commandments
1. [The 10 Core Commandments](#-the-10-core-commandments)
2. [Architectural Invariants](#-architectural-invariants)
3. [Security & Multi-Tenant Boundaries](#-security--multi-tenant-boundaries)
4. [Performance & Concurrency Mandates](#-performance--concurrency-mandates)
5. [Automated Quality Verification](#-automated-quality-verification)
6. [Constitutional Amendments Procedure](#-constitutional-amendments-procedure)

---

## ⚖️ The 10 Core Commandments

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THE 10 CONSTITUTIONAL COMMANDMENTS                       │
├────┬─────────────────────────────┬──────────────────────────────────────────┤
│ #  │ Commandment                 │ Constitutional Invariant                 │
├────┼─────────────────────────────┼──────────────────────────────────────────┤
│ I  │ Law of Store Sovereignty    │ Zero cross-store telemetry leakage (IDOR)│
│ II │ Law of Zero Workbooks       │ 100% MongoDB Atlas & Redis; zero Excel   │
│ III│ Law of Single Environment   │ Exactly one .env at backend/.env         │
│ IV │ Law of Administrative Gate  │ Admin-only target & directive mutations  │
│ V  │ Law of Secret Hygiene       │ Zero secret commits; enforce .gitignore  │
│ VI │ Law of Sub-10ms Hot Path    │ Write-evicted Redis L2 hot-path cache    │
│ VII│ Law of Session Revocation   │ Server-revocable sessions in Redis       │
│VIII│ Law of High Availability    │ Workers never crash main FastAPI process │
│ IX │ Law of 5 Quality Gates      │ Task -> Build -> Validate -> Test -> Rev │
│ X  │ Law of Human Push Gate      │ Explicit user confirmation before push   │
└────┴─────────────────────────────┴──────────────────────────────────────────┘
```

---

## 🏛️ Section 1: Architectural Invariants

### Article 1.1: The Zero-Workbook Principle
* The Daily Operations sub-project exists independently of any static historical dataset (`DATASET.xlsx`).
* All operational calculations (Net Sales, Deficit Gap, ATV, RPV, Conversion Rate) must read from and write to **MongoDB Atlas** and **Redis** at request time.
* Never import `src/data_loader.py` or historical workbook engines into this sub-project.

### Article 1.2: The Single Authoritative Environment Config
* There is strictly **ONE** authoritative environment configuration file: `Daily Operations/backend/.env`.
* Creating duplicate `.env` files at the root of `Daily Operations/` is unconstitutional and strictly prohibited.

### Article 1.3: Synchronized Shared Contracts
* Core shared configuration modules duplicated between sub-projects must remain byte-for-byte synchronized:
  * `src/theme.py` (Color mappings & hex codes)
  * `config/kpi_thresholds.py` (Red / Yellow / Green status threshold bands)
  * `config/settings.py` (Store codes `NM`, `HB`, `CHW`, and `TIME_SLOT_ORDER`)
  * `src/formatting.py` (Currency `₹`, percentages, and numbers)

---

## 🔒 Section 2: Security & Multi-Tenant Boundaries

### Article 2.1: Store Sovereignty & BOLA/IDOR Elimination
* Store managers are bound strictly to their designated store identity:
  * `new_market` $\to$ **New Market (`NM`)**
  * `hatibagan` $\to$ **Hatibagan (`HB`)**
  * `chowringhee` $\to$ **Chowringhee (`CHW`)**
* Every store-scoped endpoint must invoke server-side authorization:
  ```python
  require_store_access(store_code, current_user)
  ```
* Every database query must inject `{"store_id": store_code}` at the query layer.

### Article 2.2: Dual-Tier Token Lifecycle (AUTH-05)
* Access tokens are short-lived `HS256` Bearer JWTs ($\le 15$ minutes).
* Refresh tokens are server-revocable, rotating tokens stored in secure `HttpOnly` cookies and tracked in the Redis session registry (`session:<sid>`).
* Logout must immediately invalidate the session key in Redis, rejecting further access token use across all load-balanced replicas.

---

## ⚡ Section 3: Performance & Concurrency Mandates

### Article 3.1: Sub-10ms Telemetry Response
* Core operational dashboard endpoints (`GET /api/daily/stores/{store_id}/summary`) must resolve within **1–10 ms** under normal load using Redis L2 caching.

### Article 3.2: Write-Evicted Cache Invalidation (PERF-01)
* Any mutating action (logging bills, footfall, NOB, or targets) must instantly evict the corresponding Redis and local memory cache keys across all replicas.

### Article 3.3: Database Indexing Law (MongoDB ESR Rule)
* All compound indexes in MongoDB Atlas must strictly satisfy the **Equality $\to$ Sort $\to$ Range (ESR)** structure to guarantee RAM execution.

---

## 🧪 Section 4: Automated Quality Verification

### Article 4.1: The 5 Quality Gates
Before any code modification may be committed to version control, it must pass the 5-Gate Lifecycle:
1. **Gate 1 (Task):** Adhere to PRD and specification requirements.
2. **Gate 2 (Build):** TypeScript compiles cleanly (`tsc -b && vite build`); Python passes `compileall`.
3. **Gate 3 (Validate):** Linting and security checks pass without warnings.
4. **Gate 4 (Test):** The complete Pytest test suite (240+ tests) passes with 100% success.
5. **Gate 5 (Review):** Verify absence of secrets, verify multi-tenant isolation, and complete code-review checklist.

### Article 4.2: Human Push Gate
* Under no circumstances may an automated agent execute `git push` or `git branch -d` without explicit, real-time user confirmation.

---

## 📜 Section 5: Constitutional Amendments Procedure

* Any amendment to this Constitution requires unanimous architectural consensus between the Lead Engineer, Security Officer, and Central Operations Directorate.
* An amended constitution must be version-incremented and documented in `Daily Operations/docs/ARCHITECTURE.md`.
