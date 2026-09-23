import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, Sparkles } from "lucide-react";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { ChartPanel } from "@/components/ChartPanel";
import { DailyExportMenu } from "@/components/DailyExportMenu";
import { DailyHeroCard } from "@/components/DailyHeroCard";
import { KpiCard } from "@/components/KpiCard";
import { LoggedDailyEntries } from "@/components/LoggedDailyEntries";
import { Section } from "@/components/Section";
import { ThresholdPopover } from "@/components/ThresholdPopover";
import { TargetAdjustmentAlert } from "@/components/TargetAdjustmentAlert";
import { AiStoreAdvisor } from "@/components/AiStoreAdvisor";
import { AtAGlanceCard } from "@/components/AtAGlanceCard";
import { Skeleton } from "@/components/ui/skeleton";
import { DAILY_KPI_FORMATTERS, DAILY_KPI_FORMULAS, DAILY_KPI_LABELS, DAILY_KPI_ORDER, todayLocalDate } from "@/lib/format";
import { EDITABLE_THRESHOLDS } from "@/lib/kpiThresholds";
import { emptyFilterState } from "@/lib/filterParams";
import { STORE_NAME_BY_CODE, type StoreCode } from "@/lib/authUsers";
import type { DailyKpiKey, DailyKpis, FilterState, StatusColor } from "@/lib/types";

// The six gauges shown in 3x2 matrix format.
const GAUGES: { id: string; title: string }[] = [
  { id: "daily_conversion_gauge", title: "Conversion %" },
  { id: "daily_achievement_gauge", title: "Achievement %" },
  { id: "daily_remaining_gauge", title: "Remaining %" },
  { id: "daily_atv_gauge", title: "ATV" },
  { id: "daily_rpv_gauge", title: "RPV" },
  { id: "daily_basket_size_gauge", title: "Basket Size" },
];

/** Resolves KPI card status color:
 * When no operations are logged yet for the day (0 net sales, 0 footfall, 0 bills),
 * all KPI cards are neutral (no red, yellow, green), EXCEPT remaining % (100%),
 * which displays RED until operations commence. */
function resolveKpiStatus(key: DailyKpiKey, rawStatus: StatusColor | undefined, kpis?: DailyKpis): StatusColor | null | undefined {
  if (!kpis) return rawStatus;
  const hasOperations = (kpis.net_sales ?? 0) > 0 || (kpis.footfall ?? 0) > 0 || (kpis.bill_quantity ?? 0) > 0 || (kpis.nob ?? 0) > 0;
  if (!hasOperations) {
    if (key === "remaining_pct" || key === "remaining") {
      return "red";
    }
    return null; // neutral state at day start
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

/** One store's live Daily Dashboard:
 * Level 1: 4x3 KPI Cards matrix and 3x2 Gauges matrix at the exact same horizontal level with an imaginary line separator.
 * Level 2: AI Store Intelligence Decision Advisor & Target Adjustment Alert.
 * Level 3: 2 Time-Slot Charts (Today's Performance & Footfall vs NOB) in 2-column horizontal view with multi-type format switchers.
 * Level 4: At a Glance with Today's Context & Granular Lookback Comparison.
 * Level 5: Logged Floor Operations (Unified Logged Daily Entries). */
function StoreDailyDashboard({ store }: { store: StoreCode }) {
  const today = todayLocalDate();
  const gaugeFilters: FilterState = { ...emptyFilterState(), stores: [store], start: today, end: today };
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  // Admin-only: the red/yellow/green band editor on the five ratio cards.
  const { data: thresholds } = useQuery({
    queryKey: ["kpi-thresholds"],
    queryFn: () => api.kpiThresholds(),
    enabled: isAdmin,
  });

  const thresholdMutation = useMutation({
    mutationFn: (action: { type: "save"; patch: Record<string, Record<string, number>> } | { type: "reset"; kpi: string }) =>
      action.type === "save" ? api.putKpiThresholds(action.patch) : api.resetKpiThreshold(action.kpi),
    onSuccess: () => {
      for (const key of [["daily-live"], ["chart"], ["kpi-thresholds"]]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  const storeName = STORE_NAME_BY_CODE[store] ?? store;

  const { data, isLoading } = useQuery({
    queryKey: ["daily-live", store, today],
    queryFn: () => api.dailyLive(store, today),
  });

  return (
    <div className="space-y-6">
      <DailyHeroCard storeName={storeName} data={data} />


      <div className="flex flex-wrap justify-end gap-2">
        <DailyExportMenu store={store} />
      </div>

      {/* AI Store Intelligence & Decision Advisor */}
      {data && (
        <AiStoreAdvisor kpis={data.kpis} storeCode={store} storeName={storeName} />
      )}

      {/* Target Adjustment Alert */}
      {data?.target_adjustment && (
        <TargetAdjustmentAlert alert={data.target_adjustment} storeCode={store} />
      )}

      {/* Level 1: Horizontal View - 4x3 KPI Matrix & Gauges at the Same Level with Imaginary Line */}
      <div className="rounded-2xl border border-border/80 bg-card/40 p-3 sm:p-5 shadow-sm backdrop-blur-sm">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:items-stretch">
          
          {/* Left Side: 12 KPI Cards in 4x3 Matrix */}
          <div className="flex flex-col justify-between xl:col-span-7">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Store KPI Matrix
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">12 Live Metric Indicators</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-4 gap-2 sm:gap-2.5 flex-1">
              {isLoading || !data
                ? Array.from({ length: DAILY_KPI_ORDER.length }).map((_, i) => (
                    <Skeleton key={i} className="h-[88px] sm:h-[96px] rounded-xl" />
                  ))
                : DAILY_KPI_ORDER.map((key, i) => {
                    const editable = isAdmin ? EDITABLE_THRESHOLDS[key] : undefined;
                    const band = editable && thresholds ? thresholds.effective[editable.kpi] : undefined;
                    const resolvedStatus = resolveKpiStatus(key, data.statuses[key], data.kpis);

                    return (
                      <KpiCard
                        key={key}
                        kpiKey={key}
                        index={i}
                        label={DAILY_KPI_LABELS[key]}
                        value={data.kpis[key]}
                        formatter={DAILY_KPI_FORMATTERS[key]}
                        formula={DAILY_KPI_FORMULAS[key]}
                        status={resolvedStatus}
                        thresholdControl={
                          editable && band ? (
                            <ThresholdPopover
                              kpiKey={editable.kpi}
                              kpiLabel={DAILY_KPI_LABELS[key]}
                              greenKey={editable.greenKey}
                              band={band}
                              isOverridden={!!thresholds?.overrides[editable.kpi]}
                              onSave={(patch) => thresholdMutation.mutate({ type: "save", patch })}
                              onReset={() => thresholdMutation.mutate({ type: "reset", kpi: editable.kpi })}
                            />
                          ) : undefined
                        }
                      />
                    );
                  })}
            </div>
          </div>

          {/* Middle: Imaginary Line Separator */}
          <div className="hidden xl:flex xl:col-span-1 xl:h-full xl:flex-col xl:items-center xl:justify-center relative py-4">
            <div className="h-full w-px border-l-2 border-dashed border-indigo-500/30 dark:border-indigo-400/20 relative">
              <div className="absolute top-1/2 -left-3 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded-full bg-background border border-indigo-500/40 text-[10px] text-indigo-400 shadow-sm">
                <Sparkles className="h-3 w-3 animate-pulse" />
              </div>
            </div>
          </div>

          <div className="block xl:hidden w-full my-2 border-t-2 border-dashed border-indigo-500/30" />

          {/* Right Side: Gauges at Same Level */}
          <div className="flex flex-col justify-between xl:col-span-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Gauge className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Performance Gauges
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">Live Dials</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-3 gap-2 sm:gap-2.5 flex-1">
              {GAUGES.map((g) => (
                <div
                  key={g.id}
                  className="group relative bg-card/90 dark:bg-card/75 backdrop-blur-md rounded-xl border border-border/70 p-1.5 shadow-xs hover:shadow-md hover:border-primary/40 transition-all duration-200 flex items-center justify-center min-h-[145px] sm:min-h-[155px] overflow-hidden"
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent" />
                  <ChartPanel chartId={g.id} filters={gaugeFilters} className="h-auto w-full min-h-[135px]" />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Level 3: 2 Charts in Horizontal View with Interactive Format Switchers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Section title="Today's Performance by Time Slot" className="mb-0 h-full">
          <ChartPanel chartId="daily_timeslot_breakdown" filters={gaugeFilters} className="h-[320px] sm:h-[420px] w-full" />
        </Section>

        <Section title="Footfall vs NOB (based on Time Slot)" className="mb-0 h-full">
          <ChartPanel chartId="daily_footfall_nob" filters={gaugeFilters} className="h-[320px] sm:h-[420px] w-full" />
        </Section>
      </div>

      {/* Level 4: At a Glance with Today's Context & Granular Lookback Comparison */}
      <AtAGlanceCard
        storeCode={store}
        storeName={storeName}
        date={today}
        data={data}
        isLoading={isLoading}
      />

      {/* Level 5: Logged Floor Operations (Unified Logged Daily Entries) */}
      <LoggedDailyEntries store={store} date={today} />
    </div>
  );
}

export function DailyDashboardNM() {
  return <StoreDailyDashboard store="NM" />;
}

export function DailyDashboardHB() {
  return <StoreDailyDashboard store="HB" />;
}

export function DailyDashboardCHW() {
  return <StoreDailyDashboard store="CHW" />;
}
