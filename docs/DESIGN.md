# CITIMART Daily Operations — UI/UX Design System (DESIGN)

**Theme:** High-Impact Executive Retail Operations Dark/Light Theme  
**Typography:** Inter, Geist Sans, Fira Code (financial tables)  
**Layout Standards:** Optimized for 1366x768 (standard store POS/desktop terminals), 1080p, and tablet touch screens

---

## 1. Visual Language & Principles

Floor managers operate in high-stress retail environments. The UI emphasizes:
1. **At-A-Glance Status Recognition:** Key performance indicators (Target Gap, Remaining %, ATV) are immediately distinguishable within 3 seconds of glance.
2. **Tactile Data Entry:** Form inputs and time pickers have large tap targets ($> 44\text{ px}$) suitable for touch displays.
3. **Consolidated Row Management:** Single unified action column on logged entries eliminates confusing multi-button clutter.
4. **Visual Urgency:** High-priority directives from Raphael Sir render as pulsating alerts (`BossAlertBanner.tsx`).

---

## 2. Key Screen Blueprints

### 2.1 Landing Page (`Landing.tsx`)
- High-contrast visual grid presenting the 4 sign-in choices:
  - `CITIMART — Admin (All Stores)`
  - `CITIMART — New Market`
  - `CITIMART — Hatibagan`
  - `CITIMART — Chowringhee`
- Direct deep links to `/login?account=<username>`.

### 2.2 Live Store Dashboard (`StoreDailyDashboard.tsx`)
- **Daily Hero Card:** Big-number KPI display with progress bar to target milestone and MTD pacing matrix.
- **Glossy Gauges:** Real-time needle indicators for Target Achievement % and Conversion Rate.
- **Hourly Timeslot Pacing:** 4-column breakdown tracking Slot 1 through Slot 4 velocity.

### 2.3 Manual Entry Grid (`ManualEntryDashboard.tsx`)
- Inline row editing for Bill Quantity, Net Amount, Footfall, and Remarks.
- Layman's expandable guidance drawer explaining standard operational data entry SOPs.

### 2.4 Multi-lingual AI Copilot Drawer (`AiStoreAdvisor.tsx` / `AiChatbot.tsx`)
- Slide-over chat drawer with language toggle pills: `English`, `বাংলা`, `हिंदी`.
- Preset prompt chips ("Today's Target Gap", "Evening Peak Strategy", "YoY Pacing").
