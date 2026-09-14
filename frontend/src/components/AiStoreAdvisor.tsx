import { useState, useMemo } from "react";
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
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RotateCcw,
  CheckCircle2,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtCurrencyOrZero, fmtNumberOrZero, fmtPercentOrZero } from "@/lib/format";
import { useLanguage } from "@/context/LanguageContext";
import type { DailyKpis } from "@/lib/types";

interface AiStoreAdvisorProps {
  kpis: DailyKpis;
  storeCode: string;
  storeName: string;
}

export function AiStoreAdvisor({ kpis, storeCode, storeName }: AiStoreAdvisorProps) {
  const { language, t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);

  const tasks = useMemo(() => [
    { id: "1", text: t.task1, category: "upsell" },
    { id: "2", text: t.task2, category: "conversion" },
    { id: "3", text: t.task3, category: "upsell" },
    { id: "4", text: t.task4, category: "speed" },
  ], [t]);

  const toggleTask = (id: string) => {
    setCompletedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const markAllTasks = (completed: boolean) => {
    setCompletedTaskIds(completed ? tasks.map((tk) => tk.id) : []);
  };

  const copyActionText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(idx);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Determine current time slot and time of day
  const currentTime = new Date();
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();
  const timeInMinutes = currentHour * 60 + currentMinute;

  // Real-time AI Analysis
  const analysis = useMemo(() => {
    const netSales = kpis.net_sales ?? 0;
    const target = kpis.sales_target ?? 0;
    const achPct = kpis.achievement_pct ?? (target > 0 ? (netSales / target) * 100 : 0);
    const footfall = kpis.footfall ?? 0;
    const nob = kpis.nob ?? 0;
    const conversion = kpis.conversion_pct ?? (footfall > 0 ? (nob / footfall) * 100 : 0);
    const atv = kpis.atv ?? (nob > 0 ? netSales / nob : 0);
    const basket = kpis.basket_size ?? (nob > 0 ? (kpis.bill_quantity ?? 0) / nob : 0);
    const remaining = kpis.remaining ?? Math.max(0, target - netSales);

    // Operational Slot Identification
    let slotName = language === "hi"
      ? "शाम का प्राइम स्लॉट"
      : language === "bn"
      ? "সন্ধ্যার প্রাইম স্লট"
      : "Evening Prime";
    let isClosingSlot = false;
    let expectedAchPct = 50;

    if (timeInMinutes < 780) {
      slotName = language === "hi"
        ? "सुबह का ओपनिंग स्लॉट (10:30 AM – 01:00 PM)"
        : language === "bn"
        ? "সকালের ওপেনিং স্লট (10:30 AM – 01:00 PM)"
        : "Morning Opening Slot (10:30 AM – 01:00 PM)";
      expectedAchPct = 20;
    } else if (timeInMinutes < 900) {
      slotName = language === "hi"
        ? "दोपहर का रश स्लॉट (01:00 PM – 03:00 PM)"
        : language === "bn"
        ? "দুপুরের রাশ স্লট (01:00 PM – 03:00 PM)"
        : "Mid-Day Rush Slot (01:00 PM – 03:00 PM)";
      expectedAchPct = 40;
    } else if (timeInMinutes < 1020) {
      slotName = language === "hi"
        ? "अपराह्न ट्रांज़िशन स्लॉट (03:00 PM – 05:00 PM)"
        : language === "bn"
        ? "বিকেলের ট্রানজিশন স্লট (03:00 PM – 05:00 PM)"
        : "Afternoon Transition Slot (03:00 PM – 05:00 PM)";
      expectedAchPct = 55;
    } else if (timeInMinutes < 1140) {
      slotName = language === "hi"
        ? "शाम का पीक रश (05:00 PM – 07:00 PM)"
        : language === "bn"
        ? "সন্ধ্যার পিক রাশ (05:00 PM – 07:00 PM)"
        : "Evening Peak Rush (05:00 PM – 07:00 PM)";
      expectedAchPct = 75;
    } else if (timeInMinutes < 1290) {
      slotName = language === "hi"
        ? "प्राइम शॉपिंग स्लॉट (07:00 PM – 09:30 PM)"
        : language === "bn"
        ? "প্রাইম শপিং স্লট (07:00 PM – 09:30 PM)"
        : "Prime Shopping Slot (07:00 PM – 09:30 PM)";
      expectedAchPct = 90;
    } else {
      slotName = language === "hi"
        ? "क्लोजिंग स्प्रिंट (09:30 PM – 11:59 PM)"
        : language === "bn"
        ? "ক্লোজিং স্প্রিন্ট (09:30 PM – 11:59 PM)"
        : "Closing Sprint (09:30 PM – 11:59 PM)";
      isClosingSlot = true;
      expectedAchPct = 95;
    }

    const isLagging = target > 0 && achPct < expectedAchPct - 10;
    const isCrushing = target > 0 && achPct >= expectedAchPct + 15;

    // Tactical AI Insights Generation
    const insights: {
      title: string;
      desc: string;
      type: "urgent" | "opportunity" | "success";
      action: string;
      categoryTag: string;
    }[] = [];

    // 1. Target & Time Slot Insight
    if (isClosingSlot && achPct < 100 && target > 0) {
      insights.push({
        title: t.insightClosingTitle,
        desc: t.insightClosingDesc(fmtCurrencyOrZero(remaining)),
        type: "urgent",
        categoryTag: t.categoryRecovery,
        action: t.insightClosingAction,
      });
    } else if (isLagging) {
      insights.push({
        title: t.insightLaggingTitle(slotName.split("(")[0].trim()),
        desc: t.insightLaggingDesc(fmtPercentOrZero(achPct), expectedAchPct),
        type: "urgent",
        categoryTag: t.categoryPace,
        action: t.insightLaggingAction,
      });
    } else if (isCrushing) {
      insights.push({
        title: t.insightCrushingTitle,
        desc: t.insightCrushingDesc(fmtPercentOrZero(achPct), expectedAchPct),
        type: "success",
        categoryTag: t.categoryMomentum,
        action: t.insightCrushingAction,
      });
    }

    // 2. Conversion Engine Insight
    if (footfall > 50 && conversion < 35) {
      insights.push({
        title: t.insightConversionTitle,
        desc: t.insightConversionDesc(fmtNumberOrZero(footfall), fmtPercentOrZero(conversion)),
        type: "opportunity",
        categoryTag: t.categoryConversion,
        action: t.insightConversionAction,
      });
    }

    // 3. ATV & Basket Growth Insight
    if (nob > 20 && atv < 1100) {
      insights.push({
        title: t.insightAtvTitle,
        desc: t.insightAtvDesc(fmtCurrencyOrZero(atv), fmtNumberOrZero(nob), fmtCurrencyOrZero(nob * 150)),
        type: "opportunity",
        categoryTag: t.categoryAtv,
        action: t.insightAtvAction,
      });
    }

    if (nob > 15 && basket < 3.2) {
      insights.push({
        title: t.insightBasketTitle,
        desc: t.insightBasketDesc(fmtNumberOrZero(basket)),
        type: "opportunity",
        categoryTag: t.categoryBasket,
        action: t.insightBasketAction,
      });
    }

    if (insights.length === 0) {
      insights.push({
        title: t.insightBalancedTitle,
        desc: t.insightBalancedDesc(fmtCurrencyOrZero(netSales), fmtNumberOrZero(footfall), fmtPercentOrZero(conversion)),
        type: "success",
        categoryTag: t.categorySteady,
        action: t.insightBalancedAction,
      });
    }

    return {
      slotName,
      isClosingSlot,
      isLagging,
      isCrushing,
      expectedAchPct,
      insights,
      remaining,
      achPct,
    };
  }, [kpis, timeInMinutes, language, t]);

  const completedCount = completedTaskIds.length;
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl border border-indigo-500/25 bg-gradient-to-b from-indigo-950/20 via-card/70 to-card/90 p-4 sm:p-5 shadow-lg backdrop-blur-md"
    >
      {/* Subtle Background Glow Mesh */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3 min-w-0">
          {/* Glowing Animated AI Neural Orb */}
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-600 text-white shadow-md shadow-indigo-500/30">
            <span className="absolute inset-0 rounded-xl bg-indigo-400 opacity-20 animate-ping" />
            <Brain className="h-5 w-5 animate-pulse" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold text-base sm:text-lg text-foreground tracking-tight flex items-center gap-2">
                <span>{t.aiTitle}</span>
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-400 shadow-xs">
                <Radio className="h-3 w-3 text-indigo-400 animate-pulse" /> {t.liveIntelligence}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate sm:whitespace-normal">
              {t.aiSubtitle} <strong className="text-foreground">{storeName} ({storeCode})</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <span className="hidden sm:inline mr-1">{isExpanded ? t.collapseHub : t.expandHub}</span>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Expandable Body with AnimatePresence */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden space-y-4 relative z-10"
          >
            {/* Real-time Time-Slot Pacing Bar */}
            <div className="rounded-xl border border-border/80 bg-background/60 p-3.5 backdrop-blur-sm shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-semibold text-foreground">{t.operatingWindow}:</span>
                  <span className="text-muted-foreground font-medium">{analysis.slotName}</span>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{t.slotBenchmark}:</span>
                    <strong className="text-foreground font-mono">{analysis.expectedAchPct}%</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{t.liveAch}:</span>
                    <strong
                      className={`font-mono text-sm font-bold ${
                        analysis.isLagging
                          ? "text-amber-500 dark:text-amber-400"
                          : analysis.isCrushing
                          ? "text-emerald-500 dark:text-emerald-400"
                          : "text-blue-500 dark:text-blue-400"
                      }`}
                    >
                      {fmtPercentOrZero(analysis.achPct)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Dynamic Progress Meter */}
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.max(0, analysis.achPct))}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full rounded-full ${
                    analysis.isLagging
                      ? "bg-gradient-to-r from-amber-500 to-orange-500"
                      : analysis.isCrushing
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : "bg-gradient-to-r from-blue-500 to-indigo-600"
                  }`}
                />
                {/* Expected Benchmark Marker */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-foreground/80 shadow-xs z-10"
                  style={{ left: `${Math.min(99, analysis.expectedAchPct)}%` }}
                  title={`${t.slotBenchmark}: ${analysis.expectedAchPct}%`}
                />
              </div>
            </div>

            {/* AI Tactical Recommendations Grid */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t.tacticalDirectives}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">{t.tacticalSub}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {analysis.insights.map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -3, scale: 1.01 }}
                    transition={{ duration: 0.25, delay: idx * 0.05 }}
                    className={`group relative flex flex-col justify-between rounded-xl border p-3.5 transition-all duration-200 shadow-xs hover:shadow-md ${
                      item.type === "urgent"
                        ? "border-amber-500/35 bg-amber-500/5 dark:border-amber-500/25 hover:border-amber-500/60"
                        : item.type === "opportunity"
                        ? "border-blue-500/35 bg-blue-500/5 dark:border-blue-500/25 hover:border-blue-500/60"
                        : "border-emerald-500/35 bg-emerald-500/5 dark:border-emerald-500/25 hover:border-emerald-500/60"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {item.type === "urgent" ? (
                            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                          ) : item.type === "opportunity" ? (
                            <Zap className="h-4 w-4 text-blue-500 shrink-0" />
                          ) : (
                            <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
                          )}
                          <h4 className="font-bold text-xs uppercase tracking-wide text-foreground truncate">
                            {item.title}
                          </h4>
                        </div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider uppercase border ${
                            item.type === "urgent"
                              ? "bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30"
                              : item.type === "opportunity"
                              ? "bg-blue-500/15 text-blue-500 dark:text-blue-400 border-blue-500/30"
                              : "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border-emerald-500/30"
                          }`}
                        >
                          {item.categoryTag}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{item.desc}</p>
                    </div>

                    <div className="rounded-lg bg-background/90 p-2.5 text-xs border border-border/70 shadow-xs relative">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <Lightbulb className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                          <span className="font-semibold text-foreground leading-snug">{item.action}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyActionText(item.action, idx)}
                          title={t.copyAction}
                          className="text-muted-foreground hover:text-foreground shrink-0 p-1 rounded hover:bg-muted transition-colors cursor-pointer"
                        >
                          {copiedId === idx ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Manager Real-Time Tactical Checklist */}
            <div className="rounded-xl border border-border/80 bg-card/60 p-4 shadow-xs backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                    <CheckSquare className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wide text-foreground">
                      {t.managerChecklist}
                    </span>
                    <span className="ml-2 text-xs font-semibold text-indigo-400">
                      ({completedCount}/{tasks.length} {language === "hi" ? "पूरा हुआ" : language === "bn" ? "সম্পন্ন" : "Completed"} · {progressPercent}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => markAllTasks(true)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" /> {t.markAll}
                  </button>
                  <span className="text-border">|</span>
                  <button
                    type="button"
                    onClick={() => markAllTasks(false)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" /> {t.resetTasks}
                  </button>
                </div>
              </div>

              {/* Checklist Progress Bar */}
              <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.4 }}
                  className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                />
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {tasks.map((task) => {
                  const isCompleted = completedTaskIds.includes(task.id);
                  return (
                    <motion.button
                      key={task.id}
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleTask(task.id)}
                      className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left text-xs transition-all duration-200 cursor-pointer ${
                        isCompleted
                          ? "border-emerald-500/40 bg-emerald-500/10 text-muted-foreground"
                          : "border-border/80 bg-background/90 hover:bg-muted/50 text-foreground hover:border-border"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckSquare className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5 animate-in zoom-in-50 duration-150" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <span className={`font-medium transition-all ${isCompleted ? "line-through opacity-75" : ""}`}>
                        {task.text}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
