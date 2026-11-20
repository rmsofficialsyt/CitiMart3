# CITIMART Daily Operations — Engineering Rules & Disciplines (RULES)

![Rules](https://img.shields.io/badge/CITIMART-Engineering%20Rules-00D26A?style=for-the-badge&logo=codewars&logoColor=white)
![Discipline](https://img.shields.io/badge/Discipline-Strict%20Enforcement-red?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-OWASP%20Compliant-blue?style=for-the-badge)

> **Mandatory Operating Standards for Contributors & Autonomous AI Coding Agents**  
> Follow [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md) and [docs/CONSTITUTION.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/CONSTITUTION.md) without exception.

---

## 📑 Table of Rules
1. [Core Non-Negotiables](#1-core-non-negotiables)
2. [Multi-Tenant Store Scoping (IDOR / BOLA Prevention)](#2-multi-tenant-store-scoping-idor--bola-prevention)
3. [Administrative Privilege Verification](#3-administrative-privilege-verification)
4. [Secret Hygiene & Git Safety](#4-secret-hygiene--git-safety)
5. [Karpathy Guidelines (Anti-Hallucination & Focus)](#5-karpathy-guidelines-anti-hallucination--focus)
6. [Ponytail Restraint Ladder (Anti-Overengineering)](#6-ponytail-restraint-ladder-anti-overengineering)
7. [The 5 Quality Gates](#7-the-5-quality-gates)

---

## 1. Core Non-Negotiables

* **Rule 1.1:** Store managers (`new_market`, `hatibagan`, `chowringhee`) must **never** read, write, or infer figures belonging to another store.
* **Rule 1.2:** Every operational route must be protected by authentication: `Depends(get_current_user)`.
* **Rule 1.3:** Operational data entry is strictly constrained to **10:30 AM – 11:59 PM**. Entries outside this boundary must be rejected by Pydantic validation.
* **Rule 1.4:** Passwords must be hashed using **Argon2id** (`AUTH-02`).

---

## 2. Multi-Tenant Store Scoping (IDOR / BOLA Prevention)

Every endpoint handling store-specific telemetry must enforce strict tenant isolation:

```python
# Enforced pattern across all routes_*.py:
def require_store_access(store_code: str, current_user: UserContext):
    if current_user.role == "admin":
        return
    if current_user.store_code != store_code:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: Account '{current_user.username}' is not authorized for store '{store_code}'."
        )
```

At the persistence layer, all MongoDB collection queries must include `{"store_id": store_code}`.

---

## 3. Administrative Privilege Verification

* Endpoints that mutate sales targets (`PUT /api/targets/*`), broadcast executive directives (`POST /api/directives`), or switch accounts (`POST /api/auth/switch-account`) must declare `Depends(require_admin)`.
* Client-side UI gates (hiding buttons) are strictly cosmetic; server-side token inspection is mandatory.

---

## 4. Secret Hygiene & Git Safety

* **Zero Secret Commits:** Secrets, MongoDB Atlas connection strings, JWT signing keys, and Redis passwords must strictly live in `backend/.env`.
* **Git Exclusion:** Verify that `*.env`, `CREDENTIALS*.txt`, and `LOGIN_CREDENTIALS*.txt` remain permanently git-ignored.
* **Single .env Rule:** There is strictly ONE authoritative environment file: `Daily Operations/backend/.env`.

---

## 5. Karpathy Guidelines (Anti-Hallucination & Focus)

1. **Don't Assume — Don't Hide Confusion:** Clarify ambiguous requirements immediately rather than guessing.
2. **Minimum Code that Solves the Problem:** Zero speculative abstractions, unused utility helpers, or unrequested features.
3. **Touch Only What You Must:** Do not reformat untouched code, reorganize imports, or edit unrelated files.
4. **Define & Execute Success Criteria:** Formulate explicit verification commands (tests, curl, typecheck) and verify green before declaring completion.

---

## 6. Ponytail Restraint Ladder (Anti-Overengineering)

When considering any code addition, climb the restraint ladder:
1. *Does this need to exist?* If no, skip (YAGNI).
2. *Is it already in this codebase?* Reuse existing helpers and patterns.
3. *Does the standard library do it?* Use Python / TypeScript standard libraries first.
4. *Does a native platform feature cover it?* Use native browser / OS capabilities.
5. *Does an already-installed dependency solve it?* Never introduce new dependencies for simple utilities.
6. *Can it be written in a few clean lines?* Write the minimal, direct solution.

---

## 7. The 5 Quality Gates

Hold all git commits until all 5 gates pass:
```
[ Gate 1: Task ]     ──► Implement strictly against specification requirements
[ Gate 2: Build ]    ──► TypeScript compiles (`tsc -b`), Vite bundles, Python compileall passes
[ Gate 3: Validate ] ──► Linting passes with zero warnings (ESLint / Oxlint)
[ Gate 4: Test ]     ──► Pytest suite passes 100% with zero regressions (240+ tests)
[ Gate 5: Review ]   ──► Verify zero secret leaks and strict multi-tenant tenant isolation
```
