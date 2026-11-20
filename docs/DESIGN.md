# CITIMART Daily Operations — UI/UX Design System Specification (DESIGN)

![Design](https://img.shields.io/badge/CITIMART-Design%20System-00D26A?style=for-the-badge&logo=figma&logoColor=white)
![Standard](https://img.shields.io/badge/WCAG-2.1%20AA%20Compliant-blue?style=for-the-badge)
![Theme](https://img.shields.io/badge/Theme-High--Contrast%20Executive-darkgreen?style=for-the-badge)

> **Visual Language, Typography Rhythms, Design Tokens & Component Blueprints**  
> Built for high-stress retail floor store manager terminals, POS touch displays, and executive mobile dashboards.  
> Governed by [Taste-Skill Frontend Guidelines](file:///d:/Project%20CITIMART%20Sales%20Analysis/.agents/skills/taste-skill/SKILL.md).

---

## 📑 Design System Blueprint
1. [Core Design Principles](#1-core-design-principles)
2. [Color Palette & Status Tokens](#2-color-palette--status-tokens)
3. [Typography Hierarchy & Tabular Numerics](#3-typography-hierarchy--tabular-numerics)
4. [Component Blueprints & Layout Specs](#4-component-blueprints--layout-specs)
5. [Touch Targets & Ergonomics](#5-touch-targets--ergonomics)

---

## 1. Core Design Principles

1. **3-Second Glanceability:** In high-traffic retail environments, floor managers must understand their daily sales gap and pacing status within 3 seconds of glancing at the screen.
2. **Tabular Numerics First:** All currency figures (`₹`), percentages, and quantities use monospaced tabular figures (`tabular-nums`) to prevent layout jitter during live updates.
3. **Intentional Color Economy:** Color is never purely decorative; every vibrant hue communicates an exact operational threshold.
4. **Tactile Touch Targets:** All clickable actions feature minimum 44 × 44 px tap zones suitable for touchscreen POS kiosks.

---

## 2. Color Palette & Status Tokens

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COLOR TOKEN MATRIX                                 │
├──────────────┬─────────────┬─────────────┬──────────────────────────────────┤
│ Status Band  │ Hex Code    │ Tailwind    │ Operational Semantic             │
├──────────────┼─────────────┼─────────────┼──────────────────────────────────┤
│ Emerald      │ `#10B981`   │ `emerald-500`│ Target Achieved / Surpassed (≥100%)│
│ Slate        │ `#94A3B8`   │ `slate-400`  │ Baseline On-Pace (95% - 99.9%)  │
│ Amber        │ `#F59E0B`   │ `amber-500`  │ Warning Deficit Alert (85%-94.9%)│
│ Rose         │ `#EF4444`   │ `rose-500`   │ Critical Floor Shortfall (<85%) │
│ Dark Ground  │ `#0B0F17`   │ `slate-950`  │ High-contrast background canvas │
│ Card Ground  │ `#151D2A`   │ `slate-900`  │ Elevated surface card canvas    │
│ Border Rule  │ `#232F42`   │ `slate-800`  │ Subtle card divider strokes     │
└──────────────┴─────────────┴─────────────┴──────────────────────────────────┘
```

---

## 3. Typography Hierarchy & Tabular Numerics

* **Primary Font:** `Inter`, `Geist Sans` (High readability, neutral tone).
* **Financial & Data Font:** `Fira Code`, `JetBrains Mono` with `font-feature-settings: "tnum"`.
* **Scale Ladder:**
  * **Hero Metric Numbers:** `text-4xl md:text-5xl font-extrabold tracking-tight tabular-nums`
  * **Section Headers:** `text-xl font-bold tracking-normal`
  * **Table Column Headers:** `text-xs font-semibold uppercase tracking-wider text-slate-400`
  * **Data Cell Content:** `text-sm font-medium tabular-nums text-slate-100`

---

## 4. Component Blueprints & Layout Specs

### 4.1 4-Role Account Landing Grid (`AccountSelector.tsx`)
* Four prominent interactive cards representing `ADMIN`, `NEW MARKET`, `HATIBAGAN`, and `CHOWRINGHEE`.
* Hover state elevates card with a soft neon border glow matching store brand tokens.

### 4.2 Hero Summary Card (`HeroSummaryCard.tsx`)
* Prominent top card containing Net Sales, Target, Achievement Badge, and Deficit Gap.
* Secondary metric row displaying Footfall, Bills, NOB, ATV, RPV, and Conversion Rate.

### 4.3 Unified Inline Logger (`ManualDataEntryTable.tsx`)
* Single table consolidating timestamp, bills count, net amount, footfall, and NOB.
* Unified action column containing atomic **Edit** and **Delete** buttons.

---

## 5. Touch Targets & Ergonomics

* Button heights: Minimum `44px` (`h-11` in Tailwind).
* Input padding: `px-4 py-3` with large numeric text.
* Modal overlays: Dark backdrop blur (`backdrop-blur-sm bg-black/60`) focusing user attention on data verification.
