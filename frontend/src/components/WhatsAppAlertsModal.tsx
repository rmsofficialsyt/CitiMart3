import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, Send, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.79 14.12c-.24.68-1.41 1.3-1.95 1.38-.5.07-1.13.1-1.83-.12-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.18-4.94-4.38-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36.19 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.83 2.02.9 2.17.07.14.12.31.02.51-.1.19-.14.31-.29.48-.14.17-.31.38-.44.51-.14.14-.3.3-.13.59.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.44.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.39-.24.65-.14.27.1 1.69.8 1.98.94.29.14.48.22.55.34.07.12.07.7-.17 1.38z" />
    </svg>
  );
}
import { toast } from "sonner";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ALERT_TYPE_OPTIONS = [
  { key: "hourly_pulse", label: "Hourly Pulse (11 AM–11 PM IST)" },
  { key: "slot_summary", label: "4-Slot Close (2 PM, 5 PM, 8 PM, 12 AM)" },
  { key: "daily_eod", label: "Daily EOD Summary (11:59 PM IST)" },
  { key: "anomaly_pace", label: "Pace & Red-KPI Anomaly" },
  { key: "closing_sprint", label: "Closing Sprint (9:30 PM IST)" },
] as const;

const STORES = [
  { code: "NM", label: "New Market (NM)" },
  { code: "HB", label: "Hatibagan (HB)" },
  { code: "CHW", label: "Chowringhee (CHW)" },
] as const;

function parsePhones(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function WhatsAppAlertsModal() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-alerts-config"],
    queryFn: api.getWhatsAppAlertConfig,
    enabled: open,
  });

  const { data: logsData, refetch: refetchLogs } = useQuery({
    queryKey: ["whatsapp-alerts-logs"],
    queryFn: () => api.getWhatsAppAlertLogs({ limit: 20 }),
    enabled: open,
  });

  const [enabled, setEnabled] = useState(false);
  const [language, setLanguage] = useState<"en" | "hi" | "bn">("en");
  const [adminPhones, setAdminPhones] = useState("");
  const [mgrPhones, setMgrPhones] = useState<Record<string, string>>({ NM: "", HB: "", CHW: "" });
  const [adminSched, setAdminSched] = useState<Record<string, boolean>>({});
  const [mgrSched, setMgrSched] = useState<Record<string, boolean>>({});

  // Preview & Test state
  const [previewAudience, setPreviewAudience] = useState<"admin" | "manager">("admin");
  const [previewStore, setPreviewStore] = useState<string>("NM");
  const [previewType, setPreviewType] = useState<string>("hourly_pulse");
  const [previewText, setPreviewText] = useState<string>("");
  const [previewMeta, setPreviewMeta] = useState<{ ai_used?: boolean; provider?: string } | null>(null);

  useEffect(() => {
    if (!data?.settings) return;
    const s = data.settings;
    setEnabled(s.enabled);
    setLanguage(s.language);
    setAdminPhones((s.admin_recipients || []).join(", "));
    setMgrPhones({
      NM: (s.manager_recipients?.NM || []).join(", "),
      HB: (s.manager_recipients?.HB || []).join(", "),
      CHW: (s.manager_recipients?.CHW || []).join(", "),
    });
    setAdminSched(s.schedules?.admin || {});
    setMgrSched(s.schedules?.manager || {});
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateWhatsAppAlertConfig({
        enabled,
        language,
        trading_start_hour: data?.settings?.trading_start_hour ?? 11,
        trading_end_hour: data?.settings?.trading_end_hour ?? 23,
        admin_recipients: parsePhones(adminPhones),
        manager_recipients: {
          NM: parsePhones(mgrPhones.NM || ""),
          HB: parsePhones(mgrPhones.HB || ""),
          CHW: parsePhones(mgrPhones.CHW || ""),
        },
        schedules: {
          admin: adminSched,
          manager: mgrSched,
        },
      }),
    onSuccess: () => {
      toast.success("WhatsApp alert settings saved (Indian +91 numbers normalized).");
      qc.invalidateQueries({ queryKey: ["whatsapp-alerts-config"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save WhatsApp alert settings");
    },
  });

  const sendMutation = useMutation({
    mutationFn: (previewOnly: boolean) =>
      api.triggerWhatsAppAlert({
        audience: previewAudience,
        store_code: previewAudience === "admin" ? "ALL" : previewStore,
        alert_type: previewType,
        language,
        use_ai: true,
        preview_only: previewOnly,
      }),
    onSuccess: (res) => {
      setPreviewText(res.message_body || "");
      setPreviewMeta({ ai_used: res.ai_used, provider: res.provider });
      if (res.preview_only) {
        toast.success("AI WhatsApp briefing preview generated.");
      } else {
        toast.success(`Alert processed (${res.status}) via ${res.provider}.`);
        refetchLogs();
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to run WhatsApp alert");
    },
  });

  const provider = data?.provider;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="WhatsApp AI Sales Alerts"
          title="WhatsApp AI Sales Alerts (Admin & Managers)"
          className="size-9 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 shrink-0 cursor-pointer"
        >
          <WhatsAppIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] max-w-5xl sm:max-w-5xl max-h-[90vh] overflow-y-auto bg-card text-foreground border-border p-5 sm:p-6">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2.5 text-lg leading-snug">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <WhatsAppIcon className="h-5 w-5" />
                </span>
                <span>WhatsApp AI Sales Alerts (Admin &amp; Managers)</span>
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-xs sm:text-sm leading-relaxed text-muted-foreground">
                Role-separated tabular briefings: Admin receives network totals + all-store rankings; each Store Manager receives strictly their own store.
              </DialogDescription>
            </div>
            {provider && (
              <span className="shrink-0 rounded-full border border-border bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
                Mode: {provider.active_provider}
              </span>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="config" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="config">Recipients & Schedules</TabsTrigger>
            <TabsTrigger value="preview">AI Preview & Send</TabsTrigger>
            <TabsTrigger value="logs">Delivery Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-4 pt-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading settings...</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3">
                  <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
                    <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(Boolean(v))} />
                    <span>Enable Automated Scheduled Alerts (11:00–23:59 IST)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Language</Label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as "en" | "hi" | "bn")}
                      className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium"
                    >
                      <option value="en">English (EN)</option>
                      <option value="hi">Hindi (HI)</option>
                      <option value="bn">Bengali (BN)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Admin Recipients & Schedule */}
                  <div className="space-y-3 rounded-xl border border-border p-3.5">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <span>Admin Granular Report (Network + All Stores)</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Indian Mobile Numbers (+91 or 10-digit, comma-separated)
                      </Label>
                      <Input
                        placeholder="9876543210, +919830011223"
                        value={adminPhones}
                        onChange={(e) => setAdminPhones(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 pt-1">
                      {ALERT_TYPE_OPTIONS.map((opt) => (
                        <label key={opt.key} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox
                            checked={Boolean(adminSched[opt.key])}
                            onCheckedChange={(v) => setAdminSched((p) => ({ ...p, [opt.key]: Boolean(v) }))}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Manager Recipients & Schedule */}
                  <div className="space-y-3 rounded-xl border border-border p-3.5">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span>Manager Granular Report (Single-Store Isolated)</span>
                    </div>
                    <div className="space-y-2">
                      {STORES.map((s) => (
                        <div key={s.code} className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">{s.label}</Label>
                          <Input
                            placeholder="10-digit Indian mobile"
                            value={mgrPhones[s.code] || ""}
                            onChange={(e) => setMgrPhones((p) => ({ ...p, [s.code]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2 pt-1">
                      {ALERT_TYPE_OPTIONS.map((opt) => (
                        <label key={opt.key} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox
                            checked={Boolean(mgrSched[opt.key])}
                            onCheckedChange={(v) => setMgrSched((p) => ({ ...p, [opt.key]: Boolean(v) }))}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Saving..." : "Save Alert Settings"}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="preview" className="space-y-4 pt-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Audience</Label>
                <select
                  value={previewAudience}
                  onChange={(e) => setPreviewAudience(e.target.value as "admin" | "manager")}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-medium"
                >
                  <option value="admin">Admin (Network + All Stores)</option>
                  <option value="manager">Store Manager (Isolated)</option>
                </select>
              </div>
              {previewAudience === "manager" && (
                <div className="space-y-1">
                  <Label className="text-xs">Store</Label>
                  <select
                    value={previewStore}
                    onChange={(e) => setPreviewStore(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-medium"
                  >
                    {STORES.map((s) => (
                      <option key={s.code} value={s.code}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Report Type</Label>
                <select
                  value={previewType}
                  onChange={(e) => setPreviewType(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-medium"
                >
                  {ALERT_TYPE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                  <option value="custom_on_demand">On-Demand Briefing</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => sendMutation.mutate(true)}
                disabled={sendMutation.isPending}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                Preview AI Tabular Message
              </Button>
              <Button
                onClick={() => sendMutation.mutate(false)}
                disabled={sendMutation.isPending}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Send className="h-4 w-4" />
                Send Now ({provider?.active_provider || "dry_run"})
              </Button>
            </div>

            {previewText && (
              <div className="rounded-xl border border-emerald-500/30 bg-muted/40 p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    {previewMeta?.ai_used ? "Gemini AI Grounded Briefing" : "Deterministic Tabular Fallback"}
                  </span>
                  <span>Provider: {previewMeta?.provider}</span>
                </div>
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
                  {previewText}
                </pre>
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="pt-3">
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(logsData?.logs || []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No WhatsApp alerts logged yet.</p>
              ) : (
                (logsData?.logs || []).map((log: any, idx: number) => (
                  <div key={log.trigger_key || idx} className="rounded-xl border border-border p-3 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        [{log.audience?.toUpperCase()}] {log.store_code} · {log.alert_type}
                      </span>
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                        {log.status} ({log.provider})
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Recipients: {(log.recipients || []).join(", ") || "None"} · {log.created_at}
                    </div>
                    <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-[11px]">
                      {log.message_body}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
