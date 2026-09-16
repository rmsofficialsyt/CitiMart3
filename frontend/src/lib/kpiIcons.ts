import type { ElementType } from "react";
import {
  BadgeIndianRupee,
  Footprints,
  Hourglass,
  IndianRupee,
  PackageCheck,
  Receipt,
  ShoppingBasket,
  Target,
  Timer,
  Trophy,
  UserCheck,
  Zap,
} from "lucide-react";
import type { DailyKpiKey } from "./types";

export interface KpiIconConfig {
  icon: ElementType;
  color: string;
  bg: string;
  border: string;
  glow: string;
  badgeLabel?: string;
}

export const KPI_ICON_CONFIG: Record<DailyKpiKey, KpiIconConfig> = {
  sales_target: {
    icon: Target,
    color: "text-violet-500 dark:text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/25",
    glow: "shadow-violet-500/20",
  },
  net_sales: {
    icon: IndianRupee,
    color: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    glow: "shadow-emerald-500/20",
  },
  remaining: {
    icon: Hourglass,
    color: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    glow: "shadow-amber-500/20",
  },
  bill_quantity: {
    icon: PackageCheck,
    color: "text-sky-500 dark:text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/25",
    glow: "shadow-sky-500/20",
  },
  footfall: {
    icon: Footprints,
    color: "text-purple-500 dark:text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/25",
    glow: "shadow-purple-500/20",
  },
  nob: {
    icon: Receipt,
    color: "text-blue-500 dark:text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/25",
    glow: "shadow-blue-500/20",
  },
  atv: {
    icon: BadgeIndianRupee,
    color: "text-teal-500 dark:text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/25",
    glow: "shadow-teal-500/20",
  },
  rpv: {
    icon: UserCheck,
    color: "text-indigo-500 dark:text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/25",
    glow: "shadow-indigo-500/20",
  },
  basket_size: {
    icon: ShoppingBasket,
    color: "text-orange-500 dark:text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/25",
    glow: "shadow-orange-500/20",
  },
  conversion_pct: {
    icon: Zap,
    color: "text-amber-500 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    glow: "shadow-amber-500/20",
  },
  achievement_pct: {
    icon: Trophy,
    color: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    glow: "shadow-emerald-500/20",
  },
  remaining_pct: {
    icon: Timer,
    color: "text-rose-500 dark:text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/25",
    glow: "shadow-rose-500/20",
  },
};

export function getKpiIconConfig(key?: string | null): KpiIconConfig | null {
  if (!key) return null;
  if (key in KPI_ICON_CONFIG) {
    return KPI_ICON_CONFIG[key as DailyKpiKey];
  }
  const lower = key.toLowerCase();
  if (lower.includes("sales target") || lower === "target") return KPI_ICON_CONFIG.sales_target;
  if (lower.includes("net sales") || lower === "sales") return KPI_ICON_CONFIG.net_sales;
  if (lower.includes("remaining %") || lower === "remaining_pct") return KPI_ICON_CONFIG.remaining_pct;
  if (lower.includes("remaining")) return KPI_ICON_CONFIG.remaining;
  if (lower.includes("bill quantity") || lower.includes("units")) return KPI_ICON_CONFIG.bill_quantity;
  if (lower.includes("footfall") || lower.includes("visitors")) return KPI_ICON_CONFIG.footfall;
  if (lower.includes("nob") || lower.includes("transactions") || lower.includes("bills")) return KPI_ICON_CONFIG.nob;
  if (lower.includes("atv")) return KPI_ICON_CONFIG.atv;
  if (lower.includes("rpv")) return KPI_ICON_CONFIG.rpv;
  if (lower.includes("basket")) return KPI_ICON_CONFIG.basket_size;
  if (lower.includes("conversion")) return KPI_ICON_CONFIG.conversion_pct;
  if (lower.includes("achievement")) return KPI_ICON_CONFIG.achievement_pct;
  return null;
}

export function getGaugeIconConfig(chartIdOrTitle?: string | null): KpiIconConfig {
  if (!chartIdOrTitle) {
    return {
      icon: Zap,
      color: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/25",
      glow: "shadow-primary/20",
    };
  }
  const lower = chartIdOrTitle.toLowerCase();
  if (lower.includes("conversion")) return KPI_ICON_CONFIG.conversion_pct;
  if (lower.includes("achievement")) return KPI_ICON_CONFIG.achievement_pct;
  if (lower.includes("remaining")) return KPI_ICON_CONFIG.remaining_pct;
  if (lower.includes("atv")) return KPI_ICON_CONFIG.atv;
  if (lower.includes("rpv")) return KPI_ICON_CONFIG.rpv;
  if (lower.includes("basket")) return KPI_ICON_CONFIG.basket_size;
  return {
    icon: Zap,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/25",
    glow: "shadow-primary/20",
  };
}
