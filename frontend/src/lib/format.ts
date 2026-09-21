import type { DailyKpiKey } from "@/lib/types";

const NA = "N/A";

// "Today" in Kolkata (IST) as YYYY-MM-DD. Deliberately not
// toISOString().slice(0,10) (that reads UTC -> yesterday for the first ~5.5h
// after IST midnight) and deliberately not `new Date()` local components
// either -- an in-store tablet on a non-IST timezone would then log the wrong
// calendar day. The whole app is IST-only, so pin to Asia/Kolkata. en-CA
// formats as YYYY-MM-DD.
const IST_ISO_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
export function todayLocalDate(): string {
  return IST_ISO_DATE.format(new Date());
}

/**
 * Timezone-safe date arithmetic for YYYY-MM-DD ISO strings.
 * Avoids any local timezone/UTC midnight boundary shifts.
 */
export function addDaysISO(isoDate: string, days: number): string {
  if (!isoDate) return todayLocalDate();
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return todayLocalDate();
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().split("T")[0];
}

const IST_TIME_HHMM = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Current wall-clock time in Kolkata (IST) as "HH:MM", for the Manual Daily
// Entry Time Stamp default. Deliberately NOT `new Date().getHours()` -- an
// in-store tablet left on a non-IST timezone was producing e.g. an early-
// morning UTC value there, which falls outside every TIME_SLOT band and made
// the Time Slot field read "—" for store managers while working fine on the
// admin's correctly-set desktop. Pinning to Asia/Kolkata (same as every other
// date/time surface in this app) removes that whole class of bug.
export function nowTimeHHMM(): string {
  return IST_TIME_HHMM.format(new Date());
}

/**
 * Renders any date string (ISO YYYY-MM-DD, ISO timestamp, or Date) in standardized DD.MM.YYYY format.
 * Examples: "2026-08-21" -> "21.08.2026", Date -> "21.08.2026"
 */
export function fmtDateDot(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "—";
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) return trimmed;
    // YYYY-MM-DD
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (isoMatch) {
      return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
    }
    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(trimmed);
    if (dmyMatch) {
      return `${dmyMatch[1].padStart(2, "0")}.${dmyMatch[2].padStart(2, "0")}.${dmyMatch[3]}`;
    }
    const d = new Date(trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00Z`);
    if (!isNaN(d.getTime())) {
      const day = String(d.getUTCDate()).padStart(2, "0");
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      const year = d.getUTCFullYear();
      return `${day}.${month}.${year}`;
    }
    return trimmed;
  }
  const day = String(dateInput.getDate()).padStart(2, "0");
  const month = String(dateInput.getMonth() + 1).padStart(2, "0");
  const year = dateInput.getFullYear();
  return `${day}.${month}.${year}`;
}

// Display-only: renders date in project standard dd.mm.yyyy format
export function fmtDateIndian(isoDate: string): string {
  return fmtDateDot(isoDate);
}

/** Formats HH:MM (24-hr), HH.MM, ISO time strings or existing strings into standardized 12-hour format:
 * Pattern: "10.30 am", "11.00 am", "12.00 pm", "1.00 pm", "2.00 pm", ..., "11.59 pm" */
export function fmtTime12Hour(timeStr: string | null | undefined): string {
  if (!timeStr) return "—";
  const trimmed = timeStr.trim();
  if (trimmed === "" || trimmed === "—" || trimmed === "-") return "—";

  // Check for ISO timestamp (e.g. "2026-08-20T14:30:00" or "2026-08-20 14:30")
  if (trimmed.includes("T") || (trimmed.includes("-") && trimmed.includes(":"))) {
    try {
      const d = new Date(trimmed);
      if (!Number.isNaN(d.getTime())) {
        let h = d.getHours();
        const m = String(d.getMinutes()).padStart(2, "0");
        const ap = h >= 12 ? "pm" : "am";
        h = h % 12;
        if (h === 0) h = 12;
        return `${h}.${m} ${ap}`;
      }
    } catch {}
  }

  // Match standard time patterns: e.g. "10:30", "10.30", "14:15", "10:30:00", "1:00 PM", "10.30 am"
  const match = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?(?:\s*([aApP][mM]))?$/.exec(trimmed);
  if (!match) return trimmed;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const existingAmPm = match[4]?.toLowerCase();

  let ampm: "am" | "pm";
  if (existingAmPm) {
    ampm = existingAmPm === "am" ? "am" : "pm";
    if (hours === 0) hours = 12;
    else if (hours > 12) hours = hours % 12;
  } else {
    ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    if (hours === 0) hours = 12;
  }

  return `${hours}.${minutes} ${ampm}`;
}

/** Converts arbitrary time strings (e.g. "10:30", "10.30", "14:15", "10:30:00", "1:00 PM", "10.30 am", ISO timestamps)
 * into standard 24-hour "HH:MM" format suitable for HTML5 `<input type="time" />`. */
export function toTimeHHMM(timeStr: string | null | undefined): string {
  if (!timeStr) return nowTimeHHMM();
  const trimmed = timeStr.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return nowTimeHHMM();

  // If ISO timestamp (e.g. 2026-09-18T14:30:00 or 2026-09-18 14:30)
  if (trimmed.includes("T") || (trimmed.includes("-") && trimmed.includes(":"))) {
    try {
      const d = new Date(trimmed);
      if (!Number.isNaN(d.getTime())) {
        const h = String(d.getHours()).padStart(2, "0");
        const m = String(d.getMinutes()).padStart(2, "0");
        return `${h}:${m}`;
      }
    } catch {}
  }

  // Regex to match e.g. "10:30", "10.30", "14:15", "10:30:00", "1:00 PM", "10.30 am", "2.30pm"
  const match = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?(?:\s*([aApP][mM]))?$/.exec(trimmed);
  if (!match) return trimmed.slice(0, 5);

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = match[4]?.toLowerCase();

  if (ampm) {
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  }

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}


// All KPI/table figures are rounded to whole numbers for display (the
// underlying computed values retain full precision -- only presentation
// rounds off, via Math.round semantics through maximumFractionDigits: 0).
export function fmtCurrency(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NA;
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function fmtNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NA;
  return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function fmtPercent(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NA;
  return Math.round(v) + "%";
}

// Daily Dashboard/Manual Entry only (TEST_DAILY_DASHBOARD.xlsx-driven, live
// data): missing values show 0 rather than N/A, since on that page a blank
// field usually means "hasn't happened yet today" rather than "the source
// column doesn't exist" -- unlike the DATASET.xlsx-driven historical pages,
// which keep the project's normal don't-fabricate N/A convention.
export const fmtCurrencyOrZero = (v: number | null | undefined) => fmtCurrency(v ?? 0);
export const fmtNumberOrZero = (v: number | null | undefined) => fmtNumber(v ?? 0);
export const fmtPercentOrZero = (v: number | null | undefined) => fmtPercent(v ?? 0);
export const fmtDecimalOrZero = (v: number | null | undefined, decimals = 2) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

// Generic table-cell formatter: same column-name heuristic the old app.js
// used for regular data tables (top products/brands, store scorecard, ...).
// NOT used for the KPI table -- that needs a per-row formatter, see
// KPI_FORMATTERS below and components/KpiTable.tsx.
const CURRENCY_KEYS = new Set([
  "net_sales", "gross_sales", "discounts", "gross_profit", "avg_net_sales",
  "atv", "rpv", "sales_target", "returned_value",
  "cost", "target", "gross_amount", "net_profit", "promo_amount",
  // Product & Brand: category_net_sales_table / top_category_table
  "cogs_gst", "discount",
  // src/forecasting/* table/overview columns:
  "forecast_total", "total_net_sales", "avg_net_per_bill",
  "flat_continuation", "model_forecast_total", "confidence_lower", "confidence_upper",
  "current_avg_daily", "required_avg_daily", "point", "lower", "upper",
  // performer_pairing table: measure-suffixed strong/weak/gap columns
  "strong_net_sales", "weak_net_sales", "gap_net_sales",
  "strong_gross_profit", "weak_gross_profit", "gap_gross_profit",
  // same_period_year_over_year_table
  "current_year_net_sales", "previous_year_net_sales", "absolute_variance",
]);
const PERCENT_KEYS = new Set([
  "conversion_pct", "achievement_pct", "remaining_pct", "percentage_variance",
  "discount_pct", "gross_margin_pct", "share_pct", "contribution_pct",
  "uplift_pct", "gap_pct",
]);
// Plain-count columns -- a missing value here means 0, same as the currency /
// percent columns (Historical Analytics Overhaul: missing numeric -> 0, not N/A).
const COUNT_KEYS = new Set([
  "bill_quantity", "footfall", "nob", "quantity", "transactions", "rank",
  "basket_size", "promo_names",
  "returned_units", "strong_quantity", "weak_quantity", "gap_quantity",
  "current_year_transactions", "previous_year_transactions",
  // conversion_funnel_table (date mode): a stage's raw count
  "value",
]);

export function fmtCell(key: string, v: unknown): string {
  const numericIntent = CURRENCY_KEYS.has(key) || PERCENT_KEYS.has(key) || COUNT_KEYS.has(key);
  // Missing numeric-column value -> 0 (not N/A). A null in a text / date column
  // (product_style, promo_type, previous_year_date, ...) still shows N/A.
  if (v === null || v === undefined) return numericIntent ? fmtCell(key, 0) : NA;
  if (typeof v !== "number") return String(v);
  if (CURRENCY_KEYS.has(key)) return fmtCurrency(v);
  if (PERCENT_KEYS.has(key)) return fmtPercent(v);
  return fmtNumber(v);
}

// The per-store Daily Dashboards' KPI set (MongoDB-driven, via
// GET /api/daily/live). No Gross Sales / Discounts / Product Returns -- none of
// those are logged here -- plus Remaining % (its gauge's companion figure).
// Object.keys() insertion order drives card display order.
//
// The historical KPI_LABELS / KPI_ORDER / KPI_FORMATTERS / KPI_FORMULAS maps
// that used to sit above these went to the Analytics & Forecasting sub-project
// with the pages they fed. Every formatter below is an *OrZero variant: on a
// live manual-entry surface a blank means "hasn't happened yet today", not
// "the source column is missing".
export const DAILY_KPI_LABELS: Record<DailyKpiKey, string> = {
  sales_target: "Total Sales Target",
  net_sales: "Net Sales",
  remaining: "Remaining",
  bill_quantity: "Bill Quantity (units sold)",
  footfall: "Footfall",
  nob: "Transactions (NOB)",
  atv: "ATV",
  rpv: "RPV",
  basket_size: "Basket Size",
  conversion_pct: "Conversion %",
  achievement_pct: "Achievement %",
  remaining_pct: "Remaining %",
};

export const DAILY_KPI_ORDER = Object.keys(DAILY_KPI_LABELS) as DailyKpiKey[];

export const DAILY_KPI_FORMATTERS: Record<DailyKpiKey, (v: number | null | undefined) => string> = {
  sales_target: fmtCurrencyOrZero,
  net_sales: fmtCurrencyOrZero,
  remaining: fmtCurrencyOrZero,
  bill_quantity: fmtNumberOrZero,
  footfall: fmtNumberOrZero,
  nob: fmtNumberOrZero,
  atv: fmtCurrencyOrZero,
  rpv: fmtCurrencyOrZero,
  basket_size: fmtNumberOrZero,
  conversion_pct: fmtPercentOrZero,
  achievement_pct: fmtPercentOrZero,
  remaining_pct: fmtPercentOrZero,
};

export const DAILY_KPI_FORMULAS: Record<DailyKpiKey, string> = {
  sales_target: "Admin-set — DAILY SALES TARGET sheet",
  net_sales: "SUM(Net Amount) — today's bill log",
  remaining: "Total Sales Target − Net Sales",
  bill_quantity: "SUM(Bill Quantity) — today's bill log",
  footfall: "SUM(Footfall) — today's Logged Footfall entries",
  nob: "SUM(NOB) — today's Logged NOB entries",
  atv: "Net Sales ÷ NOB",
  rpv: "Net Sales ÷ Footfall",
  basket_size: "Bill Quantity ÷ NOB",
  conversion_pct: "NOB ÷ Footfall × 100",
  achievement_pct: "Net Sales ÷ Sales Target × 100",
  remaining_pct: "Remaining ÷ Sales Target × 100",
};
