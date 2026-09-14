import { animate, motion, useMotionValue } from "framer-motion";
import { Info } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { StatusColor } from "@/lib/types";

const STATUS_CLASSES: Record<StatusColor, string> = {
  red: "border-l-status-red bg-status-red-bg/10",
  yellow: "border-l-status-yellow bg-status-yellow-bg/10",
  green: "border-l-status-green bg-status-green-bg/10",
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
 * `value` changes (filter change, refetch) -- the "dynamic indicator" polish
 * requested for the KPI cards. Non-numeric values (N/A) skip the tween. */
function useCountUp(value: number | null | undefined, formatter: (v: number | null | undefined) => string): string {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(() => formatter(value));

  useEffect(() => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      setDisplay(formatter(value));
      return;
    }
    const controls = animate(motionValue, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(formatter(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, scale: 1.015 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 12) * 0.025 }}
      className={cn(
        "bg-card relative flex flex-col justify-between rounded-xl border border-border/80 border-l-4 p-3 sm:p-3.5 transition-all duration-200 shadow-xs hover:shadow-md min-h-[88px] sm:min-h-[96px]",
        status ? STATUS_CLASSES[status] : "border-l-border/60",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="text-muted-foreground pr-2 text-[11px] font-bold uppercase tracking-wider truncate sm:text-xs">
          {label}
        </div>
        <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-1">
          {thresholdControl}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${label} formula`}
                className="text-muted-foreground/60 hover:text-foreground rounded p-1 transition-colors cursor-pointer"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3 shadow-lg">
              <div className="text-xs font-bold tracking-wide uppercase text-foreground">{label}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground bg-muted/60 p-1.5 rounded border border-border/60">
                {formula}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="mt-2 font-mono text-base font-extrabold break-all tabular-nums text-foreground tracking-tight sm:text-lg lg:text-xl sm:break-normal">
        {display}
      </div>
    </motion.div>
  );
}
