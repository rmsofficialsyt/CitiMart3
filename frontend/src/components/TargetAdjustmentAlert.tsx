import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { fmtCurrency, fmtCurrencyOrZero, fmtPercentOrZero } from "@/lib/format";
import type { TargetAdjustmentAlert as TargetAdjustmentAlertType } from "@/lib/types";

interface TargetAdjustmentAlertProps {
  alert?: TargetAdjustmentAlertType | null;
  storeCode: string;
}

export function TargetAdjustmentAlert({ alert, storeCode }: TargetAdjustmentAlertProps) {
  const { t } = useLanguage();

  if (!alert || !alert.active || alert.prev_target == null) {
    return null;
  }

  const {
    prev_date,
    prev_target,
    prev_actual,
    prev_shortfall,
    prev_surplus,
    admin_today_target,
    adjusted_cumulative_target,
    adjusted_remaining,
    recovery_achievement_pct,
    has_shortfall,
  } = alert;

  const isShortfall = has_shortfall && prev_shortfall > 0;
  const isSurplus = prev_surplus > 0 && !has_shortfall;
  const prevDateFormatted = prev_date ? prev_date.split("-").reverse().join(".") : "";

  const adminTargetStr = admin_today_target != null ? fmtCurrency(admin_today_target) : t.notSet;
  const adjustedTargetStr = adjusted_cumulative_target != null ? fmtCurrencyOrZero(adjusted_cumulative_target) : adminTargetStr;
  const prevActualStr = fmtCurrencyOrZero(prev_actual);
  const prevTargetStr = fmtCurrencyOrZero(prev_target);
  const shortfallStr = fmtCurrencyOrZero(prev_shortfall);
  const surplusStr = fmtCurrencyOrZero(prev_surplus);

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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left Info Column */}
        <div className="space-y-1.5 flex-1">
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

            <span className="text-[11px] font-medium text-muted-foreground">
              {t.cumulativeRecoveryMode(prevDateFormatted)}
            </span>
          </div>

          <h3 className="text-base font-bold tracking-tight text-foreground sm:text-lg">
            {isShortfall
              ? t.shortfallHeading(shortfallStr)
              : isSurplus
              ? t.surplusHeading(surplusStr)
              : t.exactMatchHeading(prevDateFormatted)}
          </h3>

          <p className="max-w-2xl text-xs text-muted-foreground sm:text-sm leading-relaxed">
            {isShortfall ? (
              t.shortfallDesc(prevDateFormatted, adjustedTargetStr, adminTargetStr)
            ) : isSurplus ? (
              t.surplusDesc(prevActualStr, prevTargetStr, prevDateFormatted, adminTargetStr)
            ) : (
              t.exactMatchDesc(prevTargetStr, prevDateFormatted, storeCode)
            )}
          </p>
        </div>

        {/* Right Metric Cards */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:w-auto shrink-0">
          <div className="rounded-xl border border-border/80 bg-background/80 p-2.5 backdrop-blur-sm sm:p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
              {t.adminSetTarget}
            </span>
            <span className="mt-0.5 font-mono text-sm font-bold text-foreground sm:text-base block">
              {admin_today_target != null ? fmtCurrencyOrZero(admin_today_target) : t.notSet}
            </span>
            <span className="text-[10px] text-muted-foreground">{t.primaryBaseline}</span>
          </div>

          <div
            className={`rounded-xl border p-2.5 backdrop-blur-sm sm:p-3 ${
              isShortfall
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-border/80 bg-background/80"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 dark:text-amber-400 block">
              {isShortfall ? t.adjustedRecoveryGoal : t.targetGoal}
            </span>
            <span className="mt-0.5 font-mono text-sm font-bold text-amber-400 sm:text-base block">
              {adjusted_cumulative_target != null ? fmtCurrencyOrZero(adjusted_cumulative_target) : (admin_today_target != null ? fmtCurrencyOrZero(admin_today_target) : "—")}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {isShortfall ? t.includesDeficit(shortfallStr) : (isSurplus ? t.plusBuffer(surplusStr) : t.noDeficit)}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl border border-border/80 bg-background/80 p-2.5 backdrop-blur-sm sm:p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
              {t.recoveryStatus}
            </span>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="font-mono text-sm font-bold text-emerald-400 sm:text-base">
                {recovery_achievement_pct != null ? fmtPercentOrZero(recovery_achievement_pct) : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {t.rem} {fmtCurrencyOrZero(adjusted_remaining)}
              </span>
            </div>
            {/* Mini Progress Bar */}
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
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
          </div>
        </div>
      </div>
    </div>
  );
}
