import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { downloadDailyReport } from "@/api/reportClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { todayLocalDate } from "@/lib/format";

type Scope = "all" | "day" | "range";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "all", label: "All days" },
  { value: "day", label: "Single day" },
  { value: "range", label: "Date range" },
];

const DATE_INPUT_CLASS = "border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm";

/** The Daily Operations export control: one "Export" button opening a popover
 * that picks the date scope *and* the file format, replacing the two bare
 * "Export Excel" / "Export PDF" buttons. Scope maps straight onto
 * GET /api/daily/report's optional start/end window (src/daily_report.py):
 * "All days" sends neither bound (every recorded date, the original
 * behaviour), "Single day" sends start == end, "Date range" sends both. */
export function DailyExportMenu({ store }: { store: string }) {
  const today = todayLocalDate();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [day, setDay] = useState(today);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  // Only "Date range" can be invalid: an inverted window the backend would
  // reject with a 400 anyway.
  const invalidRange = scope === "range" && (!start || !end || start > end);
  const missingDay = scope === "day" && !day;
  const canExport = !invalidRange && !missingDay;

  const rangeForScope = (): { start?: string; end?: string } | undefined => {
    if (scope === "day") return { start: day, end: day };
    if (scope === "range") return { start, end };
    return undefined;
  };

  const runExport = async (format: "xlsx" | "pdf") => {
    setExporting(format);
    try {
      await downloadDailyReport(store, format, rangeForScope());
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="glossy-btn flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-foreground transition-all cursor-pointer"
        >
          <Download className="h-3.5 w-3.5 text-primary" />
          <span>Export Reports</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="text-xs font-semibold tracking-wide uppercase">Export daily report</div>

        <div className="mt-3 space-y-1.5">
          <Label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Dates</Label>
          <div className="grid grid-cols-3 gap-1">
            {SCOPES.map((s) => (
              <Button
                key={s.value}
                type="button"
                size="sm"
                variant={scope === s.value ? "default" : "outline"}
                className="h-7 px-1 text-xs"
                onClick={() => setScope(s.value)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        {scope === "all" && (
          <p className="text-muted-foreground mt-2 text-xs">Every date this store has recorded entries for.</p>
        )}

        {scope === "day" && (
          <div className="mt-2">
            <Label className="mb-1 block text-xs">Date</Label>
            <input type="date" className={DATE_INPUT_CLASS} value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
        )}

        {scope === "range" && (
          <div className="mt-2 space-y-2">
            <div>
              <Label className="mb-1 block text-xs">Start date</Label>
              <input type="date" className={DATE_INPUT_CLASS} value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">End date</Label>
              <input type="date" className={DATE_INPUT_CLASS} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            {invalidRange && <p className="text-status-red text-xs">Start date must not be after the end date.</p>}
          </div>
        )}

        <div className="mt-3 space-y-1.5">
          <Label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Format</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={exporting !== null || !canExport}
              onClick={() => runExport("xlsx")}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {exporting === "xlsx" ? "…" : "Excel"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting !== null || !canExport}
              onClick={() => runExport("pdf")}
            >
              <FileText className="h-4 w-4" />
              {exporting === "pdf" ? "…" : "PDF"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
