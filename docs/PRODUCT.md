# CITIMART Daily Operations — Product Overview (PRODUCT)

**Product:** CITIMART Live Daily Operations & Store Floor Portal
**Users:** one administrator + three store managers (fixed accounts, no self-signup)
**Stores:** New Market (`NM`), Hatibagan (`HB`), Chowringhee (`CHW`) — Kolkata

---

## 1. Problem

Store managers log a day's trading as it happens — bills, footfall, number of
buyers — and leadership wants to know, during the day, whether each store is on
pace for its target and why it isn't. Before this portal that meant
end-of-day spreadsheets: numbers arrived after the day was already lost.

Daily Operations makes the live day visible: every entry updates the store's
KPIs immediately, against an admin-set daily target, with the context (weather,
holidays, elections, day type) a manager needs to explain a miss.

## 2. Personas

| Persona | Account | What they do |
|---|---|---|
| **Store manager** | `CITIMART - NEW MARKET` / `- HATIBAGAN` / `- CHOWRINGHEE` | Logs footfall, bills (net amount + quantity), NOB and remarks for **today, own store only**; watches own dashboard; edits/deletes own entries; exports own store's report. |
| **Administrator** | `ADMINISTRATOR` | Sets every store's monthly Sales Target grid; sees every store plus the blended **Overall Stores Summary**; tunes KPI status bands; sends directives; can "View as Store Manager". Logs no floor data. |

## 3. Core Capabilities

- **Live KPI dashboard** per store: cards + six gauges + time-slot charts, all
  recomputed from MongoDB on read — no "save" needed for numbers to move.
- **Manual data entry** (manager only, today only, 10:30–23:59): Footfall,
  Bill Details (bill time, net amount, bill quantity, NOB), Remarks;
  Update vs. Final Submission (same save, the latter confirmed).
- **Sales Target grid** (admin only): one row per day per store, typed or
  uploaded from Excel (≤ 10 MB).
- **Overall Stores Summary** (admin): raw totals summed, ratios recomputed.
- **Today's Context:** weather (Open-Meteo), West Bengal holidays, ECI election
  dates, day type (Weekend / Mid-Week / Regular). Lookups that fail show
  "unavailable"; they never break the page.
- **History:** any past recorded date, time-slot breakdown and raw logs.
- **Reports:** per-store XLSX / PDF for all days, one day or a range —
  synchronous, or as a background job for long PDFs.
- **Midnight auto-finalize (00:00 IST):** snapshots every store's day even if
  nobody clicked Final Submission.
- Requisitions, stock, staff, executive directives, and an AI operations copilot.

## 4. KPI Glossary

| KPI | Definition |
|---|---|
| Net Sales | Σ bill net amount (bill log) |
| Bill Quantity | Σ items across bills |
| Footfall | Σ footfall log entries |
| NOB | Number of buyers — Σ NOB log entries (independent of footfall and bills) |
| ATV | Net Sales ÷ NOB |
| RPV | Net Sales ÷ Footfall |
| Basket Size | Bill Quantity ÷ NOB |
| Conversion % | NOB ÷ Footfall × 100 |
| Achievement % | Net Sales ÷ Sales Target × 100 (green only when **> 100%**) |
| Remaining / Remaining % | Target − Net Sales; 100 − Achievement % |

A ratio with no denominator yet (e.g. no target set) is unknown, not zero, in the
engine; the dashboard displays it as 0 because on a live page a blank almost
always means "not logged yet today". Red/yellow/green bands are global and
admin-editable.

**Time slots:** 10:30 AM–1:59 PM · 2:00–4:59 PM · 5:00–7:59 PM · 8:00–11:59 PM.

## 5. Security & Tenancy Guarantees

- A manager can only ever read or write their own store; the server enforces
  this on every request and every row (a wrong store/row pairing is a 403/404,
  never another store's data).
- Argon2id passwords; 15-minute access tokens on revocable server-side
  sessions with rotating refresh tokens; users can list and end their own
  sessions; logout is immediate.
- Login throttling per IP and per account (failures), shared across servers.
- Security events (logins, logouts, account switches, target uploads) are
  written to an audit log.
- Engineering bar: [Production-grade-Security-checks-spec-check.md](../../Production-grade-Security-checks-spec-check.md).

## 6. Scale & Deployment

- **Default:** React SPA on Vercel, FastAPI on Render, MongoDB Atlas.
- **Scaled out:** with `REDIS_URL`, sessions, rate limits, the dashboard cache
  and the midnight job become shared across any number of workers/replicas
  (writes are visible on every server's next read). `docker-compose.yml`
  runs Redis + N API replicas + M BullMQ workers behind Nginx.
- **Design targets** (not yet measured on production hardware): sub-10 ms
  cached reads and session checks; login cost dominated by the deliberate
  ~30 ms Argon2id hash, scaling linearly with CPU cores across replicas.

## 7. Out of Scope

Historical analytics over the multi-year POS export and forecasting live in the
sibling **Analytics & Forecasting** product ([its PRODUCT.md](../../Analytics%20and%20Forecasting/docs/PRODUCT.md));
neither managers nor the admin use it. No backfilling past days through manual
entry; no per-slot targets (slot achievement is measured against the day's target).
