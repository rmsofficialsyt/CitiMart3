import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useMemo, useState } from "react";
import { BarChart3, Eye, EyeOff, Grid3X3, LineChart, PieChart, TrendingUp } from "lucide-react";

import { api } from "@/api/client";
import { GlossyGauge } from "@/components/GlossyGauge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  MODERN_PALETTE,
  RechartsAreaChart,
  RechartsColumnChart,
  RechartsDonutChart,
  RechartsLineChart,
  type RechartDataPoint,
  type SeriesConfig,
} from "@/components/charts/RechartsComponents";
import { deriveTableFromFigure } from "@/lib/chartTable";
import { filterQueryKey } from "@/lib/filterParams";
import { fmtNumber } from "@/lib/format";
import type { FilterState, GaugeSpec, PlotlyChartFigure } from "@/lib/types";

interface ChartPanelProps {
  chartId: string;
  filters: FilterState;
  extra?: Record<string, string | number | undefined>;
  className?: string;
}

function formatCell(v: unknown): string {
  if (typeof v === "number") return fmtNumber(v);
  if (v === null || v === undefined) return "0";
  return String(v);
}

export type ChartVisualFormat = "column" | "line" | "area" | "pie";

const SERIES_COLOR_ORDER = [
  MODERN_PALETTE.coral,
  MODERN_PALETTE.cyan,
  MODERN_PALETTE.purple,
  MODERN_PALETTE.amber,
  MODERN_PALETTE.emerald,
  MODERN_PALETTE.sky,
];

export function ChartPanel({ chartId, filters, extra = {}, className }: ChartPanelProps) {
  const [showTable, setShowTable] = useState(false);
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [chartFormat, setChartFormat] = useState<ChartVisualFormat>("column");
  const [pieSubMetric, setPieSubMetric] = useState<number | "all">(0);

  const { theme } = useTheme();
  const themedExtra = useMemo(
    () => (theme === "neon" ? { ...extra, theme: "neon" } : extra),
    [extra, theme],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["chart", chartId, filterQueryKey(filters, themedExtra)],
    queryFn: () => api.chart(chartId, filters, themedExtra),
    placeholderData: keepPreviousData,
  });

  const isGaugeSpec = !!data && "kind" in data && data.kind === "gauge";
  const figure = !isGaugeSpec ? (data as PlotlyChartFigure | undefined) : undefined;
  const traces = figure?.data as any[] | undefined;

  const isTimeslotChart = chartId === "daily_timeslot_breakdown" || chartId === "daily_footfall_nob";
  const isCurrency = chartId === "daily_timeslot_breakdown";

  // Convert backend traces to normalized Recharts tabular structures
  const { rechartsData, seriesConfigs } = useMemo(() => {
    if (!traces || traces.length === 0) {
      return { rechartsData: [] as RechartDataPoint[], seriesConfigs: [] as SeriesConfig[] };
    }

    const configs: SeriesConfig[] = traces.map((t, idx) => {
      const key = `series_${idx}`;
      const name = t.name || (traces.length === 1 && isCurrency ? "Net Sales (₹)" : `Series ${idx + 1}`);
      const color =
        chartId === "daily_timeslot_breakdown"
          ? MODERN_PALETTE.coral
          : chartId === "daily_footfall_nob"
          ? idx === 0
            ? MODERN_PALETTE.cyan
            : MODERN_PALETTE.coral
          : SERIES_COLOR_ORDER[idx % SERIES_COLOR_ORDER.length];

      return { key, name, color };
    });

    // Find all distinct X axis labels across traces
    const firstTraceX = Array.isArray(traces[0]?.x) ? traces[0].x : [];
    const points: RechartDataPoint[] = firstTraceX.map((xVal: any, slotIdx: number) => {
      const point: RechartDataPoint = { name: String(xVal) };
      traces.forEach((t, tIdx) => {
        const yArr = Array.isArray(t.y) ? t.y : [];
        point[`series_${tIdx}`] = Number(yArr[slotIdx]) || 0;
      });
      return point;
    });

    return { rechartsData: points, seriesConfigs: configs };
  }, [traces, chartId, isCurrency]);

  // Donut chart formatted data
  const donutData = useMemo(() => {
    if (!traces || traces.length === 0) return [];

    if (traces.length === 1) {
      const t = traces[0];
      const labels = Array.isArray(t.x) ? t.x : [];
      const values = Array.isArray(t.y) ? t.y : [];
      return labels.map((lbl: any, i: number) => ({
        name: String(lbl),
        value: Number(values[i]) || 0,
        color: SERIES_COLOR_ORDER[i % SERIES_COLOR_ORDER.length],
      }));
    }

    if (pieSubMetric === "all") {
      return traces.map((t, i) => {
        const total = Array.isArray(t.y)
          ? t.y.reduce((sum: number, val: any) => sum + (Number(val) || 0), 0)
          : 0;
        return {
          name: t.name || `Series ${i + 1}`,
          value: total,
          color: SERIES_COLOR_ORDER[i % SERIES_COLOR_ORDER.length],
        };
      });
    }

    const targetIdx = typeof pieSubMetric === "number" && pieSubMetric < traces.length ? pieSubMetric : 0;
    const targetTrace = traces[targetIdx];
    const labels = Array.isArray(targetTrace?.x) ? targetTrace.x : [];
    const values = Array.isArray(targetTrace?.y) ? targetTrace.y : [];
    return labels.map((lbl: any, i: number) => ({
      name: String(lbl),
      value: Number(values[i]) || 0,
      color: SERIES_COLOR_ORDER[i % SERIES_COLOR_ORDER.length],
    }));
  }, [traces, pieSubMetric]);

  const table = useMemo(() => {
    try {
      return deriveTableFromFigure(figure?.data, figure?.layout);
    } catch {
      return null;
    }
  }, [figure]);

  if (isLoading) {
    return <Skeleton className={className ?? "h-[320px] sm:h-[420px] w-full rounded-2xl"} />;
  }
  if (isError || !data) {
    return (
      <div className={`text-muted-foreground flex items-center justify-center text-sm ${className ?? "h-[320px] sm:h-[420px]"}`}>
        Failed to load chart.
      </div>
    );
  }
  if (isGaugeSpec) {
    return <GlossyGauge spec={data as GaugeSpec} className={className} neon={theme === "neon"} />;
  }

  return (
    <div className="space-y-3">
      {/* Chart Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 border-b border-white/5 pb-2">
        {isTimeslotChart ? (
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-0.5 sm:p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setChartFormat("column")}
              className={`flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
                chartFormat === "column"
                  ? "glossy-btn-primary text-white shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
              title="Column Chart"
            >
              <BarChart3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Column</span>
            </button>
            <button
              type="button"
              onClick={() => setChartFormat("line")}
              className={`flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
                chartFormat === "line"
                  ? "glossy-btn-primary text-white shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
              title="Line Chart"
            >
              <LineChart className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Line</span>
            </button>
            <button
              type="button"
              onClick={() => setChartFormat("area")}
              className={`flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
                chartFormat === "area"
                  ? "glossy-btn-primary text-white shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
              title="Area Chart"
            >
              <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Area</span>
            </button>
            <button
              type="button"
              onClick={() => setChartFormat("pie")}
              className={`flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
                chartFormat === "pie"
                  ? "glossy-btn-primary text-white shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
              title="Donut / Pie Chart"
            >
              <PieChart className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Donut</span>
            </button>
          </div>
        ) : (
          <div />
        )}

        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 ml-auto">
          {/* Chart Grid Lines View Toggle */}
          {chartFormat !== "pie" && (
            <button
              type="button"
              onClick={() => setShowGrid((prev) => !prev)}
              className={`glossy-btn flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold border transition-all cursor-pointer ${
                showGrid
                  ? "bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-300 shadow-xs"
                  : "bg-muted/60 border-border text-muted-foreground hover:text-foreground dark:bg-white/5 dark:border-white/10 dark:text-slate-400 dark:hover:text-white"
              }`}
              title={showGrid ? "Hide Chart Grid Lines" : "Show Chart Grid Lines"}
            >
              <Grid3X3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Grid: {showGrid ? "ON" : "OFF"}</span>
            </button>
          )}

          {/* Chart Legend On/Off Option */}
          <button
            type="button"
            onClick={() => setShowLegend((prev) => !prev)}
            className={`glossy-btn flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold border transition-all cursor-pointer ${
              showLegend
                ? "bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-300 shadow-xs"
                : "bg-muted/60 border-border text-muted-foreground hover:text-foreground dark:bg-white/5 dark:border-white/10 dark:text-slate-400 dark:hover:text-white"
            }`}
            title={showLegend ? "Hide Chart Legend" : "Show Chart Legend"}
          >
            {showLegend ? <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <EyeOff className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
            <span>Legend: {showLegend ? "ON" : "OFF"}</span>
          </button>

          {/* Table View Toggle */}
          {table && table.rows.length > 0 && (
            <button
              type="button"
              className="glossy-btn flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold text-foreground transition-all cursor-pointer"
              onClick={() => setShowTable((o) => !o)}
            >
              {showTable ? "Hide" : "View"} Data Table
            </button>
          )}
        </div>
      </div>

      {/* Donut/Pie Sub-Breakdown Selector (for multi-trace charts like Footfall vs NOB) */}
      {isTimeslotChart && chartFormat === "pie" && traces && traces.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-muted/20 px-2.5 sm:px-3 py-1.5 text-xs">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
            Breakdown:
          </span>
          {traces.map((t: any, idx: number) => {
            const name = t.name || `Series ${idx + 1}`;
            const active = pieSubMetric === idx;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setPieSubMetric(idx)}
                className={`rounded-lg px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground border border-border/70"
                }`}
              >
                {name} by Slot
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setPieSubMetric("all")}
            className={`rounded-lg px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
              pieSubMetric === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground border border-border/70"
            }`}
          >
            Overall ({traces.map((t: any) => t.name).filter(Boolean).join(" vs ")})
          </button>
        </div>
      )}

      {/* Recharts Canvas */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-2xl border border-white/10 bg-card/60 p-2 sm:p-3.5 backdrop-blur-md shadow-xs hover:border-white/20 transition-all"
      >
        {chartFormat === "column" && (
          <RechartsColumnChart
            data={rechartsData}
            series={seriesConfigs}
            showGrid={showGrid}
            showLegend={showLegend}
            isCurrency={isCurrency}
            className={className ?? "h-[280px] sm:h-[340px] md:h-[380px] w-full min-h-[260px]"}
          />
        )}
        {chartFormat === "line" && (
          <RechartsLineChart
            data={rechartsData}
            series={seriesConfigs}
            showGrid={showGrid}
            showLegend={showLegend}
            isCurrency={isCurrency}
            className={className ?? "h-[280px] sm:h-[340px] md:h-[380px] w-full min-h-[260px]"}
          />
        )}
        {chartFormat === "area" && (
          <RechartsAreaChart
            data={rechartsData}
            series={seriesConfigs}
            showGrid={showGrid}
            showLegend={showLegend}
            isCurrency={isCurrency}
            className={className ?? "h-[280px] sm:h-[340px] md:h-[380px] w-full min-h-[260px]"}
          />
        )}
        {chartFormat === "pie" && (
          <RechartsDonutChart
            data={donutData}
            showLegend={showLegend}
            isCurrency={isCurrency}
            className={className ?? "h-[280px] sm:h-[340px] md:h-[380px] w-full min-h-[260px]"}
          />
        )}
      </motion.div>

      {/* Data Table View */}
      <AnimatePresence initial={false}>
        {showTable && table && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden w-full"
          >
            <div className="mt-2 max-h-80 overflow-x-auto rounded-xl border border-white/10 w-full">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    {table.columns.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap font-semibold">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.rows.map((row, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      {table.columns.map((col) => (
                        <TableCell key={col} className="whitespace-nowrap tabular-nums">
                          {formatCell(row[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
