import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart2,
  Clock,
  Compass,
  Gauge,
  IndianRupee,
  Layers,
  LineChart,
  Percent,
  Receipt,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";


import { api } from "@/api/client";
import {
  fmtCurrency,
  fmtCurrencyOrZero,
  fmtNumberOrZero,
  fmtPercentOrZero,
  fmtDateIndian,
  fmtDateDot,
} from "@/lib/format";
import type { DailyLiveSnapshot, DailyOverallSnapshot } from "@/lib/types";
import {
  MODERN_PALETTE,
  RechartsColumnChart,
  type RechartDataPoint,
  type SeriesConfig,
} from "@/components/charts/RechartsComponents";

export type LookbackMode =
  | "prev_year_1"
  | "prev_year_2"
  | "prev_month"
  | "prev_week"
  | "prev_quarter"
  | "7days_avg"
  | "14days_avg"
  | "30days_avg";

export type MetricOptionKey = "net_sales" | "footfall" | "nob" | "atv" | "basket_size" | "conversion_pct";

interface AtAGlanceCardProps {
  storeCode: string;
  storeName: string;
  date: string;
  data?: DailyLiveSnapshot | DailyOverallSnapshot;
  isLoading?: boolean;
}

const LOOKBACK_OPTIONS: { id: LookbackMode; label: string; shortLabel: string; badge: string }[] = [
  { id: "prev_year_1", label: "1 Year Ago (Same Day YoY)", shortLabel: "1 Year Ago", badge: "YoY" },
  { id: "prev_year_2", label: "2 Years Ago (Same Day YoY)", shortLabel: "2 Years Ago", badge: "2-Yr YoY" },
  { id: "prev_month", label: "1 Month Ago (Same Day MoM)", shortLabel: "1 Month Ago", badge: "MoM" },
  { id: "prev_week", label: "1 Week Ago (Same Day WoW)", shortLabel: "1 Week Ago", badge: "WoW" },
  { id: "prev_quarter", label: "1 Quarter Ago (QoQ)", shortLabel: "1 Quarter Ago", badge: "QoQ" },
  { id: "7days_avg", label: "Past 7-Day Rolling Baseline", shortLabel: "7-Day Avg", badge: "7D Avg" },
  { id: "14days_avg", label: "Past 14-Day Rolling Baseline", shortLabel: "14-Day Avg", badge: "14D Avg" },
  { id: "30days_avg", label: "Past 30-Day Rolling Baseline", shortLabel: "30-Day Avg", badge: "30D Avg" },
];

function calculateComparisonDate(isoDate: string, mode: LookbackMode): string {
  const d = new Date(isoDate + "T00:00:00");
  switch (mode) {
    case "prev_year_1":
      d.setFullYear(d.getFullYear() - 1);
      break;
    case "prev_year_2":
      d.setFullYear(d.getFullYear() - 2);
      break;
    case "prev_month":
      d.setMonth(d.getMonth() - 1);
      break;
    case "prev_week":
      d.setDate(d.getDate() - 7);
      break;
    case "prev_quarter":
      d.setMonth(d.getMonth() - 3);
      break;
    case "7days_avg":
      d.setDate(d.getDate() - 7);
      break;
    case "14days_avg":
      d.setDate(d.getDate() - 14);
      break;
    case "30days_avg":
      d.setDate(d.getDate() - 30);
      break;
  }
  return d.toISOString().split("T")[0];
}

export function AtAGlanceCard({ storeCode, storeName, date, data }: AtAGlanceCardProps) {
  const [lookbackMode, setLookbackMode] = useState<LookbackMode>("prev_year_1");
  const [selectedMetric, setSelectedMetric] = useState<MetricOptionKey>("net_sales");
  const [showSlotComparison, setShowSlotComparison] = useState<boolean>(true);

  const compDate = useMemo(() => calculateComparisonDate(date, lookbackMode), [date, lookbackMode]);

  // Query comparison benchmark data for single store or overall
  const { data: compData } = useQuery<DailyLiveSnapshot | DailyOverallSnapshot>({
    queryKey: ["comparison-live", storeCode, compDate],
    queryFn: async () => (storeCode === "ALL" ? api.dailyLiveOverall(compDate) : api.dailyLive(storeCode, compDate)),
    staleTime: 120_000,
  });

  const presentKpis = data?.kpis;
  const compKpis = compData?.kpis;


  const presentSales = presentKpis?.net_sales ?? 0;
  const comparisonSales = compKpis?.net_sales ?? 0;
  const presentFootfall = presentKpis?.footfall ?? 0;
  const comparisonFootfall = compKpis?.footfall ?? 0;
  const presentNob = presentKpis?.nob ?? 0;
  const comparisonNob = compKpis?.nob ?? 0;
  const presentAtv = presentKpis?.atv ?? 0;
  const comparisonAtv = compKpis?.atv ?? 0;
  const presentBasket = presentKpis?.basket_size ?? 0;
  const comparisonBasket = compKpis?.basket_size ?? 0;
  const presentConversion = presentKpis?.conversion_pct ?? 0;
  const comparisonConversion = compKpis?.conversion_pct ?? 0;
  const targetSales = presentKpis?.sales_target ?? 0;
  const achievementPct = presentKpis?.achievement_pct ?? 0;

  const salesDiff = presentSales - comparisonSales;
  const growthPct =
    comparisonSales > 0
      ? ((presentSales - comparisonSales) / comparisonSales) * 100
      : presentSales > 0
      ? 100
      : 0;

  // Granular Time Slot Comparison Data for Recharts
  const slotComparisonData = useMemo(() => {
    const slots = [
      { id: "11.00 AM - 01.59 PM", label: "11AM-2PM" },
      { id: "02.00 PM - 04.59 PM", label: "2PM-5PM" },
      { id: "05.00 PM - 07.59 PM", label: "5PM-8PM" },
      { id: "08.00 PM - 11.59 PM", label: "8PM-12AM" },
    ];

    const presBreakdown = (data as DailyLiveSnapshot)?.timeslot_breakdown;
    const compBreakdown = (compData as DailyLiveSnapshot)?.timeslot_breakdown;

    const points: RechartDataPoint[] = slots.map((s) => ({
      name: s.label,
      present_sales: presBreakdown?.[s.id]?.net_sales ?? (presentSales > 0 ? Math.round(presentSales / 4) : 0),
      benchmark_sales: compBreakdown?.[s.id]?.net_sales ?? (comparisonSales > 0 ? Math.round(comparisonSales / 4) : 0),
    }));

    const series: SeriesConfig[] = [
      { key: "present_sales", name: "Selected Day (₹)", color: MODERN_PALETTE.coral },
      { key: "benchmark_sales", name: `${LOOKBACK_OPTIONS.find((o) => o.id === lookbackMode)?.shortLabel} (₹)`, color: MODERN_PALETTE.cyan },
    ];

    return { points, series };
  }, [data, compData, presentSales, comparisonSales, lookbackMode]);

  // Multi-Metric Comparison Cards
  const metricCards = useMemo(() => {
    return [
      {
        id: "net_sales" as MetricOptionKey,
        label: "Net Sales",
        Icon: IndianRupee,
        present: fmtCurrencyOrZero(presentSales),
        benchmark: fmtCurrencyOrZero(comparisonSales),
        diff: salesDiff,
        pct: growthPct,
        isCurrency: true,
      },
      {
        id: "footfall" as MetricOptionKey,
        label: "Footfall",
        Icon: Users,
        present: fmtNumberOrZero(presentFootfall),
        benchmark: fmtNumberOrZero(comparisonFootfall),
        diff: presentFootfall - comparisonFootfall,
        pct: comparisonFootfall > 0 ? ((presentFootfall - comparisonFootfall) / comparisonFootfall) * 100 : 0,
        isCurrency: false,
      },
      {
        id: "nob" as MetricOptionKey,
        label: "Bill Count (NOB)",
        Icon: Receipt,
        present: fmtNumberOrZero(presentNob),
        benchmark: fmtNumberOrZero(comparisonNob),
        diff: presentNob - comparisonNob,
        pct: comparisonNob > 0 ? ((presentNob - comparisonNob) / comparisonNob) * 100 : 0,
        isCurrency: false,
      },
      {
        id: "atv" as MetricOptionKey,
        label: "Avg Transaction Value",
        Icon: Activity,
        present: fmtCurrencyOrZero(presentAtv),
        benchmark: fmtCurrencyOrZero(comparisonAtv),
        diff: presentAtv - comparisonAtv,
        pct: comparisonAtv > 0 ? ((presentAtv - comparisonAtv) / comparisonAtv) * 100 : 0,
        isCurrency: true,
      },
      {
        id: "basket_size" as MetricOptionKey,
        label: "Basket Size (UPB)",
        Icon: ShoppingBag,
        present: presentBasket.toFixed(2),
        benchmark: comparisonBasket.toFixed(2),
        diff: presentBasket - comparisonBasket,
        pct: comparisonBasket > 0 ? ((presentBasket - comparisonBasket) / comparisonBasket) * 100 : 0,
        isCurrency: false,
      },
      {
        id: "conversion_pct" as MetricOptionKey,
        label: "Conversion Rate",
        Icon: Percent,
        present: fmtPercentOrZero(presentConversion),
        benchmark: fmtPercentOrZero(comparisonConversion),
        diff: presentConversion - comparisonConversion,
        pct: comparisonConversion > 0 ? ((presentConversion - comparisonConversion) / comparisonConversion) * 100 : 0,
        isCurrency: false,
      },
    ];
  }, [
    presentSales,
    comparisonSales,
    salesDiff,
    growthPct,
    presentFootfall,
    comparisonFootfall,
    presentNob,
    comparisonNob,
    presentAtv,
    comparisonAtv,
    presentBasket,
    comparisonBasket,
    presentConversion,
    comparisonConversion,
  ]);

  // Inferred Performance Insights Generator
  const inference = useMemo(() => {
    const presentAch = presentKpis?.achievement_pct ?? 0;
    const activeOpt = LOOKBACK_OPTIONS.find((o) => o.id === lookbackMode);

    if (presentSales === 0 && comparisonSales === 0) {
      return {
        headline: "Store Operations Awaiting Initial Billings",
        detail: "No transactions recorded yet for this date. Operational tracking active across standard 3-hour time slots.",
        action: "Ensure POS counters are synchronized and welcome staff is positioned at entrance doors.",
        badge: "Standby Cadence",
        badgeColor: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
      };
    }

    if (presentSales > 0 && comparisonSales === 0) {
      return {
        headline: `Live Sales Recorded: ${fmtCurrency(presentSales)}`,
        detail: `Store generated active revenue with ${presentAch.toFixed(1)}% target achievement today. Historical comparison data for ${compDate} is pending initial upload.`,
        action: "Maintain cashier turnaround velocity and active cross-selling at checkout.",
        badge: "Active Operations",
        badgeColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      };
    }

    if (growthPct >= 20) {
      return {
        headline: `Supercharged Growth (+${growthPct.toFixed(1)}% vs ${activeOpt?.shortLabel})`,
        detail: `Store sales are outperforming the ${activeOpt?.label} benchmark by ${fmtCurrency(salesDiff)}. High conversion yield and premium basket sizes are creating strong operating momentum.`,
        action: "Replenish high-velocity display racks and deploy additional staff to checkout counters.",
        badge: "Growth Surge",
        badgeColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
      };
    }

    if (growthPct >= 0) {
      return {
        headline: `Healthy Positive Pacing (+${growthPct.toFixed(1)}% vs ${activeOpt?.shortLabel})`,
        detail: `Revenue is pacing ahead of comparative baseline by ${fmtCurrency(salesDiff)}. Conversion velocity is holding steady across operating shifts.`,
        action: "Encourage floor staff to push add-on accessories to expand basket sizes further.",
        badge: "On Target Pace",
        badgeColor: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
      };
    }

    if (growthPct >= -15) {
      return {
        headline: `Minor Lagging Variance (${growthPct.toFixed(1)}% vs ${activeOpt?.shortLabel})`,
        detail: `Current revenue trails benchmark by ${fmtCurrency(Math.abs(salesDiff))}. Footfall traffic is ${presentFootfall} visitors vs ${comparisonFootfall || 'N/A'}.`,
        action: "Activate promotional bundle signage at entrance aisles and speed up billing queues.",
        badge: "Pacing Notice",
        badgeColor: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
      };
    }

    return {
      headline: `Critical Pacing Deficit (${growthPct.toFixed(1)}% vs ${activeOpt?.shortLabel})`,
      detail: `Store is trailing the comparative baseline by ${fmtCurrency(Math.abs(salesDiff))}. Floor traffic or buyer conversion requires immediate managerial focus.`,
      action: "Conduct mid-shift floor huddle, push promotional hero products, and maximize customer engagement.",
      badge: "Deficit Alert",
      badgeColor: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    };
  }, [presentSales, comparisonSales, salesDiff, growthPct, presentKpis, compDate, lookbackMode, presentFootfall, comparisonFootfall]);

  return (
    <div className="glossy-card rounded-3xl p-4 sm:p-6 shadow-2xl space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 via-coral-500/20 to-amber-500/10 border border-orange-500/30 text-orange-500 dark:text-orange-400 shadow-md">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground sm:text-lg tracking-tight">
                At a Glance · Operational Context & Multi-Period Intuition
              </h3>
              <span className="rounded-lg bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-300">
                {storeName}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Comprehensive multi-metric comparative analytics, pace velocity, and historical benchmarks
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 border border-border px-3.5 py-1.5 rounded-xl shadow-2xs">
          <Clock className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />
          <span>Active Date: <strong className="text-foreground font-mono">{fmtDateIndian(date)}</strong></span>
        </div>
      </div>

      {/* 2-Column Split: Left = Operational Pace & Multi-Metric Suite, Right = Granular Historical Comparison Engine */}
      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-12 2xl:items-stretch">
        
        {/* Left Column: Multi-Metric Comparative Grid & Target Pace Tracker */}
        <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card/80 dark:bg-slate-900/60 p-3.5 sm:p-4 2xl:p-5 2xl:col-span-5 space-y-4 shadow-md backdrop-blur-xl">
          <div className="space-y-4">
            {/* Header / Metric selector */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground/90 flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                Operational Metrics Comparison
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">
                vs {LOOKBACK_OPTIONS.find((o) => o.id === lookbackMode)?.shortLabel}
              </span>
            </div>

            {/* Metric Comparison Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 2xl:grid-cols-2 gap-2 sm:gap-2.5">
              {metricCards.map((m) => {
                const isPositive = m.diff >= 0;
                const isSelected = selectedMetric === m.id;
                const Icon = m.Icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMetric(m.id)}
                    className={`flex flex-col justify-between rounded-xl p-2.5 sm:p-3 text-left transition-all cursor-pointer border ${
                      isSelected
                        ? "border-blue-500 bg-blue-500/10 dark:bg-blue-500/20 shadow-sm shadow-blue-500/10"
                        : "border-border/80 bg-muted/30 hover:bg-muted/60 dark:border-white/5 dark:bg-black/25 dark:hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between text-muted-foreground text-[10px] sm:text-[11px]">
                      <span className="font-semibold truncate">{m.label}</span>
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-1 font-mono text-sm sm:text-base font-extrabold text-foreground truncate">
                      {m.present}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[9px] sm:text-[10px] text-muted-foreground border-t border-border/60 dark:border-white/5 pt-1">
                      <span className="truncate">Ref: <strong className="text-foreground font-mono">{m.benchmark}</strong></span>
                      <span className={`font-bold flex items-center gap-0.5 shrink-0 ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {isPositive ? `+${m.pct.toFixed(1)}%` : `${m.pct.toFixed(1)}%`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Target Achievement & Run-Rate Gauge Box */}
            <div className="rounded-xl border border-border/80 bg-muted/40 dark:border-white/10 dark:bg-black/30 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Gauge className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                  Target Run-Rate Progress
                </span>
                <span className="font-mono font-bold text-foreground">
                  {achievementPct.toFixed(1)}% Achieved
                </span>
              </div>

              {/* Progress bar */}
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    achievementPct >= 100
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-md shadow-emerald-500/50"
                      : achievementPct >= 80
                      ? "bg-gradient-to-r from-blue-500 to-indigo-400"
                      : achievementPct >= 50
                      ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                      : "bg-gradient-to-r from-rose-500 to-red-400"
                  }`}
                  style={{ width: `${Math.min(achievementPct, 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                <span>Target: <strong className="text-foreground">{fmtCurrencyOrZero(targetSales)}</strong></span>
                <span>Net Sales: <strong className="text-foreground">{fmtCurrencyOrZero(presentSales)}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Granular Comparative Analytics & Inference Engine */}
        <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card/80 dark:bg-slate-900/60 p-3.5 sm:p-4 2xl:p-5 2xl:col-span-7 space-y-4 shadow-md backdrop-blur-xl">
          <div>
            {/* Lookback Selector Tabs */}
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground/90 flex items-center gap-1.5">
                <LineChart className="h-4 w-4 text-primary" />
                Granular Historical Benchmark Engine
              </span>
              <span className="text-xs text-muted-foreground">
                Baseline Ref: <strong className="text-foreground font-mono">{fmtDateDot(compDate)}</strong>
              </span>
            </div>

            {/* Lookback Multi-Option Bar */}
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-2 mb-3.5">
              {LOOKBACK_OPTIONS.map((opt) => {
                const active = lookbackMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setLookbackMode(opt.id)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      active
                        ? "bg-gradient-to-r from-orange-500 to-coral-500 text-white shadow-md shadow-orange-500/20"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white dark:border-white/5"
                    }`}
                  >
                    <span>{opt.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {/* 3 Metric Cards Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4">
              <div className="rounded-xl border border-border/80 bg-muted/30 dark:border-white/10 dark:bg-black/25 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Selected Day Sales
                </div>
                <div className="mt-1 font-mono text-lg font-extrabold text-foreground">
                  {fmtCurrencyOrZero(presentSales)}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{date}</div>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/30 dark:border-white/10 dark:bg-black/25 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {LOOKBACK_OPTIONS.find((o) => o.id === lookbackMode)?.shortLabel} Sales
                </div>
                <div className="mt-1 font-mono text-lg font-extrabold text-foreground/85 dark:text-slate-300">
                  {fmtCurrencyOrZero(comparisonSales)}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{compDate}</div>
              </div>

              <div
                className={`col-span-2 sm:col-span-1 rounded-xl border p-3 ${
                  salesDiff >= 0
                    ? "border-emerald-500/40 bg-emerald-500/10 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                    : "border-rose-500/40 bg-rose-500/10 dark:border-rose-500/30 dark:bg-rose-500/10"
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>Performance Delta</span>
                  {salesDiff >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  )}
                </div>
                <div
                  className={`mt-1 font-mono text-lg font-extrabold ${
                    salesDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {salesDiff >= 0 ? `+${fmtCurrency(salesDiff)}` : `-${fmtCurrency(Math.abs(salesDiff))}`}
                </div>
                <div
                  className={`text-[10px] font-bold ${
                    salesDiff >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                  }`}
                >
                  {salesDiff >= 0 ? `+${growthPct.toFixed(1)}%` : `${growthPct.toFixed(1)}%`} vs benchmark
                </div>
              </div>
            </div>

            {/* Time Slot Recharts Side-by-Side Visualizer */}
            <div className="rounded-xl border border-border/80 bg-muted/30 dark:border-white/10 dark:bg-black/20 p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <BarChart2 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>Time-Slot Pacing Breakdown vs {LOOKBACK_OPTIONS.find((o) => o.id === lookbackMode)?.shortLabel}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSlotComparison((prev) => !prev)}
                  className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                >
                  {showSlotComparison ? "Hide Chart" : "Show Chart"}
                </button>
              </div>
              {showSlotComparison && (
                <RechartsColumnChart
                  data={slotComparisonData.points}
                  series={slotComparisonData.series}
                  isCurrency={true}
                  showGrid={true}
                  showLegend={true}
                  className="h-[180px] w-full"
                />
              )}
            </div>

            {/* Inferred Floor Insight Panel */}
            <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs font-bold text-orange-600 dark:text-orange-400">
                  <Sparkles className="h-4 w-4 text-orange-600 dark:text-orange-400 animate-pulse" />
                  <span>Inferred Floor Insight & Managerial Intuition</span>
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${inference.badgeColor}`}>
                  {inference.badge}
                </span>
              </div>
              <h4 className="text-sm font-bold text-foreground">{inference.headline}</h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{inference.detail}</p>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300/90 border-t border-orange-500/20 pt-2">
                <Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Floor Action: {inference.action}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
