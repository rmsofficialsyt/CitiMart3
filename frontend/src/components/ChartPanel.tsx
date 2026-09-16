import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import Plotly from "plotly.js-dist-min";
import type { Layout, PlotData } from "plotly.js-dist-min";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Eye, EyeOff, Grid3X3, LineChart, PieChart, TrendingUp } from "lucide-react";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { GlossyGauge } from "@/components/GlossyGauge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deriveTableFromFigure } from "@/lib/chartTable";
import { filterQueryKey } from "@/lib/filterParams";
import { fmtNumber } from "@/lib/format";
import Plot from "@/lib/Plot";
import { touchConfig, touchLayout } from "@/lib/plotlyTouch";
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

type IndicatorTrace = PlotData & { type?: string; value?: number };

function isGauge(trace: PlotData): boolean {
  return (trace as IndicatorTrace).type === "indicator";
}

function zeroTraceValue(trace: PlotData): PlotData {
  return isGauge(trace) ? ({ ...trace, value: 0 } as PlotData) : trace;
}

export type ChartVisualFormat = "column" | "line" | "area" | "pie";

const SLICE_COLORS = [
  "#3b82f6", // Blue
  "#6366f1", // Indigo
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f59e0b", // Amber
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#14b8a6", // Teal
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

  const traces = figure?.data as PlotData[] | undefined;
  const hasAnimatableValues = useMemo(() => !!traces && traces.some(isGauge), [traces]);

  const [revealed, setRevealed] = useState(false);
  const latestTraces = useRef(traces);
  latestTraces.current = traces;

  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), 2000);
    return () => window.clearTimeout(id);
  }, []);

  const isTimeslotChart = chartId === "daily_timeslot_breakdown" || chartId === "daily_footfall_nob";

  const plotData = useMemo(() => {
    if (!traces) return traces;
    if (hasAnimatableValues && !revealed) {
      return traces.map(zeroTraceValue);
    }
    if (!isTimeslotChart || chartFormat === "column") {
      return traces;
    }

    // Format transformation for Line
    if (chartFormat === "line") {
      return traces.map((t) => ({
        ...t,
        type: "scatter" as any,
        mode: "lines+markers" as any,
        line: { shape: "spline", width: 3 },
        marker: { size: 8 },
      }));
    }

    // Format transformation for Area
    if (chartFormat === "area") {
      return traces.map((t) => ({
        ...t,
        type: "scatter" as any,
        mode: "lines+markers" as any,
        fill: "tozeroy" as any,
        line: { shape: "spline", width: 2.5 },
        marker: { size: 6 },
      }));
    }

    // Format transformation for Donut / Pie
    if (chartFormat === "pie") {
      // Case 1: Single trace (e.g., Performance by Time Slot - Net Sales)
      if (traces.length === 1) {
        const t = traces[0] as any;
        const labels = Array.isArray(t.x) ? t.x : [];
        const values = Array.isArray(t.y) ? t.y.map((v: any) => Number(v) || 0) : [];
        const isSales = chartId === "daily_timeslot_breakdown";

        return [
          {
            type: "pie" as any,
            hole: 0.48,
            labels,
            values,
            textinfo: "percent",
            textposition: "inside",
            insidetextorientation: "horizontal",
            automargin: true,
            hoverinfo: "label+value+percent",
            hovertemplate: isSales
              ? "<b>%{label}</b><br>Net Sales: ₹%{value:,.2f}<br>Share: <b>%{percent}</b><extra></extra>"
              : "<b>%{label}</b><br>Value: %{value:,.0f}<br>Share: <b>%{percent}</b><extra></extra>",
            marker: {
              colors: SLICE_COLORS,
              line: { color: theme === "neon" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.4)", width: 1.5 },
            },
          },
        ] as unknown as PlotData[];
      }

      // Case 2: Multi-trace (e.g., Footfall vs NOB based on Time Slot)
      if (traces.length > 1) {
        if (pieSubMetric === "all") {
          // Compare totals across the traces (Total Footfall vs Total Buyers)
          const labels = traces.map((t: any) => t.name || "Series");
          const values = traces.map((t: any) =>
            Array.isArray(t.y) ? t.y.reduce((acc: number, v: any) => acc + (Number(v) || 0), 0) : 0,
          );
          return [
            {
              type: "pie" as any,
              hole: 0.48,
              labels,
              values,
              textinfo: "percent",
              textposition: "inside",
              insidetextorientation: "horizontal",
              automargin: true,
              hoverinfo: "label+value+percent",
              hovertemplate: "<b>%{label}</b><br>Total Count: %{value:,.0f}<br>Share: <b>%{percent}</b><extra></extra>",
              marker: {
                colors: ["#94a3b8", "#2563eb", "#10b981", "#f59e0b"],
                line: { color: theme === "neon" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.4)", width: 1.5 },
              },
            },
          ] as unknown as PlotData[];
        }

        // Specific sub-trace by Time Slot (e.g. Footfall by Time Slot or NOB by Time Slot)
        const targetIdx = typeof pieSubMetric === "number" && pieSubMetric < traces.length ? pieSubMetric : 0;
        const targetTrace = traces[targetIdx] as any;
        const labels = Array.isArray(targetTrace.x) ? targetTrace.x : [];
        const values = Array.isArray(targetTrace.y) ? targetTrace.y.map((v: any) => Number(v) || 0) : [];
        const traceName = targetTrace.name || `Series ${targetIdx + 1}`;

        return [
          {
            type: "pie" as any,
            hole: 0.48,
            labels,
            values,
            textinfo: "percent",
            textposition: "inside",
            insidetextorientation: "horizontal",
            automargin: true,
            hoverinfo: "label+value+percent",
            hovertemplate: `<b>%{label}</b><br>${traceName}: %{value:,.0f}<br>Share: <b>%{percent}</b><extra></extra>`,
            marker: {
              colors: SLICE_COLORS,
              line: { color: theme === "neon" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.4)", width: 1.5 },
            },
          },
        ] as unknown as PlotData[];
      }
    }

    return traces;
  }, [traces, hasAnimatableValues, revealed, chartFormat, isTimeslotChart, pieSubMetric, chartId, theme]);

  // Dynamic layout tweaks with Legend and Grid view support
  const plotLayout = useMemo(() => {
    if (!figure) return undefined;
    const base = { ...(figure.layout as Partial<Layout>), autosize: true };

    const baseXaxis = (base.xaxis as Record<string, any>) || {};
    const baseYaxis = (base.yaxis as Record<string, any>) || {};

    if (chartFormat === "pie") {
      return touchLayout({
        ...base,
        xaxis: { ...baseXaxis, visible: false, showgrid: false },
        yaxis: { ...baseYaxis, visible: false, showgrid: false },
        showlegend: showLegend,
        legend: {
          orientation: "h",
          y: -0.15,
          x: 0.5,
          xanchor: "center",
          font: { size: 11 },
          itemclick: "toggle",
          itemdoubleclick: "toggleothers",
        },
        margin: { l: 20, r: 20, t: 40, b: showLegend ? 50 : 20 },
      });
    }

    return touchLayout({
      ...base,
      xaxis: {
        ...baseXaxis,
        showgrid: showGrid,
        gridcolor: theme === "neon" ? "rgba(0, 255, 255, 0.12)" : "rgba(148, 163, 184, 0.2)",
      },
      yaxis: {
        ...baseYaxis,
        showgrid: showGrid,
        gridcolor: theme === "neon" ? "rgba(0, 255, 255, 0.12)" : "rgba(148, 163, 184, 0.2)",
      },
      showlegend: showLegend,
      legend: {
        orientation: "h",
        y: -0.18,
        x: 0.5,
        xanchor: "center",
        font: { size: 11 },
        itemclick: "toggle",
        itemdoubleclick: "toggleothers",
      },
    });
  }, [figure, chartFormat, showLegend, showGrid, theme]);

  function revealChart(graphDiv: Readonly<HTMLElement>) {
    const real = latestTraces.current;
    if (hasAnimatableValues && real) {
      Plotly.animate(
        graphDiv as unknown as Plotly.Root,
        { data: real as Plotly.Data[] },
        { transition: { duration: 400, easing: "cubic-in-out" }, frame: { duration: 400, redraw: false } },
      ).catch(() => {});
    }
    setRevealed(true);
  }

  const table = useMemo(() => {
    try {
      return deriveTableFromFigure(figure?.data, figure?.layout);
    } catch {
      return null;
    }
  }, [figure]);

  if (isLoading) {
    return <Skeleton className={className ?? "h-[320px] sm:h-[460px] w-full rounded-lg"} />;
  }
  if (isError || !data) {
    return (
      <div className={`text-muted-foreground flex items-center justify-center text-sm ${className ?? "h-[320px] sm:h-[460px]"}`}>
        Failed to load chart.
      </div>
    );
  }
  if (isGaugeSpec) {
    return <GlossyGauge spec={data as GaugeSpec} className={className} neon={theme === "neon"} />;
  }

  return (
    <div className="space-y-2">
      {/* Chart Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isTimeslotChart ? (
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setChartFormat("column")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                chartFormat === "column"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Column Chart"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Column</span>
            </button>
            <button
              type="button"
              onClick={() => setChartFormat("line")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                chartFormat === "line"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Line Chart"
            >
              <LineChart className="h-3.5 w-3.5" />
              <span>Line</span>
            </button>
            <button
              type="button"
              onClick={() => setChartFormat("area")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                chartFormat === "area"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Area Chart"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Area</span>
            </button>
            <button
              type="button"
              onClick={() => setChartFormat("pie")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                chartFormat === "pie"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Donut / Pie Chart"
            >
              <PieChart className="h-3.5 w-3.5" />
              <span>Donut/Pie</span>
            </button>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Chart Grid Lines View Toggle */}
          {chartFormat !== "pie" && (
            <button
              type="button"
              onClick={() => setShowGrid((prev) => !prev)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition-colors ${
                showGrid
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
              }`}
              title={showGrid ? "Hide Chart Grid Lines" : "Show Chart Grid Lines"}
            >
              <Grid3X3 className="h-3.5 w-3.5" />
              <span>Grid: {showGrid ? "ON" : "OFF"}</span>
            </button>
          )}

          {/* Chart Legend On/Off Option */}
          <button
            type="button"
            onClick={() => setShowLegend((prev) => !prev)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition-colors ${
              showLegend
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
            }`}
            title={showLegend ? "Hide Chart Legend" : "Show Chart Legend"}
          >
            {showLegend ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span>Legend: {showLegend ? "ON" : "OFF"}</span>
          </button>

          {/* Table View Toggle */}
          {table && table.rows.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs font-medium"
              onClick={() => setShowTable((o) => !o)}
            >
              {showTable ? "Hide" : "View"} Data Table
            </Button>
          )}
        </div>
      </div>

      {/* Donut/Pie Sub-Breakdown Selector (for multi-trace charts like Footfall vs NOB) */}
      {isTimeslotChart && chartFormat === "pie" && traces && traces.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
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
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
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
            className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
              pieSubMetric === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground border border-border/70"
            }`}
          >
            Overall ({traces.map((t: any) => t.name).filter(Boolean).join(" vs ")})
          </button>
        </div>
      )}

      {/* Main Chart Canvas */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={{ y: -2 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={`transition-shadow duration-200 hover:shadow-md ${className ?? ""}`}
      >
        <Plot
          data={plotData as PlotData[]}
          layout={plotLayout!}
          useResizeHandler
          style={{ width: "100%", height: "100%" }}
          config={touchConfig({ responsive: true, displaylogo: false })}
          onInitialized={(_figure, graphDiv) => revealChart(graphDiv)}
        />
      </motion.div>

      {/* Data Table View */}
      <AnimatePresence initial={false}>
        {showTable && table && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {table.columns.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.rows.map((row, i) => (
                    <TableRow key={i}>
                      {table.columns.map((col) => (
                        <TableCell key={col} className="whitespace-nowrap">
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
