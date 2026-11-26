import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  Sparkles,
  TrendingUp,
  Zap,
  Clock,
  CheckSquare,
  Square,
  AlertCircle,
  Info,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Radio,
  Target,
  Receipt,
  LineChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdvisorExplain } from "@/components/AdvisorExplain";
import { AdvisorSignals } from "@/components/AdvisorSignals";
import { AdvisorWhatIf } from "@/components/AdvisorWhatIf";
import { api } from "@/api/client";
import { ADVISOR_STRINGS, type AdvisorStrings } from "@/lib/advisorTranslations";
import { fmtCurrencyOrZero, fmtNumberOrZero, fmtPercentOrZero } from "@/lib/format";
import { useLanguage } from "@/context/LanguageContext";
import type { Translations } from "@/lib/translations";
import type { AdvisorInsight, AdvisorResponse } from "@/lib/types";

interface AiStoreAdvisorProps {
  storeCode: string;
  storeName: string;
  date: string;
}

type Severity = AdvisorInsight["severity"];

const SEVERITY_STYLE: Record<Severity, { card: string; tag: string; icon: typeof AlertCircle; iconClass: string }> = {
  urgent: {
    card: "border-amber-500/35 bg-amber-500/5 dark:border-amber-500/25 hover:border-amber-500/60",
    tag: "bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30",
    icon: AlertCircle,
    iconClass: "text-amber-500",
  },
  opportunity: {
    card: "border-blue-500/35 bg-blue-500/5 dark:border-blue-500/25 hover:border-blue-500/60",
    tag: "bg-blue-500/15 text-blue-500 dark:text-blue-400 border-blue-500/30",
    icon: Zap,
    iconClass: "text-blue-500",
  },
  info: {
    card: "border-border bg-muted/30 hover:border-foreground/30",
    tag: "bg-muted text-muted-foreground border-border",
    icon: Info,
    iconClass: "text-muted-foreground",
  },
  success: {
    card: "border-emerald-500/35 bg-emerald-500/5 dark:border-emerald-500/25 hover:border-emerald-500/60",
    tag: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border-emerald-500/30",
    icon: TrendingUp,
    iconClass: "text-emerald-500",
  },
};

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

// Evidence keys rendered as ₹ / % / counts in the Tier 2 wording.
const MONEY_KEYS = new Set(["atv", "baseline_atv", "largest_bill", "net_sales_without"]);
const ROUND_KEYS = new Set(["footfall", "baseline_footfall", "nob", "baseline_nob", "footfall_per_staff", "median_footfall_per_staff"]);

function fmtEvidence(e: AdvisorInsight["evidence"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(e)) {
    if (Array.isArray(v)) out[k] = v.join(", ");
    else if (typeof v === "number") {
      if (MONEY_KEYS.has(k)) out[k] = fmtCurrencyOrZero(v);
      else if (k.endsWith("_pct")) out[k] = fmtPercentOrZero(v);
      else if (ROUND_KEYS.has(k)) out[k] = fmtNumberOrZero(Math.round(v * 10) / 10);
      else out[k] = fmtNumberOrZero(v);
    } else out[k] = v == null ? "—" : String(v);
  }
  return out;
}

/** Localized wording for a backend insight. Numbers come only from `evidence`
 *  / the response — the rules themselves live in backend/src/advisor/engine.py. */
function describe(ins: AdvisorInsight, data: AdvisorResponse, t: Translations, s: AdvisorStrings) {
  const e = ins.evidence;
  const tier2 = s.insights[ins.id];
  if (tier2) return { title: tier2.title, desc: tier2.desc(fmtEvidence(e)), action: tier2.action, tag: tier2.tag };
  switch (ins.id) {
    case "closing_gap":
      return { title: t.insightClosingTitle, desc: t.insightClosingDesc(fmtCurrencyOrZero(num(e.remaining))), action: t.insightClosingAction, tag: t.categoryRecovery };
    case "pace_behind":
      return {
        title: t.insightLaggingTitle(typeof e.slot === "string" ? e.slot : ""),
        desc: t.insightLaggingDesc(fmtPercentOrZero(num(e.achievement_pct)), Math.round(num(e.expected_pct))),
        action: t.insightLaggingAction,
        tag: t.categoryPace,
      };
    case "pace_ahead":
      return {
        title: t.insightCrushingTitle,
        desc: t.insightCrushingDesc(fmtPercentOrZero(num(e.achievement_pct)), Math.round(num(e.expected_pct))),
        action: t.insightCrushingAction,
        tag: t.categoryMomentum,
      };
    case "conversion_low":
      return { title: t.insightConversionTitle, desc: t.insightConversionDesc(fmtNumberOrZero(num(e.footfall)), fmtPercentOrZero(num(e.value))), action: t.insightConversionAction, tag: t.categoryConversion };
    case "atv_low":
      return {
        title: t.insightAtvTitle,
        desc: t.insightAtvDesc(fmtCurrencyOrZero(num(e.value)), fmtCurrencyOrZero(num(e.green_at)), fmtCurrencyOrZero(num(e.uplift_if_green))),
        action: t.insightAtvAction,
        tag: t.categoryAtv,
      };
    case "basket_low":
      return { title: t.insightBasketTitle, desc: t.insightBasketDesc(fmtNumberOrZero(num(e.value))), action: t.insightBasketAction, tag: t.categoryBasket };
    case "no_target":
      return { title: t.insightNoTargetTitle, desc: t.insightNoTargetDesc, action: t.insightNoTargetAction, tag: t.categoryPace };
    case "data_gap":
      return {
        title: t.insightDataGapTitle,
        desc: t.insightDataGapDesc(Array.isArray(e.slots) ? e.slots.join(", ") : ""),
        action: t.insightDataGapAction,
        tag: t.categorySteady,
      };
    case "balanced":
    default:
      return {
        title: t.insightBalancedTitle,
        desc: t.insightBalancedDesc(
          fmtCurrencyOrZero(data.kpis.net_sales ?? 0),
          fmtNumberOrZero(data.kpis.footfall ?? 0),
          fmtPercentOrZero(data.kpis.conversion_pct ?? 0),
        ),
        action: t.insightBalancedAction,
        tag: t.categorySteady,
      };
  }
}

function checklistLabel(key: string, data: AdvisorResponse, t: Translations, s: AdvisorStrings): string {
  const floor: Record<string, string> = { task1: t.task1, task2: t.task2, task3: t.task3, task4: t.task4 };
  if (floor[key]) return floor[key];
  const ins = data.insights.find((i) => i.id === key);
  return ins ? describe(ins, data, t, s).action : key;
}

export function AiStoreAdvisor({ storeCode, storeName, date }: AiStoreAdvisorProps) {
  const { language, t } = useLanguage();
  const s = ADVISOR_STRINGS[language];
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Prefixed with "daily-live" so every existing entry/target invalidation
  // refreshes the Advisor too; the interval keeps the pace marker moving.
  const queryKey = ["daily-live", storeCode, date, "advisor"];
  const { data, isError } = useQuery({
    queryKey,
    queryFn: () => api.advisor(storeCode, date),
    refetchInterval: 60_000,
  });

  const toggle = useMutation({
    mutationFn: (v: { action_key: string; done: boolean }) => api.setAdvisorAction({ store: storeCode, date, ...v }),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<AdvisorResponse>(queryKey);
      if (prev) {
        queryClient.setQueryData<AdvisorResponse>(queryKey, {
          ...prev,
          checklist: prev.checklist.map((c) => (c.action_key === v.action_key ? { ...c, done: v.done } : c)),
        });
      }
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const copyActionText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(idx);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isError) {
    return <div className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">{t.advisorLoadError}</div>;
  }
  if (!data) return null;

  const ach = data.kpis.achievement_pct ?? 0;
  const expected = data.pacing.expected_achievement_pct;
  const isLagging = data.insights.some((i) => i.id === "pace_behind" || i.id === "closing_gap");
  const isCrushing = data.insights.some((i) => i.id === "pace_ahead");
  const canEdit = data.day_status === "open";
  const completedCount = data.checklist.filter((c) => c.done).length;
  const progressPercent = data.checklist.length ? Math.round((completedCount / data.checklist.length) * 100) : 0;
  const dash = (v: number | null, fmt: (n: number) => string) => (v == null ? "—" : fmt(v));

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl border border-indigo-500/25 bg-gradient-to-b from-indigo-950/20 via-card/70 to-card/90 p-4 sm:p-5 shadow-lg backdrop-blur-md"
    >
      <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-600 text-white shadow-md shadow-indigo-500/30">
            <Brain className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold text-base sm:text-lg text-foreground tracking-tight">{t.aiTitle}</h3>
              {canEdit && (
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  <Radio className="h-3 w-3 animate-pulse" /> {t.liveIntelligence}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate sm:whitespace-normal">
              {t.aiSubtitle} <strong className="text-foreground">{storeName} ({storeCode})</strong>
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer"
        >
          <span className="hidden sm:inline mr-1">{isExpanded ? t.collapseHub : t.expandHub}</span>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden space-y-4 relative z-10"
          >
            {/* Pace vs this store's learned curve */}
            <div className="rounded-xl border border-border/80 bg-background/60 p-3.5 backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-semibold text-foreground">{t.operatingWindow}:</span>
                  <span className="text-muted-foreground font-medium">
                    {data.day_status === "closed" ? t.advisorDayClosed : data.current_slot ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{t.slotBenchmark}:</span>
                    <strong className="text-foreground font-mono">{dash(expected, fmtPercentOrZero)}</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{t.liveAch}:</span>
                    <strong
                      className={`font-mono text-sm font-bold ${
                        isLagging ? "text-amber-500 dark:text-amber-400" : isCrushing ? "text-emerald-500 dark:text-emerald-400" : "text-blue-500 dark:text-blue-400"
                      }`}
                    >
                      {fmtPercentOrZero(ach)}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.max(0, ach))}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full rounded-full ${
                    isLagging ? "bg-gradient-to-r from-amber-500 to-orange-500" : isCrushing ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gradient-to-r from-blue-500 to-indigo-600"
                  }`}
                />
                {expected != null && (
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-foreground/80 z-10"
                    style={{ left: `${Math.min(99, expected)}%` }}
                    title={`${t.slotBenchmark}: ${fmtPercentOrZero(expected)}`}
                  />
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {!data.pacing.available
                  ? t.advisorPacingInsufficient(data.pacing.days_used)
                  : data.pacing.source === "similar_days"
                    ? s.pacingSimilar(
                        data.pacing.days_used,
                        (data.pacing.context?.matched_on ?? []).map((m) => s.matched[m] ?? m).join(", "),
                      )
                    : t.advisorPacingLearned(data.pacing.days_used, data.pacing.source === "same_weekday")}
              </p>

              {/* Projection */}
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { icon: LineChart, label: t.advisorProjectedClose, value: dash(data.projection.projected_close, fmtCurrencyOrZero) },
                  { icon: Target, label: t.advisorToTarget, value: dash(data.projection.remaining_to_target, fmtCurrencyOrZero) },
                  { icon: Receipt, label: t.advisorBillsNeeded, value: dash(data.projection.bills_needed_at_current_atv, fmtNumberOrZero) },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2">
                    <Icon className="h-4 w-4 text-indigo-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</div>
                      <div className="font-mono text-sm font-bold text-foreground">{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Insights */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.tacticalDirectives}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{t.tacticalSub}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.insights.map((ins, idx) => {
                  const d = describe(ins, data, t, s);
                  const sev = SEVERITY_STYLE[ins.severity];
                  const Icon = sev.icon;
                  return (
                    <motion.div
                      key={ins.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: idx * 0.05 }}
                      className={`flex flex-col justify-between rounded-xl border p-3.5 transition-colors ${sev.card}`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Icon className={`h-4 w-4 shrink-0 ${sev.iconClass}`} />
                            <h4 className="font-bold text-xs uppercase tracking-wide text-foreground truncate">{d.title}</h4>
                          </div>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider uppercase border ${sev.tag}`}>
                            {d.tag}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{d.desc}</p>
                      </div>
                      <div className="rounded-lg bg-background/90 p-2.5 text-xs border border-border/70">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <Lightbulb className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                            <span className="font-semibold text-foreground leading-snug">{d.action}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyActionText(d.action, idx)}
                            title={t.copyAction}
                            className="text-muted-foreground hover:text-foreground shrink-0 p-1 rounded hover:bg-muted cursor-pointer"
                          >
                            {copiedId === idx ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Tier 2 data panels: bill mix, staff vs traffic, stock & transfers */}
            <AdvisorSignals data={data} storeCode={storeCode} s={s} />

            {/* Tier 3: what-if (open day only) and driver attribution */}
            <div className="grid gap-3 lg:grid-cols-2">
              {canEdit && <AdvisorWhatIf storeCode={storeCode} date={date} s={s} />}
              <AdvisorExplain storeCode={storeCode} date={date} s={s} />
            </div>

            {/* Persisted floor checklist */}
            <div className="rounded-xl border border-border/80 bg-card/60 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                  <CheckSquare className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wide text-foreground">{t.managerChecklist}</span>
                <span className="text-xs font-semibold text-indigo-400">
                  ({completedCount}/{data.checklist.length}{" "}
                  {language === "hi" ? "पूरा हुआ" : language === "bn" ? "সম্পন্ন" : "Completed"} · {progressPercent}%)
                </span>
              </div>
              <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.4 }}
                  className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                />
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {data.checklist.map((item) => (
                  <button
                    key={item.action_key}
                    type="button"
                    disabled={!canEdit || toggle.isPending}
                    onClick={() => toggle.mutate({ action_key: item.action_key, done: !item.done })}
                    title={item.done && item.done_by ? item.done_by : undefined}
                    className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left text-xs transition-colors cursor-pointer disabled:cursor-not-allowed ${
                      item.done
                        ? "border-emerald-500/40 bg-emerald-500/10 text-muted-foreground"
                        : "border-border/80 bg-background/90 hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    {item.done ? (
                      <CheckSquare className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span className="min-w-0">
                      <span className={`font-medium ${item.done ? "line-through opacity-75" : ""}`}>
                        {checklistLabel(item.action_key, data, t, s)}
                      </span>
                      {item.outcome && (
                        <span
                          className={`mt-1 block text-[10px] font-semibold ${
                            item.outcome.win_rate_pct >= 50 ? "text-emerald-500" : "text-muted-foreground"
                          }`}
                        >
                          {s.winRate(`${item.outcome.wins}`, item.outcome.trials)}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
