# CITIMART Daily Operations — Frontend Portal

![React](https://img.shields.io/badge/React-18.2+-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.0+-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack%20Query-v5-FF4154?style=for-the-badge&logo=react-query&logoColor=white)

> **Enterprise Real-Time Retail Operations Single-Page Application (SPA)**  
> High-density, zero-waterfall operator dashboard designed for floor store managers and executive leadership across CITIMART's three department stores: **New Market (`NM`)**, **Hatibagan (`HB`)**, and **Chowringhee (`CHW`)**.  
> Governed by [Taste-Skill Frontend Guidelines](file:///d:/Project%20CITIMART%20Sales%20Analysis/.agents/skills/taste-skill/SKILL.md) and [Constitution](file:///d:/Project%20CITIMART%20Sales%20Analysis/docs/specs/CONSTITUTION.md).

---

## 📑 Table of Contents
1. [User Experience & Visual Design](#-user-experience--visual-design)
2. [Component Architecture](#-component-architecture)
3. [Technology Stack](#-technology-stack)
4. [Key Feature Walkthrough](#-key-feature-walkthrough)
   - [4-Role Landing Account Picker](#1-4-role-landing-account-picker)
   - [Live Intraday Hero Card & Badges](#2-live-intraday-hero-card--badges)
   - [Timeslot Pacing Bar Chart](#3-timeslot-pacing-bar-chart)
   - [Unified Inline Data Entry Logger](#4-unified-inline-data-entry-logger)
   - [Executive Directives Modal](#5-executive-directives-modal)
   - [Product Shortfall Requisitions](#6-product-shortfall-requisitions)
   - [Trilingual AI Copilot Drawer](#7-trilingual-ai-copilot-drawer)
   - [Certified Report Exporter](#8-certified-report-exporter)
5. [State Management & API Layer](#-state-management--api-layer)
6. [Design System & Typography](#-design-system--typography)
7. [Development & Build Commands](#-development--build-commands)
8. [Vercel Deployment & Proxy Architecture](#-vercel-deployment--proxy-architecture)

---

## 🎨 User Experience & Visual Design

The UI is built with an enterprise high-contrast dark theme engineered for fast glanceability in brightly lit retail department store environments:
* **Zero Request Waterfalls:** All core operational metrics hydrate on initial mount in a single aggregated HTTP request.
* **Tabular Figure Alignment:** Currency values (`₹`), percentages, and quantities utilize monospace tabular figures (`tabular-nums`) to prevent layout shifts.
* **Intentional Color Rhythms:** Color is reserved strictly for operational status:
  * 🟢 **Emerald (`#10B981`):** Target Met / Surpassed ($\ge 100\%$)
  * ⚪ **Slate (`#94A3B8`):** Nominal Baseline ($95\% - 99.9\%$)
  * 🟡 **Amber (`#F59E0B`):** Warning Deficit ($85\% - 94.9\%$)
  * 🔴 **Rose (`#EF4444`):** Critical Deficit Alert ($< 85\%$)

---

## 📂 Component Architecture

```
frontend/src/
├── components/
│   ├── AccountSelector.tsx        # 4-card interactive store login & role picker
│   ├── HeroSummaryCard.tsx        # Live sales, target gap, achievement badge & conversion KPIs
│   ├── TimeslotPacingChart.tsx    # 4-slot intraday pacing bar chart (Morning/Afternoon/Evening/Night)
│   ├── ManualDataEntryTable.tsx   # Unified hourly bills/footfall/NOB inline editable table
│   ├── ExecutiveDirectivesModal.tsx # Broadcast directives dialog with store read receipts
│   ├── ProductRequisitionModal.tsx # Stockout size request modal with priority tagging
│   ├── AICopilotDrawer.tsx        # Multi-lingual sales query assistant side-drawer
│   ├── TargetAllocationModal.tsx  # Executive target adjustment & bulk upload interface
│   └── ExportReportButton.tsx     # One-click Excel (.xlsx) and PDF (.pdf) generator
├── context/
│   └── AuthContext.tsx            # Store credentials, active token & session management
├── services/
│   └── api.ts                     # Axios client with interceptors for Bearer JWT & error toasts
├── types/
│   └── daily.ts                   # TypeScript interfaces for operational telemetry
├── App.tsx                        # Main dashboard shell & routing gate
├── main.tsx                       # React DOM entrypoint & TanStack Query client provider
└── index.css                      # Tailwind CSS v4 directives & typography rules
```

---

## 🛠️ Technology Stack

| Layer | Library / Tool | Purpose |
|:---|:---|:---|
| **Core Framework** | React 18.2 | Component-driven declarative SPA architecture |
| **Language** | TypeScript 5.0+ | Strict type safety, interfaces, and compile-time validation |
| **Build Tool** | Vite 5.0 | Lightning-fast HMR and optimized production bundling |
| **Styling** | Tailwind CSS v4 | Utility-first CSS engine with custom CITIMART design tokens |
| **Server State** | TanStack React Query v5 | Auto-revalidation, background refetching & local cache |
| **Client State** | React Context API | Store-scoped authentication and operator profile |
| **Icons** | Lucide React | Clean, lightweight SVG iconography |
| **Data Viz** | Plotly & SVG Gauges | Interactive timeslot pacing bars & circular gauges |

---

## 🌟 Key Feature Walkthrough

### 1. 4-Role Landing Account Picker
Presents an immediate visual landing screen with 4 dedicated store operator identity cards:
* **CITIMART - NEW MARKET (`NM`)**
* **CITIMART - HATIBAGAN (`HB`)**
* **CITIMART - CHOWRINGHEE (`CHW`)**
* **ADMINISTRATOR (Executive Operations)**

Selecting a card prompts for the store password and immediately binds the user's session to that store's authorized tenant scope.

### 2. Live Intraday Hero Card & Badges
Displays the primary operational pulse:
* **Net Sales Today:** Real-time cumulative revenue in Indian Rupees (`₹`).
* **Target Achievement:** Large percentage with dynamic color-coded status badges.
* **Remaining Deficit Gap:** Exact rupee shortfall needed to hit the daily target.
* **Telemetry Secondary Row:** Footfall, Bills, NOB, ATV (Average Transaction Value), RPV (Revenue Per Visitor), and Conversion Rate.

### 3. Timeslot Pacing Bar Chart
Visualizes hourly sales against the intraday pacing curve across 4 normalized operational slots:
* **Slot 1 (Morning):** `10:30 AM – 01:59 PM`
* **Slot 2 (Afternoon):** `02:00 PM – 04:59 PM`
* **Slot 3 (Evening):** `05:00 PM – 07:59 PM`
* **Slot 4 (Night):** `08:00 PM – 11:59 PM`

### 4. Unified Inline Data Entry Logger
A single consolidated table replacing disjointed entry screens:
* Records timestamp, bills count, footfall, NOB, and remarks.
* Features atomic **Inline Edit** and **Inline Delete** actions.
* Client-side validation prevents entries outside 10:30 AM – 11:59 PM.

### 5. Executive Directives Modal
Allows central management (Raphael Sir) to broadcast urgent operational notices. Store managers see an unread badge and must click to acknowledge read receipts.

### 6. Product Shortfall Requisitions
Enables floor managers to report stockouts (e.g., missing sizes in fast-moving apparel) directly to central merchandisers with urgency flags (`Urgent`, `High`, `Normal`).

### 7. Trilingual AI Copilot Drawer
A slide-out assistant allowing managers and directors to query live performance in natural language (**English**, **Bengali**, or **Hindi**), receiving grounded answers with zero speculative hallucination.

### 8. Certified Report Exporter
One-click generation of certified spreadsheets (`.xlsx`) or printable briefs (`.pdf`) with verified timestamp signatures.

---

## 🔄 State Management & API Layer

* **Bearer Token Injection:** Axios request interceptors automatically read the `access_token` from `AuthContext` and attach it to the `Authorization` header.
* **Automatic Silent Refresh:** On receiving a `401 Unauthorized` response, the interceptor transparently issues a refresh call to `/api/auth/refresh` using the `HttpOnly` cookie before retrying the failed request.
* **Optimistic UI Updates:** TanStack Query optimistically mutates row entries, rolling back smoothly if the backend rejects an invalid payload.

---

## 🚀 Development & Build Commands

```powershell
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev
# Server accessible at http://localhost:5173

# 3. Production Typecheck & Bundle Build
npm run build
# Runs `tsc -b` followed by `vite build` to generate `dist/`

# 4. Lint Codebase
npm run lint
```

---

## 🌐 Vercel Deployment & Proxy Architecture

The frontend is configured for instant deployment to **Vercel** with a zero-CORS proxy architecture defined in `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://citimart-daily-backend.onrender.com/api/$1"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This guarantees that all `/api/*` network requests route securely to the backend without triggering cross-origin restrictions or exposing the backend host directly.
