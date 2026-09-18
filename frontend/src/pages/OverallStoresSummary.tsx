import { useQuery } from "@tanstack/react-query";
import { Gauge, Sparkles } from "lucide-react";

import { api } from "@/api/client";
import { ChartPanel } from "@/components/ChartPanel";
import { KpiCard } from "@/components/KpiCard";
import { Section } from "@/components/Section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TargetAdjustmentAlert } from "@/components/TargetAdjustmentAlert";
import { AtAGlanceCard } from "@/components/AtAGlanceCard";
import { DAILY_KPI_FORMATTERS, DAILY_KPI_FORMULAS, DAILY_KPI_LABELS, DAILY_KPI_ORDER, todayLocalDate } from "@/lib/format";
import { getKpiIconConfig } from "@/lib/kpiIcons";
import { emptyFilterState } from "@/lib/filterParams";
import { cn } from "@/lib/utils";
import type { DailyKpiKey, DailyKpis, FilterState, StatusColor } from "@/lib/types";

const STORES: { code: string; label: string }[] = [
  { code: "NM", label: "New Market" },
  { code: "HB", label: "Hatibagan" },
  { code: "CHW", label: "Chowringhee" },
];

const GAUGES: { id: string; title: string }[] = [
  { id: "daily_conversion_gauge", title: "Conversion %" },
  { id: "daily_achievement_gauge", title: "Achievement %" },
  { id: "daily_remaining_gauge", title: "Remaining %" },
  { id: "daily_atv_gauge", title: "ATV" },
  { id: "daily_rpv_gauge", title: "RPV" },
  { id: "daily_basket_size_gauge", title: "Basket Size" },
];

function resolveKpiStatus(key: DailyKpiKey, rawStatus: StatusColor | undefined, kpis?: DailyKpis): StatusColor | null | undefined {
  if (!kpis) return rawStatus;
  const hasOperations = (kpis.net_sales ?? 0) > 0 || (kpis.footfall ?? 0) > 0 || (kpis.bill_quantity ?? 0) > 0 || (kpis.nob ?? 0) > 0;
  if (!hasOperations) {
    if (key === "remaining_pct" || key === "remaining") {
      return "red";
    }
    return null;
  }
  if (rawStatus) return rawStatus;
  if (key === "net_sales" && kpis.achievement_pct !== undefined) {
    if ((kpis.achievement_pct ?? 0) >= 100) return "green";
    if ((kpis.achievement_pct ?? 0) >= 80) return "yellow";
    return "red";
  }
  if (key === "remaining" && kpis.remaining_pct !== undefined) {
    if ((kpis.remaining_pct ?? 0) <= 20) return "green";
    if ((kpis.remaining_pct ?? 0) <= 50) return "yellow";
    return "red";
  }
  return rawStatus;
}

/** Admin-only "Overall Stores Summary" (first entry in the Daily Operations
 * store selector). Blended live Daily KPIs across all three stores -- raw
 * totals summed server-side, ratios recomputed (GET /api/daily/live/overall)
 * -- plus a per-store side-by-side comparison. Read-only: no value overrides
 * or threshold editing here. */
export function OverallStoresSummary() {
  const today = todayLocalDate();
  const gaugeFilters: FilterState = { ...emptyFilterState(), stores: STORES.map((s) => s.code), start: today, end: today };

  const { data, isLoading } = useQuery({
    queryKey: ["daily-live", "ALL", today],
    queryFn: () => api.dailyLiveOverall(today),
  });

  return (
    <div className="space-y-6">
      {/* Target Adjustment Alert */}
      {data?.target_adjustment && (
        <TargetAdjustmentAlert alert={data.target_adjustment} storeCode="ALL" />
      )}

      {/* Level 1: Horizontal View - 4x3 KPI Matrix & Gauges at the Same Level with Imaginary Line */}
      <div className="rounded-2xl border border-border/80 bg-card/40 p-4 sm:p-5 shadow-sm backdrop-blur-sm">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
          
          {/* Left Side: 12 KPI Cards in Matrix */}
          <div className="flex flex-col justify-between lg:col-span-7">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Consolidated KPI Matrix
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">12 Blended Metrics</span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5 flex-1">
              {isLoading || !data
                ? Array.from({ length: DAILY_KPI_ORDER.length }).map((_, i) => (
                    <Skeleton key={i} className="h-[88px] sm:h-[96px] rounded-xl" />
                  ))
                : DAILY_KPI_ORDER.map((key, i) => (
                    <KpiCard
                      key={key}
                      kpiKey={key}
                      index={i}
                      label={DAILY_KPI_LABELS[key]}
                      value={data.kpis[key]}
                      formatter={DAILY_KPI_FORMATTERS[key]}
                      formula={DAILY_KPI_FORMULAS[key]}
                      status={resolveKpiStatus(key, data.statuses[key], data.kpis)}
                    />
                  ))}
            </div>
          </div>

          {/* Middle: Imaginary Line Separator */}
          <div className="hidden lg:flex lg:col-span-1 lg:h-full lg:flex-col lg:items-center lg:justify-center relative py-4">
            <div className="h-full w-px border-l-2 border-dashed border-indigo-500/30 dark:border-indigo-400/20 relative">
              <div className="absolute top-1/2 -left-3 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded-full bg-background border border-indigo-500/40 text-[10px] text-indigo-400 shadow-sm">
                <Sparkles className="h-3 w-3 animate-pulse" />
              </div>
            </div>
          </div>

          <div className="block lg:hidden w-full my-1 border-t-2 border-dashed border-indigo-500/30" />

          {/* Right Side: Gauges at Same Level */}
          <div className="flex flex-col justify-between lg:col-span-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Gauge className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Consolidated Gauges
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">Live Dials</span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 flex-1">
              {GAUGES.map((g) => (
                <div
                  key={g.id}
                  className="group relative bg-card/90 dark:bg-card/75 backdrop-blur-md rounded-xl border border-border/70 p-1.5 shadow-xs hover:shadow-md hover:border-primary/40 transition-all duration-200 flex items-center justify-center min-h-[146px] sm:min-h-[152px] overflow-hidden"
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent" />
                  <ChartPanel chartId={g.id} filters={gaugeFilters} className="h-[140px] sm:h-[146px] w-full" />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* At a Glance with Environmental Context & Granular Lookback Comparison */}
      <AtAGlanceCard
        storeCode="ALL"
        storeName="Consolidated (All 3 Stores)"
        date={today}
        data={data}
        isLoading={isLoading}
      />

      {/* Side-by-Side Store Comparison Table */}
      <Section title="By Store Breakdown">
        {isLoading || !data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-semibold">KPI</TableHead>
                  {STORES.map((s) => (
                    <TableHead key={s.code} className="text-right font-semibold">
                      {s.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right font-bold text-primary">Total (All Stores)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DAILY_KPI_ORDER.map((key) => {
                  const fmt = DAILY_KPI_FORMATTERS[key];
                  const iconCfg = getKpiIconConfig(key);
                  const IconComp = iconCfg?.icon;
                  return (
                    <TableRow key={key} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          {IconComp && (
                            <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", iconCfg?.bg, iconCfg?.border, iconCfg?.color)}>
                              <IconComp className="h-3 w-3" />
                            </div>
                          )}
                          <span>{DAILY_KPI_LABELS[key]}</span>
                        </div>
                      </TableCell>
                      {STORES.map((s) => (
                        <TableCell key={s.code} className="text-right tabular-nums text-muted-foreground">
                          {fmt(data.per_store[s.code]?.[key] ?? null)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-bold tabular-nums text-foreground">{fmt(data.kpis[key])}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
