// Mirrors the JSON shapes returned by this sub-project's api/routes_*.py.
// Keep in sync with the backend -- these are hand-written, not code-generated.
//
// The historical shapes (KpiBundle, KpisResponse, KpiDelta, FilterOptions,
// FilterDefaults, TableResponse, DataQualityProfile, the previous-year
// comparison matrix) live in the Analytics & Forecasting sub-project's copy
// of this file, because that is where the routes returning them live.

export type StatusColor = "red" | "yellow" | "green";

// Order matters: mirrors src/filter_engine.py's FILTER_HIERARCHY exactly --
// each field's options are cascaded off every field before it.
export const FILTER_HIERARCHY = [
  "division",
  "section",
  "department",
  "product_design_no",
  "product_style",
  "product_type",
  "product_size",
  "vendors",
] as const;

export type FilterHierarchyField = (typeof FILTER_HIERARCHY)[number];

export interface FilterState {
  stores: string[];
  start: string;
  end: string;
  time_slot: string[];
  division: string[];
  section: string[];
  department: string[];
  product_design_no: string[];
  product_style: string[];
  product_type: string[];
  product_size: string[];
  vendors: string[];
}

// Plotly figure JSON as returned by /api/charts/{chart_id} (src/charts.py's
// _fig_to_dict). Typed loosely -- Plotly's own types are supplied at the
// react-plotly.js call site.
export interface PlotlyChartFigure {
  data: unknown[];
  layout: Record<string, unknown>;
}

// The other shape /api/charts/{chart_id} can return: a plain gauge
// description (src/charts.py's gauge_spec()) for the 4 *_gauge chart ids,
// rendered by components/GlossyGauge.tsx -- not a Plotly figure, since
// Plotly's Indicator can't draw a true needle. `value: null` means N/A (the
// source KPI wasn't computable), in which case every other field is absent.
export interface GaugeSpec {
  kind: "gauge";
  title: string;
  value: number | null;
  target?: number | null;
  min?: number;
  max?: number;
  redBelow?: number;
  greenAt?: number;
  reverse?: boolean;
  suffix?: string;
  prefix?: string;
}

export type ChartFigure = PlotlyChartFigure | GaugeSpec;

// GET/PUT/DELETE /api/kpi-thresholds (admin-only). A band is {red_below,
// green_at_or_above} for every KPI except achievement, which uses
// {red_below, green_above} (strict '>' per the business spec).
export type ThresholdKpi = "atv" | "rpv" | "conversion" | "achievement" | "basket_size";
export type ThresholdBand = Record<string, number>;

export interface KpiThresholdsResponse {
  defaults: Record<ThresholdKpi, ThresholdBand>;
  overrides: Partial<Record<ThresholdKpi, ThresholdBand>>;
  effective: Record<ThresholdKpi, ThresholdBand>;
}

export interface WeatherReading {
  condition: string;
  temp_max_c: number | null;
  temp_min_c: number | null;
  precipitation_mm: number | null;
}

// Mirrors src/daily_dashboard_store.py's compute_live_kpis dict shape.
export interface DailyKpis {
  sales_target: number | null;
  net_sales: number | null;
  bill_quantity: number | null;
  remaining: number | null;
  remaining_pct: number | null;
  footfall: number | null;
  nob: number | null;
  atv: number | null;
  rpv: number | null;
  basket_size: number | null;
  conversion_pct: number | null;
  achievement_pct: number | null;
}

export type DailyKpiKey = keyof DailyKpis;

// GET /api/daily/live -- one store's live KPIs for one date, plus that day's
// weather / holiday / election context.
export interface DailyLiveSnapshot {
  store: string;
  date: string;
  day_name: string;
  is_weekend: boolean;
  day_type: string; // "Weekend" (Sat/Sun) | "Mid-Week" (Wed/Thu) | "Regular"
  holiday_name: string | null;
  election_name: string | null;
  weather: WeatherReading | null;
  kpis: DailyKpis;
  statuses: Partial<Record<DailyKpiKey, StatusColor>>;
  // Which of the five overridable ratio KPIs currently carry a manager's
  // hand-entered value (targets.overrides) rather than the computed figure.
  overridden: DailyKpiKey[];
  reason: string | null;
}

// GET /api/daily/live/overall -- blended live Daily KPIs across all three
// stores (raw totals summed, ratios recomputed) plus each store's own
// bundle. Admin-only.
export interface DailyOverallSnapshot {
  store: "ALL";
  date: string;
  kpis: DailyKpis;
  statuses: Partial<Record<DailyKpiKey, StatusColor>>;
  per_store: Record<string, DailyKpis>;
}

// The five ratio KPIs a manager can override at runtime on the Daily
// Dashboard -- must match src/daily_dashboard_store.OVERRIDABLE_KPIS.
export const OVERRIDABLE_DAILY_KPIS = ["atv", "rpv", "basket_size", "conversion_pct", "achievement_pct"] as const;
export type OverridableDailyKpi = (typeof OVERRIDABLE_DAILY_KPIS)[number];

// PUT/DELETE /api/daily/kpi-override response.
export interface KpiOverrideResult {
  store: string;
  date: string;
  kpis: DailyKpis;
  overridden: DailyKpiKey[];
}

// Admin-only "Sales Targets" page (GET/PUT/DELETE /api/targets,
// POST /api/targets/bulk). One entry per store+date; sales_target is the
// admin-set figure the Daily Dashboard's Remaining / Achievement % KPIs are
// measured against. net_sales / achievement_pct are the latest snapshot
// alongside it (null until the store logs sales), shown for target-vs-actual.
export interface StoreTargetEntry {
  date: string;
  sales_target: number | null;
  net_sales: number | null;
  achievement_pct: number | null;
}

export interface StoreTargetsResponse {
  store: string;
  entries: StoreTargetEntry[];
}

// Manual Daily Entry page -- backed by TEST_DAILY_DASHBOARD.xlsx via
// src/daily_dashboard_store.py, not DATASET.xlsx.
// time_slot is system-generated server-side (config.settings.time_slot_for_time,
// applied to bill_time/time at save) -- never user-editable, and null when
// the entry's time falls outside all 4 TIME_SLOT_ORDER bands (before 11 AM).
export interface BillEntry {
  row: number;
  date: string;
  bill_time: string | null;
  net_amount: number | null;
  bill_quantity: number | null;
  time_slot: string | null;
}

export interface BillLogResponse {
  store: string;
  date: string;
  entries: BillEntry[];
}

// Footfall and NOB are each their own separate, time-wise log -- structurally
// identical to BillEntry/BillLogResponse but with a single value column.
// Neither is derived from the other or from Bill Quantity; the KPI cards'
// Footfall/NOB figures are the live SUM of each log's entries for the day.
export interface FootfallEntry {
  row: number;
  date: string;
  time: string | null;
  footfall: number | null;
  time_slot: string | null;
}

export interface FootfallLogResponse {
  store: string;
  date: string;
  entries: FootfallEntry[];
}

export interface NobEntry {
  row: number;
  date: string;
  time: string | null;
  nob: number | null;
  time_slot: string | null;
}

export interface NobLogResponse {
  store: string;
  date: string;
  entries: NobEntry[];
}

// reason is optional -- omitted (or null) leaves that value as whatever was
// last saved. Net Sales/Bill Quantity/Footfall/NOB are never part of this
// payload -- they're always live sums of their own logs (see BillEntry/
// FootfallEntry/NobEntry).
export interface SaveEntryPayload {
  store: string;
  date: string;
  reason?: string | null;
}

export interface SaveEntryResult extends DailyKpis {
  store: string;
  date: string;
  reason: string | null;
}

export interface HistoryDateSummary {
  date: string;
  day_name: string;
  store: string;
  net_sales: number;
  footfall: number;
  bill_quantity: number;
  nob: number;
  sales_target?: number | null;
  achievement_pct?: number | null;
  atv?: number | null;
  conversion_pct?: number | null;
}

export interface TimeSlotSummary {
  time_slot: string;
  net_sales: number;
  bill_quantity: number;
  bill_count: number;
  footfall: number;
  nob: number;
  atv: number;
  rpv: number;
  basket_size: number;
  conversion_pct: number;
}

export interface HistoryDetailsResponse {
  store: string;
  date: string;
  day_name: string;
  kpis: DailyKpis;
  timeslot_breakdown: TimeSlotSummary[];
  bill_logs: (BillEntry & { store?: string })[];
  footfall_logs: (FootfallEntry & { store?: string })[];
  nob_logs: (NobEntry & { store?: string })[];
}
