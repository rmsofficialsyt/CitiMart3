import { motion } from "framer-motion";
import {
  ChevronDown,
  FileOutput,
  LogOut,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  SlidersHorizontal,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useMediaQuery";
import citimartLogo from "@/assets/citimart-logo.png";

interface TopBarProps {
  activeStores: string[];
  dateRange: string;
  lastRefresh: string;
  panelOpen: boolean;
  onTogglePanel: () => void;
  showPanelToggle?: boolean;
  showReportButton?: boolean;
  onOpenReport?: () => void;
  username?: string;
  roleLabel?: string;
  onSignOut?: () => void;
}

// Light -> Dark -> Neon -> Light. Uses `theme` (the explicit choice), not
// `resolvedTheme`, so cycling is deterministic; falls back to "light" for the
// unresolved / "system" state.
const THEME_CYCLE = ["light", "dark", "neon"] as const;
const THEME_META: Record<(typeof THEME_CYCLE)[number], { label: string; Icon: typeof Sun }> = {
  light: { label: "Light", Icon: Sun },
  dark: { label: "Dark", Icon: Moon },
  neon: { label: "Neon", Icon: Sparkles },
};

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (THEME_CYCLE as readonly string[]).includes(theme ?? "") ? (theme as (typeof THEME_CYCLE)[number]) : "light";
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
  const { Icon } = THEME_META[current];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Theme: ${THEME_META[current].label} — switch to ${THEME_META[next].label}`}
      title={`Theme: ${THEME_META[current].label} — switch to ${THEME_META[next].label}`}
      className="size-9 text-slate-300 hover:bg-white/10 hover:text-white"
      onClick={() => setTheme(next)}
    >
      {mounted ? <Icon className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

const ICON_BTN = "size-9 shrink-0 text-slate-300 hover:bg-white/10 hover:text-white";

export function TopBar({
  activeStores,
  dateRange,
  lastRefresh,
  panelOpen,
  onTogglePanel,
  showPanelToggle = true,
  showReportButton = false,
  onOpenReport,
  username,
  roleLabel,
  onSignOut,
}: TopBarProps) {
  const isMobile = useIsMobile();
  // The meta strip (stores / reporting period / last refresh) is three lines of
  // text on a phone and would push the whole dashboard below the fold, so on
  // small screens it collapses behind the chevron and only the Live pill stays
  // visible. From `md` up it's always shown and the chevron disappears.
  const [metaOpen, setMetaOpen] = useState(false);

  const liveDot = (
    <span className="inline-flex items-center gap-1.5" title="Dashboard is live on the current workbook">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-semibold text-emerald-300">Live</span>
    </span>
  );

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="topbar bg-[#0f172a] px-3 py-3.5 text-white sm:px-6"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <img src={citimartLogo} alt="CitiMart" className="h-8 w-auto shrink-0 rounded bg-white/95 p-1 sm:h-10" />
          <div className="min-w-0">
            <h1 className="truncate text-base leading-tight font-bold sm:text-lg lg:text-xl">
              <span className="text-blue-300">CITIMART</span>
              {/* The full title doesn't fit beside the action icons on a 360px
                  screen -- shorten it there rather than truncating mid-word. */}
              <span className="hidden sm:inline"> SALES KPI DASHBOARD REPORT</span>
              <span className="sm:hidden"> KPI</span>
            </h1>

            {/* Mobile: the Live pill + the expand chevron on one short line. */}
            <button
              type="button"
              onClick={() => setMetaOpen((o) => !o)}
              aria-expanded={metaOpen}
              aria-label={metaOpen ? "Hide dashboard details" : "Show dashboard details"}
              className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-300 md:hidden"
            >
              {liveDot}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${metaOpen ? "rotate-180" : ""}`} />
            </button>

            {/* md+ (and the expanded mobile state) -- the full meta strip. */}
            <p
              className={`mt-1 flex-wrap items-center gap-x-1.5 text-xs text-slate-300 md:flex ${
                metaOpen ? "flex" : "hidden"
              }`}
            >
              <span className="hidden md:inline-flex">{liveDot}</span>
              <span className="hidden md:inline">&nbsp;|&nbsp;</span>
              <span>Active stores: {activeStores.join(", ") || "—"}</span>
              <span className="hidden sm:inline">&nbsp;|&nbsp;</span>
              <span className="w-full sm:w-auto">Reporting period: {dateRange}</span>
              <span className="hidden sm:inline">&nbsp;|&nbsp;</span>
              <span className="w-full sm:w-auto">Last workbook refresh: {lastRefresh}</span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {showReportButton && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Export report"
              title="Export Report"
              className={ICON_BTN}
              onClick={onOpenReport}
            >
              <FileOutput className="h-4 w-4" />
            </Button>
          )}
          {showPanelToggle && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={panelOpen ? "Hide filters" : "Show filters"}
              title={panelOpen ? "Hide filters" : "Show filters"}
              className={ICON_BTN}
              onClick={onTogglePanel}
            >
              {/* On mobile the panel is a drawer, not a docked sidebar, so the
                  panel-collapse chevrons would be misleading -- use the plain
                  "filters" affordance there instead. */}
              {isMobile ? (
                <SlidersHorizontal className="h-4 w-4" />
              ) : panelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          )}
          <ThemeToggle />

          {username && (
            <div className="ml-1 flex items-center gap-1 border-l border-white/15 pl-1.5 sm:ml-2 sm:gap-2 sm:pl-3">
              <span className="hidden items-center gap-1.5 text-xs text-slate-300 lg:flex">
                <UserRound className="h-3.5 w-3.5" />
                <span className="font-medium text-white">{username}</span>
                {roleLabel && <span className="text-slate-400">· {roleLabel}</span>}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                title={username ? `Sign out (${username})` : "Sign out"}
                className={ICON_BTN}
                onClick={onSignOut}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.header>
  );
}
