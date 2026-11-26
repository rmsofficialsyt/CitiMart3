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

export interface DeficitBucketItem {
  id: string;
  store_code?: string;
  origin_date: string;
  original_deficit: number;
  remaining_deficit: number;
  recovered_amount?: number;
  recovery_pct?: number;
  recovery_start_date: string;
  recovery_end_date: string;
  recovery_window?: number;
  elapsed_days?: number;
  total_horizon_days?: number;
  days_remaining: number;
  scheduled_carry_today: number;
  daily_burn_rate?: number;
  fifo_priority?: number;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED" | "FORCED_MONTH_END";
}

export interface TargetAdjustmentAlert {
  active: boolean;
  target_date: string;
  store?: string;
  recovery_window?: number;
  carry_forward_policy?: "MONTH_END_CLOSE" | "TRUE_ROLLING";
  distribution_mode?: "EQUAL" | "TARGET_WEIGHTED";
  recovery_allocation?: string;

  // Target Metrics
  original_target?: number | null;
  admin_today_target?: number | null;
  scheduled_carry?: number;
  adjusted_target?: number | null;
  adjusted_cumulative_target?: number | null;
  today_actual_sales: number;
  adjusted_remaining: number | null;
  adjusted_target_gap?: number | null;
  original_target_gap?: number;
  recovery_achievement_pct: number | null;
  recovered_today?: number;
  true_surplus?: number;
  new_deficit_created?: number;

  // Deficit Backlog
  outstanding_before?: number;
  outstanding_after?: number;
  total_outstanding_deficit?: number;
  active_buckets_count?: number;
  deficit_buckets?: DeficitBucketItem[];

  // Status
  has_shortfall: boolean;
  status: "shortfall_recovery" | "surplus_cushion" | "neutral";

  // Legacy/Compatibility fields
  prev_date?: string;
  prev_target?: number | null;
  prev_actual?: number;
  prev_shortfall?: number;
  prev_surplus?: number;
}


export interface MonthlyTargetSummary {
  month_target: number | null;
  prev_year_total: number | null;
  month_net_sales?: number | null;
  growth_pct: number | null;
  target_growth_pct?: number | null;
  daily_present_sales?: number | null;
  daily_prev_year_sales?: number | null;
  daily_growth_pct?: number | null;
  daily_target?: number | null;
  daily_ach_pct?: number | null;
  daily_diff?: number | null;
}

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
  gauges?: Record<string, GaugeSpec>;
  target_adjustment?: TargetAdjustmentAlert | null;
  timeslot_breakdown?: Record<string, { net_sales: number; bill_quantity: number; footfall: number; nob: number }>;
  monthly_target_summary?: MonthlyTargetSummary | null;
  // Which of the five overridable ratio KPIs currently carry a manager's
  // hand-entered value (targets.overrides) rather than the computed figure.
  overridden: DailyKpiKey[];
  reason: string | null;
}

// GET /api/daily/live/overall -- blended live Daily KPIs across all three
// stores (raw totals summed, ratios recomputed) plus each store's own
// bundle. Admin-only.
export interface OperationsLogResponse {
  store: string;
  date: string;
  bills: BillEntry[];
  footfall: FootfallEntry[];
  nob: NobEntry[];
}

export interface DailyOverallSnapshot {
  store: "ALL";
  date: string;
  kpis: DailyKpis;
  statuses: Partial<Record<DailyKpiKey, StatusColor>>;
  gauges?: Record<string, GaugeSpec>;
  target_adjustment?: TargetAdjustmentAlert | null;
  timeslot_breakdown?: Record<string, { net_sales: number; bill_quantity: number; footfall: number; nob: number }>;
  monthly_target_summary?: MonthlyTargetSummary | null;
  per_store: Record<string, DailyKpis>;
}

export interface LandingHeroStoreTelemetry {
  name: string;
  subtitle: string;
  sales: string;
  raw_sales: number;
  salesGrowth: string;
  footfall: string;
  raw_footfall: number;
  conversion: string;
  raw_conversion: number;
  atv: string;
  raw_atv: number;
  basket: string;
  raw_basket: number;
  achievement_pct: number | null;
  peakRush: string;
  hourlyPoints: {
    time: string;
    value: number;
    amount: string;
    isPeak?: boolean;
  }[];
}

export interface LandingHeroResponse {
  recorded_date: string;
  day_name: string;
  available_dates?: string[];
  stores: Record<string, LandingHeroStoreTelemetry>;
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
  prev_year_net_sales?: number | null;
  net_sales: number | null;
  achievement_pct: number | null;
  footfall?: number | null;
  nob?: number | null;
  bill_quantity?: number | null;
  atv?: number | null;
  rpv?: number | null;
  basket_size?: number | null;
  conversion_pct?: number | null;
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
  remaining?: number | null;
  achievement_pct?: number | null;
  remaining_pct?: number | null;
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

export interface DailyHistoryBreakdown {
  date: string;
  day_name: string;
  net_sales: number;
  sales_target: number | null;
  achievement_pct: number | null;
  remaining: number | null;
  bill_quantity: number;
  footfall: number;
  nob: number;
  basket_size: number;
  atv: number;
  rpv: number;
  conversion_pct: number;
}

export interface HistoryRangeResponse {
  store: string;
  start_date: string;
  end_date: string;
  days_count: number;
  kpis: DailyKpis;
  daily_breakdown: DailyHistoryBreakdown[];
  timeslot_breakdown: TimeSlotSummary[];
  bill_logs: (BillEntry & { store?: string; date?: string })[];
  footfall_logs: (FootfallEntry & { store?: string; date?: string })[];
  nob_logs: (NobEntry & { store?: string; date?: string })[];
}

export type DirectivePriority = "urgent" | "high" | "normal" | "info";
export type DirectiveCategory = "sales_target" | "special_notice" | "operations" | "announcement" | "remarks" | "complaint" | "requirements";
export type DirectiveTargetStore = "ALL" | "NM" | "HB" | "CHW" | "ADMIN";

export interface Directive {
  id: number;
  title: string;
  message: string;
  priority: DirectivePriority;
  category: DirectiveCategory;
  target_store: DirectiveTargetStore;
  author_name: string;
  author_title: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  read_by: string[];
}

export interface DirectivesSummaryResponse {
  directives: Directive[];
  latest_active: Directive | null;
  unread_count: number;
  has_urgent: boolean;
}

export interface CreateDirectivePayload {
  title: string;
  message: string;
  priority?: DirectivePriority;
  category?: DirectiveCategory;
  target_store?: DirectiveTargetStore;
  author_name?: string;
  author_title?: string;
}

export interface UpdateDirectivePayload {
  title?: string;
  message?: string;
  priority?: DirectivePriority;
  category?: DirectiveCategory;
  target_store?: DirectiveTargetStore;
  author_name?: string;
  author_title?: string;
  active?: boolean;
}

// ==========================================
// Required Product Requisition Types
// ==========================================

export interface RequisitionItem {
  sl_no: number;
  division: string;
  section: string;
  department: string;
  product_required: string;
  barcode_details: string;
  brand: string;
  mrp: string;
  time_required: string;
  remarks: string;
}

export type RequisitionStatus = "Pending" | "In Review" | "Approved" | "In Transit" | "Fulfilled" | "Rejected";

export interface RequisitionSlip {
  _id: number;
  req_code: string;
  store_code: "NM" | "HB" | "CHW";
  store_name: string;
  store_name_full: string;
  date: string;
  created_at: string;
  updated_at: string;
  created_by_user: string;
  created_by_name: string;
  created_by_role: string;
  target_recipient: string;
  priority: "Urgent" | "High" | "Normal";
  status: RequisitionStatus;
  remarks_general: string;
  items: RequisitionItem[];
  item_count: number;
  admin_remarks: string;
  actioned_by?: string;
  actioned_at?: string;
}

export interface RequisitionsListResponse {
  status: string;
  count: number;
  requisitions: RequisitionSlip[];
}

export interface RequisitionLineOption {
  division: string;
  section: string;
  department: string;
  label: string;
  raw: string;
}

export interface CategoryHierarchyResponse {
  tree: Record<string, Record<string, string[]>>;
  divisions: string[];
  sections: string[];
  departments: string[];
  lines?: RequisitionLineOption[];
  dept_meta?: Record<string, { division: string; section: string }>;
  sec_meta?: Record<string, string[]>;
  total_divisions?: number;
  total_sections?: number;
  total_departments?: number;
  total_lines?: number;
}

export interface CreateRequisitionPayload {
  store_code: "NM" | "HB" | "CHW";
  date?: string;
  items: {
    sl_no?: number;
    division: string;
    section: string;
    department: string;
    product_required?: string;
    barcode_details: string;
    brand: string;
    mrp?: string;
    time_required: string;
    remarks?: string;
  }[];
  priority?: "Urgent" | "High" | "Normal";
  remarks_general?: string;
}

export interface UpdateRequisitionStatusPayload {
  status: RequisitionStatus;
  admin_remarks?: string;
}




// Mirror of backend src/chat/links.py build_links items (ChatResponse.links).
// "app" hrefs are in-app (/app?store=&view=&date=); "source" hrefs are external http(s).
export interface ChatLink {
  kind: "app" | "source";
  label: string;
  href: string;
}

// ---- Co-Pilot token usage window (backend src/chat/usage.py + usage_store.py) ----
// Display only: "available" = configured caps, not Google quota.
export interface TokenCounts {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  llm_calls: number;
}

/** One turn's usage, as returned on POST /api/daily/chat. */
export interface TurnUsage extends TokenCounts {
  models: string[];
}

/** Caps the turn ran under. */
export interface TurnLimits {
  context_window: number;
  tier: "short" | "medium" | "long" | null;
  max_output_tokens: number | null;
}

export interface ChatUsageSummary {
  model: string;
  fallback_models: string[];
  limits: {
    context_window: number;
    max_output: { short: number; medium: number; long: number };
    max_input_chars: number;
    history_messages: number;
  };
  today: TokenCounts & { turns: number };
  session: (TokenCounts & { turns: number }) | null;
  last_turn: (TurnUsage & { tier: TurnLimits["tier"]; created_at: string | null }) | null;
}

// ---- AI Decision Advisor (GET /api/advisor, backend src/advisor/engine.py) ----
export type AdvisorInsightId =
  | "no_target" | "closing_gap" | "pace_behind" | "pace_ahead"
  | "conversion_low" | "atv_low" | "basket_low" | "data_gap" | "balanced"
  // Tier 2 (src/advisor/anomalies.py, staffing.py, stock_signals.py)
  | "conversion_leak" | "atv_drop" | "dead_hours" | "mix_small_heavy" | "mix_large_heavy" | "big_bill"
  | "understaffed_peak" | "break_window" | "attendance_missing"
  | "stock_out" | "stock_low" | "slow_movers" | "transfer_suggested";

export interface AdvisorOutcome {
  kpi: string;
  trials: number;
  wins: number;
  win_rate_pct: number;
  avg_lift_pct: number;
  /** Enough scored trials for the Advisor to rank this action by win rate. */
  ranked: boolean;
}

export interface AdvisorStockItem {
  barcode: string;
  item_name: string | null;
  department: string | null;
  current_stock: number;
  reorder_level: number;
}

export interface AdvisorTransferSuggestion {
  direction: "inbound" | "outbound";
  from_store: string;
  to_store: string;
  barcode: string;
  item_name: string | null;
  quantity: number;
}

export interface AdvisorStaffSlot {
  slot: string;
  staff: number;
  footfall: number | null;
  footfall_source: "actual" | "expected";
  footfall_per_staff: number | null;
  upcoming: boolean;
}

export interface AdvisorInsight {
  id: AdvisorInsightId;
  severity: "urgent" | "opportunity" | "info" | "success";
  kpi: string | null;
  /** The exact numbers the rule used; keys depend on `id`. */
  evidence: Record<string, number | string | string[] | null>;
}

export interface AdvisorChecklistItem {
  action_key: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  /** Measured track record of this action at this store (absent from PUT responses). */
  outcome?: AdvisorOutcome | null;
}

export interface AdvisorResponse {
  store: string;
  date: string;
  as_of: string;
  day_status: "open" | "closed" | "not_started";
  current_slot: string | null;
  pacing: {
    available: boolean;
    source: "similar_days" | "same_weekday" | "all_days" | null;
    days_used: number;
    slots: string[];
    cumulative_share: number[] | null;
    expected_share_now: number | null;
    expected_achievement_pct: number | null;
    context: { holiday: boolean; rainy: boolean | null; matched_on: string[] } | null;
  };
  bill_mix: {
    available: boolean;
    norm_available: boolean;
    today_bills: number;
    norm_bills: number;
    bands: { band: "under_500" | "500_1500" | "over_1500"; today_count: number; today_share_pct: number; norm_share_pct: number | null }[];
    largest_bill: number | null;
  };
  staffing: {
    available: boolean;
    active_staff: number;
    logged: number;
    present: number;
    times_known: boolean | null;
    slots: AdvisorStaffSlot[];
  };
  stock: {
    available: boolean;
    total_skus?: number;
    out_of_stock_count?: number;
    low_stock_count?: number;
    out_of_stock?: AdvisorStockItem[];
    low_stock?: AdvisorStockItem[];
    slow_movers?: AdvisorStockItem[];
    slow_mover_days?: number;
    transfers?: AdvisorTransferSuggestion[];
  };
  outcomes: Record<string, AdvisorOutcome>;
  projection: {
    projected_close: number | null;
    projected_achievement_pct: number | null;
    remaining_to_target: number | null;
    bills_needed_at_current_atv: number | null;
  };
  kpis: Record<"net_sales" | "sales_target" | "achievement_pct" | "footfall" | "nob" | "conversion_pct" | "atv" | "basket_size", number | null>;
  insights: AdvisorInsight[];
  checklist: AdvisorChecklistItem[];
}

// ---- Advisor Tier 3 (src/advisor/{drivers,brief,explain,replan,whatif}.py) ----
export interface AdvisorDriver {
  driver: "traffic" | "conversion" | "atv";
  /** ₹ share of the gap vs baseline; the three always sum to the gap. */
  amount: number;
  change_pct: number;
  current: number;
  baseline: number;
}

export interface AdvisorStoreReview {
  store: string;
  store_name: string;
  date: string;
  /** "in_progress" only in the midday brief, where nothing has been missed yet. */
  verdict: "hit" | "missed" | "in_progress" | "no_target" | "no_data";
  net_sales: number;
  sales_target: number | null;
  achievement_pct: number | null;
  achievement_status: "red" | "yellow" | "green" | null;
  gap_to_target: number | null;
  footfall: number | null;
  nob: number | null;
  conversion_pct: number | null;
  atv: number | null;
  baseline: { net_sales: number; footfall: number; nob: number; days_used: number } | null;
  vs_baseline_pct: number | null;
  delta_vs_baseline: number | null;
  drivers: AdvisorDriver[];
}

export interface AdvisorWatchOut {
  id: "no_target" | "holiday" | "election" | "rain" | "weekend" | "stock_out" | "attendance_missing";
  evidence: Record<string, number | string>;
}

export type AdvisorBriefKind = "morning" | "midday" | "evening";

/** Midday only: today so far against the store's learned pace curve. */
export interface AdvisorBriefPace {
  status: "behind" | "on_pace" | "ahead" | "target_hit" | "no_pace_curve" | "no_target" | "no_data";
  expected_achievement_pct: number | null;
  pace_gap_pp: number | null;
  projected_close: number | null;
  projected_achievement_pct: number | null;
  curve_days: number;
}

export interface AdvisorBrief {
  kind: AdvisorBriefKind;
  review_date: string;
  watch_date: string;
  /** Midday only: the moment the pace was judged at. */
  as_of: string | null;
  network: {
    net_sales: number;
    sales_target: number | null;
    achievement_pct: number | null;
    projected_close?: number | null;
    projected_achievement_pct?: number | null;
  };
  stores: (AdvisorStoreReview & {
    watch_outs: AdvisorWatchOut[];
    /** Midday: the completed slots the drivers compare; null for full-day briefs. */
    slots_compared: string[] | null;
    pace?: AdvisorBriefPace;
  })[];
}

export interface AdvisorReason {
  id: string;
  /** ₹ impact for driver reasons; null for non-monetary signals. */
  impact: number | null;
  evidence: Record<string, number | string | null>;
}

export interface AdvisorExplain {
  store: string;
  date: string;
  review: AdvisorStoreReview;
  context: { holiday: string | null; election: string | null; day_type: string; rainy: boolean | null };
  staffing: { present: number | null; usual_present: number | null };
  reasons: AdvisorReason[];
}

export interface AdvisorReplan {
  store: string;
  month: string;
  available: boolean;
  reason?: "no_targets" | "month_over";
  weighting?: "weekday" | "equal";
  month_target?: number;
  actual_closed_days?: number;
  still_needed?: number;
  rows: { date: string; weekday: number; current_target: number | null; recommended_target: number; delta: number | null }[];
}

export interface AdvisorWhatIfClose {
  base_close: number | null;
  scenario_close: number | null;
  base_achievement_pct?: number | null;
  scenario_achievement_pct?: number | null;
  reason: string | null;
}

export interface AdvisorWhatIf {
  store: string;
  date: string;
  available: boolean;
  reason?: string;
  multiplier: number | null;
  day: (AdvisorWhatIfClose & { net_sales: number; sales_target: number | null }) | null;
  month: (AdvisorWhatIfClose & { month_target: number | null }) | null;
}
