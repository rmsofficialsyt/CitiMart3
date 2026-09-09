import type { ThresholdKpi } from "@/lib/types";

// The five KPIs whose red/yellow/green status band is admin-editable at
// runtime (PUT /api/kpi-thresholds -- Historical Analytics Overhaul A3):
// which threshold-KPI key each maps to, and which "green" boundary it uses
// (Achievement % is strict '>' via `green_above`; the rest are '>=' via
// `green_at_or_above`). Keyed by the KPI *field* name, which is identical
// across the Executive Overview KpiBundle and the Daily Dashboard's live KPI
// dict -- both pages read this one map so the editable set can't drift.
export const EDITABLE_THRESHOLDS: Record<string, { kpi: ThresholdKpi; greenKey: "green_above" | "green_at_or_above" }> = {
  atv: { kpi: "atv", greenKey: "green_at_or_above" },
  rpv: { kpi: "rpv", greenKey: "green_at_or_above" },
  basket_size: { kpi: "basket_size", greenKey: "green_at_or_above" },
  conversion_pct: { kpi: "conversion", greenKey: "green_at_or_above" },
  achievement_pct: { kpi: "achievement", greenKey: "green_above" },
};
