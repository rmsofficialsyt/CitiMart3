import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Boxes, Receipt, Users } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { STORE_NAME_BY_CODE, type StoreCode } from "@/lib/authUsers";
import type { AdvisorStrings } from "@/lib/advisorTranslations";
import { fmtCurrencyOrZero, fmtNumberOrZero, fmtPercentOrZero } from "@/lib/format";
import type { AdvisorResponse, AdvisorStockItem, AdvisorTransferSuggestion } from "@/lib/types";

const storeName = (code: string) => STORE_NAME_BY_CODE[code as StoreCode] ?? code;

function Panel({ icon: Icon, title, children }: { icon: typeof Receipt; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/80 bg-background/60 p-3.5 backdrop-blur-sm min-w-0">
      <div className="mb-2.5 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

function BillMix({ mix, s }: { mix: AdvisorResponse["bill_mix"]; s: AdvisorStrings }) {
  return (
    <Panel icon={Receipt} title={s.billMix}>
      <div className="space-y-2">
        {mix.bands.map((b) => (
          <div key={b.band} className="text-[11px]">
            <div className="mb-1 flex justify-between gap-2 text-muted-foreground">
              <span>{s.bands[b.band]}</span>
              <span className="font-mono text-foreground">
                {fmtPercentOrZero(b.today_share_pct)}
                {b.norm_share_pct != null && <span className="text-muted-foreground"> · {s.norm} {fmtPercentOrZero(b.norm_share_pct)}</span>}
              </span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, b.today_share_pct)}%` }} />
              {b.norm_share_pct != null && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/70" style={{ left: `${Math.min(99, b.norm_share_pct)}%` }} />
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {mix.today_bills} {s.today.toLowerCase()} · {s.largestBill}: {mix.largest_bill != null ? fmtCurrencyOrZero(mix.largest_bill) : "—"}
        {!mix.norm_available && <span className="block">{s.noNorm}</span>}
      </p>
    </Panel>
  );
}

function Staffing({ staffing, s }: { staffing: AdvisorResponse["staffing"]; s: AdvisorStrings }) {
  return (
    <Panel icon={Users} title={s.staffing}>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-medium pb-1">Slot</th>
            <th className="text-right font-medium pb-1">{s.staffOnFloor}</th>
            <th className="text-right font-medium pb-1">{s.footfallPerStaff}</th>
          </tr>
        </thead>
        <tbody>
          {staffing.slots.map((r) => (
            <tr key={r.slot} className="border-t border-border/50">
              <td className="py-1 pr-2 truncate max-w-[9rem]">{r.slot}</td>
              <td className="py-1 text-right font-mono">{r.staff}</td>
              <td className="py-1 text-right font-mono">
                {r.footfall_per_staff != null ? fmtNumberOrZero(Math.round(r.footfall_per_staff * 10) / 10) : "—"}
                {r.footfall_source === "expected" && <span className="ml-1 text-muted-foreground">({s.expected})</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {staffing.times_known === false && <p className="mt-2 text-[11px] text-muted-foreground">{s.timesUnknown}</p>}
    </Panel>
  );
}

function ItemList({ label, items }: { label: string; items?: AdvisorStockItem[] }) {
  if (!items?.length) return null;
  return (
    <div className="text-[11px]">
      <div className="font-semibold text-foreground">{label}</div>
      <ul className="text-muted-foreground">
        {items.map((i) => (
          <li key={i.barcode} className="flex justify-between gap-2">
            <span className="truncate">{i.item_name ?? i.barcode}</span>
            <span className="font-mono shrink-0">{i.current_stock}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stock({ stock, storeCode, s }: { stock: AdvisorResponse["stock"]; storeCode: string; s: AdvisorStrings }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Transfers are initiated by the sending store (routes_stocks checks from_store).
  const canSend = (t: AdvisorTransferSuggestion) => user?.role === "admin" || user?.storeCode === t.from_store;
  const create = useMutation({
    mutationFn: (t: AdvisorTransferSuggestion) =>
      api.createTransfer({
        from_store: t.from_store,
        to_store: t.to_store,
        items: [{ barcode: t.barcode, quantity: t.quantity }],
        notes: "Suggested by AI Decision Advisor",
      }),
    onSuccess: () => {
      toast.success(s.transferCreated);
      queryClient.invalidateQueries({ queryKey: ["daily-live", storeCode] });
      queryClient.invalidateQueries({ queryKey: ["stocks-transfers"] });
    },
    onError: (e) => toast.error(`${s.transferFailed}: ${(e as Error).message}`),
  });

  return (
    <Panel icon={Boxes} title={s.stock}>
      <div className="space-y-2">
        <ItemList label={`${s.outOfStock} (${stock.out_of_stock_count ?? 0})`} items={stock.out_of_stock} />
        <ItemList label={`${s.lowStock} (${stock.low_stock_count ?? 0})`} items={stock.low_stock} />
        <ItemList label={s.slowMovers(stock.slow_mover_days ?? 0)} items={stock.slow_movers} />
        {!!stock.transfers?.length && (
          <div className="text-[11px]">
            <div className="font-semibold text-foreground flex items-center gap-1">
              <ArrowRightLeft className="h-3 w-3" /> {s.transfers}
            </div>
            <ul className="space-y-1 mt-1">
              {stock.transfers.map((t) => (
                <li key={`${t.direction}-${t.barcode}-${t.to_store}`} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-muted-foreground">
                    <span className="text-foreground">{t.item_name ?? t.barcode}</span> ·{" "}
                    {t.direction === "outbound" ? s.send(t.quantity, storeName(t.to_store)) : s.request(t.quantity, storeName(t.from_store))}
                  </span>
                  {canSend(t) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 shrink-0 px-2 text-[10px] cursor-pointer"
                      disabled={create.isPending}
                      onClick={() => {
                        if (window.confirm(`${s.createTransfer}: ${t.quantity} × ${t.item_name ?? t.barcode} → ${storeName(t.to_store)}?`)) {
                          create.mutate(t);
                        }
                      }}
                    >
                      {s.createTransfer}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Tier 2 data panels under the insight cards. Every figure is the backend's. */
export function AdvisorSignals({ data, storeCode, s }: { data: AdvisorResponse; storeCode: string; s: AdvisorStrings }) {
  const panels = [
    data.bill_mix.available && <BillMix key="mix" mix={data.bill_mix} s={s} />,
    data.staffing.available && <Staffing key="staff" staffing={data.staffing} s={s} />,
    data.stock.available && <Stock key="stock" stock={data.stock} storeCode={storeCode} s={s} />,
  ].filter(Boolean);
  if (!panels.length) return null;
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{panels}</div>;
}
