import { animate, motion, useMotionValue } from "framer-motion";
import { Info } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { StatusColor } from "@/lib/types";

const STATUS_CONFIGS: Record<
  StatusColor,
  {
    border: string;
    borderGlow: string;
    bgGradient: string;
    dotColor: string;
    dotGlow: string;
    aura: string;
  }
> = {
  red: {
    border: "border-l-rose-500 dark:border-l-rose-400",
    borderGlow: "shadow-[inset_2px_0_12px_rgba(244,63,94,0.18)]",
    bgGradient: "bg-gradient-to-br from-rose-500/[0.07] via-transparent to-rose-500/[0.02]",
    dotColor: "bg-rose-500",
    dotGlow: "bg-rose-500/40",
    aura: "from-rose-500/15 via-rose-500/5 to-transparent",
  },
  yellow: {
    border: "border-l-amber-500 dark:border-l-amber-400",
    borderGlow: "shadow-[inset_2px_0_12px_rgba(245,158,11,0.18)]",
    bgGradient: "bg-gradient-to-br from-amber-500/[0.07] via-transparent to-amber-500/[0.02]",
    dotColor: "bg-amber-500",
    dotGlow: "bg-amber-500/40",
    aura: "from-amber-500/15 via-amber-500/5 to-transparent",
  },
  green: {
    border: "border-l-emerald-500 dark:border-l-emerald-400",
    borderGlow: "shadow-[inset_2px_0_12px_rgba(16,185,129,0.18)]",
    bgGradient: "bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-emerald-500/[0.02]",
    dotColor: "bg-emerald-500",
    dotGlow: "bg-emerald-500/40",
    aura: "from-emerald-500/15 via-emerald-500/5 to-transparent",
  },
};

interface KpiCardProps {
  label: string;
  value: number | null | undefined;
  formatter: (v: number | null | undefined) => string;
  formula: string;
  status?: StatusColor | null;
  index: number;
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
  index,
  thresholdControl,
}: KpiCardProps) {
  const display = useCountUp(value, formatter);
  const statusConfig = status ? STATUS_CONFIGS[status] : null;

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
        "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] p-3 sm:p-3.5 transition-all duration-200 overflow-hidden",
        "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
        statusConfig
          ? cn(statusConfig.border, statusConfig.borderGlow, statusConfig.bgGradient)
          : "border-l-primary/40 bg-gradient-to-br from-primary/[0.02] to-transparent",
      )}
    >
      {/* Ambient status aura in top-left corner */}
      {statusConfig && (
        <div
          className={cn(
            "pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100",
            statusConfig.aura,
          )}
        />
      )}

      {/* Glass top specular line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />

      {/* Shimmer sweep on hover */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

      {/* Card Header: Label + Status Beacon + Popover Actions */}
      <div className="relative z-10 flex items-start justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0 pr-1">
          {statusConfig && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", statusConfig.dotGlow)} />
              <span className={cn("relative inline-flex h-2 w-2 rounded-full", statusConfig.dotColor)} />
            </span>
          )}
          <span className="text-muted-foreground group-hover:text-foreground/90 text-[11px] font-bold uppercase tracking-wider truncate sm:text-xs transition-colors">
            {label}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-1">
          {thresholdControl}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${label} formula`}
                className="text-muted-foreground/60 hover:text-foreground hover:bg-muted/80 rounded p-1 transition-all cursor-pointer"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-68 p-3.5 shadow-xl border-border/80 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold tracking-wide uppercase text-foreground">{label}</div>
                {status && (
                  <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full", {
                    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400": status === "green",
                    "bg-amber-500/15 text-amber-600 dark:text-amber-400": status === "yellow",
                    "bg-rose-500/15 text-rose-600 dark:text-rose-400": status === "red",
                  })}>
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

      {/* Card Value Display */}
      <div className="relative z-10 mt-2.5 flex items-baseline justify-between">
        <div className="font-mono text-base font-extrabold tabular-nums tracking-tight text-foreground group-hover:text-primary transition-colors sm:text-lg lg:text-xl break-all sm:break-normal drop-shadow-xs">
          {display}
        </div>
      </div>
    </motion.div>
  );
}
