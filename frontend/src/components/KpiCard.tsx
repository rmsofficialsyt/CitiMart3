import { animate, motion, useMotionValue } from "framer-motion";
import { Info } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { StatusColor } from "@/lib/types";

const BORDER_BY_STATUS: Record<StatusColor, string> = {
  red: "border-l-status-red",
  yellow: "border-l-status-yellow",
  green: "border-l-status-green",
};

interface KpiCardProps {
  label: string;
  value: number | null | undefined;
  formatter: (v: number | null | undefined) => string;
  formula: string;
  status?: StatusColor | null;
  index: number;
  /** Admin only: the <ThresholdPopover> gear, slotted into the card's
   * top-right control cluster next to the (i) button. The period-over-period
   * `delta` badge this card used to render went with the historical pages --
   * Daily Operations compares against the day's target, not a prior period. */
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
      whileHover={{ y: -3 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 12) * 0.03 }}
      className={cn(
        // Two cards per row on a phone (see the KPI grids' `grid-cols-2`), so
        // the padding and type scale down a step to keep a long value like
        // "₹12,34,567.00" on one line inside a ~165px card.
        "bg-card relative rounded-xl border border-l-4 p-3 transition-shadow duration-200 hover:shadow-md sm:p-4",
        status ? BORDER_BY_STATUS[status] : "border-l-border",
      )}
    >
      {/* Below-threshold KPIs are marked by the static status border alone
          (BORDER_BY_STATUS above) -- an earlier version also pulsed a red
          glow on an infinite loop to draw the eye, but that read as an
          unwanted "blinking" card rather than a calm attention cue, so the
          highlight is static now. */}
      <div className="absolute top-1 right-1 flex items-center gap-0.5 sm:top-2 sm:right-2 sm:gap-1">
        {thresholdControl}
        {/* The formula used to print openly under every card; it now lives
            behind this info button so the card face stays uncluttered. */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${label} formula`}
              className="text-muted-foreground/70 hover:text-foreground rounded p-1.5 transition-colors sm:p-0.5"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <div className="text-xs font-semibold tracking-wide uppercase">{label}</div>
            <div className="font-mono text-xs">{formula}</div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="text-muted-foreground pr-9 text-[11px] font-semibold tracking-wide uppercase sm:pr-12 sm:text-xs">
        {label}
      </div>
      <div className="mt-1 font-mono text-base font-bold break-all tabular-nums sm:text-xl sm:break-normal">{display}</div>
    </motion.div>
  );
}
