# Security Report — CITIMART Daily Operations
Date: 2026-11-25 | Agent: Claude Code (Opus 5.5) | Mode: audit, then fix for blockers #1 and #2 | Commit: be53403 + uncommitted working tree (advisor / alerts / notifications)

## Summary
| Status | Count |   | Severity (open) | Count |
|---|---|---|---|---|
| PASS | 24 | | critical | 0 |
| FAIL | 4 | | high | 1 |
| PARTIAL | 5 | | medium | 5 |
| FIXED | 2 | | low | 5 |
| CANNOT_VERIFY | 6 | | | |
| NEEDS_HUMAN | 5 | | | |
| N/A | 22 | | | |

**Release gate: NO-GO.** One high-severity issue is still open: vulnerable dependencies (SUP-01). Directive impersonation and the store-manager KPI override are fixed and re-verified.
**Tests:** `cd backend && pytest` → 553 passed before fixes, 558 passed after (5 new negative tests).
**Not reviewed in depth:** `streamlit_daily_app.py` (local read-only), `scripts/`, `src/reports/renderers/*` internals, `src/advisor/*` maths. Also anything that needs Render / Vercel / Atlas console access (marked CANNOT_VERIFY).

## Release blockers (critical/high open)
| ID | Title | Location | Risk (plain English) | Recommended fix |
|---|---|---|---|---|
| ~~AC-02 / AC-04~~ **FIXED** | Store managers can post fake "Operational Head" directives to other stores | `backend/api/routes_directives.py:71-75`, `:30-31`, `:112`; `src/directives_store.py:23-37` | A manager can send POST /api/daily/directives with `target_store: "HB"` (or another store, or `ADMIN`) and `author_name: "Operational Head"`. Only `ALL` is rewritten to their own store. The target store's manager then sees what looks like an executive instruction (e.g. a priority "urgent" sales-target change). The response never shows who actually created it (`created_by_user` is dropped). A manager can also retarget their own directive to `ALL` through PUT. | For non-admins: pin `target_store` to the user's own store or `ADMIN`, ignore client-sent `author_name` / `author_title`, and reject `target_store` on PUT. Return `created_by_role` so the UI can label manager-authored items. Add a two-user negative test. |
| ~~AC-01 / INP-09~~ **FIXED** | Store managers can overwrite their own store's ratio KPIs, including Achievement %, for any date | `backend/api/routes_daily.py:236-275` → `daily_dashboard_store.set_kpi_override` | The UI was removed, but the API still accepts managers (only `_guard`, no `require_admin`). A manager can set their store's Achievement % / Conversion % / ATV for any past or present date. The override flows into the dashboard the admin views, the gauges, PDF/XLSX exports and the midnight snapshot. Nothing is audited. | Add `Depends(require_admin)` to both routes, or remove them until the admin tool exists. Add `audit_event` on set/clear. Add a negative test (manager → 403). |
| SUP-01 | Dependencies with known vulnerabilities | `backend/requirements.txt`, `frontend/package.json` / lockfile | pip-audit: **pyjwt 2.10.1** (22 advisories, fix 2.12.x; this is the auth library), **python-multipart 0.0.20** (12, fix ≥0.0.22; parses the Excel upload), pymongo 4.17.0 (5, fix 4.18.x), **pillow 12.3.0** (42, fix 13.0.0), lupa 2.6 (2, no fix; test-only fakeredis Lua, so move it to a dev requirements file). npm audit (prod tree): 3 critical (plotly.js, maplibre-gl, proxy-addr), 12 high, including direct `vite` (dev server only) and `shadcn` (a CLI listed under `dependencies`). | Bump to the minimal fixed versions one at a time, re-running `pytest` and `npm run build` after each. Move `shadcn` and `lupa` to dev-only. Major bumps (pillow 13) need owner approval. |

## All checks
| ID | Title | Applies | Status | Severity | Evidence | Notes / fix |
|---|---|---|---|---|---|---|
| SEC-01 | No secrets in source / bundles | ALL | PASS | — | Working-tree grep finds only placeholders; `INSECURE_JWT_SECRET_DEFAULT` is a documented dev value refused in prod (`config/env.py:27,261-277`) | Frontend uses no `VITE_*` secrets |
| SEC-02 | Env vars handled safely | ALL | PASS | — | `.env` ignored (`backend/.gitignore:10`, `.gitignore` root) and docker-ignored (`backend/.dockerignore:2`); startup guard `config/env.py:261`; local `JWT_SECRET` is 64 chars | `CREDENTIALS.txt` holds live passwords locally (ignored in git + docker). Keep it off shared drives |
| SEC-03 | No secrets in Git history | ALL | PASS | — | `git log --all -p` regex scan: only `JWT_SECRET=your****`, `test****`, doc example URI | gitleaks not installed; regex scan only |
| SEC-04 | Secrets management / rotation | BACKEND | CANNOT_VERIFY | high | Secrets come from Render/Vercel env | Write a rotation runbook (JWT_SECRET, Atlas, Gemini, WhatsApp/Twilio) |
| AUTH-01 | Secure authentication | HAS_AUTH | PASS | — | Generic error `routes_auth.py:54,149`; dummy hash for unknown user `:142`; IP + per-account failure limits `src/rate_limiter.py` | |
| AUTH-02 | Password storage | HAS_AUTH | PASS | — | Argon2id `src/user_store.py:38-84`, legacy PBKDF2 rehash on login `routes_auth.py:150`; min length 12 `src/password_policy.py:11` | |
| AUTH-03 | Password reset | HAS_AUTH | N/A | — | No self-service reset; four fixed accounts reseeded by an operator | |
| AUTH-04 | MFA for admin | HAS_ADMIN | FAIL | medium | No TOTP/WebAuthn anywhere | NEEDS_HUMAN: decide on TOTP for the admin account |
| AUTH-05 | Session / token security | HAS_AUTH | PASS | — | 15-min HS256 with fixed alg, iss/aud, `sid` checked against server session `api/auth.py:74-126`; refresh cookie HttpOnly + Secure + Lax + path-scoped and rotating `routes_auth.py:77-86,168`; access token kept in memory only | sid-less tokens accepted unless `ENVIRONMENT=production` (see INFRA-01) |
| AUTH-06 | Takeover protection / session list | HAS_AUTH | PARTIAL | low | Session list/revoke `routes_auth.py:230-268` | A switched-to manager session can return to admin without re-auth (`routes_auth.py:306-307`), by design. Consider step-up |
| AC-01 | Admin functions protected server-side | HAS_ADMIN | FIXED | high | Routers OK (`app.py:350-352`); requisition status `require_admin`; **kpi-override PUT/DELETE now `Depends(require_admin)` and audited** (`routes_daily.py`) | Tests: `test_manager_cannot_override_own_store_kpi`, `test_manager_cannot_clear_kpi_override`, audit asserted in `test_kpi_override_round_trip` |
| AC-02 | Object-level authorization | BACKEND | FIXED | high | daily `_guard` (`routes_daily.py:43-50`), staff, stocks (transfer from/to), requisitions get/delete, chat sessions (`_owned_session`), report jobs `owner_sub`, notifications. **Directives: manager target pinned to own store / ADMIN, author fields server-derived** (`routes_directives.py` `_manager_target_store`, `_manager_author`) | Tests: `test_manager_cannot_post_directive_to_another_store`, `test_manager_cannot_sign_as_operational_head`, `test_manager_cannot_retarget_or_rename_own_directive`. Low item L1 still open |
| AC-03 | Mass assignment | BACKEND | PASS | — | Pydantic models with `Literal` fields; `update_directive` allow-list `directives_store.py:101`; staff `exclude_unset` on a fixed model | |
| AC-04 | Function-level / tenant isolation | HAS_API | PARTIAL | high | Every router gets `get_current_user` (`app.py:335-352`); store derived from token (`api/auth.py:143`) | Directive `target_store` is still client-chosen for managers |
| AC-05 | Least privilege (DB user, cloud) | BACKEND | CANNOT_VERIFY | high | Atlas user rights not in repo | Confirm the app's Atlas user has readWrite on `citimart` only |
| INP-01 | Server-side input validation | BACKEND | PARTIAL | medium | Most routes use Pydantic. Daily log routes take `payload: dict = Body(...)` (`routes_daily.py:237,324,…`), coerced by hand; `RequisitionItemPayload` strings and `items` list have no max length (`routes_requisitions.py:24-40`) | Move to Pydantic models with `max_length` / `max_items` |
| INP-02 | SQL injection | DATABASE | N/A | — | MongoDB only | |
| INP-03 | Other injection | BACKEND | PASS | — | No `eval/exec/subprocess/pickle/yaml.load`; store codes validated against `STORE_CODE_TO_NAME` before queries; dates via `fromisoformat` | |
| INP-04 | XSS | WEB_FRONTEND | PASS | — | No `dangerouslySetInnerHTML` / `innerHTML` in `frontend/src`; chat markdown links allow-listed (`AiChatbot.tsx:657-684`) | |
| INP-05 | CSRF | cookie auth | PASS | — | API auth is a bearer header; the only cookie is the refresh token, path `/api/auth`, SameSite=Lax, POST-only | |
| INP-06 | File uploads | FILE_UPLOAD | PARTIAL | low | 10 MB cap + `read_only` openpyxl (`routes_targets.py:189-214`); admin-only | Type checked by extension only; parsing fails safely on non-xlsx |
| INP-07 | SSRF | OUTBOUND_FETCH | N/A | — | Outbound calls only to fixed hosts (Open-Meteo, Gemini, Tavily, Meta/Twilio) | |
| INP-08 | Open redirect | WEB_FRONTEND | PASS | — | In-app links via `isAppHref`; no server redirects | |
| INP-09 | Business logic integrity | stock/limits | FAIL | medium | Backend accepts **any date** for bill/footfall/NOB add/edit/delete (`routes_daily.py:323-520`); "today only" is enforced in the UI only. Combined with LOG-01, a manager can silently rewrite past sales | For managers, enforce IST today server-side (or audit + admin approval for past dates) |
| INP-10 | Fail closed | BACKEND | PASS | — | Session store down → 503 (`api/auth.py:122`); rate limiter never fails open | |
| WEB-01 | HTTPS / HSTS | WEB | PARTIAL | high | HSTS on https in `app.py:122`; nginx listens :80 only; `vercel.json` sets no HSTS | CANNOT_VERIFY live TLS. Vercel adds HSTS on its domains; confirm for any custom domain |
| WEB-02 | Security headers | WEB_FRONTEND | FAIL | medium | nosniff / XFO / Referrer / Permissions present (`app.py:113-124`, `vercel.json`, `nginx.conf`); **no Content-Security-Policy anywhere** | Add CSP (start Report-Only) in `vercel.json` + nginx |
| WEB-03 | CORS | HAS_API | PASS | — | Off unless configured, `allow_credentials=False`, explicit methods/headers (`app.py:268-279`) | |
| WEB-04 | Clickjacking | WEB_FRONTEND | PASS | — | `X-Frame-Options: DENY` in all three layers | |
| WEB-05 | Third-party scripts | external scripts | PASS | — | No external `<script src>`; fonts/libs bundled | |
| WEB-06 | Front-end hardening | WEB_FRONTEND | PASS | — | `target="_blank"` links carry `rel="noopener noreferrer"` | Confirm Vite `build.sourcemap` stays off |
| API-01 | Every endpoint secured | HAS_API | PARTIAL | high | All routers authed. `/api/daily/landing-hero` docstring says "public" but it sits under the authed router (fine). KPI-override and directives gaps as above | |
| API-02 | Rate limiting | HAS_API | PASS | — | Login (IP, IP+user, per-account failures), chat (`chat_rate_limit`), advisor limiter; nginx `limit_req` | |
| API-03 | Resource limits | HAS_API | PARTIAL | low | Upload cap, list `limit` caps (`le=2000/500/100`), body cap 11 m in nginx | Requisition items unbounded (INP-01) |
| API-04 / API-05 / API-06 | GraphQL / WebSockets / Payments | — | N/A | — | Not present | |
| API-07 | API inventory, no stray routes | HAS_API | FAIL | low | Unreachable-from-UI `kpi-override` routes left live | Remove or admin-gate (blocker #2) |
| SUP-01 | Vulnerable dependencies | ALL | FAIL | high | pip-audit / npm audit output above | Blocker #3 |
| SUP-02 | Lockfiles | ALL | PARTIAL | medium | `package-lock.json` committed; Python `requirements.txt` not hash-locked; Vercel uses `npm install` not `npm ci` | |
| SUP-03 | Unused code / deps | ALL | PARTIAL | low | `shadcn` CLI in runtime deps; `lupa` (test) in `requirements.txt` | |
| SUP-04 | SBOM | ALL | FAIL | low | None generated | |
| SUP-05 / SUP-06 | CI pipeline / CI scanning | CI | N/A | medium | No `.github/workflows` in this repo | Recommend adding Part 6.2 workflow (gitleaks + semgrep + osv) |
| SUP-07 | Image signing | CONTAINERS | CANNOT_VERIFY | high | — | |
| SUP-08 | Environment separation | BACKEND | NEEDS_HUMAN | high | `.env.example` defaults `ENVIRONMENT=development` | Confirm Render sets `ENVIRONMENT=production` (enables sid requirement and disables `/docs` + `/openapi.json`) |
| INFRA-01 | Debug / docs off in prod | BACKEND | CANNOT_VERIFY | high | Docs gated on `ENVIRONMENT` (`app.py:233-235`, `env.py:236-239`) | Same as SUP-08 |
| INFRA-02 | No exposed sensitive files | BACKEND | PASS | — | SPA fallback path-contained (`app.py:368-369`); `.dockerignore` excludes secrets | |
| INFRA-03 | Database secured | DATABASE | CANNOT_VERIFY | critical | Atlas network allow-list / TLS not in repo | Confirm the Atlas IP access list is not `0.0.0.0/0` |
| INFRA-06 | Containers | CONTAINERS | PASS | — | Pinned `python:3.13.9-slim-bookworm`, non-root `appuser`, healthcheck, no `--forwarded-allow-ips='*'` (`backend/Dockerfile`) | |
| CRYPTO-01 | TLS everywhere | ALL | PASS | — | No `verify=False` / insecure overrides found | |
| CRYPTO-04 | JWT secret strength | JWT | PASS | — | 64-char local secret; dev default refused in prod | No `kid` rotation support (low) |
| CRYPTO-05 | Algorithms / randomness | ALL | PASS | — | `secrets.token_*` for ids/tokens; Argon2id; HS256 pinned | |
| CRYPTO-06 | Backups | DATABASE | CANNOT_VERIFY | high | Atlas console | |
| PRIV-01 | Personal data inventory | PII | NEEDS_HUMAN | high | Staff name/phone/email (`routes_staff.py:21-39`), attendance, WhatsApp numbers, chat transcripts (30-day TTL setting), session IP/UA | See PROJECT_PROFILE.md inventory |
| PRIV-02 / PRIV-04 / PRIV-08 | Notice / rights / breach readiness | PII | NEEDS_HUMAN | high | Landing has a Privacy Policy page; no staff-data deletion/export path | DPDP review |
| LOG-01 | Audit logging | BACKEND | PARTIAL | medium | Audited: login/logout/sessions/switch, targets, advisor, alerts, chat clear, notif scan. **Not audited:** bill/footfall/NOB add/edit/delete, kpi-override, staff create/update/attendance, stock inward/adjust/transfer, requisitions, directives | Add `audit_event` to every write route |
| LOG-02 | No secrets/PII in logs | ALL | PARTIAL | low | WhatsApp dry-run logs full phone number (`src/alerts/whatsapp_provider.py:79`) | Mask to the last 4 digits |
| LOG-05 / DESIGN-01 | Runbook / threat model | ALL | NEEDS_HUMAN | high | No `security/RUNBOOK.md` or `THREAT_MODEL.md` | |
| AI-01 | Prompt injection / tool permissions | AI_LLM | PASS | — | Tools read-only and take store scope from server-built `SecurityContext` (`routes_chat.py:44-58`), not model args | |
| AI-02 | Output handling / leakage | AI_LLM | PASS | — | Model links not clickable unless app-internal or a returned source (`AiChatbot.tsx:657-684`); sessions owner-scoped | |
| AI-03 | Provider cost / privacy | AI_LLM | PARTIAL | medium | Per-user chat limiter, `max_output_tokens`, 4000-char input cap | NEEDS_HUMAN: Gemini data-retention setting and disclosure |
| MSG-01 | Messaging safety | EMAIL_SMS | PASS | — | Fixed provider hosts; admin-only recipients validated as Indian mobiles | |
| MOB / DESK / GAME / CMS / IAC | — | — | N/A | — | Not present | |

### Low-severity findings (not blockers)
- **L1 — Directive ownership by substring.** `routes_directives.py:105-108,131-134` treats any user whose username appears in `author_title` as the author. `directives_store.py:60` shows a manager any directive whose `author_title` regex-matches their store code. Use `created_by_user` only.
- **L2 — Notification existence oracle.** `mark_read` answers 404 for an unknown ID and 403 for someone else's. The IDs are sequential, so this reveals which notifications exist, but not their content.
- **L3 — `switch-account` echoes the target username** in its 404 (`routes_auth.py:314`). Admin-only, so the impact is negligible.

## Changes made
| Commit/patch | Check ID | Files | Description | Tests |
|---|---|---|---|---|
| uncommitted | AC-01, LOG-01 | `backend/api/routes_daily.py`, `backend/tests/test_daily_authz.py` | `PUT`/`DELETE /api/daily/kpi-override` now admin-only; every set/clear writes `kpi_override_set` / `kpi_override_cleared` audit events. Existing override tests switched to admin headers. | 2 new negative tests; 558 passed |
| uncommitted | AC-02, AC-04 | `backend/api/routes_directives.py`, `backend/tests/test_directives.py` | Manager directives: `target_store` limited to own store or `ADMIN` (`ALL` still means own store on create; another store → 403); `author_name` / `author_title` set from the session, never the body; PUT can't retarget to another store/ALL or rename the author. Admin behaviour unchanged. | 3 new negative tests; 558 passed |

## Human actions required
| Priority | Action | Why | Where |
|---|---|---|---|
| 1 | Review and commit the blocker #1 / #2 fixes (done, uncommitted) | Insiders could spoof executive instructions and falsify KPIs | `routes_daily.py`, `routes_directives.py` + tests |
| 2 | Approve dependency bumps (pyjwt, python-multipart, pymongo, pillow 13 major; npm audit fix) | Known CVEs in the auth and upload path | `requirements.txt`, `package.json` |
| 3 | Confirm `ENVIRONMENT=production` on Render | Otherwise `/docs` + `/openapi.json` are public and sid-less tokens are accepted | Render dashboard |
| 4 | Confirm the Atlas network access list and the DB user role | INFRA-03 / AC-05 | MongoDB Atlas console |
| 5 | Decide on admin MFA (TOTP) | AUTH-04 | Product decision |
| 6 | Create RUNBOOK.md + THREAT_MODEL.md | LOG-05, DESIGN-01, PRIV-08 (CERT-In 6 h) | `security/` |

## Legal / privacy items for review
| ID | Question for owner/lawyer |
|---|---|
| PRIV-01/04 | Staff phone/email and attendance are personal data under the DPDP Act. What retention applies, and how does a former employee get their data deleted? |
| PRIV-07 | Chat questions (possibly mentioning staff) go to Google Gemini and optionally Tavily. Is this covered in the privacy notice and vendor terms? |
| PRIV-08 | Who files CERT-In 6-hour incident reports for this system? |

## Residual risk
This report reflects checks performed on 2026-11-25 against this spec. It is not a guarantee that the project cannot be compromised. Re-run after significant changes and before each release.
