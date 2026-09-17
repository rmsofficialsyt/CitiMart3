import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  History,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useLanguage } from "@/context/LanguageContext";
import { fmtCurrency, fmtCurrencyOrZero, fmtPercentOrZero } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TargetAdjustmentAlert as TargetAdjustmentAlertType } from "@/lib/types";

interface TargetAdjustmentAlertProps {
  alert?: TargetAdjustmentAlertType | null;
  storeCode: string;
  onPolicyChange?: (window: number, policy: "MONTH_END_CLOSE" | "TRUE_ROLLING") => void;
}

export function TargetAdjustmentAlert({
  alert,
  storeCode,
  onPolicyChange,
}: TargetAdjustmentAlertProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { t } = useLanguage();
  const [showBuckets, setShowBuckets] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<number>(alert?.recovery_window ?? 7);
  const [selectedPolicy, setSelectedPolicy] = useState<"MONTH_END_CLOSE" | "TRUE_ROLLING">(
    alert?.carry_forward_policy ?? "MONTH_END_CLOSE"
  );

  if (!alert || !alert.active) {
    return null;
  }

  const {
    recovery_window = selectedWindow,
    carry_forward_policy = selectedPolicy,
    original_target,
    admin_today_target,
    scheduled_carry = 0,
    adjusted_target,
    adjusted_cumulative_target,
    today_actual_sales = 0,
    total_outstanding_deficit = 0,
    outstanding_before = total_outstanding_deficit,
    outstanding_after = outstanding_before,
    adjusted_remaining,
    adjusted_target_gap = adjusted_remaining,
    original_target_gap,
    recovery_achievement_pct,
    recovered_today = 0,
    true_surplus = 0,
    new_deficit_created = 0,
    active_buckets_count = 0,
    deficit_buckets = [],
    has_shortfall,
    status,
    prev_date,
    prev_target,
    prev_actual = 0,
    prev_surplus = 0,
  } = alert;

  // Resolve target baselines
  const effectiveOriginalTarget = original_target ?? admin_today_target ?? prev_target;
  const effectiveAdjustedTarget =
    adjusted_target ??
    adjusted_cumulative_target ??
    (effectiveOriginalTarget != null ? effectiveOriginalTarget + scheduled_carry : null);

  const effectiveOriginalGap =
    original_target_gap ??
    (effectiveOriginalTarget != null ? Math.max(0, effectiveOriginalTarget - today_actual_sales) : 0);

  const effectiveAdjustedGap =
    adjusted_target_gap ??
    (effectiveAdjustedTarget != null ? Math.max(0, effectiveAdjustedTarget - today_actual_sales) : 0);

  const isShortfall =
    has_shortfall || status === "shortfall_recovery" || scheduled_carry > 0 || outstanding_before > 0;
  const isSurplus =
    (status === "surplus_cushion" || true_surplus > 0 || prev_surplus > 0) && !isShortfall;
  const prevDateFormatted = prev_date ? prev_date.split("-").reverse().join(".") : "";

  const origTargetStr = effectiveOriginalTarget != null ? fmtCurrency(effectiveOriginalTarget) : t.notSet;
  const adjTargetStr =
    effectiveAdjustedTarget != null ? fmtCurrencyOrZero(effectiveAdjustedTarget) : origTargetStr;
  const scheduledCarryStr = fmtCurrencyOrZero(scheduled_carry);
  const totalOutstandingStr = fmtCurrencyOrZero(outstanding_before);
  const surplusStr = fmtCurrencyOrZero(true_surplus > 0 ? true_surplus : prev_surplus);

  const handleWindowSwitch = (days: number) => {
    setSelectedWindow(days);
    if (onPolicyChange) {
      onPolicyChange(days, selectedPolicy);
    }
  };

  const handlePolicyToggle = (pol: "MONTH_END_CLOSE" | "TRUE_ROLLING") => {
    setSelectedPolicy(pol);
    if (onPolicyChange) {
      onPolicyChange(selectedWindow, pol);
    }
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 shadow-sm transition-all duration-300 ${
        isShortfall
          ? "border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:border-amber-500/20"
          : isSurplus
          ? "border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent dark:border-emerald-500/20"
          : "border-border bg-card/60"
      }`}
    >
      {/* Decorative top accent line */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          isShortfall
            ? "bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300"
            : isSurplus
            ? "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300"
            : "bg-muted"
        }`}
      />

      {/* Header & Controls Bar */}
      <div className="flex flex-col gap-3.5 pb-4 border-b border-border/50">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold tracking-wide uppercase ${
                isShortfall
                  ? "bg-amber-500/20 text-amber-500 dark:text-amber-400"
                  : isSurplus
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isShortfall ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t.targetAdjustmentAlert}
                </>
              ) : isSurplus ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t.positiveMomentumSurplus}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t.targetTrackingOnTrack}
                </>
              )}
            </span>

            {/* Rolling Policy Mode Indicator */}
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Clock className="h-3 w-3" />
              {t.rollingRecoveryMode(recovery_window, carry_forward_policy)}
            </span>
          </div>

          {/* Horizon & Policy Controls */}
          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* Interactive Horizon Selector Pills (Admin only) */}
              <div className="flex items-center gap-1 rounded-lg bg-background/60 p-0.5 border border-border/60 text-[10px] font-semibold">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => handleWindowSwitch(days)}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      recovery_window === days
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {days}D
                  </button>
                ))}
              </div>

              {/* Policy Toggle Pill (Admin only) */}
              <button
                type="button"
                onClick={() =>
                  handlePolicyToggle(
                    carry_forward_policy === "MONTH_END_CLOSE" ? "TRUE_ROLLING" : "MONTH_END_CLOSE"
                  )
                }
                className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border/60 bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
                title="Click to toggle Month-End Closure vs True Rolling"
              >
                {carry_forward_policy === "MONTH_END_CLOSE" ? t.monthEndClosePolicy : t.trueRollingPolicy}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shadow-xs">
              <Lock className="h-3 w-3 text-amber-400" />
              <span>{recovery_window}D Horizon · {carry_forward_policy === "MONTH_END_CLOSE" ? t.monthEndClosePolicy : t.trueRollingPolicy}</span>
              <span className="text-[10px] font-normal text-slate-500">(Admin Policy)</span>
            </div>
          )}
        </div>

        {/* Dynamic Contextual Text */}
        <div className="space-y-1">
          <h3 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
            {isShortfall
              ? t.shortfallHeading(scheduledCarryStr)
              : isSurplus
              ? t.surplusHeading(surplusStr)
              : t.exactMatchHeading(prevDateFormatted)}
          </h3>

          <p className="max-w-4xl text-xs text-muted-foreground sm:text-sm leading-relaxed">
            {isShortfall ? (
              t.shortfallDesc(prevDateFormatted, adjTargetStr, origTargetStr)
            ) : isSurplus ? (
              t.surplusDesc(
                fmtCurrencyOrZero(prev_actual),
                origTargetStr,
                prevDateFormatted,
                origTargetStr
              )
            ) : (
              t.exactMatchDesc(origTargetStr, prevDateFormatted, storeCode)
            )}
          </p>
        </div>
      </div>

      {/* Complete Suite of All 10 Store KPI Matrix Metric Indicators */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {/* Card 1: Original Target (T_t) */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ y: -3, scale: 1.018 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0 }}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-violet-500 dark:border-l-violet-400 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
            "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
            "shadow-[inset_2px_0_12px_rgba(139,92,246,0.18)] bg-gradient-to-br from-violet-500/[0.07] via-transparent to-violet-500/[0.02]"
          )}
        >
          <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

          <div className="relative z-10 flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground/90 transition-colors truncate">
              {t.adminSetTarget}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-violet-500/25 bg-violet-500/10 text-violet-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
              <Target className="h-3 w-3" />
            </div>
          </div>
          <div className="relative z-10 mt-2">
            <span className="font-mono text-sm font-extrabold tracking-tight text-foreground group-hover:text-primary transition-colors sm:text-base block truncate drop-shadow-xs">
              {effectiveOriginalTarget != null ? fmtCurrencyOrZero(effectiveOriginalTarget) : t.notSet}
            </span>
            <span className="text-[10px] text-muted-foreground block truncate">
              {t.primaryBaseline}
            </span>
          </div>
        </motion.div>

        {/* Card 2: Scheduled Carry Today (C_t) */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ y: -3, scale: 1.018 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.022 }}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-amber-500 dark:border-l-amber-400 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
            "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
            "shadow-[inset_2px_0_12px_rgba(245,158,11,0.18)] bg-gradient-to-br from-amber-500/[0.07] via-transparent to-amber-500/[0.02]"
          )}
        >
          <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

          <div className="relative z-10 flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400 group-hover:text-amber-400 transition-colors truncate">
              {t.scheduledCarryLabel}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-amber-500/25 bg-amber-500/10 text-amber-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
              <RefreshCw className="h-3 w-3" />
            </div>
          </div>
          <div className="relative z-10 mt-2">
            <span className="font-mono text-sm font-extrabold tracking-tight text-amber-500 dark:text-amber-400 sm:text-base block truncate drop-shadow-xs">
              +{scheduledCarryStr}
            </span>
            <span className="text-[10px] text-muted-foreground block truncate">
              {active_buckets_count > 0
                ? `${active_buckets_count} active bucket${active_buckets_count > 1 ? "s" : ""}`
                : t.noDeficit}
            </span>
          </div>
        </motion.div>

        {/* Card 3: Adjusted Target (A_t) */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ y: -3, scale: 1.018 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.044 }}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-amber-500 dark:border-l-amber-400 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
            "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
            "shadow-[inset_2px_0_12px_rgba(245,158,11,0.18)] bg-gradient-to-br from-amber-500/[0.07] via-transparent to-amber-500/[0.02]"
          )}
        >
          <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

          <div className="relative z-10 flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400 truncate">
              {t.adjustedRecoveryGoal}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-amber-500/25 bg-amber-500/10 text-amber-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
              <TrendingUp className="h-3 w-3" />
            </div>
          </div>
          <div className="relative z-10 mt-2">
            <span className="font-mono text-sm font-extrabold tracking-tight text-amber-500 dark:text-amber-400 sm:text-base block truncate drop-shadow-xs">
              {adjTargetStr}
            </span>
            <span className="text-[10px] text-muted-foreground block truncate">
              {isShortfall
                ? t.includesDeficit(scheduledCarryStr)
                : isSurplus
                ? t.plusBuffer(surplusStr)
                : t.noDeficit}
            </span>
          </div>
        </motion.div>

        {/* Card 4: Live Net Sales (S_t) */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ y: -3, scale: 1.018 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.066 }}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-blue-500 dark:border-l-blue-400 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
            "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
            "shadow-[inset_2px_0_12px_rgba(59,130,246,0.18)] bg-gradient-to-br from-blue-500/[0.07] via-transparent to-blue-500/[0.02]"
          )}
        >
          <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-blue-500/15 via-blue-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

          <div className="relative z-10 flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400 truncate">
              {t.liveNetSalesLabel}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-blue-500/25 bg-blue-500/10 text-blue-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
              <Zap className="h-3 w-3" />
            </div>
          </div>
          <div className="relative z-10 mt-2">
            <span className="font-mono text-sm font-extrabold tracking-tight text-blue-500 dark:text-blue-400 sm:text-base block truncate drop-shadow-xs">
              {fmtCurrencyOrZero(today_actual_sales)}
            </span>
            <span className="text-[10px] text-muted-foreground block truncate">
              {recovery_achievement_pct != null
                ? `${fmtPercentOrZero(recovery_achievement_pct)} of goal`
                : "Live recorded sales"}
            </span>
          </div>
        </motion.div>

        {/* Card 5: Daily Original Gap (D_t) */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ y: -3, scale: 1.018 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.088 }}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
            "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
            effectiveOriginalGap > 0
              ? "border-l-rose-500 dark:border-l-rose-400 shadow-[inset_2px_0_12px_rgba(244,63,94,0.18)] bg-gradient-to-br from-rose-500/[0.07] via-transparent to-rose-500/[0.02]"
              : "border-l-emerald-500 dark:border-l-emerald-400 shadow-[inset_2px_0_12px_rgba(16,185,129,0.18)] bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-emerald-500/[0.02]"
          )}
        >
          <div
            className={cn(
              "pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100",
              effectiveOriginalGap > 0
                ? "from-rose-500/15 via-rose-500/5 to-transparent"
                : "from-emerald-500/15 via-emerald-500/5 to-transparent"
            )}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

          <div className="relative z-10 flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground/90 transition-colors truncate">
              {t.originalGapLabel}
            </span>
            <div
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border shadow-xs transition-transform duration-300 group-hover:scale-110",
                effectiveOriginalGap > 0
                  ? "border-rose-500/25 bg-rose-500/10 text-rose-500"
                  : "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
              )}
            >
              <AlertCircle className="h-3 w-3" />
            </div>
          </div>
          <div className="relative z-10 mt-2">
            <span
              className={cn(
                "font-mono text-sm font-extrabold tracking-tight sm:text-base block truncate drop-shadow-xs",
                effectiveOriginalGap > 0 ? "text-rose-500 dark:text-rose-400" : "text-emerald-500 dark:text-emerald-400"
              )}
            >
              {effectiveOriginalGap > 0 ? fmtCurrencyOrZero(effectiveOriginalGap) : t.onTrackLabel}
            </span>
            <span className="text-[10px] text-muted-foreground block truncate">
              {new_deficit_created > 0
                ? `+${fmtCurrencyOrZero(new_deficit_created)} new deficit`
                : effectiveOriginalGap > 0
                ? "Shortfall vs base"
                : "Base target surpassed"}
            </span>
          </div>
        </motion.div>

        {/* Card 6: Adjusted Recovery Gap */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ y: -3, scale: 1.018 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.11 }}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-amber-500 dark:border-l-amber-400 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
            "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
            "shadow-[inset_2px_0_12px_rgba(245,158,11,0.18)] bg-gradient-to-br from-amber-500/[0.07] via-transparent to-amber-500/[0.02]"
          )}
        >
          <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

          <div className="relative z-10 flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400 truncate">
              {t.adjustedGapLabel}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-amber-500/25 bg-amber-500/10 text-amber-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
              <Coins className="h-3 w-3" />
            </div>
          </div>
          <div className="relative z-10 mt-2">
            <span className="font-mono text-sm font-extrabold tracking-tight text-amber-500 dark:text-amber-400 sm:text-base block truncate drop-shadow-xs">
              {effectiveAdjustedGap > 0 ? fmtCurrencyOrZero(effectiveAdjustedGap) : t.onTrackLabel}
            </span>
            <span className="text-[10px] text-muted-foreground block truncate">
              {effectiveAdjustedGap > 0 ? "Needed for full recovery" : "Adjusted goal met"}
            </span>
          </div>
        </motion.div>

        {/* Card 7: Recovered Deficit Today (R_t) */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ y: -3, scale: 1.018 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.132 }}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-emerald-500 dark:border-l-emerald-400 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
            "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
            "shadow-[inset_2px_0_12px_rgba(16,185,129,0.18)] bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-emerald-500/[0.02]"
          )}
        >
          <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

          <div className="relative z-10 flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 truncate">
              {t.recoveredTodayLabel}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
              <CheckCircle2 className="h-3 w-3" />
            </div>
          </div>
          <div className="relative z-10 mt-2">
            <span className="font-mono text-sm font-extrabold tracking-tight text-emerald-500 dark:text-emerald-400 sm:text-base block truncate drop-shadow-xs">
              {recovered_today > 0 ? `+${fmtCurrencyOrZero(recovered_today)}` : fmtCurrencyOrZero(0)}
            </span>
            <span className="text-[10px] text-muted-foreground block truncate">
              {recovered_today > 0 ? "FIFO debt cleared" : "No debt paydown today"}
            </span>
          </div>
        </motion.div>

        {/* Card 8: True Surplus Buffer */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ y: -3, scale: 1.018 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.154 }}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-teal-500 dark:border-l-teal-400 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
            "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
            "shadow-[inset_2px_0_12px_rgba(20,184,166,0.18)] bg-gradient-to-br from-teal-500/[0.07] via-transparent to-teal-500/[0.02]"
          )}
        >
          <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-teal-500/15 via-teal-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

          <div className="relative z-10 flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-500 dark:text-teal-400 truncate">
              {t.trueSurplusLabel}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-teal-500/25 bg-teal-500/10 text-teal-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
              <Award className="h-3 w-3" />
            </div>
          </div>
          <div className="relative z-10 mt-2">
            <span className="font-mono text-sm font-extrabold tracking-tight text-teal-500 dark:text-teal-400 sm:text-base block truncate drop-shadow-xs">
              {true_surplus > 0 ? `+${fmtCurrencyOrZero(true_surplus)}` : fmtCurrencyOrZero(0)}
            </span>
            <span className="text-[10px] text-muted-foreground block truncate">
              {true_surplus > 0 ? "Pure overperformance" : "No excess surplus"}
            </span>
          </div>
        </motion.div>

        {/* Card 9: Total Outstanding Deficit Backlog (P_t) */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ y: -3, scale: 1.018 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.176 }}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-rose-500 dark:border-l-rose-400 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
            "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
            "shadow-[inset_2px_0_12px_rgba(244,63,94,0.18)] bg-gradient-to-br from-rose-500/[0.07] via-transparent to-rose-500/[0.02]"
          )}
        >
          <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-rose-500/15 via-rose-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

          <div className="relative z-10 flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 dark:text-rose-400 truncate">
              {t.outstandingDeficitLabel}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-rose-500/25 bg-rose-500/10 text-rose-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
              <Layers className="h-3 w-3" />
            </div>
          </div>
          <div className="relative z-10 mt-2">
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-sm font-extrabold tracking-tight text-rose-500 dark:text-rose-400 sm:text-base truncate drop-shadow-xs">
                {totalOutstandingStr}
              </span>
              {recovery_achievement_pct != null && (
                <span className="text-[10px] font-mono font-bold text-emerald-400 shrink-0">
                  {fmtPercentOrZero(recovery_achievement_pct)} pace
                </span>
              )}
            </div>
            {/* Recovery progress bar */}
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  (recovery_achievement_pct ?? 0) >= 100
                    ? "bg-emerald-500"
                    : (recovery_achievement_pct ?? 0) >= 70
                    ? "bg-amber-400"
                    : "bg-blue-500"
                )}
                style={{ width: `${Math.min(100, Math.max(0, recovery_achievement_pct ?? 0))}%` }}
              />
            </div>
            <span className="mt-1 text-[10px] text-muted-foreground block truncate">
              {outstanding_after != null && outstanding_after !== outstanding_before
                ? `End of day: ${fmtCurrencyOrZero(outstanding_after)}`
                : "Authoritative backlog"}
            </span>
          </div>
        </motion.div>

        {/* Card 10: Active Buckets & Horizon Status */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ y: -3, scale: 1.018 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.198 }}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-primary/70 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
            "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
            "shadow-[inset_2px_0_12px_rgba(99,102,241,0.18)] bg-gradient-to-br from-primary/[0.07] via-transparent to-primary/[0.02]"
          )}
        >
          <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

          <div className="relative z-10 flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground/90 transition-colors truncate">
              {t.activeBucketsPaceLabel}
            </span>
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary shadow-xs transition-transform duration-300 group-hover:scale-110">
              <Activity className="h-3 w-3" />
            </div>
          </div>
          <div className="relative z-10 mt-2">
            <span className="font-mono text-sm font-extrabold tracking-tight text-foreground group-hover:text-primary transition-colors sm:text-base block truncate drop-shadow-xs">
              {active_buckets_count} {active_buckets_count === 1 ? "Bucket" : "Buckets"} · {recovery_window}D
            </span>
            <span className="text-[10px] text-muted-foreground block truncate">
              {carry_forward_policy === "MONTH_END_CLOSE" ? t.monthEndClosePolicy : t.trueRollingPolicy}
            </span>
          </div>
        </motion.div>
      </div>

      {/* Expandable Deficit Buckets Tray */}
      {deficit_buckets.length > 0 && (() => {
        const totalOrig = deficit_buckets.reduce((sum, b) => sum + (b.original_deficit || 0), 0);
        const totalRecovered = deficit_buckets.reduce(
          (sum, b) => sum + (b.recovered_amount ?? Math.max(0, (b.original_deficit || 0) - (b.remaining_deficit || 0))),
          0
        );
        const totalRemaining = deficit_buckets.reduce((sum, b) => sum + (b.remaining_deficit || 0), 0);
        const totalCarryToday = deficit_buckets.reduce((sum, b) => sum + (b.scheduled_carry_today || 0), 0);
        const totalPct = totalOrig > 0 ? Math.round((totalRecovered / totalOrig) * 1000) / 10 : 0;

        return (
          <div className="mt-4 pt-3.5 border-t border-border/60">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <motion.button
                type="button"
                onClick={() => setShowBuckets(!showBuckets)}
                whileHover={{ y: -1.5, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={cn(
                  "group relative inline-flex items-center gap-2.5 text-xs font-bold text-foreground hover:text-primary transition-all duration-200",
                  "bg-card/90 dark:bg-card/75 backdrop-blur-md px-3.5 py-2 rounded-xl border border-border/70 hover:border-amber-500/40 shadow-xs hover:shadow-md cursor-pointer overflow-hidden"
                )}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
                <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
                
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-amber-500/25 bg-amber-500/10 text-amber-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
                  <Layers className="h-3.5 w-3.5" />
                </div>
                
                <span className="font-semibold tracking-tight">
                  {t.activeDeficitBuckets}
                </span>

                <span className="inline-flex items-center justify-center h-5 px-1.5 rounded-md font-mono text-[11px] font-bold bg-primary/10 border border-primary/20 text-primary">
                  {deficit_buckets.length}
                </span>

                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-500 dark:text-rose-400 bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded-md font-bold">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
                  </span>
                  {fmtCurrency(totalRemaining)} backlog
                </span>

                <div className="ml-1 flex h-4 w-4 items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                  {showBuckets ? (
                    <ChevronUp className="h-3.5 w-3.5 transition-transform duration-200" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" />
                  )}
                </div>
              </motion.button>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-500 dark:text-emerald-400">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                  <span>{t.fifoRecoveryRule}</span>
                </div>
              </div>
            </div>

            {showBuckets && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: 8 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -4 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                className="mt-3.5 space-y-3"
              >
                {/* Granular Micro-KPI Summary Strip with Store KPI Matrix Design */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {/* Micro-Card 1: Active Buckets */}
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    whileHover={{ y: -3, scale: 1.018 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ type: "spring", stiffness: 240, damping: 22 }}
                    className={cn(
                      "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-primary/80 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
                      "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
                      "shadow-[inset_2px_0_12px_rgba(99,102,241,0.18)] bg-gradient-to-br from-primary/[0.07] via-transparent to-primary/[0.02]"
                    )}
                  >
                    <div className="pointer-events-none absolute -top-10 -left-10 h-24 w-24 rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
                    <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

                    <div className="relative z-10 flex items-center justify-between gap-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground group-hover:text-foreground/90 transition-colors truncate">
                        {t.activeDeficitBuckets}
                      </span>
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary shadow-xs transition-transform duration-300 group-hover:scale-110">
                        <Layers className="h-3 w-3" />
                      </div>
                    </div>
                    <div className="relative z-10 mt-2 flex items-baseline justify-between gap-1">
                      <span className="font-mono text-sm font-extrabold tracking-tight text-foreground group-hover:text-primary transition-colors sm:text-base drop-shadow-xs truncate">
                        {deficit_buckets.length} {deficit_buckets.length === 1 ? "Bucket" : "Buckets"}
                      </span>
                      <span className="text-[10px] font-semibold text-amber-500 dark:text-amber-400 shrink-0">
                        {carry_forward_policy === "MONTH_END_CLOSE" ? "Month-End" : "True-Rolling"}
                      </span>
                    </div>
                  </motion.div>

                  {/* Micro-Card 2: Initial Deficit */}
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    whileHover={{ y: -3, scale: 1.018 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.02 }}
                    className={cn(
                      "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-slate-400 dark:border-l-slate-500 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
                      "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
                      "shadow-[inset_2px_0_12px_rgba(148,163,184,0.15)] bg-gradient-to-br from-slate-500/[0.06] via-transparent to-slate-500/[0.02]"
                    )}
                  >
                    <div className="pointer-events-none absolute -top-10 -left-10 h-24 w-24 rounded-full bg-gradient-to-br from-slate-400/15 via-slate-400/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
                    <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

                    <div className="relative z-10 flex items-center justify-between gap-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground group-hover:text-foreground/90 transition-colors truncate">
                        {t.bucketInitialDeficit}
                      </span>
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground shadow-xs transition-transform duration-300 group-hover:scale-110">
                        <History className="h-3 w-3" />
                      </div>
                    </div>
                    <div className="relative z-10 mt-2">
                      <span className="font-mono text-sm font-extrabold tracking-tight text-foreground sm:text-base block truncate drop-shadow-xs">
                        {fmtCurrency(totalOrig)}
                      </span>
                    </div>
                  </motion.div>

                  {/* Micro-Card 3: Cleared So Far */}
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    whileHover={{ y: -3, scale: 1.018 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.04 }}
                    className={cn(
                      "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-emerald-500 dark:border-l-emerald-400 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
                      "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
                      "shadow-[inset_2px_0_12px_rgba(16,185,129,0.18)] bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-emerald-500/[0.02]"
                    )}
                  >
                    <div className="pointer-events-none absolute -top-10 -left-10 h-24 w-24 rounded-full bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
                    <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

                    <div className="relative z-10 flex items-center justify-between gap-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500 dark:text-emerald-400 truncate">
                        {t.bucketTotalCleared}
                      </span>
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                    </div>
                    <div className="relative z-10 mt-2 flex items-baseline justify-between gap-1">
                      <span className="font-mono text-sm font-extrabold tracking-tight text-emerald-500 dark:text-emerald-400 sm:text-base drop-shadow-xs truncate">
                        +{fmtCurrency(totalRecovered)}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-emerald-500 dark:text-emerald-400 shrink-0">
                        {fmtPercentOrZero(totalPct)}
                      </span>
                    </div>
                  </motion.div>

                  {/* Micro-Card 4: Total Remaining Backlog */}
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    whileHover={{ y: -3, scale: 1.018 }}
                    whileTap={{ scale: 0.99 }}
                    transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.06 }}
                    className={cn(
                      "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-rose-500 dark:border-l-rose-400 p-2.5 sm:p-3 transition-all duration-200 overflow-hidden",
                      "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
                      "shadow-[inset_2px_0_12px_rgba(244,63,94,0.18)] bg-gradient-to-br from-rose-500/[0.07] via-transparent to-rose-500/[0.02]"
                    )}
                  >
                    <div className="pointer-events-none absolute -top-10 -left-10 h-24 w-24 rounded-full bg-gradient-to-br from-rose-500/15 via-rose-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
                    <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

                    <div className="relative z-10 flex items-center justify-between gap-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-rose-500 dark:text-rose-400 truncate">
                        {t.bucketTotalBacklog}
                      </span>
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-rose-500/25 bg-rose-500/10 text-rose-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
                        <AlertCircle className="h-3 w-3" />
                      </div>
                    </div>
                    <div className="relative z-10 mt-2 flex items-baseline justify-between gap-1">
                      <span className="font-mono text-sm font-extrabold tracking-tight text-rose-500 dark:text-rose-400 sm:text-base drop-shadow-xs truncate">
                        {fmtCurrency(totalRemaining)}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-amber-500 dark:text-amber-400 shrink-0">
                        +{fmtCurrency(totalCarryToday)}/d
                      </span>
                    </div>
                  </motion.div>
                </div>

                {/* Granular Table with Store KPI Matrix Style */}
                <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent z-10" />
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/50 dark:bg-muted/30 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                          <th className="py-2.5 px-3 whitespace-nowrap">{t.bucketFifoRank}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">Bucket ID & {t.bucketStore}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">{t.bucketOriginDate}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">{t.bucketAge}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-right">{t.bucketInitialDeficit}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">{t.bucketRecoveredSoFar}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-right">{t.bucketRemainingDeficit}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">{t.bucketHorizonSpan}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-center">{t.bucketDaysRemaining}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-right">{t.bucketDailyPace}</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-center">{t.bucketStatusCol}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 font-mono">
                        {deficit_buckets.map((b, idx) => {
                          const fifoRank = b.fifo_priority ?? idx + 1;
                          const isFirst = idx === 0;
                          const recoveredAmt =
                            b.recovered_amount ?? Math.max(0, b.original_deficit - b.remaining_deficit);
                          const recPct =
                            b.recovery_pct ??
                            (b.original_deficit > 0
                              ? Math.round((recoveredAmt / b.original_deficit) * 1000) / 10
                              : 0);
                          const originFormatted = b.origin_date.split("-").reverse().join(".");
                          const startFormatted = b.recovery_start_date
                            ? b.recovery_start_date.split("-").reverse().join(".")
                            : "";
                          const endFormatted = b.recovery_end_date.split("-").reverse().join(".");
                          const elapsed = b.elapsed_days ?? 0;
                          const windowDays = b.total_horizon_days ?? b.recovery_window ?? 7;
                          const bStore = b.store_code ?? storeCode;

                          return (
                            <tr
                              key={b.id}
                              className={cn(
                                "group transition-all duration-200",
                                isFirst
                                  ? "bg-emerald-500/[0.06] hover:bg-emerald-500/[0.11] dark:bg-emerald-500/[0.08]"
                                  : "hover:bg-primary/[0.04] dark:hover:bg-primary/[0.06]"
                              )}
                            >
                              {/* 1. FIFO Rank */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "inline-flex items-center justify-center h-5 px-1.5 rounded-md font-sans text-[11px] font-bold shadow-2xs transition-transform duration-200 group-hover:scale-105",
                                      isFirst
                                        ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400"
                                        : "bg-muted border border-border text-muted-foreground"
                                    )}
                                  >
                                    #{fifoRank}
                                  </span>
                                  {isFirst && (
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 2. Bucket ID & Store */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-sans font-bold text-xs text-foreground group-hover:text-primary transition-colors" title={b.id}>
                                    {b.id.length > 20 ? `${b.id.slice(0, 10)}...${b.id.slice(-6)}` : b.id}
                                  </span>
                                  {bStore && (
                                    <span className="font-sans text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-primary/10 text-primary border border-primary/20">
                                      {bStore}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 3. Origin Date */}
                              <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground group-hover:text-foreground/90 transition-colors">
                                {originFormatted}
                              </td>

                              {/* 4. Age */}
                              <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                                <div className="flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground/90 transition-colors">
                                  <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span>
                                    {elapsed > 0 ? `${elapsed}d old` : "Originated Today"}
                                  </span>
                                </div>
                              </td>

                              {/* 5. Initial Deficit */}
                              <td className="py-2.5 px-3 whitespace-nowrap text-right font-semibold text-foreground">
                                {fmtCurrency(b.original_deficit)}
                              </td>

                              {/* 6. Recovered so far & % Progress */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex flex-col gap-1 min-w-[115px]">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-bold text-emerald-500 dark:text-emerald-400">
                                      {recoveredAmt > 0 ? `+${fmtCurrency(recoveredAmt)}` : "—"}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground font-mono font-semibold">
                                      {fmtPercentOrZero(recPct)}
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full transition-all duration-500 rounded-full",
                                        recPct >= 100
                                          ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                                          : recPct > 0
                                          ? "bg-emerald-500"
                                          : "bg-transparent"
                                      )}
                                      style={{ width: `${Math.min(100, Math.max(0, recPct))}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* 7. Remaining Deficit */}
                              <td className="py-2.5 px-3 whitespace-nowrap text-right font-extrabold text-rose-500 dark:text-rose-400 drop-shadow-xs">
                                {fmtCurrency(b.remaining_deficit)}
                              </td>

                              {/* 8. Recovery Horizon */}
                              <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                                <div className="flex flex-col text-[10px]">
                                  <span className="font-mono text-muted-foreground group-hover:text-foreground/90 transition-colors">
                                    {startFormatted || originFormatted} → {endFormatted}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/80 font-medium">
                                    {windowDays}D Horizon
                                  </span>
                                </div>
                              </td>

                              {/* 9. Days Left */}
                              <td className="py-2.5 px-3 whitespace-nowrap text-center font-sans">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-2xs",
                                    b.days_remaining <= 2
                                      ? "bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30"
                                      : b.days_remaining <= 4
                                      ? "bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30"
                                      : "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30"
                                  )}
                                >
                                  <Timer className="h-2.5 w-2.5" />
                                  {b.days_remaining} {b.days_remaining === 1 ? "day" : "days"}
                                </span>
                              </td>

                              {/* 10. Scheduled Carry Today */}
                              <td className="py-2.5 px-3 whitespace-nowrap text-right font-bold text-emerald-500 dark:text-emerald-400">
                                <div className="flex flex-col items-end">
                                  <span>+{fmtCurrency(b.scheduled_carry_today)}</span>
                                  <span className="text-[9px] font-normal text-muted-foreground">
                                    / day chunk
                                  </span>
                                </div>
                              </td>

                              {/* 11. Queue Status */}
                              <td className="py-2.5 px-3 whitespace-nowrap text-center font-sans">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] shadow-2xs",
                                    isFirst
                                      ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/30 font-bold"
                                      : "bg-muted text-muted-foreground border border-border font-medium"
                                  )}
                                >
                                  {isFirst ? (
                                    <>
                                      <ShieldCheck className="h-3 w-3 text-emerald-500 dark:text-emerald-400" />
                                      {t.bucketNextInLine}
                                    </>
                                  ) : (
                                    <>
                                      <Clock className="h-3 w-3 text-muted-foreground" />
                                      {t.bucketInQueue}
                                    </>
                                  )}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>

                      {/* Table Footer with Summary Aggregates */}
                      <tfoot>
                        <tr className="border-t-2 border-border/80 bg-muted/60 dark:bg-muted/40 font-mono text-xs font-bold text-foreground">
                          <td colSpan={4} className="py-2.5 px-3 font-sans uppercase text-[11px] tracking-wider text-muted-foreground">
                            {t.bucketTotals} ({deficit_buckets.length} active)
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {fmtCurrency(totalOrig)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-500 dark:text-emerald-400">
                              <span>+{fmtCurrency(totalRecovered)}</span>
                              <span className="text-[10px] text-muted-foreground">({fmtPercentOrZero(totalPct)})</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right text-rose-500 dark:text-rose-400 drop-shadow-xs">
                            {fmtCurrency(totalRemaining)}
                          </td>
                          <td colSpan={2} className="py-2.5 px-3 text-center font-sans text-[10px] text-muted-foreground">
                            All Horizons Active
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-500 dark:text-emerald-400">
                            +{fmtCurrency(totalCarryToday)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-sans text-[10px] text-muted-foreground">
                            FIFO Active
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
