# Security Report — CITIMART Daily Operations
Date: 2026-11-27 | Agent: Claude Code (Opus 5.5) | Mode: audit (no code changes) | Commit: 17d297f + uncommitted working tree (`api/routes_meta.py` `/status`, `SystemStatusIndicators.tsx`, UI restyle)

Re-audit of the 2026-11-25 report. Scope: the 2026-11-25 open items were re-verified, plus the code added since then (commits `fa497a1` and `17d297f`, and the uncommitted working tree).

## Summary
| Status | Count |   | Severity (open) | Count |
|---|---|---|---|---|
| PASS | 29 | | critical | 0 |
| FAIL | 5 | | high | 1 |
| PARTIAL | 11 | | medium | 7 |
| FIXED | 0 (2 from 2026-11-25 now committed → PASS) | | low | 7 (+3 minor, L1–L3) |
| CANNOT_VERIFY | 6 | | | |
| NEEDS_HUMAN | 4 | | | |
| N/A | 6 | | | |

**Release gate: NO-GO.** One high-severity issue is still open: vulnerable dependencies (SUP-01). Nothing has changed there since 2026-11-25.
**Tests:** `cd backend && pytest` → **568 passed, 1 failed**. The failure is not security-related: `test_advisor_tier3.py::test_brief_payload_mirrors_the_brief` expects "Guru Nanak's Jayanti", but the installed `holidays` package now returns "Guru Nanak's Birthday".
**Not reviewed in depth:** `streamlit_daily_app.py`, `scripts/`, `src/reports/renderers/*` internals, `src/advisor/*` maths, and anything that needs Render / Vercel / Atlas console access (marked CANNOT_VERIFY).

## What changed since 2026-11-25
- **Committed:** the two blocker fixes (directive impersonation, and the manager KPI override) are now in `fa497a1`. `routes_directives.py` and `routes_daily.py` have no uncommitted changes. AC-01, AC-02, AC-04 and API-07 are now **PASS**.
- **New:** `GET /api/meta/status` (uncommitted). It needs a login, but it shows infrastructure details to every role, and each call runs a live MongoDB ping (finding **N1**, below).
- **Secret scan of the new commits:** a regex scan over `git diff be53403..HEAD` found only `self._access_token = access_token` (a variable, not a secret). No `.env` or credential files are tracked.
- **Unchanged:** every other open item from 2026-11-25. Each one was re-checked in the current code; the line numbers below are current.

## Release blockers (critical/high open)
| ID | Title | Location | Risk (plain English) | Recommended fix |
|---|---|---|---|---|
| SUP-01 | Dependencies with known vulnerabilities | `backend/requirements.txt`, `frontend/package-lock.json` | pip-audit: 83 advisories in 5 packages. **pyjwt 2.10.1** (the auth library; fixes up to 2.14.0), **python-multipart 0.0.20** (parses the Excel upload; fix 0.0.31), pymongo 4.17.0, **pillow 12.3.0** (fix 13.0.0, a major bump), lupa 2.6 (test-only, no fix). npm audit `--omit=dev`: 23 (3 critical: maplibre-gl, proxy-addr, plus one more; 12 high incl. `vite` 8.2.x, `zod`, `undici`, `@modelcontextprotocol/sdk`). | Bump pyjwt, python-multipart and pymongo first (minor bumps), re-running `pytest` after each. Then run `npm audit fix` and `npm run build`. Pillow 13 needs owner approval. Move `lupa` and `shadcn` to dev-only. |

## Findings by severity (open, non-blocking)
| # | ID | Severity | Location | Finding | Fix |
|---|---|---|---|---|---|
| M1 | INP-09 | medium | `api/routes_daily.py:339-536` | The bill, footfall and NOB **add/edit/delete** routes accept **any date** for a manager. "Today only" is enforced in the UI alone. A manager can add, change or delete past-day sales for their own store through the API, and with M2 nothing records it. | For `role != admin`, reject dates other than today (IST) on add. On PUT/DELETE, look up the row's `entry_date` and apply the same rule. Add negative tests. |
| M2 | LOG-01 | medium | `api/routes_daily.py:339-566`; staff, stock, requisition and directive routes | No `audit_event` on bill/footfall/NOB writes, `save-entry`, staff create/update/attendance, stock inward/adjust/transfer, requisitions or directives. Logins, targets, KPI overrides, the advisor and alerts are audited. | Call `audit_event(user, action, store, row, before/after)` in each write route. |
| M3 | WEB-02 | medium | `app.py:113-124`, `frontend/vercel.json`, `nginx/nginx.conf` | **No Content-Security-Policy** in any layer. The other security headers are present. | Add a CSP in `Content-Security-Policy-Report-Only` mode first (`default-src 'self'; frame-ancestors 'none'; object-src 'none'`), then enforce it. |
| M4 | INP-01 | medium | `api/routes_daily.py:242,341,362,412,433,483,504,541,617` | Nine routes take `payload: dict = Body(...)` and coerce fields by hand: no unknown-field rejection, and `reason` (Remarks) has no length cap. | Use Pydantic models with `extra="forbid"`, `max_length` and `ge=0`. |
| M5 | AUTH-04 | medium | — | No MFA for the admin account. | NEEDS_HUMAN: decide on TOTP. |
| M6 | AI-03 | medium | `config/env.py` (Gemini, Tavily) | Per-user limiter and token caps exist. The vendor retention setting and its disclosure are unconfirmed. | NEEDS_HUMAN |
| M7 | SUP-02 | medium | `requirements.txt` | Not hash-locked; Vercel runs `npm install`, not `npm ci`. | `pip-compile --generate-hashes`; `npm ci`. |
| **N1** | API-01 / API-03 | low | `api/routes_meta.py:47-103` (uncommitted), `SystemStatusIndicators.tsx:74-79` | **New.** `/api/meta/status` returns the MongoDB database name, pool sizes, the DB exception class name, and server start time / uptime to **every logged-in user, including store managers**. Each call runs a live `db.command("ping")` with no rate limit, and every open tab polls it every 30 s. Atlas outages are bounded by the 8 s `serverSelectionTimeoutMS` (`db/engine.py:41`), but during one, each poll holds a threadpool thread for up to 8 s. | Return only `up/down` to managers and the details to admins only (`user.role == "admin"`). Cache the ping result for about 10 s at module level so polling never multiplies DB pings. |
| L-a | LOG-02 | low | `src/alerts/whatsapp_provider.py:79` | The dry-run log writes the full recipient phone number. | Mask to the last 4 digits. |
| L-b | INP-06 | low | `api/routes_targets.py` | The Excel upload's type is checked by extension only. It is admin-only, capped at 10 MB and parsed with `read_only`. | Check the ZIP magic bytes (`PK\x03\x04`). |
| L-c | AUTH-06 | low | `api/routes_auth.py` switch-account | An admin can switch to a manager session and back without re-auth (by design). | Consider step-up re-auth. |
| L-d | SUP-03 | low | `package.json`, `requirements.txt` | `shadcn` CLI is in runtime deps; `lupa` (test) is in prod requirements. | Move to dev. |
| L-e | SUP-04 | low | — | No SBOM. | `cyclonedx-py` / `@cyclonedx/cyclonedx-npm` per release. |
| L1 | AC-02 | low | `routes_directives.py:127,160`; `directives_store.py:60` | Directive ownership also matches when the username appears as a **substring of `author_title`**. The manager list query regex-matches the store code inside `author_title`. | Use `created_by_user` only. |
| L2 | AC-02 | low | notifications `mark_read` | 404 vs 403 on sequential IDs reveals which notifications exist (not their content). | Return 404 for both. |
| L3 | — | low | `routes_auth.py` switch-account | The 404 echoes the target username (admin-only). | Generic message. |

## All checks
| ID | Title | Applies | Status | Severity | Evidence | Notes / fix |
|---|---|---|---|---|---|---|
| SEC-01 | No secrets in source / bundles | ALL | PASS | — | Working-tree + new-commit regex scan clean; no `VITE_*` secrets | |
| SEC-02 | Env vars handled safely | ALL | PASS | — | `.env` ignored and docker-ignored; no `.env` tracked (`git ls-files`); prod refuses dev JWT secret (`config/env.py`) | `backend/CREDENTIALS.txt` holds live passwords locally (untracked) |
| SEC-03 | No secrets in Git history | ALL | PASS | — | 2026-11-25 full-history scan + `be53403..HEAD` scan today | gitleaks not installed; regex only |
| SEC-04 | Secrets management / rotation | BACKEND | CANNOT_VERIFY | high | Render/Vercel env | Rotation runbook needed |
| AUTH-01 | Secure authentication | HAS_AUTH | PASS | — | Generic errors, dummy hash for unknown users, IP + account failure limits (`src/rate_limiter.py`) | |
| AUTH-02 | Password storage | HAS_AUTH | PASS | — | Argon2id (`src/user_store.py`), min length 12 | |
| AUTH-03 | Password reset | HAS_AUTH | N/A | — | No self-service reset | |
| AUTH-04 | MFA for admin | HAS_ADMIN | FAIL | medium | None | M5 |
| AUTH-05 | Session / token security | HAS_AUTH | PASS | — | 15-min HS256 with iss/aud/sid; HttpOnly+Secure+Lax rotating refresh cookie | sid optional unless `ENVIRONMENT=production` |
| AUTH-06 | Takeover / session list | HAS_AUTH | PARTIAL | low | Session list/revoke present | L-c |
| AC-01 | Admin functions server-side | HAS_ADMIN | PASS | — | `app.py:350-352` admin routers; `routes_daily.py:244,280` kpi-override `require_admin` (committed `fa497a1`) | |
| AC-02 | Object-level authorization | BACKEND | PASS | — | `_guard` → `require_store_access` on every daily route (`routes_daily.py:45-52`); `_id`+`store_code` scoped updates; directives pinned (`routes_directives.py:95,108`) | L1, L2 low |
| AC-03 | Mass assignment | BACKEND | PASS | — | Directive allow-list `directives_store.py:101`; author fields popped on manager PUT `routes_directives.py:139` | |
| AC-04 | Function-level / tenant isolation | HAS_API | PASS | — | Every router under `_authed`/`_admin_only` (`app.py:338-352`); store from token | Was PARTIAL; directive fix committed |
| AC-05 | Least privilege | BACKEND | CANNOT_VERIFY | high | Atlas user role not in repo | |
| INP-01 | Server-side validation | BACKEND | PARTIAL | medium | 9 `dict` bodies in `routes_daily.py` | M4 |
| INP-02 | SQL injection | DATABASE | N/A | — | MongoDB only | |
| INP-03 | Other injection | BACKEND | PASS | — | Store codes validated before queries; `fromisoformat` parsing; no eval/exec/pickle | |
| INP-04 | XSS | WEB_FRONTEND | PASS | — | No `dangerouslySetInnerHTML`/`innerHTML` in `frontend/src`; new `SystemStatusIndicators.tsx` renders text only | |
| INP-05 | CSRF | cookie auth | PASS | — | Bearer-header auth; refresh cookie path-scoped, SameSite=Lax | |
| INP-06 | File uploads | FILE_UPLOAD | PARTIAL | low | 10 MB cap, admin-only | L-b |
| INP-07 | SSRF | OUTBOUND_FETCH | N/A | — | Fixed outbound hosts only | |
| INP-08 | Open redirect | WEB_FRONTEND | PASS | — | No server redirects; in-app links allow-listed | |
| INP-09 | Business logic integrity | limits | FAIL | medium | Any-date writes, `routes_daily.py:339-536` | M1 |
| INP-10 | Fail closed | BACKEND | PASS | — | Session store down → 503 (`api/auth.py`) | |
| WEB-01 | HTTPS / HSTS | WEB | PARTIAL | high | HSTS in `app.py:123`; nginx HSTS commented (`nginx.conf:65`) | Live TLS CANNOT_VERIFY |
| WEB-02 | Security headers | WEB_FRONTEND | FAIL | medium | No CSP anywhere | M3 |
| WEB-03 | CORS | HAS_API | PASS | — | Off by default, `allow_credentials=False` | |
| WEB-04 | Clickjacking | WEB_FRONTEND | PASS | — | `X-Frame-Options: DENY` (`app.py:119`, `vercel.json:26`, `nginx.conf:61`) | |
| WEB-05 | Third-party scripts | external | PASS | — | None | |
| WEB-06 | Front-end hardening | WEB_FRONTEND | PASS | — | `target="_blank"` links carry `rel="noopener noreferrer"`; localStorage holds UI prefs + chat session id only, no tokens | |
| API-01 | Every endpoint secured | HAS_API | PARTIAL | low | All routers authed | N1 (status endpoint over-shares to managers) |
| API-02 | Rate limiting | HAS_API | PASS | — | Login, chat, advisor limiters; nginx `limit_req` | |
| API-03 | Resource limits | HAS_API | PARTIAL | low | Upload + list caps | N1 unthrottled DB ping; requisition `items` unbounded |
| API-04/05/06 | GraphQL / WS / Payments | — | N/A | — | Not present | |
| API-07 | API inventory | HAS_API | PASS | — | kpi-override now admin-gated + audited | Was FAIL |
| SUP-01 | Vulnerable dependencies | ALL | FAIL | high | pip-audit 83 / npm audit 23 (today) | Blocker |
| SUP-02 | Lockfiles | ALL | PARTIAL | medium | npm lock committed; pip not hashed | M7 |
| SUP-03 | Unused deps | ALL | PARTIAL | low | | L-d |
| SUP-04 | SBOM | ALL | FAIL | low | | L-e |
| SUP-05/06 | CI | CI | N/A | — | No workflows | Recommend Part 6.2 workflow |
| SUP-07 | Image signing | CONTAINERS | CANNOT_VERIFY | high | | |
| SUP-08 | Environment separation | BACKEND | NEEDS_HUMAN | high | | Confirm `ENVIRONMENT=production` on Render |
| INFRA-01 | Debug / docs off in prod | BACKEND | CANNOT_VERIFY | high | Docs gated on `ENVIRONMENT` | Same as SUP-08 |
| INFRA-02 | No exposed files | BACKEND | PASS | — | SPA fallback path-contained; `.dockerignore` | |
| INFRA-03 | Database secured | DATABASE | CANNOT_VERIFY | critical | Atlas console | Confirm IP access list ≠ `0.0.0.0/0` |
| INFRA-06 | Containers | CONTAINERS | PASS | — | Pinned slim image, non-root, healthcheck | |
| CRYPTO-01 | TLS everywhere | ALL | PASS | — | No `verify=False`/insecure overrides | |
| CRYPTO-04 | JWT secret strength | JWT | PASS | — | 64-char secret; dev default refused in prod | No `kid` rotation |
| CRYPTO-05 | Algorithms / randomness | ALL | PASS | — | `secrets.*`, Argon2id, HS256 pinned | |
| CRYPTO-06 | Backups | DATABASE | CANNOT_VERIFY | high | Atlas console | |
| PRIV-01 | Personal data inventory | PII | NEEDS_HUMAN | high | Staff name/phone/email, attendance, WhatsApp numbers, chat transcripts, session IP/UA | |
| PRIV-02/04/08 | Notice / rights / breach | PII | NEEDS_HUMAN | high | No staff-data delete/export path | DPDP review |
| LOG-01 | Audit logging | BACKEND | PARTIAL | medium | | M2 |
| LOG-02 | No PII in logs | ALL | PARTIAL | low | | L-a |
| LOG-05 / DESIGN-01 | Runbook / threat model | ALL | NEEDS_HUMAN | high | None under `Daily Operations/security/` | The repo-root `security/RUNBOOK.md` + `THREAT_MODEL.md` (2026-10-30) predate the split; adapt them |
| AI-01 | Prompt injection / tools | AI_LLM | PASS | — | Read-only tools, server-built `SecurityContext` | |
| AI-02 | Output handling | AI_LLM | PASS | — | Model links allow-listed (`AiChatbot.tsx:657-684`) | |
| AI-03 | Provider cost / privacy | AI_LLM | PARTIAL | medium | Limiter + caps + 8000-char input cap | M6 |
| MSG-01 | Messaging safety | EMAIL_SMS | PASS | — | Fixed provider hosts; admin-only validated recipients | |
| MOB/DESK/GAME/CMS/IAC | — | — | N/A | — | Not present | |

## Changes made
None. This was an audit-only run. The only file written is this report.

## Human actions required
| Priority | Action | Why | Where |
|---|---|---|---|
| 1 | Approve dependency bumps (pyjwt → 2.14, python-multipart → 0.0.31, pymongo 4.18; pillow 13 major; `npm audit fix`) | Release blocker; CVEs in the auth and upload path | `requirements.txt`, `package.json` |
| 2 | Decide on fixing M1 + M2 (today-only writes for managers, audit on log writes) | A manager can rewrite past sales without a trace | `routes_daily.py` |
| 3 | Scope `/api/meta/status` details to admin before committing it | N1 | `routes_meta.py` (uncommitted) |
| 4 | Confirm `ENVIRONMENT=production` on Render | Otherwise `/docs` is public and sid-less tokens are accepted | Render dashboard |
| 5 | Confirm Atlas network access list + DB user role | INFRA-03 / AC-05 | Atlas console |
| 6 | Decide on admin MFA; adapt RUNBOOK / THREAT_MODEL for this sub-project | AUTH-04, LOG-05, DESIGN-01 | `security/` |

## Legal / privacy items for review
| ID | Question for owner/lawyer |
|---|---|
| PRIV-01/04 | Staff phone/email and attendance are personal data under the DPDP Act. What retention applies, and how does a former employee get their data deleted? |
| PRIV-07 | Chat questions go to Google Gemini and optionally Tavily. Is this covered in the privacy notice and vendor terms? |
| PRIV-08 | Who files CERT-In 6-hour incident reports for this system? |

## Residual risk
This report reflects checks performed on 2026-11-27 against `Production-grade-Security-checks-spec-check.md`. It is not a guarantee that the project cannot be compromised. Re-run after significant changes and before each release.
