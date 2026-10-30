# CITIMART Daily Operations System — Technical Specification (SPEC)

**Module:** Real-Time Retail Daily Operations & Management Dashboard  
**Version:** 3.2.0  
**Status:** Production (Deployed on Render + Vercel + MongoDB Atlas)  
**Last Updated:** 2026-10-30

---

## 1. System Overview

The **CITIMART Daily Operations System** is an enterprise real-time store management platform built specifically for CITIMART's three department stores in Kolkata:
- **New Market (`NM`)**
- **Hatibagan (`HB`)**
- **Chowringhee (`CHW`)**

Unlike the Historical Analytics module, the Daily Operations system is a **transactional, write-heavy, multi-tenant RBAC platform**. It allows store managers to log hourly timestamped billing data, footfall counts, and customer buyer volumes (NOB), manage inventory product requisitions, submit daily sales targets, interact with an AI Operations Copilot, and export certified operational reports.

---

## 2. Operational Hours & Time-Slot Matrix

Kolkata department stores operate strictly between **10:30 AM and 23:59 PM**. Time-stamped data entries map directly into four core operational bands:
1. **Slot 1:** 11.00 AM – 01.59 PM (Morning Setup & Cash Register Preparation)
2. **Slot 2:** 02.00 PM – 04.59 PM (Mid-Day Traffic & Fitting Room Support)
3. **Slot 3:** 05.00 PM – 07.59 PM (Prime Evening Peak — Full Staffing Required)
4. **Slot 4:** 08.00 PM – 11.59 PM (Night Rush, Closing Push & 10:30 PM Mandatory Reconciliation)

---

## 3. Core Functional Domains

### 3.1 Live Per-Store KPI Engine
Calculates live metrics for the selected store and operational date:
- Net Sales ($₹$), Target Sales ($₹$), Target Gap ($₹$), Achievement $\%$, Remaining $\%$.
- Footfall Headcount, Total Bills, Buyer Count (NOB).
- Conversion Rate ($\%$), Average Transaction Value (ATV), Revenue Per Visitor (RPV), Units Per Bill (Basket Size).
- Real-time environmental grounding: Automated Kolkata weather status, public holiday indicator, and election alerts.

### 3.2 Timestamped Data Entry & Reconciliation
- Store managers enter timestamped billing amounts and quantities throughout the day.
- Consolidated row management: Single consolidated Edit and Delete actions per merged timestamp row.
- Automated 00:00 UTC midnight finalizer automatically closes unfinalized daily logs.

### 3.3 Product Requisition Management
- Department managers submit item stock requisitions to prevent stock-outs.
- Tracked across 4 statuses: `Pending Approval`, `Approved`, `Ordered`, `Fulfilled`.

### 3.4 AI Store Advisor & Copilot (`/api/daily/chat`)
- Dual-engine architecture: Google Gemini API (2.5 Flash / 1.5 Flash) with fallback to a granular Real-Time MongoDB Domain Intelligence Engine.
- Multi-lingual support: English, Bengali (বাংলা), and Hindi (हिंदी).
- Role-aware prompt context: Automatically scopes live figures to the authenticated store.

---

## 4. Multi-Tenant Role-Based Access Control (RBAC)

The system supports four fixed accounts:
1. `ADMINISTRATOR` (`admin`): Full network access across all 3 stores, executive summary, sales target entry, directive broadcasting, and password-less manager account switching.
2. `CITIMART - NEW MARKET` (`manager`, store: `NM`): Strictly scoped to New Market operations.
3. `CITIMART - HATIBAGAN` (`manager`, store: `HB`): Strictly scoped to Hatibagan operations.
4. `CITIMART - CHOWRINGHEE` (`manager`, store: `CHW`): Strictly scoped to Chowringhee operations.
