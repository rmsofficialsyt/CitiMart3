import { useState } from "react";
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
  Layers,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { fmtCurrency, fmtCurrencyOrZero, fmtPercentOrZero } from "@/lib/format";
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
          <div className="flex flex-wrap items-center gap-2">
            {/* Interactive Horizon Selector Pills */}
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

            {/* Policy Toggle Pill */}
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

      {/* Complete Suite of All 10 Possible Cards */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
        {/* Card 1: Original Target (T_t) */}
        <div className="rounded-xl border border-border/80 bg-background/80 p-2.5 backdrop-blur-xs transition-all hover:border-border sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block truncate">
              {t.adminSetTarget}
            </span>
            <Target className="h-3 w-3 text-muted-foreground shrink-0" />
          </div>
          <span className="mt-1 font-mono text-sm font-bold text-foreground sm:text-base block truncate">
            {effectiveOriginalTarget != null ? fmtCurrencyOrZero(effectiveOriginalTarget) : t.notSet}
          </span>
          <span className="text-[10px] text-muted-foreground block truncate">
            {t.primaryBaseline}
          </span>
        </div>

        {/* Card 2: Scheduled Carry Today (C_t) */}
        <div className="rounded-xl border border-border/80 bg-background/80 p-2.5 backdrop-blur-xs transition-all hover:border-amber-500/40 sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 dark:text-amber-400 block truncate">
              {t.scheduledCarryLabel}
            </span>
            <RefreshCw className="h-3 w-3 text-amber-500 shrink-0" />
          </div>
          <span className="mt-1 font-mono text-sm font-bold text-amber-400 sm:text-base block truncate">
            +{scheduledCarryStr}
          </span>
          <span className="text-[10px] text-muted-foreground block truncate">
            {active_buckets_count > 0
              ? `${active_buckets_count} active bucket${active_buckets_count > 1 ? "s" : ""}`
              : t.noDeficit}
          </span>
        </div>

        {/* Card 3: Adjusted Target (A_t) */}
        <div
          className={`rounded-xl border p-2.5 backdrop-blur-xs transition-all sm:p-3 ${
            isShortfall
              ? "border-amber-500/40 bg-amber-500/10 hover:border-amber-500/60"
              : "border-border/80 bg-background/80 hover:border-border"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 dark:text-amber-400 block truncate">
              {t.adjustedRecoveryGoal}
            </span>
            <TrendingUp className="h-3 w-3 text-amber-400 shrink-0" />
          </div>
          <span className="mt-1 font-mono text-sm font-bold text-amber-400 sm:text-base block truncate">
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

        {/* Card 4: Live Net Sales (S_t) */}
        <div className="rounded-xl border border-border/80 bg-background/80 p-2.5 backdrop-blur-xs transition-all hover:border-blue-500/40 sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 block truncate">
              {t.liveNetSalesLabel}
            </span>
            <Zap className="h-3 w-3 text-blue-400 shrink-0" />
          </div>
          <span className="mt-1 font-mono text-sm font-bold text-blue-400 sm:text-base block truncate">
            {fmtCurrencyOrZero(today_actual_sales)}
          </span>
          <span className="text-[10px] text-muted-foreground block truncate">
            {recovery_achievement_pct != null
              ? `${fmtPercentOrZero(recovery_achievement_pct)} of goal`
              : "Live recorded sales"}
          </span>
        </div>

        {/* Card 5: Daily Original Gap (D_t) */}
        <div className="rounded-xl border border-border/80 bg-background/80 p-2.5 backdrop-blur-xs transition-all hover:border-border sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block truncate">
              {t.originalGapLabel}
            </span>
            <AlertCircle
              className={`h-3 w-3 shrink-0 ${
                effectiveOriginalGap > 0 ? "text-rose-400" : "text-emerald-400"
              }`}
            />
          </div>
          <span
            className={`mt-1 font-mono text-sm font-bold block truncate sm:text-base ${
              effectiveOriginalGap > 0 ? "text-rose-400" : "text-emerald-400"
            }`}
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

        {/* Card 6: Adjusted Recovery Gap */}
        <div className="rounded-xl border border-border/80 bg-background/80 p-2.5 backdrop-blur-xs transition-all hover:border-amber-500/40 sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/90 dark:text-amber-400/90 block truncate">
              {t.adjustedGapLabel}
            </span>
            <Coins className="h-3 w-3 text-amber-400 shrink-0" />
          </div>
          <span className="mt-1 font-mono text-sm font-bold text-amber-400 sm:text-base block truncate">
            {effectiveAdjustedGap > 0 ? fmtCurrencyOrZero(effectiveAdjustedGap) : t.onTrackLabel}
          </span>
          <span className="text-[10px] text-muted-foreground block truncate">
            {effectiveAdjustedGap > 0 ? "Needed for full recovery" : "Adjusted goal met"}
          </span>
        </div>

        {/* Card 7: Recovered Deficit Today (R_t) */}
        <div className="rounded-xl border border-border/80 bg-background/80 p-2.5 backdrop-blur-xs transition-all hover:border-emerald-500/40 sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 block truncate">
              {t.recoveredTodayLabel}
            </span>
            <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
          </div>
          <span className="mt-1 font-mono text-sm font-bold text-emerald-400 sm:text-base block truncate">
            {recovered_today > 0 ? `+${fmtCurrencyOrZero(recovered_today)}` : fmtCurrencyOrZero(0)}
          </span>
          <span className="text-[10px] text-muted-foreground block truncate">
            {recovered_today > 0 ? "FIFO debt cleared" : "No debt paydown today"}
          </span>
        </div>

        {/* Card 8: True Surplus Buffer */}
        <div className="rounded-xl border border-border/80 bg-background/80 p-2.5 backdrop-blur-xs transition-all hover:border-teal-500/40 sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-500 dark:text-teal-400 block truncate">
              {t.trueSurplusLabel}
            </span>
            <Award className="h-3 w-3 text-teal-400 shrink-0" />
          </div>
          <span className="mt-1 font-mono text-sm font-bold text-teal-400 sm:text-base block truncate">
            {true_surplus > 0 ? `+${fmtCurrencyOrZero(true_surplus)}` : fmtCurrencyOrZero(0)}
          </span>
          <span className="text-[10px] text-muted-foreground block truncate">
            {true_surplus > 0 ? "Pure overperformance" : "No excess surplus"}
          </span>
        </div>

        {/* Card 9: Total Outstanding Deficit Backlog (P_t) */}
        <div className="rounded-xl border border-border/80 bg-background/80 p-2.5 backdrop-blur-xs transition-all hover:border-rose-500/40 sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-500 dark:text-rose-400 block truncate">
              {t.outstandingDeficitLabel}
            </span>
            <Layers className="h-3 w-3 text-rose-400 shrink-0" />
          </div>
          <div className="mt-1 flex items-center justify-between gap-1">
            <span className="font-mono text-sm font-bold text-rose-400 sm:text-base truncate">
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
              className={`h-full transition-all duration-500 ${
                (recovery_achievement_pct ?? 0) >= 100
                  ? "bg-emerald-500"
                  : (recovery_achievement_pct ?? 0) >= 70
                  ? "bg-amber-400"
                  : "bg-blue-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, recovery_achievement_pct ?? 0))}%` }}
            />
          </div>
          <span className="mt-1 text-[10px] text-muted-foreground block truncate">
            {outstanding_after != null && outstanding_after !== outstanding_before
              ? `End of day: ${fmtCurrencyOrZero(outstanding_after)}`
              : "Authoritative backlog"}
          </span>
        </div>

        {/* Card 10: Active Buckets & Horizon Status */}
        <div className="rounded-xl border border-border/80 bg-background/80 p-2.5 backdrop-blur-xs transition-all hover:border-primary/40 sm:p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block truncate">
              {t.activeBucketsPaceLabel}
            </span>
            <Activity className="h-3 w-3 text-primary shrink-0" />
          </div>
          <span className="mt-1 font-mono text-sm font-bold text-foreground sm:text-base block truncate">
            {active_buckets_count} {active_buckets_count === 1 ? "Bucket" : "Buckets"} · {recovery_window}D
          </span>
          <span className="text-[10px] text-muted-foreground block truncate">
            {carry_forward_policy === "MONTH_END_CLOSE" ? t.monthEndClosePolicy : t.trueRollingPolicy}
          </span>
        </div>
      </div>

      {/* Expandable Deficit Buckets Tray */}
      {deficit_buckets.length > 0 && (
        <div className="mt-3.5 pt-3 border-t border-border/60">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowBuckets(!showBuckets)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <Layers className="h-3.5 w-3.5 text-amber-500" />
              <span>
                {t.activeDeficitBuckets} ({deficit_buckets.length})
              </span>
              {showBuckets ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              {t.fifoRecoveryRule}
            </span>
          </div>

          {showBuckets && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-border/60 bg-background/50 backdrop-blur-xs p-2">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-[10px] uppercase font-semibold text-muted-foreground">
                    <th className="py-2 px-2.5">Bucket ID</th>
                    <th className="py-2 px-2.5">{t.bucketOriginDate}</th>
                    <th className="py-2 px-2.5">{t.bucketInitialDeficit}</th>
                    <th className="py-2 px-2.5">{t.bucketRemainingDeficit}</th>
                    <th className="py-2 px-2.5">{t.bucketRecoveryEnd}</th>
                    <th className="py-2 px-2.5">{t.bucketDaysRemaining}</th>
                    <th className="py-2 px-2.5 text-right">{t.scheduledCarryLabel}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30 font-mono">
                  {deficit_buckets.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-2 px-2.5 font-sans font-medium text-foreground">{b.id}</td>
                      <td className="py-2 px-2.5 text-muted-foreground">
                        {b.origin_date.split("-").reverse().join(".")}
                      </td>
                      <td className="py-2 px-2.5 text-foreground">{fmtCurrency(b.original_deficit)}</td>
                      <td className="py-2 px-2.5 font-semibold text-rose-400">
                        {fmtCurrency(b.remaining_deficit)}
                      </td>
                      <td className="py-2 px-2.5 text-muted-foreground">
                        {b.recovery_end_date.split("-").reverse().join(".")}
                      </td>
                      <td className="py-2 px-2.5 text-amber-400 font-sans font-semibold">
                        {b.days_remaining} {b.days_remaining === 1 ? "day" : "days"}
                      </td>
                      <td className="py-2 px-2.5 text-right font-bold text-emerald-400">
                        +{fmtCurrency(b.scheduled_carry_today)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
