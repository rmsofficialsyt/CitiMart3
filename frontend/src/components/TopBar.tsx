import { motion } from "framer-motion";
import {
  ChevronDown,
  FileOutput,
  LogOut,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  Sparkles,
  SlidersHorizontal,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { SIGN_IN_OPTIONS } from "@/lib/authUsers";
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

const ICON_BTN = "size-9 shrink-0 text-slate-300 hover:bg-white/10 hover:text-white";

function SettingsMenu({
  username,
  roleLabel,
  onSignOut,
}: {
  username?: string;
  roleLabel?: string;
  onSignOut?: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const themes = [
    { id: "light", label: "Light", Icon: Sun },
    { id: "dark", label: "Dark", Icon: Moon },
    { id: "neon", label: "Neon", Icon: Sparkles },
  ] as const;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings"
          title="Settings (Accounts, Theme, Sign Out)"
          className={ICON_BTN}
        >
          <Settings className="h-4 w-4 text-slate-200" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 rounded-xl border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl backdrop-blur-md"
      >
        <div className="border-b border-slate-800 p-3.5 bg-slate-950/40 rounded-t-xl">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-bold text-white">
              <Settings className="h-4 w-4 text-blue-400" />
              Settings & Preferences
            </span>
          </div>
        </div>

        <div className="p-3 space-y-4">
          {/* Account & Profile */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Account
            </span>
            {username ? (
              <div className="mt-1.5 flex items-center justify-between rounded-lg bg-slate-800/80 p-2.5 border border-slate-700/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-300">
                    <UserRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{username}</p>
                    <p className="truncate text-[11px] text-slate-400">{roleLabel || "User"}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-1.5 flex items-center justify-between rounded-lg bg-slate-800/80 p-2.5">
                <span className="text-xs text-slate-400">Not signed in</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    setOpen(false);
                    navigate("/login");
                  }}
                >
                  Sign In
                </Button>
              </div>
            )}

            {/* Switch Account */}
            <div className="mt-2.5">
              <span className="text-[11px] text-slate-400 font-medium">Switch Account:</span>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {SIGN_IN_OPTIONS.map((opt) => {
                  const isActive = opt.username === username;
                  return (
                    <button
                      key={opt.username}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        navigate(`/login?account=${encodeURIComponent(opt.username)}`);
                      }}
                      className={`flex flex-col items-start rounded-md px-2 py-1.5 text-left text-xs transition border ${
                        isActive
                          ? "border-blue-500 bg-blue-500/15 text-blue-200"
                          : "border-slate-800 bg-slate-800/40 text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <span className="truncate w-full font-medium">{opt.title.replace("CITIMART — ", "")}</span>
                      <span className="text-[10px] text-slate-400">{opt.sub.split("·")[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Theme Switcher */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Theme / Appearance
            </span>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {themes.map(({ id, label, Icon }) => {
                const isSelected = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition border ${
                      isSelected
                        ? "border-blue-400 bg-blue-600/30 text-white shadow-sm"
                        : "border-slate-800 bg-slate-800/40 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Log Out */}
          {onSignOut && username && (
            <div className="pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 py-2 text-xs font-semibold transition"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out ({username})
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
          <div className="shrink-0 rounded-lg bg-white p-1 sm:p-1.5 shadow-sm border border-slate-100 flex items-center justify-center">
            <img src={citimartLogo} alt="CITIMART - Value for Money Re-defined" className="h-10 sm:h-12 w-auto object-contain" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h1 className="truncate text-base leading-tight font-extrabold sm:text-lg lg:text-xl tracking-tight">
                <span className="text-white">CITIMART</span>
                <span className="hidden sm:inline text-blue-300"> DAILY OPERATIONS DASHBOARD</span>
                <span className="sm:hidden text-blue-300"> OPERATIONS</span>
              </h1>
            </div>
            <div className="text-[11px] sm:text-xs font-semibold text-amber-300/95 tracking-wide uppercase mt-0.5">
              Value for Money Re-defined
            </div>

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

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
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
              {isMobile ? (
                <SlidersHorizontal className="h-4 w-4" />
              ) : panelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Unified Settings Button (Accounts, Themes, Sign Out) */}
          <SettingsMenu
            username={username}
            roleLabel={roleLabel}
            onSignOut={onSignOut}
          />
        </div>
      </div>
    </motion.header>
  );
}
