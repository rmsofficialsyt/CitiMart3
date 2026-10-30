# CITIMART Daily Operations — Product Requirements Document (PRD)

**Product Name:** CITIMART Live Daily Operations & Store Floor Portal  
**Target Users:** Store Managers (NM, HB, CHW), Executive Operations Head (Raphael Sir), Operations Supervisors  
**Release:** v3.2.0

---

## 1. Problem Statement
Previously, floor managers recorded customer walk-ins and hourly bill amounts in paper logbooks or disparate WhatsApp messages. This resulted in:
- Executive leadership having zero real-time visibility into whether stores were meeting intraday sales targets.
- Delayed response to evening rush hour bottlenecks and stock shortages.
- Lack of immediate target gap awareness to mobilize sales staff before closing.
- Inconsistent conversion rate tracking between visitor footfall and checkout bills.

---

## 2. Product Objectives
1. **Intraday Visibility:** Provide real-time live KPI calculations updated immediately upon bill and footfall entry.
2. **Simplified Floor Entry:** Low-friction data entry optimized for store manager mobile and desktop terminals with clear layman guidelines.
3. **Executive Governance:** Enable Raphael Sir to broadcast binding operational directives and monitor all 3 stores simultaneously.
4. **Actionable AI Assistance:** Provide store managers with instant advice in their native language (English, Bengali, Hindi) on how to close sales target gaps.

---

## 3. User Personas & Core Journeys

### Persona 1: Store Floor Manager (e.g. New Market Manager)
- **Journey:** Arrives at 10:30 AM -> logs morning setup -> logs mid-day footfall & billing at 2:00 PM -> checks Target Gap on hero card -> consults AI Copilot in Bengali for evening surge pacing -> submits product requisition for out-of-stock sizes -> finalizes closing log at 10:30 PM.

### Persona 2: Executive Admin / Operations Head (Raphael Sir)
- **Journey:** Logs into portal -> reviews Overall Stores Summary comparing NM, HB, and CHW -> identifies a store lagging behind target -> issues high-priority Executive Directive -> switches into store context using View As Manager -> uploads next month's sales targets via Excel import.

---

## 4. Key Functional Requirements

- **FR-01: Authentication & Account Selector:** Landing page grid displaying 4 distinct account cards leading to credential validation.
- **FR-02: Live Daily Dashboard:** Hero card with Achievement %, Remaining %, ATV, RPV, Conversion Rate, and 4-slot pacing chart.
- **FR-03: Manual Data Logger:** Consolidated table supporting inline additions, edits, and deletions of bill and footfall records.
- **FR-04: History Archive:** Date-picker driven browser displaying past operational days grouped by timeslots.
- **FR-05: Product Requisitions:** Multi-department stock shortfall request workflow with priority tags.
- **FR-06: Executive Directives:** Admin modal allowing broadcast of time-sensitive operational instructions to specific stores.
- **FR-07: AI Chatbot / Copilot:** Multi-lingual conversational drawer answering sales queries grounded in live MongoDB data.
- **FR-08: Certified PDF / Excel Export:** One-click export of verified operational logs.
