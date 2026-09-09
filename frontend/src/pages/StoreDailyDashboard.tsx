import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { ChartPanel } from "@/components/ChartPanel";
import { DailyExportMenu } from "@/components/DailyExportMenu";
import { DailyHeroCard } from "@/components/DailyHeroCard";
import { KpiCard } from "@/components/KpiCard";
import { LoggedDailyEntries } from "@/components/LoggedDailyEntries";
import { Section } from "@/components/Section";
import { ThresholdPopover } from "@/components/ThresholdPopover";
import { Skeleton } from "@/components/ui/skeleton";
import { DAILY_KPI_FORMATTERS, DAILY_KPI_FORMULAS, DAILY_KPI_LABELS, DAILY_KPI_ORDER, todayLocalDate } from "@/lib/format";
import { EDITABLE_THRESHOLDS } from "@/lib/kpiThresholds";
import { emptyFilterState } from "@/lib/filterParams";
import { STORE_NAME_BY_CODE, type StoreCode } from "@/lib/authUsers";
import type { FilterState } from "@/lib/types";

// The six gauges shown in one responsive row. Remaining %'s bands are just
// Achievement %'s mirrored around 100.
const GAUGES: { id: string; title: string }[] = [
  { id: "daily_conversion_gauge", title: "Conversion %" },
  { id: "daily_achievement_gauge", title: "Achievement %" },
  { id: "daily_remaining_gauge", title: "Remaining %" },
  { id: "daily_atv_gauge", title: "ATV" },
  { id: "daily_rpv_gauge", title: "RPV" },
  { id: "daily_basket_size_gauge", title: "Basket Size" },
];

/** One store's live Daily Dashboard: hero card (store/date/time), the store's
 * own KPI set (MongoDB, via GET /api/daily/live), six gauges, today's
 * time-slot sales performance, same-day context (weather, holiday, election),
 * then the store's logged Footfall / Bills & NOB entries (edited inline).
 * Manual per-card value overrides stay removed. The admin (only) gets the
 * <ThresholdPopover> gear on the five band-editable KPI cards -- ATV, RPV,
 * Basket Size, Conversion %, Achievement % -- editing the global
 * PUT /api/kpi-thresholds overlay; a store manager sees the cards read-only.
 *
 * The "Previous Year — Same Day" matrix this page used to end Today's Context
 * with is gone: it read DATASET.xlsx, which lives in the Analytics &
 * Forecasting sub-project now. GET /api/daily/live no longer returns a
 * `previous_year` key at all. */
function StoreDailyDashboard({ store }: { store: StoreCode }) {
  const today = todayLocalDate();
  // The page pins its own scope -- this one store, today -- rather than
  // inheriting a shared sidebar FilterState, because there is no sidebar in
  // this app: every Daily Operations page is single-store and single-day.
  const gaugeFilters: FilterState = { ...emptyFilterState(), stores: [store], start: today, end: today };
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  // Admin-only: the red/yellow/green band editor on the five ratio cards.
  // The endpoint is admin-gated app-side, so a manager must not query it.
  const { data: thresholds } = useQuery({
    queryKey: ["kpi-thresholds"],
    queryFn: () => api.kpiThresholds(),
    enabled: isAdmin,
  });

  const thresholdMutation = useMutation({
    mutationFn: (action: { type: "save"; patch: Record<string, Record<string, number>> } | { type: "reset"; kpi: string }) =>
      action.type === "save" ? api.putKpiThresholds(action.patch) : api.resetKpiThreshold(action.kpi),
    onSuccess: () => {
      // Cards' statuses (GET /api/daily/live) and the gauges both resolve
      // their bands server-side at call time, so both must refetch.
      for (const key of [["daily-live"], ["chart"], ["kpi-thresholds"]]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  // Store display names are a fixed three-entry table (config/settings.py's
  // STORE_CODE_TO_NAME, mirrored in lib/authUsers.ts) -- no round-trip needed,
  // and the /api/filters/defaults endpoint this used to read is gone with the
  // historical half of the app.
  const storeName = STORE_NAME_BY_CODE[store] ?? store;

  const { data, isLoading } = useQuery({
    queryKey: ["daily-live", store, today],
    queryFn: () => api.dailyLive(store, today),
  });

  return (
    <div>
      <DailyHeroCard storeName={storeName} />

      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <DailyExportMenu store={store} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-3">
        {isLoading || !data
          ? Array.from({ length: DAILY_KPI_ORDER.length }).map((_, i) => <Skeleton key={i} className="h-[96px] rounded-xl sm:h-[110px]" />)
          : DAILY_KPI_ORDER.map((key, i) => {
              const editable = isAdmin ? EDITABLE_THRESHOLDS[key] : undefined;
              const band = editable && thresholds ? thresholds.effective[editable.kpi] : undefined;
              return (
                <KpiCard
                  key={key}
                  index={i}
                  label={DAILY_KPI_LABELS[key]}
                  value={data.kpis[key]}
                  formatter={DAILY_KPI_FORMATTERS[key]}
                  formula={DAILY_KPI_FORMULAS[key]}
                  status={data.statuses[key]}
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

      {/* All six gauges on one level -- wraps to 3-up / 2-up on smaller screens. */}
      <div className="mb-4 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {GAUGES.map((g) => (
          <div key={g.id} className="bg-card rounded-xl border p-2">
            <ChartPanel chartId={g.id} filters={gaugeFilters} className="h-[240px] sm:h-[300px] w-full" />
          </div>
        ))}
      </div>

      <Section title="Today's Performance by Time Slot" className="mb-4">
        <ChartPanel chartId="daily_timeslot_breakdown" filters={gaugeFilters} className="h-[320px] sm:h-[460px] w-full" />
      </Section>

      <Section title="Footfall vs NOB (based on Time Slot)" className="mb-4">
        <ChartPanel chartId="daily_footfall_nob" filters={gaugeFilters} className="h-[320px] sm:h-[460px] w-full" />
      </Section>

      <Section title="Today's Context" className="mb-4">
        {isLoading || !data ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <span className="bg-muted rounded-full px-2.5 py-1 text-xs font-semibold">{data.day_name}</span>
              <span className="bg-muted rounded-full px-2.5 py-1 text-xs font-semibold">{data.day_type}</span>
              {data.holiday_name && (
                <span className="bg-status-yellow-bg text-status-yellow rounded-full px-2.5 py-1 text-xs font-semibold">
                  {data.holiday_name}
                </span>
              )}
              {data.election_name && (
                <span className="bg-status-yellow-bg text-status-yellow rounded-full px-2.5 py-1 text-xs font-semibold">
                  {data.election_name}
                </span>
              )}
            </div>

            <div>
              <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Weather (Kolkata)</div>
              {data.weather ? (
                <p className="mt-0.5">
                  {data.weather.condition}
                  {data.weather.temp_max_c != null && (
                    <>
                      {" "}
                      · {Math.round(data.weather.temp_max_c)}°C / {Math.round(data.weather.temp_min_c ?? data.weather.temp_max_c)}°C
                    </>
                  )}
                  {data.weather.precipitation_mm != null && data.weather.precipitation_mm > 0 && (
                    <> · {data.weather.precipitation_mm.toFixed(0)}mm rain</>
                  )}
                </p>
              ) : (
                <p className="text-muted-foreground mt-0.5">Weather unavailable</p>
              )}
            </div>

            {data.reason && (
              <div>
                <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Remarks</div>
                <p className="mt-0.5">{data.reason}</p>
              </div>
            )}
          </div>
        )}
      </Section>

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
