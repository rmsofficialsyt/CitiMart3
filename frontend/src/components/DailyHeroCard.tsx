import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  CloudSun,
  FileText,
  MapPin,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Vote,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { fmtCurrency, fmtDateDot } from "@/lib/format";
import type { DailyLiveSnapshot, DailyOverallSnapshot } from "@/lib/types";

const TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

function getGreeting(hour: number): string {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

interface DailyHeroCardProps {
  storeName: string;
  data?: DailyLiveSnapshot | DailyOverallSnapshot | null;
}

/** The Daily Dashboard's top hero card -- Teamify-inspired personalized greeting,
 * live-ticking wall clock, store badge, Month Target summary matrix, and integrated Environmental & Trading Conditions. */
export function DailyHeroCard({ storeName, data }: DailyHeroCardProps) {
  const [now, setNow] = useState(() => new Date());
  const { user } = useAuth();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const currentHour = now.getHours();
  const greeting = getGreeting(currentHour);
  const displayName = user?.role === "admin" ? "Admin" : storeName;
  const liveData = data as DailyLiveSnapshot | undefined;

  const monthlySummary = data?.monthly_target_summary;
  const monthTarget = monthlySummary?.month_target;
  const prevYearTotal = monthlySummary?.prev_year_total;
  const growthPct = monthlySummary?.growth_pct;

  return (
    <div className="glossy-card rounded-3xl p-4 sm:p-5 2xl:p-6 shadow-2xl space-y-4">
      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left Side: Personalized Greeting */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Live Store Operations · Kolkata
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <span>{greeting}, {displayName}</span>
            <Sparkles className="h-5 w-5 text-amber-500 inline animate-pulse" />
          </h1>
          <p className="text-xs text-muted-foreground">
            Hope you have a productive operating day. Monitoring live customer footfall, counter billings, and store targets.
          </p>
        </div>

        {/* Right Side: Active Store Pill & Live Wall Clock */}
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/60 dark:bg-black/30 px-3.5 py-2 shadow-xs">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Store Active</div>
              <div className="text-xs font-bold text-foreground">{storeName}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/60 dark:bg-black/30 px-3.5 py-2 shadow-xs">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {fmtDateDot(now)}
              </div>
              <div className="font-mono text-sm font-black text-foreground tabular-nums">
                {TIME_FORMATTER.format(now)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Growth & Target Matrix: Monthly Overview + Daily Live Growth View */}
      <div className="space-y-3">
        {/* Row 1: Monthly Target & Actual Growth vs Prev Year */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Month Target Card */}
          <div className="flex items-center gap-3 rounded-2xl border border-orange-500/30 bg-orange-500/10 dark:bg-orange-950/20 p-3 shadow-xs">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30">
              <Target className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Month Target</div>
              <div className="font-mono text-base font-extrabold text-orange-600 dark:text-orange-400 truncate">
                {monthTarget != null ? fmtCurrency(monthTarget) : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">Planned Month Target</div>
            </div>
          </div>

          {/* Prev Year Month Total Card */}
          <div className="flex items-center gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 dark:bg-cyan-950/20 p-3 shadow-xs">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prev. Year Total</div>
              <div className="font-mono text-base font-extrabold text-cyan-600 dark:text-cyan-400 truncate">
                {prevYearTotal != null ? fmtCurrency(prevYearTotal) : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">Previous Year Month Sales</div>
            </div>
          </div>

          {/* Month Present Net Sales Card */}
          <div className="flex items-center gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 dark:bg-indigo-950/20 p-3 shadow-xs">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Month Net Sales (MTD)</div>
              <div className="font-mono text-base font-extrabold text-indigo-600 dark:text-indigo-400 truncate">
                {monthlySummary?.month_net_sales != null ? fmtCurrency(monthlySummary.month_net_sales) : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">Logged Month Revenue</div>
            </div>
          </div>

          {/* Month Actual vs Prev Year Growth Card */}
          <div className={`flex items-center gap-3 rounded-2xl border p-3 shadow-xs ${
            growthPct != null && growthPct >= 0
              ? "border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20"
              : growthPct != null
              ? "border-rose-500/30 bg-rose-500/10 dark:bg-rose-950/20"
              : "border-border bg-card/60 dark:bg-black/30"
          }`}>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              growthPct != null && growthPct >= 0
                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : growthPct != null
                ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30"
                : "bg-muted text-muted-foreground border-border"
            }`}>
              {growthPct != null && growthPct < 0 ? (
                <TrendingDown className="h-4 w-4" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Month Net Sales Growth</div>
              <div className={`font-mono text-base font-extrabold truncate ${
                growthPct != null && growthPct >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : growthPct != null
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-foreground"
              }`}>
                {growthPct != null ? `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%` : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">Present vs Prev Year Sales</div>
            </div>
          </div>
        </div>

        {/* Row 2: Daily Basis Growth View (Today vs Prev Year Same Day) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Daily Net Sales vs Prev Year Day Sales Card */}
          <div className="flex items-center gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 dark:bg-sky-950/20 p-3 shadow-xs">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Today vs Prev Year Day</div>
              <div className="font-mono text-base font-extrabold text-sky-600 dark:text-sky-400 truncate">
                {liveData?.kpis?.net_sales != null ? fmtCurrency(liveData.kpis.net_sales) : "₹0"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                Last Year: {monthlySummary?.daily_prev_year_sales != null ? fmtCurrency(monthlySummary.daily_prev_year_sales) : "—"}
              </div>
            </div>
          </div>

          {/* Daily YoY Tally Growth Card */}
          <div className={`flex items-center gap-3 rounded-2xl border p-3 shadow-xs ${
            monthlySummary?.daily_growth_pct != null && monthlySummary.daily_growth_pct >= 0
              ? "border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20"
              : monthlySummary?.daily_growth_pct != null
              ? "border-rose-500/30 bg-rose-500/10 dark:bg-rose-950/20"
              : "border-border bg-card/60 dark:bg-black/30"
          }`}>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              monthlySummary?.daily_growth_pct != null && monthlySummary.daily_growth_pct >= 0
                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : monthlySummary?.daily_growth_pct != null
                ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30"
                : "bg-muted text-muted-foreground border-border"
            }`}>
              {monthlySummary?.daily_growth_pct != null && monthlySummary.daily_growth_pct < 0 ? (
                <TrendingDown className="h-4 w-4" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Daily YoY Growth</div>
              <div className={`font-mono text-base font-extrabold truncate ${
                monthlySummary?.daily_growth_pct != null && monthlySummary.daily_growth_pct >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : monthlySummary?.daily_growth_pct != null
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-foreground"
              }`}>
                {monthlySummary?.daily_growth_pct != null
                  ? `${monthlySummary.daily_growth_pct >= 0 ? "+" : ""}${monthlySummary.daily_growth_pct.toFixed(1)}%`
                  : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {monthlySummary?.daily_diff != null
                  ? `${monthlySummary.daily_diff >= 0 ? "+" : ""}${fmtCurrency(monthlySummary.daily_diff)} YoY delta`
                  : "Selected Day vs 1-Yr Ago"}
              </div>
            </div>
          </div>

          {/* Daily Target Run-Rate / Achievement Card */}
          <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20 p-3 shadow-xs">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <Target className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Daily Target Progress</div>
              <div className="font-mono text-base font-extrabold text-amber-600 dark:text-amber-400 truncate">
                {liveData?.kpis?.achievement_pct != null ? `${liveData.kpis.achievement_pct.toFixed(1)}%` : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                Target: {liveData?.kpis?.sales_target != null ? fmtCurrency(liveData.kpis.sales_target) : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Environmental & Trading Conditions (Underlying Context) Strip */}
      <div className="rounded-2xl border border-border/80 bg-muted/40 dark:bg-black/30 p-3.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Context Label */}
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1 hidden sm:inline">
              Trading Context:
            </span>

            {/* Day Type Badge */}
            <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/80 px-3 py-1.5 font-medium text-foreground shadow-2xs">
              <Calendar className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
              <span>{liveData?.day_name ? `${liveData.day_name} (${liveData.day_type ?? "Regular"})` : "Standard Trading Day"}</span>
            </div>

            {/* Weather Badge */}
            <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/80 px-3 py-1.5 font-medium text-foreground shadow-2xs">
              <CloudSun className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
              <span>
                {liveData?.weather
                  ? `${liveData.weather.condition}${liveData.weather.temp_max_c != null ? ` · ${liveData.weather.temp_max_c}°C` : ""}${liveData.weather.precipitation_mm ? ` (${liveData.weather.precipitation_mm}mm rain)` : ""}`
                  : "Kolkata Weather Normal"}
              </span>
            </div>

            {/* Holiday / Event Context */}
            <div className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-medium shadow-2xs ${
              liveData?.holiday_name
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold"
                : "border-border/80 bg-background/80 text-foreground"
            }`}>
              <Sparkles className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
              <span>{liveData?.holiday_name ? `Holiday: ${liveData.holiday_name}` : "Standard Retail Trading Day"}</span>
            </div>

            {/* Election Context (if present) */}
            {liveData?.election_name && (
              <div className="flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/15 px-3 py-1.5 font-medium text-purple-700 dark:text-purple-300 shadow-2xs">
                <Vote className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
                <span>Election: {liveData.election_name}</span>
              </div>
            )}
          </div>

          {/* Manager Operational Remarks / Notes (if present) */}
          {liveData?.reason && (
            <div className="flex items-center gap-2 text-xs bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 px-3 py-1.5 rounded-xl">
              <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="font-medium truncate max-w-[320px]">
                <strong className="text-amber-900 dark:text-amber-300">Remarks:</strong> {liveData.reason}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
