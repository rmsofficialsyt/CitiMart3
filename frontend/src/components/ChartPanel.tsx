import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import Plotly from "plotly.js-dist-min";
import type { Layout, PlotData } from "plotly.js-dist-min";
import { useEffect, useMemo, useRef, useState } from "react";

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
  // A chart-derived table is value-oriented -- a null/undefined cell is a gap in
  // a numeric series, shown as 0 (Historical Analytics Overhaul: missing -> 0).
  if (v === null || v === undefined) return "0";
  return String(v);
}

// Gauge (Indicator) value-sweep-in: mount the gauge with its value zeroed,
// then imperatively animate to the real value once Plotly has actually
// painted that zeroed first frame. `Plotly.animate()` on the graph div
// `onInitialized` hands back is what makes this reliable.
//
// Deliberately indicator-only, not "zero every chart": bar/scatter data-
// value changes were tried the same way and rejected after testing -- the
// y-axis autorange doesn't stay synced with the interpolated in-between
// values during the transition, producing genuinely broken intermediate
// geometry (bar paths landing at wild coordinates like `V-11827455...`
// instead of a clean grow-in), confirmed by polling the live SVG path data
// frame-by-frame during the transition. Indicators have no such autorange
// dependency (their gauge arc range is fixed from server-side thresholds),
// so they sweep cleanly. Every other chart type keeps only the whole-panel
// fade+rise entrance below.
type IndicatorTrace = PlotData & { type?: string; value?: number };

function isGauge(trace: PlotData): boolean {
  return (trace as IndicatorTrace).type === "indicator";
}

function zeroTraceValue(trace: PlotData): PlotData {
  return isGauge(trace) ? ({ ...trace, value: 0 } as PlotData) : trace;
}

export function ChartPanel({ chartId, filters, extra = {}, className }: ChartPanelProps) {
  const [showTable, setShowTable] = useState(false);
  const { theme } = useTheme();
  // The "neon" theme recolours the server-rendered figure (`src/theme.py`);
  // any other theme leaves `?theme` off so the figure is byte-identical to
  // before. Report exports call `api.chart` directly (not this component) and
  // never pass a theme, so exported charts stay on the light palette.
  const themedExtra = useMemo(
    () => (theme === "neon" ? { ...extra, theme: "neon" } : extra),
    [extra, theme],
  );
  // keepPreviousData: an Apply-Filters-driven refetch keeps showing the
  // last chart (not a blank skeleton) until the new figure lands -- see
  // ExecutiveOverview.tsx's KPI query for the same reasoning.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["chart", chartId, filterQueryKey(filters, themedExtra)],
    queryFn: () => api.chart(chartId, filters, themedExtra),
    placeholderData: keepPreviousData,
  });

  // /api/charts/{chart_id} returns a GaugeSpec (plain JSON, rendered below
  // via GlossyGauge -- a real SVG needle, which Plotly can't draw) for the
  // *_gauge chart ids instead of a Plotly figure. `figure` narrows `data`
  // to the Plotly-figure case so every `.data`/`.layout` access below stays
  // type-safe without gating any hook behind a conditional.
  const isGaugeSpec = !!data && "kind" in data && data.kind === "gauge";
  const figure = !isGaugeSpec ? (data as PlotlyChartFigure | undefined) : undefined;

  const traces = figure?.data as PlotData[] | undefined;
  const hasAnimatableValues = useMemo(() => !!traces && traces.some(isGauge), [traces]);

  // Scoped to first mount only (empty deps) -- filter-driven data changes on
  // an already-mounted chart get Plotly's normal old-value-to-new-value
  // transition on the `data` prop, not a repeated sweep-from-zero.
  const [revealed, setRevealed] = useState(false);
  const latestTraces = useRef(traces);
  latestTraces.current = traces;

  // Safety net: onInitialized (below) is the normal, precise trigger, but if
  // it never fires for some edge-case figure shape, this still guarantees
  // the chart can't get stuck showing zeroed values indefinitely.
  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), 2000);
    return () => window.clearTimeout(id);
  }, []);

  const plotData = useMemo(() => {
    if (!traces) return traces;
    if (hasAnimatableValues && !revealed) {
      return traces.map(zeroTraceValue);
    }
    return traces;
  }, [traces, hasAnimatableValues, revealed]);

  // Fires once Plotly has actually painted the zeroed first frame (the
  // graphDiv it hands back is fully drawn at this point -- see onInitialized
  // below). Animate straight from there to the real values.
  function revealChart(graphDiv: Readonly<HTMLElement>) {
    const real = latestTraces.current;
    if (hasAnimatableValues && real) {
      Plotly.animate(
        graphDiv as unknown as Plotly.Root,
        { data: real as Plotly.Data[] },
        { transition: { duration: 400, easing: "cubic-in-out" }, frame: { duration: 400, redraw: false } },
      ).catch(() => {
        // Best-effort polish -- a failed animate() (e.g. the graph div was
        // torn down mid-flight) should never block showing the real data.
      });
    }
    setRevealed(true);
  }

  const table = useMemo(() => {
    try {
      return deriveTableFromFigure(figure?.data, figure?.layout);
    } catch {
      // Best-effort table extraction from arbitrary Plotly trace shapes --
      // a shape this doesn't recognise should just hide the toggle, not
      // break the chart itself.
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
    <div>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={{ y: -2 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={`transition-shadow duration-200 hover:shadow-md ${className ?? ""}`}
      >
        <Plot
          data={plotData as PlotData[]}
          layout={touchLayout({ ...(figure!.layout as Partial<Layout>), autosize: true })}
          useResizeHandler
          style={{ width: "100%", height: "100%" }}
          config={touchConfig({ responsive: true, displaylogo: false })}
          onInitialized={(_figure, graphDiv) => revealChart(graphDiv)}
        />
      </motion.div>

      {table && table.rows.length > 0 && (
        <>
          <div className="mt-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowTable((o) => !o)}>
              {showTable ? "Hide" : "View"} Table
            </Button>
          </div>
          <AnimatePresence initial={false}>
            {showTable && (
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
        </>
      )}
    </div>
  );
}
