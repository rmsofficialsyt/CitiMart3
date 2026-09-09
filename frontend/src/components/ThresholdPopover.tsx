import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ThresholdBand } from "@/lib/types";

// Admin-only gear next to a KPI card's (i) button: edit that KPI's
// red/yellow/green status band (PUT /api/kpi-thresholds). Same popover shape as
// KpiCard.tsx's EditValuePopover. Achievement % uses `green_above` (strict '>'),
// every other KPI uses `green_at_or_above`.
export function ThresholdPopover({
  kpiKey,
  kpiLabel,
  greenKey,
  band,
  isOverridden,
  onSave,
  onReset,
}: {
  kpiKey: string;
  kpiLabel: string;
  greenKey: "green_above" | "green_at_or_above";
  band: ThresholdBand;
  isOverridden: boolean;
  onSave: (patch: Record<string, Record<string, number>>) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [red, setRed] = useState("");
  const [green, setGreen] = useState("");

  useEffect(() => {
    if (open) {
      setRed(String(band.red_below ?? ""));
      setGreen(String(band[greenKey] ?? ""));
    }
  }, [open, band, greenKey]);

  const redN = Number(red);
  const greenN = Number(green);
  const canSave =
    red.trim() !== "" &&
    green.trim() !== "" &&
    Number.isFinite(redN) &&
    Number.isFinite(greenN) &&
    redN >= 0 &&
    greenN > redN;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Edit ${kpiLabel} thresholds`}
          // Extra padding on small screens only -- a 14px icon at p-0.5 is an
          // 18px tap target, well under the ~44px a finger needs.
          className="text-muted-foreground/70 hover:text-foreground rounded p-1.5 transition-colors sm:p-0.5"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="text-xs font-semibold tracking-wide uppercase">{kpiLabel} thresholds</div>
        <p className="text-muted-foreground text-xs">
          Below “Red” shows red; “{greenKey === "green_above" ? "above" : "at or above"} Green” shows green; between is yellow.
          Applies to every card, gauge and table.
        </p>
        <form
          className="mt-1 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) {
              onSave({ [kpiKey]: { red_below: redN, [greenKey]: greenN } });
              setOpen(false);
            }
          }}
        >
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Red below</span>
            <Input type="number" step="any" min="0" value={red} onChange={(e) => setRed(e.target.value)} className="h-8 w-28" />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Green {greenKey === "green_above" ? "above" : "at/above"}</span>
            <Input type="number" step="any" min="0" value={green} onChange={(e) => setGreen(e.target.value)} className="h-8 w-28" />
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={!canSave}>
              Save
            </Button>
            {isOverridden && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-1 text-xs"
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
              >
                Reset to default
              </Button>
            )}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
