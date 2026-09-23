import { animate, motion, useMotionValue } from "framer-motion";
import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { useLanguage } from "@/context/LanguageContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getKpiIconConfig } from "@/lib/kpiIcons";
import { cn } from "@/lib/utils";
import type { DailyKpiKey, StatusColor } from "@/lib/types";
import type { Translations } from "@/lib/translations";

const KPI_TRANSLATION_MAP: Record<string, keyof Translations> = {
  net_sales: "kpiNetSales",
  sales_target: "kpiSalesTarget",
  remaining: "kpiRemaining",
  achievement_pct: "kpiAchievementPct",
  remaining_pct: "kpiRemainingPct",
  footfall: "kpiFootfall",
  bill_quantity: "kpiBillQty",
  nob: "kpiNob",
  conversion_pct: "kpiConversionPct",
  atv: "kpiAtv",
  rpv: "kpiRpv",
  basket_size: "kpiBasketSize",
};

export interface KpiDelta {
  kpi?: string;
  current?: number | null;
  previous?: number | null;
  absolute_variance?: number | null;
  percentage_variance?: number | null;
  status?: StatusColor;
}

const STATUS_CONFIGS: Record<
  StatusColor,
  {
    cardClass: string;
    dotColor: string;
    dotGlow: string;
    aura: string;
    specular: string;
    badgeClass: string;
    valueClass: string;
  }
> = {
  red: {
    cardClass: "glossy-kpi-red",
    dotColor: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]",
    dotGlow: "bg-rose-500/70",
    aura: "from-rose-500/35 via-rose-500/15 to-transparent",
    specular: "from-rose-500/0 via-rose-300/70 dark:via-rose-400/60 to-rose-500/0",
    badgeClass: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30",
    valueClass: "text-rose-950 dark:text-rose-50 group-hover:text-rose-600 dark:group-hover:text-rose-300",
  },
  yellow: {
    cardClass: "glossy-kpi-yellow",
    dotColor: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.9)]",
    dotGlow: "bg-amber-500/70",
    aura: "from-amber-500/35 via-amber-500/15 to-transparent",
    specular: "from-amber-500/0 via-amber-300/70 dark:via-amber-400/60 to-amber-500/0",
    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
    valueClass: "text-amber-950 dark:text-amber-50 group-hover:text-amber-600 dark:group-hover:text-amber-300",
  },
  green: {
    cardClass: "glossy-kpi-green",
    dotColor: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]",
    dotGlow: "bg-emerald-500/70",
    aura: "from-emerald-500/35 via-emerald-500/15 to-transparent",
    specular: "from-emerald-500/0 via-emerald-300/70 dark:via-emerald-400/60 to-emerald-500/0",
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
    valueClass: "text-emerald-950 dark:text-emerald-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-300",
  },
};

interface KpiCardProps {
  label: string;
  value: number | null | undefined;
  formatter: (v: number | null | undefined) => string;
  formula: string;
  status?: StatusColor | null;
  delta?: KpiDelta;
  index: number;
  kpiKey?: DailyKpiKey | string;
  thresholdControl?: ReactNode;
}

/** Counts the displayed number up from 0 to `value` on first mount / whenever
 * `value` changes (filter change, refetch) with smooth spring-damped motion. */
function useCountUp(value: number | null | undefined, formatter: (v: number | null | undefined) => string): string {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(() => formatter(value));

  useEffect(() => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      setDisplay(formatter(value));
      return;
    }
    const controls = animate(motionValue, value, {
      duration: 0.85,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(formatter(v)),
    });
    return () => controls.stop();
  }, [value, formatter, motionValue]);

  return display;
}

export function KpiCard({
  label,
  value,
  formatter,
  formula,
  status,
  delta,
  index,
  kpiKey,
  thresholdControl,
}: KpiCardProps) {
  const { t } = useLanguage();
  const pct = delta?.percentage_variance;
  const hasDelta = pct !== null && pct !== undefined;
  const isUp = hasDelta && pct > 0;
  const isDown = hasDelta && pct < 0;
  const display = useCountUp(value, formatter);
  const statusConfig = status ? STATUS_CONFIGS[status] : null;
  const iconConfig = getKpiIconConfig(kpiKey ?? label);
  const IconComponent = iconConfig?.icon;
  const displayLabel = (kpiKey && (t as any)[KPI_TRANSLATION_MAP[kpiKey]]) || label;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -3, scale: 1.018 }}
      whileTap={{ scale: 0.99 }}
      transition={{
        type: "spring",
        stiffness: 240,
        damping: 22,
        delay: Math.min(index, 12) * 0.022,
      }}
      className={cn(
        "group relative flex flex-col justify-between rounded-xl sm:rounded-2xl p-2 sm:p-2.5 md:p-3 xl:p-3.5 transition-all duration-200 overflow-hidden min-w-0",
        statusConfig?.cardClass ?? "glossy-kpi-neutral",
      )}
    >
      {/* Ambient aura around active status cards */}
      {statusConfig && (
        <div
          className={cn(
            "pointer-events-none absolute -top-8 -left-8 h-32 w-32 rounded-full bg-gradient-to-br opacity-80 blur-xl transition-opacity duration-300 group-hover:opacity-100",
            statusConfig.aura,
          )}
        />
      )}

      {/* Glass top specular line */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r",
          statusConfig?.specular ?? "from-transparent via-white/35 dark:via-white/20 to-transparent",
        )}
      />

      {/* Diagonal glossy sheen highlight */}
      <div className="pointer-events-none absolute -inset-full top-0 h-[200%] w-[200%] bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-50 transition-opacity group-hover:opacity-80" />

      {/* Shimmer sweep on hover */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

      {/* Card Header: Icon Chip + Label + Status Beacon + Popover Actions */}
      <div className="relative z-10 flex items-start justify-between gap-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {IconComponent && (
            <div
              className={cn(
                "flex h-4.5 w-4.5 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-300 shadow-xs",
                "group-hover:scale-110",
                iconConfig.bg,
                iconConfig.border,
                iconConfig.color,
              )}
            >
              <IconComponent className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </div>
          )}
          {statusConfig && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-80", statusConfig.dotGlow)} />
              <span className={cn("relative inline-flex h-2 w-2 rounded-full", statusConfig.dotColor)} />
            </span>
          )}
          <span className="text-muted-foreground group-hover:text-foreground/90 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate transition-colors">
            {displayLabel}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0 -mr-0.5 -mt-0.5">
          {thresholdControl}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${label} formula`}
                className="text-muted-foreground/60 hover:text-foreground hover:bg-muted/80 rounded p-0.5 sm:p-1 transition-all cursor-pointer"
              >
                <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-68 p-3.5 shadow-xl border-border/80 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold tracking-wide uppercase text-foreground">{label}</div>
                {status && (
                  <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border", statusConfig?.badgeClass)}>
                    {status}
                  </span>
                )}
              </div>
              <div className="mt-2 font-mono text-xs text-foreground/90 bg-muted/70 p-2 rounded-md border border-border/60 break-words leading-relaxed">
                {formula}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Card Value Display + Optional Delta Variance */}
      <div className="relative z-10 mt-2 flex items-baseline justify-between gap-1 min-w-0">
        <div
          className={cn(
            "font-mono text-sm sm:text-base md:text-lg xl:text-xl font-extrabold tabular-nums tracking-tight transition-colors whitespace-nowrap truncate drop-shadow-xs",
            statusConfig ? statusConfig.valueClass : "text-foreground group-hover:text-primary",
          )}
        >
          {display}
        </div>

        {hasDelta && (
          <div
            className={cn(
              "flex items-center gap-0.5 sm:gap-1 font-mono text-[9px] sm:text-[10px] md:text-[11px] font-semibold tabular-nums px-1 sm:px-1.5 py-0.5 rounded-md border shrink-0 whitespace-nowrap",
              isUp && "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
              isDown && "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
              !isUp && !isDown && "text-muted-foreground bg-muted/60 border-border/60",
            )}
          >
            {(isUp || isDown) && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 15, delay: Math.min(index, 12) * 0.022 + 0.15 }}
                className="inline-flex"
              >
                {isUp ? <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> : <TrendingDown className="h-2.5 w-2.5 sm:h-3 sm:w-3" />}
              </motion.span>
            )}
            {Math.round(Math.abs(pct))}%
          </div>
        )}
      </div>
    </motion.div>
  );
}
