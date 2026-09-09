import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import { ChartPanel } from "@/components/ChartPanel";
import { KpiCard } from "@/components/KpiCard";
import { Section } from "@/components/Section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DAILY_KPI_FORMATTERS, DAILY_KPI_FORMULAS, DAILY_KPI_LABELS, DAILY_KPI_ORDER, todayLocalDate } from "@/lib/format";
import { emptyFilterState } from "@/lib/filterParams";
import type { FilterState } from "@/lib/types";

const STORES: { code: string; label: string }[] = [
  { code: "NM", label: "New Market" },
  { code: "HB", label: "Hatibagan" },
  { code: "CHW", label: "Chowringhee" },
];

const GAUGES = [
  "daily_conversion_gauge",
  "daily_achievement_gauge",
  "daily_remaining_gauge",
  "daily_atv_gauge",
  "daily_rpv_gauge",
  "daily_basket_size_gauge",
];

/** Admin-only "Overall Stores Summary" (first entry in the Daily Operations
 * store selector). Blended live Daily KPIs across all three stores -- raw
 * totals summed server-side, ratios recomputed (GET /api/daily/live/overall)
 * -- plus a per-store side-by-side comparison. Read-only: no value overrides
 * or threshold editing here. */
export function OverallStoresSummary() {
  const today = todayLocalDate();
  // All three stores, today -- the one page that deliberately passes a
  // multi-store scope, which api/routes_charts.py blends (admin-only).
  const gaugeFilters: FilterState = { ...emptyFilterState(), stores: STORES.map((s) => s.code), start: today, end: today };

  const { data, isLoading } = useQuery({
    queryKey: ["daily-live", "ALL", today],
    queryFn: () => api.dailyLiveOverall(today),
  });

  return (
    <div>
      <Section title="All Stores — Today" className="mb-4">
        <p className="text-muted-foreground text-sm">
          Blended live KPIs for New Market, Hatibagan and Chowringhee combined. Totals are summed across stores and the
          ratios (ATV, RPV, Conversion %, Achievement %, …) are recomputed from those totals.
        </p>
      </Section>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-3">
        {isLoading || !data
          ? Array.from({ length: DAILY_KPI_ORDER.length }).map((_, i) => <Skeleton key={i} className="h-[96px] rounded-xl sm:h-[110px]" />)
          : DAILY_KPI_ORDER.map((key, i) => (
              <KpiCard
                key={key}
                index={i}
                label={DAILY_KPI_LABELS[key]}
                value={data.kpis[key]}
                formatter={DAILY_KPI_FORMATTERS[key]}
                formula={DAILY_KPI_FORMULAS[key]}
                status={data.statuses[key]}
              />
            ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {GAUGES.map((id) => (
          <div key={id} className="bg-card rounded-xl border p-2">
            <ChartPanel chartId={id} filters={gaugeFilters} className="h-[240px] sm:h-[300px] w-full" />
          </div>
        ))}
      </div>

      <Section title="By Store">
        {isLoading || !data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>KPI</TableHead>
                  {STORES.map((s) => (
                    <TableHead key={s.code} className="text-right">
                      {s.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DAILY_KPI_ORDER.map((key) => {
                  const fmt = DAILY_KPI_FORMATTERS[key];
                  return (
                    <TableRow key={key}>
                      <TableCell>{DAILY_KPI_LABELS[key]}</TableCell>
                      {STORES.map((s) => (
                        <TableCell key={s.code} className="text-right tabular-nums">
                          {fmt(data.per_store[s.code]?.[key] ?? null)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold tabular-nums">{fmt(data.kpis[key])}</TableCell>
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
