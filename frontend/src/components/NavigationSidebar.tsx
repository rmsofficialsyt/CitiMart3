import { AnimatePresence, motion } from "framer-motion";
import {
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartVertical,
  Boxes,
  Building2,
  ChevronRight,
  ClipboardList,
  Droplets,
  History,
  Languages,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Moon,
  PackagePlus,
  PanelBottom,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelTop,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Sun,
  Target,
  Users,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/context/LanguageContext";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { SIGN_IN_OPTIONS } from "@/lib/authUsers";
import type { Language } from "@/lib/translations";

export type DailyStoreId = "nm" | "hb" | "chw";
export const OVERALL_STORE_ID = "overall" as const;
export type DailyStoreSel = DailyStoreId | typeof OVERALL_STORE_ID;
export type DailyView = "dashboard" | "manual" | "target" | "history" | "requisition" | "stocks" | "staff";
type NavAlign = "top" | "center" | "bottom";
export type NavPosition = "left" | "right" | "bottom" | "top";

interface NavigationSidebarProps {
  effectiveStore: DailyStoreSel;
  setDailyStore: (store: DailyStoreSel) => void;
  effectiveView: DailyView;
  setDailyView: (view: DailyView) => void;
  isManager: boolean;
  isAdmin: boolean;
  forcedStore?: DailyStoreId;
  targetStoreCode: string;
  navOpen?: boolean;
  onToggleNav?: () => void;
  mobileDrawerOpen?: boolean;
  onMobileDrawerOpenChange?: (open: boolean) => void;
  navPosition?: NavPosition;
  onNavPositionChange?: (pos: NavPosition) => void;
}

const ALIGN_OPTIONS: { id: NavAlign; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "top", label: "Top Align", Icon: AlignStartVertical },
  { id: "center", label: "Center Align", Icon: AlignCenterVertical },
  { id: "bottom", label: "Bottom Align", Icon: AlignEndVertical },
];

const POSITION_OPTIONS: { id: NavPosition; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "left", label: "Left", Icon: PanelLeft },
  { id: "right", label: "Right", Icon: PanelRight },
  { id: "bottom", label: "Bottom", Icon: PanelBottom },
  { id: "top", label: "Top", Icon: PanelTop },
];

export function NavigationSidebar({
  effectiveStore,
  setDailyStore,
  effectiveView,
  setDailyView,
  isManager,
  isAdmin,
  forcedStore,
  targetStoreCode,
  navOpen = true,
  onToggleNav,
  mobileDrawerOpen = false,
  onMobileDrawerOpenChange,
  navPosition = "left",
  onNavPositionChange,
}: NavigationSidebarProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, isSwitchedFromAdmin, switchAccount, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [navAlign, setNavAlign] = useState<NavAlign>(() => {
    try {
      const saved = localStorage.getItem("citimart_nav_align");
      if (saved === "top" || saved === "center" || saved === "bottom") return saved;
    } catch {
      // ignore storage errors
    }
    return "center";
  });

  const updateNavAlign = (align: NavAlign) => {
    setNavAlign(align);
    try {
      localStorage.setItem("citimart_nav_align", align);
    } catch {
      // ignore storage errors
    }
  };

  const roleLabel = isAdmin
    ? "Administrator"
    : user?.storeCode
    ? `Manager · ${user.storeCode}`
    : "Manager";

  const themes = [
    { id: "light", label: "Light", Icon: Sun },
    { id: "dark", label: "Dark", Icon: Moon },
    { id: "neon", label: "Neon", Icon: Sparkles },
    { id: "glassy", label: "Glassy", Icon: Droplets },
  ] as const;

  const languages: { id: Language; label: string; sub: string }[] = [
    { id: "en", label: "English", sub: "EN" },
    { id: "hi", label: "हिंदी", sub: "HI" },
    { id: "bn", label: "বাংলা", sub: "BN" },
  ];

  const storeNavItems = [
    { id: OVERALL_STORE_ID, label: t.navOverallSummary || "Overall Stores", code: "ALL", Icon: Building2, sub: "Network Total" },
    { id: "nm" as DailyStoreId, label: t.storeNewMarket || "New Market", code: "NM", Icon: Store, sub: "Lindsay St" },
    { id: "hb" as DailyStoreId, label: t.storeHatibagan || "Hatibagan", code: "HB", Icon: Store, sub: "Bidhan Sarani" },
    { id: "chw" as DailyStoreId, label: t.storeChowringhee || "Chowringhee", code: "CHW", Icon: Store, sub: "JL Nehru Rd" },
  ];

  const isOverall = effectiveStore === OVERALL_STORE_ID;

  const viewItems: { id: DailyView; label: string; Icon: React.ComponentType<{ className?: string }>; tag: string }[] = [
    { id: "dashboard", label: t.navDashboard || "Dashboard", Icon: LayoutDashboard, tag: "Live" },
    ...(!isAdmin && !isOverall ? [{ id: "manual" as DailyView, label: t.navManualEntry || "Manual Data Entry", Icon: ClipboardList, tag: "Form" }] : []),
    ...(isAdmin && !isOverall ? [{ id: "target" as DailyView, label: t.navSalesTarget || "Sales Target", Icon: Target, tag: "Admin" }] : []),
    { id: "history", label: t.navHistory || "History and Analysis", Icon: History, tag: "Analysis" },
    { id: "requisition", label: "Product Requisition", Icon: PackagePlus, tag: "Slip" },
    { id: "stocks", label: "Stocks Management", Icon: Boxes, tag: "Inventory" },
    { id: "staff", label: "Staff Management", Icon: Users, tag: "Roster" },
  ];

  const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : "U";
  const assignedStoreLabel =
    forcedStore === "nm"
      ? "New Market (NM)"
      : forcedStore === "hb"
      ? "Hatibagan (HB)"
      : "Chowringhee (CHW)";

  useEffect(() => {
    if (!isMobile || !mobileDrawerOpen || !onMobileDrawerOpenChange) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileDrawerOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobile, mobileDrawerOpen, onMobileDrawerOpenChange]);

  const handleSelectStore = (store: DailyStoreSel) => {
    setDailyStore(store);
    if (isMobile) onMobileDrawerOpenChange?.(false);
  };

  const handleSelectView = (view: DailyView) => {
    setDailyView(view);
    if (isMobile) onMobileDrawerOpenChange?.(false);
  };

  const activeStoreItem = storeNavItems.find((s) => s.id === effectiveStore);
  const activeViewItem = viewItems.find((v) => v.id === effectiveView);

  const isHorizontal = navPosition === "top" || navPosition === "bottom";
  const isRight = navPosition === "right";
  const isBottom = navPosition === "bottom";

  const alignMarginClass =
    navAlign === "center"
      ? "lg:my-auto"
      : navAlign === "bottom"
      ? "lg:mt-auto"
      : "";

  const popoverSide: "top" | "right" | "bottom" | "left" = isMobile
    ? "top"
    : isRight
    ? "left"
    : navPosition === "top"
    ? "bottom"
    : isBottom
    ? "top"
    : "right";

  const dockTooltipClass =
    isRight
      ? "right-full mr-3"
      : navPosition === "top"
      ? "top-full mt-3 left-1/2 -translate-x-1/2"
      : isBottom
      ? "bottom-full mb-3 left-1/2 -translate-x-1/2"
      : "left-full ml-3";

  const settingsPopoverBody = (
    <PopoverContent
      align="end"
      side={popoverSide}
      sideOffset={12}
      className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl backdrop-blur-2xl"
    >
      <div className="border-b border-border p-3 2xl:p-3.5 bg-muted/40 rounded-t-2xl">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Settings className="h-4 w-4 text-blue-500" />
            {t.settingsTitle || "Settings"}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase font-mono px-1.5 py-0.5 rounded bg-muted border border-border">
            {language.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-3.5 max-h-[72vh] overflow-y-auto">
        {/* Account & Profile */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t.account || "Account & Profile"}
          </span>
          {user?.username ? (
            <div className="mt-1.5 flex items-center justify-between rounded-xl bg-muted/50 p-2.5 border border-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold shadow-md">
                  {userInitial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">{user.username}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex items-center justify-between rounded-xl bg-muted/50 p-2.5">
              <span className="text-xs text-muted-foreground">Not signed in</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setSettingsOpen(false);
                  navigate("/login");
                }}
              >
                Sign In
              </Button>
            </div>
          )}

          {/* Switch Account (Admin & Switched Mode) */}
          {(isAdmin || isSwitchedFromAdmin) && (
            <div className="mt-2.5">
              <span className="text-[11px] text-muted-foreground font-medium">{t.switchAccount || "Switch Store Account"}</span>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {SIGN_IN_OPTIONS.map((opt) => {
                  const isActive = opt.username === user?.username;
                  return (
                    <button
                      key={opt.username}
                      type="button"
                      onClick={async () => {
                        try {
                          setSettingsOpen(false);
                          await switchAccount(opt.username);
                          toast.success(`Switched account to ${opt.title.replace("CITIMART — ", "")}`);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to switch account");
                        }
                      }}
                      className={`flex flex-col items-start rounded-xl px-2.5 py-2 text-left text-xs transition border cursor-pointer ${
                        isActive
                          ? "border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-200 shadow-sm"
                          : "border-border bg-card hover:bg-muted text-foreground"
                      }`}
                    >
                      <span className="truncate w-full font-bold">{opt.title.replace("CITIMART — ", "")}</span>
                      <span className="text-[10px] text-muted-foreground">{opt.sub.split("·")[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Taskbar Position (Left / Right / Bottom / Top) */}
        {onNavPositionChange && (
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Taskbar Position
            </span>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {POSITION_OPTIONS.map(({ id, label, Icon }) => {
                const isSelected = navPosition === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onNavPositionChange(id)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition border cursor-pointer ${
                      isSelected
                        ? "border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-200 shadow-sm ring-1 ring-blue-500/35"
                        : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Navigation Alignment (Top / Center / Bottom — vertical edges only) */}
        {!isHorizontal && (
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Navigation Alignment
            </span>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {ALIGN_OPTIONS.map(({ id, label, Icon }) => {
                const isSelected = navAlign === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => updateNavAlign(id)}
                    className={`flex items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold transition border cursor-pointer ${
                      isSelected
                        ? "border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-200 shadow-sm ring-1 ring-rose-500/35"
                        : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{label.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Theme Switcher */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t.theme || "Appearance Theme"}
          </span>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {themes.map(({ id, label, Icon }) => {
              const isSelected = theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition border cursor-pointer ${
                    isSelected
                      ? "border-blue-500 bg-blue-500/20 text-blue-700 dark:text-white shadow-sm ring-1 ring-blue-500/40"
                      : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Language Selector */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Languages className="h-3.5 w-3.5 text-indigo-500" />
            {t.language || "Language"}
          </span>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {languages.map((item) => {
              const isSelected = language === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLanguage(item.id)}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-500/20 text-indigo-700 dark:text-white shadow-sm ring-1 ring-indigo-500/40"
                      : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="font-bold text-xs">{item.label}</span>
                  <span className="text-[10px] text-muted-foreground font-mono mt-0.5">{item.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sign Out Button */}
        {user?.username && (
          <div className="pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                setShowLogoutConfirm(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/25 py-2.5 text-xs font-semibold transition cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t.logout || "Log Out"} ({user.username})
            </button>
          </div>
        )}
      </div>
    </PopoverContent>
  );

  return (
    <>
      {!navOpen ? (
        /* HIDE MODE: Ubuntu Dock View (Supports Left / Right / Bottom / Top Taskbar Positions) */
        <>
          {!isHorizontal && (
            <div
              aria-hidden="true"
              className={`hidden lg:block lg:w-[4.75rem] shrink-0 ${isRight ? "lg:order-last" : ""}`}
            />
          )}
          <aside
            aria-label="Ubuntu Dock Navigation"
            className={
              isBottom
                ? "fixed bottom-2.5 left-1/2 -translate-x-1/2 px-3 max-w-full z-40 flex justify-center pb-[env(safe-area-inset-bottom)]"
                : navPosition === "top"
                ? "w-full shrink-0 px-3 pt-2.5 lg:p-0 lg:fixed lg:top-[calc(var(--topbar-h,5.25rem)+0.5rem)] lg:left-1/2 lg:-translate-x-1/2 lg:w-auto z-40 flex justify-center"
                : `w-full lg:w-auto shrink-0 px-3 pt-2.5 lg:p-0 lg:py-3 lg:fixed ${
                    isRight ? "lg:right-3" : "lg:left-3"
                  } lg:top-[var(--topbar-h,5.25rem)] lg:bottom-0 lg:pointer-events-none z-40 flex justify-center lg:flex-col`
            }
          >
          <div
            className={`lg:pointer-events-auto flex flex-row ${
              isHorizontal ? "" : "lg:flex-col"
            } items-center gap-2 rounded-3xl border border-border bg-card/95 text-foreground p-2 shadow-lg shadow-slate-900/10 dark:border-white/15 dark:bg-slate-950/90 dark:shadow-2xl dark:shadow-black/40 neon:border-cyan-400/25 neon:bg-slate-950/85 glassy:border-white/65 glassy:bg-white/60 glassy:shadow-[0_12px_36px_rgba(30,58,138,0.14),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-2xl overflow-x-auto lg:overflow-x-visible ${
              isHorizontal ? "lg:overflow-visible" : "lg:overflow-y-auto lg:max-h-full"
            } no-scrollbar max-w-full ${!isHorizontal ? alignMarginClass : ""}`}
          >
            {/* Expand to Detailed View Button (Icon-Only) */}
            {onToggleNav && (
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                type="button"
                onClick={onToggleNav}
                title="Show Detailed Navigation"
                aria-label="Show detailed navigation"
                aria-expanded={false}
                className="group relative flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-gradient-to-tr from-[#b52026] to-[#23407d] text-white shadow-md transition-all cursor-pointer"
              >
                <PanelLeftOpen className="h-4 w-4 shrink-0" />
                <span className={`pointer-events-none hidden lg:flex items-center absolute ${dockTooltipClass} whitespace-nowrap rounded-xl border border-border bg-popover px-3 py-1.5 text-xs font-semibold text-popover-foreground opacity-0 shadow-xl transition-opacity group-hover:opacity-100`}>
                  Show Detailed View
                </span>
              </motion.button>
            )}

            {/* Admin Switched Account Quick Return */}
            {isSwitchedFromAdmin && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await switchAccount("ADMINISTRATOR");
                    toast.success("Returned to Administrator view");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to return to Administrator");
                  }
                }}
                title={`Return to Admin (from ${user?.storeCode ?? "Store"})`}
                aria-label="Return to Administrator"
                className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-md hover:bg-amber-400 transition-transform hover:scale-110 cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span className={`pointer-events-none hidden lg:flex items-center absolute ${dockTooltipClass} whitespace-nowrap rounded-xl border border-amber-400/40 bg-popover px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100`}>
                  Return to Admin
                </span>
              </button>
            )}

            <div className={`h-6 w-px ${isHorizontal ? "" : "lg:h-px lg:w-7"} bg-border dark:bg-white/15 shrink-0`} />

            {/* Store Selector Circular Icons */}
            <div className={`flex flex-row ${isHorizontal ? "" : "lg:flex-col"} items-center gap-1.5`}>
              {!isManager ? (
                storeNavItems.map((item) => {
                  const active = effectiveStore === item.id;
                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setDailyStore(item.id as DailyStoreSel)}
                      title={`${item.label} (${item.code})`}
                      aria-label={`${item.label} (${item.code})`}
                      className={`group relative flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border text-[11px] font-mono font-extrabold tracking-tight transition-all cursor-pointer ${
                        active
                          ? "border-white/40 bg-gradient-to-tr from-[#b52026] to-[#23407d] text-white shadow-lg shadow-[#b52026]/30"
                          : "border-border bg-muted/60 text-muted-foreground hover:border-foreground/25 hover:bg-muted hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-white/25 dark:hover:bg-white/15 dark:hover:text-white"
                      }`}
                    >
                      {active && !isHorizontal && (
                        <span
                          className={`hidden lg:block absolute ${
                            isRight ? "-right-1.5" : "-left-1.5"
                          } top-1/2 -translate-y-1/2 h-3.5 w-1 rounded-full bg-rose-500 dark:bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]`}
                        />
                      )}
                      {active && (
                        <span
                          className={`${
                            isHorizontal ? "" : "lg:hidden"
                          } absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-3.5 rounded-full bg-rose-500 dark:bg-rose-400`}
                        />
                      )}
                      <span>{item.code}</span>
                      <span className={`pointer-events-none hidden lg:flex items-center gap-1.5 absolute ${dockTooltipClass} whitespace-nowrap rounded-xl border border-border bg-popover px-3 py-1.5 text-xs font-semibold text-popover-foreground opacity-0 shadow-xl backdrop-blur-xl transition-all group-hover:opacity-100`}>
                        <span>{item.label}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{item.sub}</span>
                      </span>
                    </motion.button>
                  );
                })
              ) : (
                <div
                  title={`Assigned Store: ${assignedStoreLabel}`}
                  className="group relative flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-white/30 bg-gradient-to-tr from-[#b52026] to-[#23407d] text-white shadow-md"
                >
                  <Store className="h-4 w-4 shrink-0" />
                  <span className={`pointer-events-none hidden lg:flex items-center absolute ${dockTooltipClass} whitespace-nowrap rounded-xl border border-border bg-popover px-3 py-1.5 text-xs font-semibold text-popover-foreground opacity-0 shadow-xl transition-opacity group-hover:opacity-100`}>
                    {assignedStoreLabel}
                  </span>
                </div>
              )}
            </div>

            <div className={`h-6 w-px ${isHorizontal ? "" : "lg:h-px lg:w-7"} bg-border dark:bg-white/15 shrink-0`} />

            {/* Operational Modules Circular Icons */}
            <div className={`flex flex-row ${isHorizontal ? "" : "lg:flex-col"} items-center gap-1.5`}>
              {viewItems.map((item) => {
                const active = effectiveView === item.id;
                const Icon = item.Icon;
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setDailyView(item.id)}
                    title={item.label}
                    aria-label={item.label}
                    className={`group relative flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border transition-all cursor-pointer ${
                      active
                        ? "border-white/40 bg-gradient-to-tr from-[#23407d] via-indigo-600 to-[#b52026] text-white shadow-lg shadow-indigo-950/40"
                        : "border-border bg-muted/60 text-muted-foreground hover:border-foreground/25 hover:bg-muted hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-white/25 dark:hover:bg-white/15 dark:hover:text-white"
                    }`}
                  >
                    {active && !isHorizontal && (
                      <span
                        className={`hidden lg:block absolute ${
                          isRight ? "-right-1.5" : "-left-1.5"
                        } top-1/2 -translate-y-1/2 h-4 w-1 rounded-full bg-sky-500 dark:bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]`}
                      />
                    )}
                    {active && (
                      <span
                        className={`${
                          isHorizontal ? "" : "lg:hidden"
                        } absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-3.5 rounded-full bg-sky-500 dark:bg-sky-400`}
                      />
                    )}
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-amber-200" : ""}`} />
                    <span className={`pointer-events-none hidden lg:flex items-center gap-1.5 absolute ${dockTooltipClass} whitespace-nowrap rounded-xl border border-border bg-popover px-3 py-1.5 text-xs font-semibold text-popover-foreground opacity-0 shadow-xl backdrop-blur-xl transition-all group-hover:opacity-100`}>
                      <span>{item.label}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase font-bold text-muted-foreground">{item.tag}</span>
                    </span>
                  </motion.button>
                );
              })}
            </div>

            <div className={`h-6 w-px ${isHorizontal ? "" : "lg:h-px lg:w-7"} bg-border dark:bg-white/15 shrink-0`} />

            {/* Circular Profile/Settings */}
            <div className={`flex flex-row ${isHorizontal ? "" : "lg:flex-col"} items-center gap-1.5`}>
              <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                <PopoverTrigger asChild>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.94 }}
                    type="button"
                    title={`Account & Settings (${user?.username || "Guest"})`}
                    aria-label="Account and Settings"
                    className="group relative flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 p-0.5 shadow-md ring-2 ring-border dark:ring-white/20 hover:ring-foreground/40 dark:hover:ring-white/50 transition-all cursor-pointer"
                  >
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-card text-foreground dark:bg-slate-950 dark:text-white text-xs font-bold">
                      {userInitial}
                    </div>
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card dark:ring-slate-950" />
                    <span className={`pointer-events-none hidden lg:flex items-center gap-1.5 absolute ${dockTooltipClass} whitespace-nowrap rounded-xl border border-border bg-popover px-3 py-1.5 text-xs font-semibold text-popover-foreground opacity-0 shadow-xl transition-opacity group-hover:opacity-100`}>
                      <span>{user?.username || "Settings"}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">{roleLabel}</span>
                    </span>
                  </motion.button>
                </PopoverTrigger>
                {settingsPopoverBody}
              </Popover>
            </div>
          </div>
        </aside>
        </>
      ) : (
        /* SHOW MODE: Ubuntu-Docs-inspired Detailed Navigation
           - Desktop (lg+): 3-zone sticky rail (pinned header + scrollable body + pinned footer)
           - Mobile/Tablet (< lg): compact contextual bar + off-canvas slide-over drawer */
        <>
          {(() => {
            const detailedSidebarContent = (
              <>
                {/* Zone 1: Pinned Brand Header + Drawer/Dock Controls */}
                <div className="shrink-0 flex items-center justify-between gap-2 px-1 pb-3 border-b border-border/60">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 2xl:h-10 2xl:w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 p-2 shadow-lg shadow-blue-500/20 border border-white/20 text-white">
                      <ShoppingBag className="h-4 w-4 2xl:h-5 2xl:w-5 shrink-0" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm 2xl:text-base font-extrabold tracking-tight text-foreground flex items-center gap-1.5">
                        <span className="truncate">CITIMART</span>
                        <span className="shrink-0 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                          Daily
                        </span>
                      </h2>
                      <p className="text-[11px] font-medium text-muted-foreground truncate">Store Operations Hub</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {onToggleNav && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isMobile) onMobileDrawerOpenChange?.(false);
                          onToggleNav();
                        }}
                        title="Switch to Ubuntu Dock View"
                        aria-label="Switch to Ubuntu Dock view"
                        aria-expanded={!isMobile ? true : undefined}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                      >
                        <PanelLeftClose className="h-4 w-4" />
                      </button>
                    )}
                    {isMobile && (
                      <button
                        type="button"
                        onClick={() => onMobileDrawerOpenChange?.(false)}
                        title="Close navigation menu"
                        aria-label="Close navigation menu"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Zone 2: Independently Scrollable Navigation Body */}
                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col py-2.5">
                  <div className={`${alignMarginClass} space-y-3.5 sm:space-y-4`}>
                  {/* Admin Switched Account Return Banner */}
                  {isSwitchedFromAdmin && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-amber-500/40 bg-amber-500/15 p-3 backdrop-blur-sm flex items-center justify-between gap-2 shadow-md"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-300">
                          <ShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="truncate">Admin Mode</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">Switched to {user?.storeCode ?? "Store"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await switchAccount("ADMINISTRATOR");
                            toast.success("Returned to Administrator view");
                            if (isMobile) onMobileDrawerOpenChange?.(false);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to return to Administrator");
                          }
                        }}
                        className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 shadow transition cursor-pointer"
                      >
                        Return to Admin
                      </button>
                    </motion.div>
                  )}

                  {/* Stores Navigation Section */}
                  <div className="space-y-2">
                    <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 shrink-0 text-blue-500" />
                        <span>{t.activeStores || "Store Selection"}</span>
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground font-semibold">{targetStoreCode}</span>
                    </div>

                    {!isManager ? (
                      <div className="flex flex-col gap-1">
                        {storeNavItems.map((item) => {
                          const active = effectiveStore === item.id;
                          const Icon = item.Icon;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectStore(item.id as DailyStoreSel)}
                              className={`relative flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 cursor-pointer ${
                                active
                                  ? "text-white shadow-md shadow-blue-900/30"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                              }`}
                            >
                              {active && (
                                <motion.div
                                  layoutId="sidebarActiveStore"
                                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 border border-white/20 shadow-md"
                                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                                />
                              )}
                              {active && (
                                <span
                                  aria-hidden="true"
                                  className="relative z-10 h-4 w-1 shrink-0 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]"
                                />
                              )}
                              <span className="relative z-10 flex flex-1 items-center gap-2.5 min-w-0">
                                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-muted-foreground"}`} />
                                <span className="truncate">{item.label}</span>
                              </span>
                              <div className="relative z-10 flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-wider ${
                                    active
                                      ? "bg-white/20 text-white border border-white/30"
                                      : "bg-muted text-muted-foreground border border-border"
                                  }`}
                                >
                                  {item.code}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-700 dark:text-blue-300 backdrop-blur-sm">
                        <div className="flex items-center gap-2 font-bold text-foreground">
                          <Store className="h-4 w-4 shrink-0 text-blue-500" />
                          <span className="truncate">Assigned Store Hub</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground truncate">{assignedStoreLabel}</div>
                      </div>
                    )}
                  </div>

                  {/* Views Navigation Section */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span>Operational Modules</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      {viewItems.map((item) => {
                        const active = effectiveView === item.id;
                        const Icon = item.Icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectView(item.id)}
                            className={`relative flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 cursor-pointer ${
                              active
                                ? "text-white shadow-md shadow-indigo-950/40"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                            }`}
                          >
                            {active && (
                              <motion.div
                                layoutId="sidebarActiveView"
                                className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 border border-white/20 shadow-md"
                                transition={{ type: "spring", stiffness: 450, damping: 35 }}
                              />
                            )}
                            {active && (
                              <span
                                aria-hidden="true"
                                className="relative z-10 h-4 w-1 shrink-0 rounded-full bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.8)]"
                              />
                            )}
                            <span className="relative z-10 flex flex-1 items-center gap-2.5 min-w-0">
                              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-amber-300" : "text-muted-foreground"}`} />
                              <span className="truncate">{item.label}</span>
                            </span>
                            <div className="relative z-10 flex items-center gap-1 shrink-0">
                              <span
                                className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                  active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {item.tag}
                              </span>
                              {active && <ChevronRight className="h-3.5 w-3.5 text-white/90" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  </div>
                </div>

                {/* Zone 3: Pinned Account & Settings Profile Card */}
                <div className="shrink-0 pt-3 border-t border-border">
                  <div className="rounded-2xl border border-border bg-card/60 dark:bg-slate-900/60 p-2.5 2xl:p-3 shadow-lg backdrop-blur-md flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative flex h-9 w-9 2xl:h-10 2xl:w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-orange-500 via-coral-500 to-amber-500 p-0.5 shadow-md shadow-orange-500/20 ring-2 ring-border">
                        <div className="flex h-full w-full items-center justify-center rounded-full bg-card dark:bg-slate-950 font-bold text-xs 2xl:text-sm text-foreground dark:text-white">
                          {userInitial}
                        </div>
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 2xl:h-3 2xl:w-3 rounded-full bg-emerald-500 ring-2 ring-background" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-foreground leading-tight">
                          {user?.username || "Guest Operator"}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30 truncate">
                            {roleLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Single Unified Settings Trigger */}
                    <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          title="Settings"
                          aria-label="Settings"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border transition cursor-pointer"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      {settingsPopoverBody}
                    </Popover>
                  </div>
                </div>
              </>
            );

            return (
              <>
                {/* Mobile / Tablet (< lg): Compact Ubuntu-Docs-style contextual navigation bar */}
                {isMobile && (
                  <div
                    className={
                      isBottom
                        ? "fixed bottom-0 inset-x-0 z-40 px-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
                        : "w-full px-2.5 pt-2.5 sm:px-4 lg:hidden"
                    }
                  >
                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card/90 px-3 py-2 shadow-md backdrop-blur-md">
                      <button
                        type="button"
                        onClick={() => onMobileDrawerOpenChange?.(true)}
                        aria-expanded={mobileDrawerOpen}
                        aria-label="Open navigation menu"
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm">
                          <Menu className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                            <span className="rounded bg-blue-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-600 dark:text-blue-300 border border-blue-500/25 shrink-0">
                              {activeStoreItem?.code ?? targetStoreCode}
                            </span>
                            <span className="truncate">{activeViewItem?.label ?? "Dashboard"}</span>
                          </span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            Tap to switch store or module
                          </span>
                        </span>
                      </button>

                      {onToggleNav && (
                        <button
                          type="button"
                          onClick={onToggleNav}
                          title="Switch to Ubuntu Dock View"
                          aria-label="Switch to Ubuntu Dock view"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                        >
                          <PanelLeftClose className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Mobile / Tablet (< lg): Off-canvas slide-over drawer (Left or Right) */}
                <AnimatePresence>
                  {isMobile && mobileDrawerOpen && (
                    <>
                      <motion.div
                        key="nav-drawer-scrim"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="filter-scrim lg:hidden"
                        role="presentation"
                        onClick={() => onMobileDrawerOpenChange?.(false)}
                      />
                      <motion.aside
                        key="nav-drawer-panel"
                        aria-label="Detailed Navigation Drawer"
                        initial={{ x: isRight ? "100%" : "-100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: isRight ? "100%" : "-100%" }}
                        transition={{ type: "spring", stiffness: 380, damping: 36 }}
                        className={`glossy-sidebar fixed inset-y-0 ${
                          isRight ? "right-0 border-l" : "left-0 border-r"
                        } z-50 flex w-[min(86vw,20rem)] flex-col p-3.5 sm:p-4 text-foreground border-border shadow-2xl lg:hidden`}
                      >
                        {detailedSidebarContent}
                      </motion.aside>
                    </>
                  )}
                </AnimatePresence>

                {/* Desktop (lg+): Vertical Rail (Left / Right) OR Windows-style Horizontal Taskbar (Top / Bottom) */}
                {!isMobile && !isHorizontal && (
                  <>
                    <div
                      aria-hidden="true"
                      className={`hidden lg:block w-60 xl:w-64 2xl:w-72 shrink-0 ${isRight ? "lg:order-last" : ""}`}
                    />
                    <aside
                      aria-label="Detailed Navigation Sidebar"
                      className={`glossy-sidebar hidden lg:flex w-60 xl:w-64 2xl:w-72 flex-col shrink-0 p-4 fixed ${
                        isRight ? "right-0 border-l" : "left-0 border-r"
                      } top-[var(--topbar-h,5.25rem)] h-[calc(100vh-var(--topbar-h,5.25rem))] text-foreground border-border shadow-xl z-40`}
                    >
                      {detailedSidebarContent}
                    </aside>
                  </>
                )}

                {!isMobile && isHorizontal && (
                  <aside
                    aria-label="Horizontal Taskbar Navigation"
                    className={`glossy-sidebar hidden lg:flex fixed inset-x-0 z-40 items-center justify-between gap-3 px-4 py-2 text-foreground border-border shadow-xl ${
                      isBottom ? "bottom-0 border-t" : "top-[var(--topbar-h,5.25rem)] border-b"
                    }`}
                  >
                    {/* Left: Brand + Collapse to Dock + Admin Return */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 text-white shadow-sm">
                        <ShoppingBag className="h-4 w-4 shrink-0" />
                      </div>
                      <span className="text-xs font-extrabold tracking-tight text-foreground hidden xl:inline">
                        CITIMART
                      </span>
                      {onToggleNav && (
                        <button
                          type="button"
                          onClick={onToggleNav}
                          title="Switch to Ubuntu Dock View"
                          aria-label="Switch to Ubuntu Dock view"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                        >
                          <PanelLeftClose className="h-4 w-4" />
                        </button>
                      )}
                      {isSwitchedFromAdmin && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await switchAccount("ADMINISTRATOR");
                              toast.success("Returned to Administrator view");
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Failed to return to Administrator");
                            }
                          }}
                          className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-400 px-2 py-1 text-[11px] font-bold text-slate-950 shadow transition cursor-pointer"
                        >
                          Return Admin
                        </button>
                      )}
                    </div>

                    {/* Center: Stores + Modules */}
                    <div className="flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                      {!isManager &&
                        storeNavItems.map((item) => {
                          const active = effectiveStore === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectStore(item.id as DailyStoreSel)}
                              className={`shrink-0 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                                active
                                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                              }`}
                            >
                              <span className="font-mono text-[10px] font-bold">{item.code}</span>
                              <span className="hidden 2xl:inline">{item.label}</span>
                            </button>
                          );
                        })}

                      <div className="h-5 w-px bg-border shrink-0 mx-1" />

                      {viewItems.map((item) => {
                        const active = effectiveView === item.id;
                        const Icon = item.Icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectView(item.id)}
                            className={`shrink-0 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                              active
                                ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                            }`}
                          >
                            <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-amber-300" : ""}`} />
                            <span className="whitespace-nowrap">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Right: User + Settings */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="hidden xl:inline text-xs font-semibold text-muted-foreground truncate max-w-[8rem]">
                        {user?.username || "Guest"}
                      </span>
                      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            title="Settings"
                            aria-label="Settings"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border transition cursor-pointer"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                        </PopoverTrigger>
                        {settingsPopoverBody}
                      </Popover>
                    </div>
                  </aside>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* Confirmation Dialog for Log Out */}
      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent className="sm:max-w-md bg-card text-foreground border-border">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                <LogOut className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Confirm Log Out</DialogTitle>
                <DialogDescription className="mt-1 text-muted-foreground">
                  Are you sure you want to log out from the dashboard?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2 sm:justify-end">
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
              onClick={() => setShowLogoutConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setShowLogoutConfirm(false);
                await signOut();
                navigate("/", { replace: true });
              }}
            >
              Yes, Log Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
