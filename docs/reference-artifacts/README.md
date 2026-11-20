# CITIMART Daily Operations — Reference Artifacts & Standards

![Artifacts](https://img.shields.io/badge/CITIMART-Reference%20Artifacts-00D26A?style=for-the-badge&logo=blueprint&logoColor=white)
![Version](https://img.shields.io/badge/Version-3.2.0-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Standard-Approved-success?style=for-the-badge)

> **Authoritative Operational Layouts, Credential Standards, and Operational Timeslot Specifications**  
> This directory archives standardized visual wireframes, access tier definitions, and time-slot mapping matrices for retail floor staff.

---

## 📑 Directory Contents
1. [Fixed Operator Accounts Specification](#1-fixed-operator-accounts-specification)
2. [Normalized 4-Timeslot Operating Schedule](#2-normalized-4-timeslot-operating-schedule)
3. [KPI Status Threshold Matrix](#3-kpi-status-threshold-matrix)
4. [Floor Layout & Screen Wireframes](#4-floor-layout--screen-wireframes)
5. [Operational Manual Links](#5-operational-manual-links)

---

## 1. Fixed Operator Accounts Specification

CITIMART operates four fixed account identities bound to physical stores and executive roles:

| Account Username | Display Name | Tenant Scope | Authorized Capabilities |
|:---|:---|:---|:---|
| **`admin`** | Executive Directorate | Global (`ALL`) | Full cross-store telemetry, executive directives broadcast, sales target configuration, and system-wide audit access. |
| **`new_market`** | CITIMART - New Market | `NM` Store Only | Read & write hourly bills, footfall, and NOB for New Market; submit stock requisitions; acknowledge directives. |
| **`hatibagan`** | CITIMART - Hatibagan | `HB` Store Only | Read & write hourly bills, footfall, and NOB for Hatibagan; submit stock requisitions; acknowledge directives. |
| **`chowringhee`** | CITIMART - Chowringhee | `CHW` Store Only | Read & write hourly bills, footfall, and NOB for Chowringhee; submit stock requisitions; acknowledge directives. |

> [!IMPORTANT]
> Passwords for these accounts are hashed with **Argon2id** (`AUTH-02`). Accounts are provisioned via `backend/scripts/seed_users.py`.

---

## 2. Normalized 4-Timeslot Operating Schedule

Floor operations and customer footfall follow an intraday curve divided into four standardized slots:

```
10:30 AM ─────────────────────────────────────────────────────────────► 11:59 PM
  │                      │                      │                     │
  ▼                      ▼                      ▼                     ▼
┌──────────────────────┬──────────────────────┬─────────────────────┬─────────────────────┐
│ Slot 1 (Morning)     │ Slot 2 (Afternoon)   │ Slot 3 (Evening)    │ Slot 4 (Night)      │
│ 10:30 AM – 01:59 PM  │ 02:00 PM – 04:59 PM  │ 05:00 PM – 07:59 PM │ 08:00 PM – 11:59 PM │
├──────────────────────┼──────────────────────┼─────────────────────┼─────────────────────┤
│ • Opening & Setup    │ • Mid-day traffic    │ • Prime retail peak │ • Closing rush      │
│ • Early shoppers     │ • Post-lunch shift   │ • Maximum conversion│ • Midnight freeze   │
└──────────────────────┴──────────────────────┴─────────────────────┴─────────────────────┘
```

### Automatic Slot Mapping Function
Timestamps entered by floor staff automatically resolve to slot bands using `config/settings.py`:
* `10:30` to `13:59` $\to$ **Slot 1**
* `14:00` to `16:59` $\to$ **Slot 2**
* `17:00` to `19:59` $\to$ **Slot 3**
* `20:00` to `23:59` $\to$ **Slot 4**

---

## 3. KPI Status Threshold Matrix

The platform dynamically applies visual color indicators based on target pacing formulas:

| Status Badge | Achievement Band | Status Meaning | Management Action |
|:---|:---|:---|:---|
| 🟢 **Emerald** | $\ge 100\%$ | **Target Achieved / Surpassed** | Nominal pacing; maintain sales momentum. |
| ⚪ **Slate** | $95.0\% - 99.9\%$ | **Nominal Baseline** | On-pace; steady floor throughput. |
| 🟡 **Amber** | $85.0\% - 94.9\%$ | **At-Risk Warning** | Floor pacing deficit; staff redeployment recommended. |
| 🔴 **Rose** | $< 85.0\%$ | **Critical Deficit Alert** | Floor underperformance; urgent executive intervention. |

---

## 4. Floor Layout & Screen Wireframes

### 4.1 Daily Hero Summary Card
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ CITIMART NEW MARKET (NM)                             [ 🟢 104.2% ACHIEVED ]    │
│ Net Sales: ₹ 4,25,800     Target: ₹ 4,10,000         Deficit Gap: ₹ 0         │
├──────────────┬──────────────┬──────────────┬──────────────┬───────────────────┤
│ Footfall: 840│ Bills: 142   │ Buyers: 128  │ ATV: ₹ 2,998 │ Conversion: 15.2% │
└──────────────┴──────────────┴──────────────┴──────────────┴───────────────────┘
```

### 4.2 Unified Manual Data Logger
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Time Stamp    Bills Count    Net Amount (₹)   Footfall     Actions            │
├──────────────┼──────────────┼────────────────┼────────────┼───────────────────┤
│ 11:30 AM     12             ₹ 34,200         48           [ ✏️ Edit ] [ 🗑️ Del ]│
│ 01:15 PM     24             ₹ 68,500         95           [ ✏️ Edit ] [ 🗑️ Del ]│
│ 03:45 PM     18             ₹ 51,000         72           [ ✏️ Edit ] [ 🗑️ Del ]│
└──────────────┴──────────────┴────────────────┴────────────┴───────────────────┘
```

---

## 5. Operational Manual Links

* **Detailed Store Manager Handbook:** [`../../MANUAL_DATA_ENTRY_GUIDE.md`](../../MANUAL_DATA_ENTRY_GUIDE.md)
* **Architecture Specifications:** [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
* **Authentication Standards:** [`../AUTH.md`](../AUTH.md)
* **Database & Indexing Specifications:** [`../DATABASE.md`](../DATABASE.md)
