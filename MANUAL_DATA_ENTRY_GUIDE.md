# CITIMART Daily Operations — Manager's Manual Data Entry User Guide

A comprehensive, step-by-step operational guide designed for store managers and administrators to accurately record **Footfall**, **Billing Details**, **NOB**, **Remarks**, and **Sales Targets**, and to understand real-time dashboard analytics, environmental context, and multi-period comparative performance.

---

## 1. Store Operating Hours & Automatic Time Slots

- **Store Operating Hours**: `10:30 AM` to `11:59 PM` (IST).
- **Time Stamp Selection**: Whenever you record customer or sales counter figures, select the exact 12-hour clock time when the activity took place.
- **Automatic 3-Hour Time Slot Mapping**: The system automatically allocates your timestamp to the correct standard operational band:
  - **Slot 1 (`11.00 AM - 01.59 PM`)**: Opening and morning traffic (includes 10:30 AM opening).
  - **Slot 2 (`02.00 PM - 04.59 PM`)**: Post-lunch and afternoon shift.
  - **Slot 3 (`05.00 PM - 07.59 PM`)**: Prime evening shopping rush.
  - **Slot 4 (`08.00 PM - 11.59 PM`)**: Night peak, closing rush, and end-of-day tallying.
- *Note*: Managers do not need to calculate slot boundaries manually; the system handles slot assignment automatically.

---

## 2. Footfall Entry (Customer Walk-ins)

- **What is Footfall?**
  Footfall is the total count of visitors who walked through the store entrance during the specified time period, regardless of whether they made a purchase.
- **How to Log**:
  1. Set the **Time Stamp** to the observation time.
  2. Type the visitor count in the **Footfall (visitors)** field (e.g., `52`).
  3. Click **"Update Footfall"**.
  4. The live Footfall KPI, RPV (Revenue Per Visitor), and Conversion % update immediately on your dashboard.

---

## 3. Billing Details & NOB (Sales & Transactions)

Enter sales counter receipts and cashier transactions in this section:
- **Net Amount (₹)**:
  The net money collected from sales receipts in Rupees after discounts (e.g., `18500`).
- **Bill Quantity (units sold)**:
  The total number of physical articles or garment/product units sold in those receipts (e.g., `12`).
- **NOB (Number of Bills / Paying Buyers)**:
  The number of customer bills/transactions generated (e.g., `4`). Every bill represents 1 paying customer/buyer.
- **How to Log**:
  1. Set the **Time Stamp**.
  2. Enter **Net Amount**, **Bill Quantity (units sold)**, and **NOB**.
  3. Click **"Update Bills & NOB"**.
  4. The dashboard instantly recalculates:
     - **Net Sales (₹)**: Cumulative revenue for the day.
     - **ATV (Average Transaction Value)**: $\text{Net Sales} / \text{NOB}$.
     - **Basket Size (UPT)**: $\text{Bill Quantity} / \text{NOB}$.
     - **Conversion %**: $(\text{NOB} / \text{Footfall}) \times 100$.
     - **Achievement % & Remaining Target %**: Measured against the admin-set daily Sales Target.

---

## 4. Understanding "Reset" (Safe Form Clearing)

Each input panel includes a dedicated **Reset** button to help you clear entered text before saving:

- **Reset Footfall**: Clears only the *Footfall (visitors)* input field.
- **Reset Bills & NOB**: Clears the *Net Amount*, *Bill Quantity*, and *NOB* input fields.
- **Reset All (Bottom)**: Clears all unsaved input fields across all sections including *Remarks*.

> [!IMPORTANT]
> **Safety Guarantee — Reset Never Deletes Saved Records**:
> Clicking **Reset** ONLY clears unsaved text in your browser inputs so you can re-type fresh numbers. It will **NEVER delete, modify, or erase any entries already logged** in the database.
>
> To edit or remove an existing entry, use the **Edit** or **Delete** buttons in the *Logged Footfall* and *Logged Bills & NOB* tables.

---

## 5. Remarks & Environmental Context

- **What are Remarks?**
  A brief note explaining any special factor that influenced store footfall or sales performance during the shift.
  - Examples: *"Heavy rain between 4 PM and 6 PM"*, *"Festival shopping rush — Durga Puja"*, *"End-of-season flat 50% discount launch"*, *"POS server downtime for 20 mins"*.
- **Automatic Context Tracking**:
  The system automatically tracks:
  - **Atmospheric Weather**: Real-time Kolkata weather, temperature range (°C), and precipitation (mm rain).
  - **Day Classification**: Weekday vs Weekend, Official Holidays, and Election dates.
  - **Inferred Floor Insights**: AI-generated operational recommendations and conversion pacing analysis.

---

## 6. "Update" vs "Final Submission" & Auto-Midnight Safety

| Action | When to Use | What Happens |
| :--- | :--- | :--- |
| **Update** (Footfall / Bills & NOB) | Throughout the day as hourly batches complete | Saves shift entries immediately to MongoDB so the live dashboard and boss directives update in real time. |
| **Final Submission** | At store closing before leaving | Saves any final inputs and locks today's official daily summary record and Remarks. |

> [!TIP]
> **Automatic Midnight Final Submission (Safety Net)**:
> If a store manager forgets to click **Final Submission** before leaving, the automated backend midnight job finalizes today's submission at **00:00 midnight**, ensuring all calculations and daily summaries are archived safely without data loss.

---

## 7. Admin Monthly Sales Targets & Previous Year Comparison

Administrators configure daily targets via the **Sales Target** portal (`/sales-targets/<store>`):
1. **Select Month**: Choose any month to view or edit the full monthly target schedule.
2. **Set Daily Targets**:
   - **Sales Target (₹)**: The benchmark against which daily Achievement % and Remaining Target are tracked.
   - **Net Sales (Prev. Year) [Editable]**: Active manual entry for the same day in the previous year (or uploaded from historical POS files).
3. **Comprehensive KPI Visibility**: View actual performance metrics side-by-side:
   - `Present Net Sales`, `Achievement %`, `Footfall`, `NOB`, `Bill Qty`, `ATV`, `Basket Size`, `Conversion %`.
4. **Bulk Actions**:
   - **Fill Down**: Copy the first day's value across the entire month.
   - **Save Month**: Bulk-write all modified days in one transaction.
   - **Clear Month**: Reset targets for the month with confirmation.
   - **Upload Excel**: Bulk-import from `.xlsx` using the 4-column format (`Previous Year Date | Net Sales | Present Year Date | Sales Target`) or standard 2-column format (`Date | Sales Target`).

---

## 8. "At a Glance" Multi-Period Lookback Engine

Store managers and administrators can use the **At a Glance** analytics engine to evaluate sales velocity and floor intuition:
- **Lookback Comparison Modes**:
  - **1 Year Ago (YoY)**: Compare against the exact same day last year.
  - **2 Years Ago**: Multi-year baseline comparison.
  - **1 Month Ago (MoM)**: Compare against the exact same day last month.
  - **1 Week Ago (WoW)**: Compare against the same day last week.
  - **1 Quarter Ago (QoQ)**: 90-day comparative shift.
  - **7-Day Rolling Avg**: Past week average performance.
  - **14-Day / 30-Day Rolling Avg**: Medium-term performance baseline.
- **Inferred Performance Insights**: Automated intelligence highlights whether the store is in a **Growth Surge**, **On Target Pace**, or experiencing a **Pacing Alert**, with floor recommendations.

---

## 9. Reviewing and Correcting Mistakes (Audit Log)

If an incorrect time, amount, or quantity was entered:
1. Navigate to the **Dashboard** or **Logged Entries** section.
2. Locate the row in **"Logged Footfall"** or **"Logged Bills & NOB"**.
3. Click the **Edit** button (pencil icon) to modify time, net amount, quantity, or NOB, then click **Save**.
4. Click **Delete** (trash icon) to remove a mistaken entry permanently. All KPIs will recalculate instantly.
