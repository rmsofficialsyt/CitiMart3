# CITIMART Daily Operations — Store Manager's Operational Handbook

![Handbook](https://img.shields.io/badge/CITIMART-Manager's%20Handbook-00D26A?style=for-the-badge&logo=gitbook&logoColor=white)
![Audience](https://img.shields.io/badge/Audience-Store%20Managers-blue?style=for-the-badge)
![Compliance](https://img.shields.io/badge/Compliance-Mandatory%20SOP-success?style=for-the-badge)

> **Step-by-Step Operating Guide for Retail Floor Managers & Cash Desk Staff**  
> For **New Market (`NM`)**, **Hatibagan (`HB`)**, and **Chowringhee (`CHW`)** store operations.  
> Governed by [docs/CONSTITUTION.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/CONSTITUTION.md) and [docs/SPEC.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/SPEC.md).

---

## 📑 Table of Contents
1. [Operating Window & Automated Timeslots](#1-operating-window--automated-timeslots)
2. [Logging Footfall (Customer Walk-ins)](#2-logging-footfall-customer-walk-ins)
3. [Logging Sales Receipts & Paying Buyers (NOB)](#3-logging-sales-receipts--paying-buyers-nob)
4. [Inline Row Editing & Deletion](#4-inline-row-editing--deletion)
5. [Form Reset Safety Guarantees](#5-form-reset-safety-guarantees)
6. [Environmental Remarks & Special Factors](#6-environmental-remarks--special-factors)
7. [Shift Updates vs Midnight Auto-Finalization](#7-shift-updates-vs-midnight-auto-finalization)
8. [Executive Directives & Stock Requisitions](#8-executive-directives--stock-requisitions)
9. [Operational Dos & Don'ts](#9-operational-dos--donts)
10. [Frequently Asked Questions (FAQ)](#10-frequently-asked-questions-faq)

---

## 1. Operating Window & Automated Timeslots

* **Mandatory Store Hours:** `10:30 AM` to `11:59 PM` (IST).
* **Automatic Timeslot Allocation:** Whenever you record an entry, the system automatically assigns it to the appropriate operational slot:
  * **Slot 1 (Morning Shift):** `10:30 AM – 01:59 PM` (Store opening, initial footfall, setup)
  * **Slot 2 (Afternoon Shift):** `02:00 PM – 04:59 PM` (Mid-day shopping, post-lunch traffic)
  * **Slot 3 (Evening Peak):** `05:00 PM – 07:59 PM` (Prime footfall rush, peak sales conversion)
  * **Slot 4 (Night Rush):** `08:00 PM – 11:59 PM` (Closing purchases, billing consolidation)

> [!NOTE]
> Store staff never need to select slot numbers manually. Simply pick the exact observation time (e.g., `04:15 PM`), and the system handles slot attribution.

---

## 2. Logging Footfall (Customer Walk-ins)

* **Definition:** The total number of visitors who crossed the store entrance during the observation window, regardless of whether they purchased merchandise.
* **Step-by-Step Procedure:**
  1. Select the **Time Stamp** (e.g., `12:00 PM`).
  2. Input the visitor count in the **Footfall (visitors)** field (e.g., `64`).
  3. Click **"Update Footfall"**.
  4. The dashboard immediately updates **Total Footfall**, **RPV (Revenue Per Visitor)**, and **Conversion %**.

---

## 3. Logging Sales Receipts & Paying Buyers (NOB)

Record sales counter transactions and cashier receipts in this panel:

| Data Field | Plain Meaning | Practical Example |
|:---|:---|:---|
| **Net Amount (₹)** | Actual net cash/card collections in Rupees (post-discount). | `₹ 38,500` |
| **Bill Quantity** | Total count of physical garment or item units sold across these bills. | `14` pieces |
| **NOB (Number of Bills)** | Number of distinct receipts generated (each bill = 1 paying buyer). | `5` bills |

### Operational Metric Formulations
Upon saving, the dashboard recalculates all retail ratios in real-time:
$$\text{Average Transaction Value (ATV)} = \frac{\text{Net Amount}}{\text{NOB}}$$
$$\text{Basket Size (UPT)} = \frac{\text{Bill Quantity}}{\text{NOB}}$$
$$\text{Conversion Rate} = \left(\frac{\text{NOB}}{\text{Footfall}}\right) \times 100$$
$$\text{Remaining Deficit Gap} = \max(0, \text{Daily Target} - \text{Cumulative Net Sales})$$

---

## 4. Inline Row Editing & Deletion

If an incorrect figure or timestamp was logged:
1. Locate the entry in the **Logged Operations Table**.
2. Click the **Edit (✏️)** button in that row.
3. Modify the values directly in the row inputs.
4. Click **Save (💾)** to apply the correction, or **Cancel (✖)** to discard.
5. If an entry was logged by mistake, click **Delete (🗑️)** and confirm. All daily ratios will recalculate immediately.

---

## 5. Form Reset Safety Guarantees

Every input panel includes a dedicated **Reset** button:
* **Reset Footfall:** Clears unsaved text from the visitor count field.
* **Reset Bills & NOB:** Clears unsaved values from the Net Amount, Bill Quantity, and NOB fields.
* **Reset All:** Clears all uncommitted input fields on the screen.

> [!IMPORTANT]
> **Zero Data Loss Guarantee:**  
> The **Reset** button ONLY clears unsaved text in your browser window. It **NEVER modifies, deletes, or alters records already saved** to MongoDB Atlas.

---

## 6. Environmental Remarks & Special Factors

Record any external condition that impacted customer walk-ins or buying patterns:
* **Weather Conditions:** Sudden rainstorms, waterlogging, or severe heatwaves.
* **Festive Traffic:** Durga Puja, Diwali, Poila Boishakh, Christmas, or weekend sale promotions.
* **Store Infrastructure:** POS network downtime, escalator maintenance, or localized power issues.

The system automatically enriches your entry with real-time Kolkata weather observations and regional holiday calendars.

---

## 7. Shift Updates vs Midnight Auto-Finalization

| Action | Schedule | System Outcome |
|:---|:---|:---|
| **Hourly Updates** | Every 1–2 hours throughout the day | Synchronizes live figures with executive dashboards and Raphael Sir's monitoring view. |
| **End-of-Day Finalize** | Store closing (around 10:30 PM – 11:30 PM) | Verifies daily total, seals the shift, and generates certified PDF/Excel summaries. |
| **Midnight Auto-Seal** | Automated nightly at `00:00:00` | Background safety worker automatically seals any open shift to prevent data loss. |

---

## 8. Executive Directives & Stock Requisitions

### Executive Directives Channel
* Urgent broadcasts from Executive Operations (Raphael Sir) appear as alert banners on your dashboard.
* Click **"Acknowledge Directive"** to register an official read receipt with your store's timestamp.

### Product Shortfall Requisitions
* If high-demand items (e.g., specific shirt sizes, festive kurta colors) sell out:
  1. Open the **Product Requisition Modal**.
  2. Enter the Department, Item Code, Size, and Quantity needed.
  3. Mark urgency as `Urgent`, `High`, or `Normal`.
  4. Central merchandising will review and update dispatch status.

---

## 9. Operational Dos & Don'ts

```
┌──────────────────────────────────────────────┬──────────────────────────────────────────────┐
│                    DOs                       │                   DON'Ts                     │
├──────────────────────────────────────────────┼──────────────────────────────────────────────┤
│ ✅ Log hourly entries consistently           │ ❌ Don't wait until night to enter all bills │
│ ✅ Verify bill quantities match physical POS │ ❌ Don't enter negative sales or footfall    │
│ ✅ Acknowledge executive directives promptly │ ❌ Don't share passwords across cashier desks│
│ ✅ Log rain or power cuts in Remarks         │ ❌ Don't leave incorrect entries unedited    │
│ ✅ Review daily targets before noon          │ ❌ Don't attempt to log outside store hours  │
└──────────────────────────────────────────────┴──────────────────────────────────────────────┘
```

---

## 10. Frequently Asked Questions (FAQ)

**Q: What if I entered bills under the wrong timestamp?**  
A: Use the **Edit (✏️)** button on the row to update the timestamp. The system will automatically move the entry to the correct timeslot.

**Q: Can I see another store's sales numbers?**  
A: No. By constitutional security design (BOLA/IDOR isolation), store managers can only access figures for their assigned store.

**Q: What if the internet disconnects while I am entering data?**  
A: The portal will display an offline alert. Keep cash counter physical register slips safe. As soon as the network restores, log the accumulated hourly slips.
