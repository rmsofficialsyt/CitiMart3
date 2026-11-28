import { useState, useEffect } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Droplets,
  ExternalLink,
  Flame,
  Layers,
  LineChart,
  LogIn,
  MapPin,
  Navigation,
  PackageCheck,
  Percent,
  Receipt,
  Scale,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { STORE_NAME_BY_CODE } from "@/lib/authUsers";
import { fmtDateDot } from "@/lib/format";
import citimartLogo from "@/assets/citimart-logo.png";
import { LegalNoticeModal, type LegalDocType } from "@/components/LegalNoticeModal";

type StoreKey = "all" | "NM" | "HB" | "CHW";

interface HourlyPoint {
  time: string;
  value: number; // percentage 0 - 100
  amount: string; // e.g. "₹84,500"
  isPeak?: boolean;
}

interface StoreTelemetry {
  name: string;
  subtitle: string;
  sales: string;
  salesGrowth: string;
  footfall: string;
  conversion: string;
  atv: string;
  basket: string;
  peakRush: string;
  hourlyPoints: HourlyPoint[];
  linePath: string;
  areaPath: string;
  categories: { name: string; icon: any; growth: string }[];
}

const TELEMETRY_DATA: Record<StoreKey, StoreTelemetry> = {
  all: {
    name: "Consolidated (All 3 Stores)",
    subtitle: "Real-time network aggregate feed",
    sales: "₹4,86,250",
    salesGrowth: "+8.4% vs target",
    footfall: "3,420",
    conversion: "36.2%",
    atv: "₹1,240",
    basket: "3.8 units",
    peakRush: "05:00 PM – 08:30 PM",
    hourlyPoints: [
      { time: "11 AM", value: 35, amount: "₹38,200" },
      { time: "01 PM", value: 62, amount: "₹68,500" },
      { time: "03 PM", value: 48, amount: "₹52,000" },
      { time: "05 PM", value: 86, amount: "₹94,800", isPeak: true },
      { time: "07 PM", value: 100, amount: "₹1,12,400", isPeak: true },
      { time: "09 PM", value: 68, amount: "₹76,100" },
      { time: "11 PM", value: 28, amount: "₹31,000" },
    ],
    linePath: "M 20 85 C 50 85, 60 58, 80 58 C 110 58, 120 72, 140 72 C 170 72, 180 34, 200 34 C 230 34, 240 20, 260 20 C 290 20, 300 52, 320 52 C 350 52, 360 92, 380 92",
    areaPath: "M 20 85 C 50 85, 60 58, 80 58 C 110 58, 120 72, 140 72 C 170 72, 180 34, 200 34 C 230 34, 240 20, 260 20 C 290 20, 300 52, 320 52 C 350 52, 360 92, 380 92 L 380 115 L 20 115 Z",
    categories: [
      { name: "Apparel & Fashion", icon: ShoppingBag, growth: "+14.2%" },
      { name: "FMCG & Groceries", icon: ShoppingCart, growth: "+18.6%" },
      { name: "Personal Care", icon: PackageCheck, growth: "+9.8%" },
      { name: "Home Essentials", icon: Layers, growth: "+11.4%" },
    ],
  },
  NM: {
    name: "New Market (Flagship)",
    subtitle: "Lindsay Street · Central Kolkata",
    sales: "₹2,18,400",
    salesGrowth: "+11.2% vs target",
    footfall: "1,490",
    conversion: "38.5%",
    atv: "₹1,380",
    basket: "4.1 units",
    peakRush: "04:30 PM – 08:00 PM",
    hourlyPoints: [
      { time: "11 AM", value: 40, amount: "₹18,500" },
      { time: "01 PM", value: 68, amount: "₹32,400" },
      { time: "03 PM", value: 54, amount: "₹25,800" },
      { time: "05 PM", value: 92, amount: "₹45,200", isPeak: true },
      { time: "07 PM", value: 100, amount: "₹51,600", isPeak: true },
      { time: "09 PM", value: 74, amount: "₹36,100" },
      { time: "11 PM", value: 32, amount: "₹15,200" },
    ],
    linePath: "M 20 80 C 50 80, 60 52, 80 52 C 110 52, 120 66, 140 66 C 170 66, 180 28, 200 28 C 230 28, 240 20, 260 20 C 290 20, 300 46, 320 46 C 350 46, 360 88, 380 88",
    areaPath: "M 20 80 C 50 80, 60 52, 80 52 C 110 52, 120 66, 140 66 C 170 66, 180 28, 200 28 C 230 28, 240 20, 260 20 C 290 20, 300 46, 320 46 C 350 46, 360 88, 380 88 L 380 115 L 20 115 Z",
    categories: [
      { name: "Apparel & Fashion", icon: ShoppingBag, growth: "+16.8%" },
      { name: "FMCG & Groceries", icon: ShoppingCart, growth: "+19.4%" },
      { name: "Personal Care", icon: PackageCheck, growth: "+12.1%" },
      { name: "Home Essentials", icon: Layers, growth: "+13.5%" },
    ],
  },
  HB: {
    name: "Hatibagan (North Hub)",
    subtitle: "Bidhan Sarani · North Kolkata",
    sales: "₹1,42,600",
    salesGrowth: "+6.8% vs target",
    footfall: "1,080",
    conversion: "34.1%",
    atv: "₹1,120",
    basket: "3.5 units",
    peakRush: "05:30 PM – 09:00 PM",
    hourlyPoints: [
      { time: "11 AM", value: 30, amount: "₹11,400" },
      { time: "01 PM", value: 52, amount: "₹19,800" },
      { time: "03 PM", value: 45, amount: "₹17,200" },
      { time: "05 PM", value: 80, amount: "₹30,500", isPeak: true },
      { time: "07 PM", value: 96, amount: "₹36,800", isPeak: true },
      { time: "09 PM", value: 72, amount: "₹27,600" },
      { time: "11 PM", value: 24, amount: "₹9,200" },
    ],
    linePath: "M 20 90 C 50 90, 60 68, 80 68 C 110 68, 120 75, 140 75 C 170 75, 180 40, 200 40 C 230 40, 240 24, 260 24 C 290 24, 300 48, 320 48 C 350 48, 360 96, 380 96",
    areaPath: "M 20 90 C 50 90, 60 68, 80 68 C 110 68, 120 75, 140 75 C 170 75, 180 40, 200 40 C 230 40, 240 24, 260 24 C 290 24, 300 48, 320 48 C 350 48, 360 96, 380 96 L 380 115 L 20 115 Z",
    categories: [
      { name: "Apparel & Fashion", icon: ShoppingBag, growth: "+11.5%" },
      { name: "FMCG & Groceries", icon: ShoppingCart, growth: "+17.2%" },
      { name: "Personal Care", icon: PackageCheck, growth: "+8.4%" },
      { name: "Home Essentials", icon: Layers, growth: "+10.2%" },
    ],
  },
  CHW: {
    name: "Chowringhee (Prime Central)",
    subtitle: "JL Nehru Road · Central Kolkata",
    sales: "₹1,25,250",
    salesGrowth: "+7.1% vs target",
    footfall: "850",
    conversion: "35.8%",
    atv: "₹1,210",
    basket: "3.7 units",
    peakRush: "01:00 PM – 03:00 PM & 06:00 PM – 08:30 PM",
    hourlyPoints: [
      { time: "11 AM", value: 36, amount: "₹10,200" },
      { time: "01 PM", value: 74, amount: "₹21,100", isPeak: true },
      { time: "03 PM", value: 52, amount: "₹14,800" },
      { time: "05 PM", value: 78, amount: "₹22,300" },
      { time: "07 PM", value: 92, amount: "₹26,400", isPeak: true },
      { time: "09 PM", value: 62, amount: "₹17,700" },
      { time: "11 PM", value: 26, amount: "₹7,500" },
    ],
    linePath: "M 20 84 C 50 84, 60 46, 80 46 C 110 46, 120 68, 140 68 C 170 68, 180 42, 200 42 C 230 42, 240 28, 260 28 C 290 28, 300 58, 320 58 C 350 58, 360 94, 380 94",
    areaPath: "M 20 84 C 50 84, 60 46, 80 46 C 110 46, 120 68, 140 68 C 170 68, 180 42, 200 42 C 230 42, 240 28, 260 28 C 290 28, 300 58, 320 58 C 350 58, 360 94, 380 94 L 380 115 L 20 115 Z",
    categories: [
      { name: "Apparel & Fashion", icon: ShoppingBag, growth: "+13.0%" },
      { name: "FMCG & Groceries", icon: ShoppingCart, growth: "+18.1%" },
      { name: "Personal Care", icon: PackageCheck, growth: "+9.0%" },
      { name: "Home Essentials", icon: Layers, growth: "+10.8%" },
    ],
  },
};

const STORES = [
  {
    code: "NM" as const,
    name: "New Market",
    badge: "Flagship Retail",
    location: "Lindsay Street, Central Kolkata",
    mapQuery: "New Market, Lindsay Street, Kolkata, West Bengal",
    coords: { lat: 22.5606, lng: 88.3532 },
    counters: "12 POS Counters",
    sqft: "18,500 sq.ft Floor",
    username: STORE_NAME_BY_CODE.NM,
  },
  {
    code: "HB" as const,
    name: "Hatibagan",
    badge: "North Hub",
    location: "Bidhan Sarani, North Kolkata",
    mapQuery: "Hatibagan, Bidhan Sarani, Kolkata, West Bengal",
    coords: { lat: 22.596, lng: 88.3687 },
    counters: "8 POS Counters",
    sqft: "14,200 sq.ft Floor",
    username: STORE_NAME_BY_CODE.HB,
  },
  {
    code: "CHW" as const,
    name: "Chowringhee",
    badge: "Prime Central",
    location: "JL Nehru Road, Central Kolkata",
    mapQuery: "Chowringhee, Jawaharlal Nehru Road, Kolkata, West Bengal",
    coords: { lat: 22.5558, lng: 88.3516 },
    counters: "10 POS Counters",
    sqft: "16,000 sq.ft Floor",
    username: STORE_NAME_BY_CODE.CHW,
  },
];

const RETAIL_CAPABILITIES = [
  {
    icon: Receipt,
    badge: "POS & Billing",
    title: "Hourly Bill & NOB Tracking",
    body: "Real-time capture of Net Billing Amount, Number of Bills (NOB), and counter throughput with automated 12-hour operational slots.",
  },
  {
    icon: Users,
    badge: "Floor Velocity",
    title: "Footfall & Conversion Yield",
    body: "Measure customer walk-ins against successful billing to monitor floor conversion rates, peak rush hours, and staff efficiency.",
  },
  {
    icon: TrendingUp,
    badge: "FMCG Economics",
    title: "Basket Size, ATV & RPV",
    body: "In-depth calculation of Average Transaction Value (ATV), Revenue Per Visitor (RPV), and units per basket across departmental lines.",
  },
  {
    icon: LineChart,
    badge: "Executive Insights",
    title: "Multi-Store Targets & PDF Digest",
    body: "Consolidated sales vs target benchmarks, automated midnight data rollups, and one-click executive PDF report generation.",
  },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
};

import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";

export function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const isGlassy = theme === "glassy";
  const isManager = user?.role === "manager";
  const [activeTab, setActiveTab] = useState<StoreKey>("all");
  const [selectedMapStore, setSelectedMapStore] = useState<"NM" | "HB" | "CHW">("NM");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [hoveredPoint, setHoveredPoint] = useState<HourlyPoint | null>(null);

  // Legal & Info modal state with deep linking
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocType>("about");

  const openLegalDoc = (doc: LegalDocType) => {
    setActiveLegalDoc(doc);
    setIsLegalModalOpen(true);
    window.history.replaceState(null, "", `#${doc}`);
  };

  const handleLegalModalClose = (open: boolean) => {
    setIsLegalModalOpen(open);
    if (!open && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").toLowerCase();
      if (hash === "about" || hash === "terms" || hash === "privacy") {
        setActiveLegalDoc(hash as LegalDocType);
        setIsLegalModalOpen(true);
      }
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Fetch authentic previous day / latest telemetry directly from MongoDB
  const { data: heroData } = useQuery({
    queryKey: ["landing-hero", selectedDate],
    queryFn: () => api.landingHero(selectedDate || undefined),
    staleTime: 60_000,
  });

  const rawFallback = TELEMETRY_DATA[activeTab];
  const liveStore = heroData?.stores?.[activeTab];

  const data: StoreTelemetry = liveStore
    ? {
        ...rawFallback,
        name: liveStore.name || rawFallback.name,
        subtitle: liveStore.subtitle || rawFallback.subtitle,
        sales: liveStore.sales || rawFallback.sales,
        salesGrowth: liveStore.salesGrowth || rawFallback.salesGrowth,
        footfall: liveStore.footfall || rawFallback.footfall,
        conversion: liveStore.conversion || rawFallback.conversion,
        atv: liveStore.atv || rawFallback.atv,
        basket: liveStore.basket || rawFallback.basket,
        hourlyPoints:
          liveStore.hourlyPoints && liveStore.hourlyPoints.length > 0
            ? liveStore.hourlyPoints
            : rawFallback.hourlyPoints,
      }
    : rawFallback;

  // Map 7 points to x-coordinates: 20, 80, 140, 200, 260, 320, 380
  const xCoords = [20, 80, 140, 200, 260, 320, 380];

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[linear-gradient(125deg,#7a151a_0%,#3d1538_38%,#193066_75%,#101f44_100%)] glassy:bg-[linear-gradient(135deg,#dbeafe_0%,#eff6ff_38%,#e0e7ff_74%,#f0f9ff_100%)] text-slate-100 glassy:text-slate-900 selection:bg-[#b52026] selection:text-white">
      {/* Background Animated SVG Financial Line Graph & Ambient Glow Orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Large sweeping background Line Chart Graphic */}
        <svg
          className="absolute top-0 left-0 w-full h-[650px] opacity-25"
          viewBox="0 0 1440 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="bgLineGradPrimary" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#e11d48" stopOpacity="0.35" />
              <stop offset="35%" stopColor="#b52026" stopOpacity="0.85" />
              <stop offset="70%" stopColor="#6366f1" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.45" />
            </linearGradient>
            <linearGradient id="bgAreaGradPrimary" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#b52026" stopOpacity="0.16" />
              <stop offset="50%" stopColor="#23407d" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#0a0d16" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="bgLineGradSecondary" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.15" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#23407d" stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines */}
          <line x1="0" y1="120" x2="1440" y2="120" stroke={isGlassy ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.03)"} strokeDasharray="6 6" />
          <line x1="0" y1="240" x2="1440" y2="240" stroke={isGlassy ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.03)"} strokeDasharray="6 6" />
          <line x1="0" y1="360" x2="1440" y2="360" stroke={isGlassy ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.03)"} strokeDasharray="6 6" />
          <line x1="0" y1="480" x2="1440" y2="480" stroke={isGlassy ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.03)"} strokeDasharray="6 6" />

          {/* Secondary Revenue Line */}
          <motion.path
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.6 }}
            transition={{ duration: 2.2, ease: "easeInOut" }}
            d="M 0,380 C 180,340 320,420 480,310 C 640,200 800,280 960,180 C 1120,80 1280,190 1440,110"
            stroke="url(#bgLineGradSecondary)"
            strokeWidth="2"
            strokeDasharray="4 4"
            fill="none"
          />

          {/* Primary Main Line Graph Area */}
          <motion.path
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.8, delay: 0.5 }}
            d="M 0,320 C 160,280 280,350 440,220 C 600,90 760,190 920,110 C 1080,30 1240,120 1440,40 L 1440,600 L 0,600 Z"
            fill="url(#bgAreaGradPrimary)"
          />

          {/* Primary Main Stroke Line */}
          <motion.path
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 2.5, ease: "easeInOut" }}
            d="M 0,320 C 160,280 280,350 440,220 C 600,90 760,190 920,110 C 1080,30 1240,120 1440,40"
            stroke="url(#bgLineGradPrimary)"
            strokeWidth="3.5"
            fill="none"
          />

          {/* Animated Glowing Peak Nodes */}
          <motion.circle
            cx="440"
            cy="220"
            r="5"
            fill="#f43f5e"
            animate={{ r: [4, 7, 4], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <motion.circle
            cx="920"
            cy="110"
            r="6"
            fill="#818cf8"
            animate={{ r: [5, 8, 5], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
          />
          <motion.circle
            cx="1440"
            cy="40"
            r="6"
            fill="#3b82f6"
            animate={{ r: [5, 9, 5], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 2.8, repeat: Infinity, delay: 1 }}
          />
        </svg>

        {/* Ambient Glowing Orbs (CITIMART Red & Royal Blue) */}
        <motion.div
          aria-hidden
          className="absolute -top-[18%] -left-[6%] h-[42rem] w-[42rem] rounded-full bg-[#dc2626]/30 glassy:bg-sky-400/35 blur-[130px]"
          animate={{
            x: [0, 40, 0],
            y: [0, 30, 0],
            scale: [1, 1.12, 1],
          }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute top-[22%] -right-[8%] h-[40rem] w-[40rem] rounded-full bg-[#2563eb]/30 glassy:bg-indigo-400/30 blur-[130px]"
          animate={{
            x: [0, -45, 0],
            y: [0, 40, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_25%,rgba(10,13,22,0.45)_100%)] glassy:opacity-15" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      {/* Seamless Landing Header (Blends with page BG, No Divider) */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative z-50 bg-transparent px-4 pt-5 pb-2 sm:px-6 2xl:px-10"
      >
        <div className="mx-auto flex max-w-7xl 2xl:max-w-[1440px] items-center justify-between gap-3 sm:gap-4">
          <motion.div
            whileHover={{ scale: 1.03 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="inline-flex items-center"
          >
            <img
              src={citimartLogo}
              alt="CITIMART - Value for Money Re-defined"
              className="h-9 w-auto sm:h-11 object-contain drop-shadow-md"
            />
          </motion.div>

          <div className="flex items-center gap-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="hidden sm:inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-black/25 glassy:border-white/80 glassy:bg-white/65 px-3.5 py-1 text-xs font-medium text-emerald-200 glassy:text-emerald-800 backdrop-blur"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span>Store Operations Active (10:30 AM – 11:59 PM)</span>
            </motion.div>

            <button
              type="button"
              onClick={() => setTheme(isGlassy ? "light" : "glassy")}
              aria-label={isGlassy ? "Switch to Classic Theme" : "Switch to Glassy Theme"}
              title={isGlassy ? "Switch to Classic Theme" : "Switch to Glassy Theme"}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border backdrop-blur-sm transition-colors cursor-pointer ${
                isGlassy
                  ? "border-white/80 bg-white/70 text-blue-700 shadow-sm hover:bg-white"
                  : "border-white/25 bg-white/10 text-white/90 hover:bg-white/20"
              }`}
            >
              <Droplets className="h-3.5 w-3.5" />
            </button>

            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button
                size="sm"
                className="bg-white/15 font-semibold text-white border border-white/30 glassy:border-white/80 glassy:bg-white/70 glassy:text-slate-900 glassy:hover:bg-white shadow-md backdrop-blur-sm hover:bg-white/25 transition-colors"
                onClick={() => navigate("/login")}
              >
                <LogIn className="h-4 w-4 mr-1.5" />
                Portal Access
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.header>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex max-w-7xl 2xl:max-w-[1440px] flex-col gap-10 px-4 py-6 sm:px-6 md:gap-16 md:py-10 2xl:px-10"
      >
        {/* Hero Section */}
        <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div variants={itemVariants}>
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="inline-flex items-center gap-2 rounded-full border border-rose-500/35 bg-gradient-to-r from-[#b52026]/20 to-[#23407d]/25 glassy:border-white/80 glassy:bg-white/65 glassy:bg-none px-3.5 py-1 text-xs font-semibold text-rose-200 glassy:text-blue-700 backdrop-blur mb-4 shadow-xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-rose-400 glassy:text-blue-600 animate-pulse" />
              Retail & FMCG Commercial Intelligence
            </motion.div>

            <h1 className="text-3xl leading-[1.15] font-extrabold sm:text-4xl md:text-5xl tracking-tight">
              Real-Time Retail Analytics &{" "}
              <span className="bg-gradient-to-r from-rose-400 via-white to-blue-400 glassy:from-[#b52026] glassy:via-slate-900 glassy:to-[#23407d] bg-clip-text text-transparent">
                Daily Store Operations
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-base text-slate-300 glassy:text-slate-600 leading-relaxed">
              CITIMART's unified retail operations platform for store managers and leadership. Track live hourly
              POS throughput, footfall conversion yield, basket sizes, and automated store performance digests.
            </p>

            {/* 3 Active Stores Badges at a Glance */}
            <div className="lg-glass-surface mt-5 rounded-2xl border border-white/15 bg-slate-900/60 glassy:border-white/80 glassy:bg-white/60 p-3.5 backdrop-blur-md shadow-lg glassy:shadow-[0_12px_36px_rgba(30,58,138,0.12),inset_0_1px_0_rgba(255,255,255,0.85)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-300 glassy:text-blue-700 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5 text-blue-400 glassy:text-blue-600" />
                  <span>3 Flagship Retail Stores · Kolkata</span>
                </span>
                <span className="text-[10px] text-emerald-400 glassy:text-emerald-700 font-semibold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> All Stores Active
                </span>
              </div>
              <div className="grid grid-cols-1 min-[380px]:grid-cols-3 gap-2">
                {[
                  { name: "New Market", code: "NM", sub: "Lindsay Street", border: "border-blue-500/40 hover:border-blue-400 glassy:border-blue-300/80", bg: "bg-blue-500/10 hover:bg-blue-500/20 glassy:bg-white/60 glassy:hover:bg-white/85" },
                  { name: "Hatibagan", code: "HB", sub: "Bidhan Sarani", border: "border-emerald-500/40 hover:border-emerald-400 glassy:border-emerald-300/80", bg: "bg-emerald-500/10 hover:bg-emerald-500/20 glassy:bg-white/60 glassy:hover:bg-white/85" },
                  { name: "Chowringhee", code: "CHW", sub: "JL Nehru Road", border: "border-amber-500/40 hover:border-amber-400 glassy:border-amber-300/80", bg: "bg-amber-500/10 hover:bg-amber-500/20 glassy:bg-white/60 glassy:hover:bg-white/85" },
                ].map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => setActiveTab(s.code as StoreKey)}
                    className={`group rounded-xl border p-2 text-left transition-all ${s.border} ${s.bg} hover:scale-[1.02] hover:shadow-md cursor-pointer`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-black/50 glassy:bg-slate-900 text-white border border-white/10">
                        {s.code}
                      </span>
                      <span className="h-2 w-2 rounded-full bg-emerald-400 group-hover:scale-125 transition-transform" />
                    </div>
                    <div className="mt-1.5 font-bold text-xs text-white glassy:text-slate-900 group-hover:text-blue-200 glassy:group-hover:text-blue-700 transition-colors truncate">
                      {s.name}
                    </div>
                    <div className="text-[10px] text-slate-400 glassy:text-slate-600 truncate">{s.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="mt-6 flex flex-wrap gap-2.5">
              <motion.span
                whileHover={{ y: -2 }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 glassy:border-white/80 glassy:bg-white/65 px-3 py-1.5 text-xs text-slate-300 glassy:text-slate-700 transition-colors hover:border-white/20 hover:bg-white/10"
              >
                <Store className="h-3.5 w-3.5 text-blue-400 glassy:text-blue-600" /> 3 Flagship Stores
              </motion.span>
              <motion.span
                whileHover={{ y: -2 }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 glassy:border-white/80 glassy:bg-white/65 px-3 py-1.5 text-xs text-slate-300 glassy:text-slate-700 transition-colors hover:border-white/20 hover:bg-white/10"
              >
                <Clock className="h-3.5 w-3.5 text-amber-400 glassy:text-amber-600" /> 12-Hour Operational Slots
              </motion.span>
              <motion.span
                whileHover={{ y: -2 }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 glassy:border-white/80 glassy:bg-white/65 px-3 py-1.5 text-xs text-slate-300 glassy:text-slate-700 transition-colors hover:border-white/20 hover:bg-white/10"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 glassy:text-emerald-600" /> Role-Scoped Security
              </motion.span>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-[#b52026] via-[#8f1d3b] to-[#23407d] px-6 font-semibold text-white border border-white/20 shadow-xl shadow-[#b52026]/25 hover:from-[#c8252c] hover:to-[#2b4d96] transition-all"
                  onClick={() => navigate("/login")}
                >
                  Launch Portal <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
              <p className="text-xs text-slate-400 glassy:text-slate-600">
                Internal workspace for store managers & admin
              </p>
            </div>
          </motion.div>

          {/* Interactive Retail & FMCG Telemetry Showcase Card with Smooth SVG Line Graph (Admin & Leadership Only) */}
          {isManager ? (
            <motion.div
              variants={itemVariants}
              whileHover={{ y: -3 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="lg-glass-surface relative overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-br from-[#1a1019]/95 via-slate-900/85 to-[#152246]/70 glassy:border-white/80 glassy:bg-white/65 glassy:bg-none glassy:text-slate-900 p-6 sm:p-8 backdrop-blur-xl shadow-2xl glassy:shadow-[0_20px_56px_rgba(30,58,138,0.14),inset_0_1px_0_rgba(255,255,255,0.9)]"
            >
              <div className="flex items-center gap-2 rounded-full border border-rose-400/30 bg-gradient-to-r from-[#b52026]/20 to-[#23407d]/25 glassy:border-white/80 glassy:bg-white/70 glassy:bg-none px-3.5 py-1 text-xs font-semibold text-rose-200 glassy:text-blue-700 w-fit mb-4">
                <Store className="h-3.5 w-3.5 text-rose-400 glassy:text-blue-600" />
                <span>Store Manager Operations Hub</span>
              </div>
              <h2 className="text-xl font-bold text-white glassy:text-slate-900 sm:text-2xl">
                Welcome, Store Manager
              </h2>
              <p className="mt-2 text-sm text-slate-300 glassy:text-slate-600 leading-relaxed">
                You are currently signed in with a store manager account. Operational floor data entry, live time-slot logging, floor advisor directives, and store history are managed within your operational portal.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  size="default"
                  className="bg-gradient-to-r from-[#b52026] to-[#23407d] font-semibold text-white border border-white/20 shadow-lg shadow-[#b52026]/25 hover:from-[#c8252c] hover:to-[#2b4d96]"
                  onClick={() => navigate("/app")}
                >
                  <Store className="mr-2 h-4 w-4" /> Go to Store Dashboard
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  className="border-white/20 text-slate-200 hover:bg-white/10 glassy:border-slate-300/80 glassy:bg-white/75 glassy:text-slate-800 glassy:hover:bg-white"
                  onClick={() => navigate("/app", { replace: true })}
                >
                  Log Daily Operations
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              variants={itemVariants}
              whileHover={{ y: -3 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="lg-glass-surface relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#17111a]/90 via-slate-900/80 to-[#142040]/70 glassy:border-white/80 glassy:bg-white/65 glassy:bg-none glassy:text-slate-900 p-5 sm:p-6 backdrop-blur-xl shadow-2xl glassy:shadow-[0_20px_56px_rgba(30,58,138,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] transition-shadow hover:shadow-[#b52026]/15"
            >
              {/* Store Tab Switcher & MongoDB Date Selector */}
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 glassy:border-slate-300/60 pb-4">
                <div className="flex items-center gap-1.5 rounded-xl bg-black/40 p-1.5 border border-white/15 glassy:bg-slate-200/70 glassy:border-white/80 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {(
                    [
                      { id: "all", label: "Consolidated (All)", code: "ALL" },
                      { id: "NM", label: "New Market", code: "NM" },
                      { id: "HB", label: "Hatibagan", code: "HB" },
                      { id: "CHW", label: "Chowringhee", code: "CHW" },
                    ] as const
                  ).map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`relative rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 whitespace-nowrap flex items-center gap-1.5 ${
                          active
                            ? "text-white shadow-md"
                            : "text-slate-300 hover:text-white hover:bg-white/10 glassy:text-slate-700 glassy:hover:text-slate-900 glassy:hover:bg-white/75"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="activeStoreTab"
                            className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#b52026] to-[#23407d] shadow-md shadow-[#b52026]/25 border border-white/25"
                            transition={{ type: "spring", stiffness: 500, damping: 32 }}
                          />
                        )}
                        <span className={`relative z-10 text-[10px] font-mono px-1 py-0.2 rounded font-bold ${
                          active ? "bg-white/20 text-white" : "bg-white/10 text-slate-400 glassy:bg-white/80 glassy:text-slate-700"
                        }`}>
                          {tab.code}
                        </span>
                        <span className="relative z-10">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  {heroData?.available_dates && heroData.available_dates.length > 0 && (
                    <select
                      value={selectedDate || heroData.recorded_date}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-slate-800/90 text-slate-200 text-xs border border-white/15 rounded-lg px-2.5 py-1 glassy:bg-white/85 glassy:text-slate-800 glassy:border-slate-300/80 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      title="Select date from MongoDB"
                    >
                      {heroData.available_dates.map((d) => (
                        <option key={d} value={d} className="bg-slate-900 text-slate-200 glassy:bg-white glassy:text-slate-900">
                          {fmtDateDot(d)}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 glassy:border-emerald-400/60 glassy:text-emerald-800 whitespace-nowrap">
                    <Activity className="h-3 w-3 animate-pulse" /> Live Telemetry
                  </span>
                </div>
              </div>

              {/* Sub-header info */}
              <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-200 glassy:text-slate-900">{data.name}</p>
                <p className="text-[11px] text-slate-400 glassy:text-slate-600">{data.subtitle}</p>
              </div>
              <motion.div
                key={`peak-${activeTab}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1 text-[11px] text-amber-300 font-medium bg-amber-500/10 border border-amber-500/20 glassy:border-amber-400/50 glassy:bg-amber-500/15 glassy:text-amber-800 px-2 py-0.5 rounded-md"
              >
                <Flame className="h-3 w-3 text-amber-400 glassy:text-amber-600 shrink-0 animate-bounce" />
                <span>Peak: {data.peakRush}</span>
              </motion.div>
            </div>

            {/* Animated KPI grid showcase */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="mt-4 grid grid-cols-1 min-[400px]:grid-cols-2 auto-rows-fr gap-3"
              >
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="landing-glass-tile flex flex-col justify-between rounded-xl border border-white/15 border-t-2 border-t-emerald-400 bg-gradient-to-br from-slate-950/75 to-[#141f3d]/75 glassy:bg-none glassy:border-white/90 glassy:border-t-emerald-600 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-emerald-400/50"
                >
                  <p className="text-[11px] font-medium text-slate-300 glassy:text-slate-700 flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 text-emerald-400 glassy:text-emerald-600 shrink-0" /> POS Net Sales
                  </p>
                  <p className="mt-1.5 font-mono text-lg font-extrabold text-emerald-300 glassy:text-emerald-700 tracking-tight tabular-nums">{data.sales}</p>
                  <p className="mt-0.5 text-[10px] text-emerald-400 glassy:text-emerald-700 font-semibold">{data.salesGrowth}</p>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="landing-glass-tile flex flex-col justify-between rounded-xl border border-white/15 border-t-2 border-t-rose-400 bg-gradient-to-br from-[#1b1018]/75 to-[#141f3d]/75 glassy:bg-none glassy:border-white/90 glassy:border-t-rose-600 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-rose-400/50"
                >
                  <p className="text-[11px] font-medium text-slate-300 glassy:text-slate-700 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-rose-400 glassy:text-rose-600 shrink-0" /> Store Footfall
                  </p>
                  <p className="mt-1.5 font-mono text-lg font-extrabold text-rose-200 glassy:text-rose-700 tracking-tight tabular-nums">{data.footfall}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400 glassy:text-slate-600">Visitors today</p>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="landing-glass-tile flex flex-col justify-between rounded-xl border border-white/15 border-t-2 border-t-blue-400 bg-gradient-to-br from-slate-950/75 to-[#162752]/75 glassy:bg-none glassy:border-white/90 glassy:border-t-blue-600 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-blue-400/50"
                >
                  <p className="text-[11px] font-medium text-slate-300 glassy:text-slate-700 flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 text-blue-400 glassy:text-blue-600 shrink-0" /> Conversion Rate
                  </p>
                  <p className="mt-1.5 font-mono text-lg font-extrabold text-sky-200 glassy:text-blue-700 tracking-tight tabular-nums">{data.conversion}</p>
                  <p className="mt-0.5 text-[10px] text-emerald-400 glassy:text-emerald-700 font-semibold">High floor yield</p>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="landing-glass-tile flex flex-col justify-between rounded-xl border border-white/15 border-t-2 border-t-amber-400 bg-gradient-to-br from-[#1b1018]/75 to-slate-950/75 glassy:bg-none glassy:border-white/90 glassy:border-t-amber-600 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-amber-400/50"
                >
                  <p className="text-[11px] font-medium text-slate-300 glassy:text-slate-700 flex items-center gap-1.5">
                    <ShoppingBag className="h-3.5 w-3.5 text-amber-400 glassy:text-amber-600 shrink-0" /> Average Bill (ATV)
                  </p>
                  <p className="mt-1.5 font-mono text-lg font-extrabold text-amber-200 glassy:text-amber-700 tracking-tight tabular-nums">{data.atv}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400 glassy:text-slate-600">Basket: {data.basket}</p>
                </motion.div>
              </motion.div>
            </AnimatePresence>

            {/* Smooth Animated SVG Line Graph Card */}
            <div className="landing-glass-tile mt-4 rounded-xl border border-white/10 bg-black/30 glassy:bg-none glassy:border-white/90 p-3.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 glassy:text-slate-800 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <LineChart className="h-3.5 w-3.5 text-emerald-400 glassy:text-emerald-600" />
                  <span>Hourly Sales Trajectory Curve</span>
                </span>
                <span className="text-[10px] text-emerald-400 glassy:text-emerald-700 font-medium">
                  {hoveredPoint ? `${hoveredPoint.time}: ${hoveredPoint.amount}` : "Hover point for value"}
                </span>
              </div>

              {/* Line Graph SVG Container */}
              <div className="relative h-28 w-full pt-1">
                <svg
                  className="w-full h-full overflow-visible"
                  viewBox="0 0 400 120"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="cardLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f43f5e" />
                      <stop offset="50%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                    <linearGradient id="cardAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#b52026" stopOpacity="0.3" />
                      <stop offset="80%" stopColor="#23407d" stopOpacity="0.08" />
                      <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Guide Lines */}
                  <line x1="20" y1="20" x2="380" y2="20" stroke={isGlassy ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.06)"} strokeDasharray="3 3" />
                  <line x1="20" y1="60" x2="380" y2="60" stroke={isGlassy ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.06)"} strokeDasharray="3 3" />
                  <line x1="20" y1="100" x2="380" y2="100" stroke={isGlassy ? "rgba(15,23,42,0.1)" : "rgba(255,255,255,0.06)"} strokeDasharray="3 3" />

                  {/* Area Gradient Fill */}
                  <AnimatePresence mode="wait">
                    <motion.path
                      key={`area-${activeTab}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      d={data.areaPath}
                      fill="url(#cardAreaGrad)"
                    />
                  </AnimatePresence>

                  {/* Smooth Line Stroke */}
                  <AnimatePresence mode="wait">
                    <motion.path
                      key={`line-${activeTab}`}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      d={data.linePath}
                      stroke="url(#cardLineGrad)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </AnimatePresence>

                  {/* Data Points on Line Graph */}
                  {data.hourlyPoints.map((pt, index) => {
                    const cx = xCoords[index];
                    // Y calculation: 110 - (pt.value / 100) * 90
                    const cy = 110 - (pt.value / 100) * 90;
                    const isHovered = hoveredPoint?.time === pt.time;

                    return (
                      <g
                        key={`${activeTab}-${pt.time}`}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPoint(pt)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        {/* Hover Ring */}
                        {isHovered && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r="8"
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="2"
                            className="animate-pulse"
                          />
                        )}

                        {/* Peak indicator ring */}
                        {pt.isPeak && !isHovered && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r="6"
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="1.5"
                            opacity="0.6"
                          />
                        )}

                        {/* Solid point center */}
                        <motion.circle
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.1 * index }}
                          cx={cx}
                          cy={cy}
                          r={pt.isPeak ? 4.5 : 3.5}
                          fill={pt.isPeak ? "#34d399" : "#38bdf8"}
                          stroke={isGlassy ? "#ffffff" : "#0f172a"}
                          strokeWidth="1.5"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* X-axis Labels */}
              <div className="flex items-center justify-between text-[9px] text-slate-400 glassy:text-slate-600 font-medium px-1 mt-1">
                {data.hourlyPoints.map((pt) => (
                  <span
                    key={pt.time}
                    className={`transition-colors ${
                      pt.isPeak
                        ? "text-emerald-400 glassy:text-emerald-700 font-bold"
                        : hoveredPoint?.time === pt.time
                        ? "text-sky-300 glassy:text-blue-700 font-semibold"
                        : "text-slate-400 glassy:text-slate-600"
                    }`}
                  >
                    {pt.time}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
          )}
        </section>

        {/* Store Network Section */}
        <motion.section
          variants={itemVariants}
          className="space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-slate-100 glassy:text-slate-900 flex items-center gap-2">
                <Store className="h-5 w-5 text-rose-400 glassy:text-rose-600" />
                CITIMART Retail Network — Kolkata
              </h2>
              <p className="text-xs text-slate-300/80 glassy:text-slate-600 mt-0.5">
                Prime retail flagships equipped with real-time operations tracking
              </p>
            </div>
          </div>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-3 auto-rows-fr">
            {STORES.map((s) => {
              const isSelectedOnMap = selectedMapStore === s.code;
              const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.mapQuery)}`;
              return (
                <motion.div
                  key={s.name}
                  whileHover={{ y: -5, scale: 1.015 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  onClick={() => navigate(`/login?account=${encodeURIComponent(s.username)}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/login?account=${encodeURIComponent(s.username)}`);
                    }
                  }}
                  className={`landing-glass-card group relative flex h-full flex-col justify-between cursor-pointer overflow-hidden rounded-2xl border p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl transition-all duration-200 hover:border-rose-400/50 hover:shadow-[0_12px_32px_-8px_rgba(181,32,38,0.3)] ${
                    isSelectedOnMap
                      ? "border-rose-400/60 bg-gradient-to-br from-[#b52026]/25 via-slate-900/85 to-[#23407d]/35 glassy:bg-none glassy:border-rose-400/80"
                      : "border-white/15 bg-gradient-to-br from-[#1b1018]/85 via-slate-950/85 to-[#122146]/85 glassy:bg-none"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="rounded-xl border border-white/15 bg-gradient-to-br from-[#b52026]/30 to-[#23407d]/35 glassy:bg-rose-500/10 glassy:bg-none glassy:border-rose-300/70 p-2.5 text-rose-200 glassy:text-rose-700 group-hover:scale-110 transition-all">
                        <Store className="h-5 w-5" />
                      </div>
                      <span className="rounded-full border border-white/15 bg-white/10 glassy:bg-white/80 glassy:border-blue-200 px-2.5 py-0.5 text-[10px] font-semibold text-sky-200 glassy:text-blue-800">
                        {s.badge}
                      </span>
                    </div>

                    <h3 className="mt-4 font-bold text-white glassy:text-slate-900 text-base group-hover:text-rose-200 glassy:group-hover:text-rose-700 transition-colors">
                      CITIMART — {s.name}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-300/80 glassy:text-slate-600">
                      <MapPin className="h-3.5 w-3.5 text-rose-400 glassy:text-rose-600 shrink-0" />
                      <span className="truncate">{s.location}</span>
                    </p>
                  </div>

                  <div>
                    <div className="mt-4 border-t border-white/10 glassy:border-slate-300/60 pt-3 flex items-center justify-between text-[11px] text-slate-300 glassy:text-slate-700">
                      <span className="font-mono">{s.counters}</span>
                      <span className="text-slate-400 glassy:text-slate-600 font-mono">{s.sqft}</span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 text-xs font-semibold">
                      <span className="inline-flex items-center gap-1 text-rose-300 group-hover:text-white glassy:text-rose-700 glassy:group-hover:text-rose-900 transition-colors">
                        <span>Store Login</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMapStore(s.code);
                          }}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                            isSelectedOnMap
                              ? "border-white/30 bg-gradient-to-r from-[#b52026] to-[#23407d] text-white shadow-sm"
                              : "border-white/15 bg-white/10 text-slate-200 hover:border-white/30 hover:bg-white/20 hover:text-white glassy:border-slate-300/80 glassy:bg-white/75 glassy:text-slate-800 glassy:hover:bg-white"
                          }`}
                        >
                          <MapPin className="h-3 w-3" />
                          <span>Map</span>
                        </button>
                        <a
                          href={directionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 glassy:border-emerald-400/60 glassy:text-emerald-800 transition-colors hover:border-emerald-400/50 hover:bg-emerald-500/25"
                          title={`Directions to CITIMART ${s.name}`}
                        >
                          <Navigation className="h-3 w-3" />
                          <span>Directions</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Interactive OpenStreetMap Store Locator (Always Visible) */}
          {(() => {
            const activeStore = STORES.find((s) => s.code === selectedMapStore) ?? STORES[0];
            const { lat, lng } = activeStore.coords;
            const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.006},${lat - 0.004},${lng + 0.006},${lat + 0.004}&layer=mapnik&marker=${lat},${lng}`;
            const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              activeStore.mapQuery,
            )}`;
            const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
              activeStore.mapQuery,
            )}`;

            return (
              <div className="landing-glass-card rounded-2xl border border-white/15 bg-gradient-to-br from-[#1b1018]/85 via-slate-950/85 to-[#122146]/85 glassy:bg-none p-4 sm:p-5 backdrop-blur-xl shadow-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-white/10 glassy:border-slate-300/60">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/35 bg-gradient-to-r from-[#b52026]/25 to-[#23407d]/25 glassy:bg-white/80 glassy:bg-none glassy:border-rose-300/70 px-2.5 py-0.5 text-[11px] font-semibold text-rose-200 glassy:text-rose-700">
                        <MapPin className="h-3 w-3 text-rose-300 glassy:text-rose-600" />
                        Interactive Store Locator
                      </span>
                      <span className="text-xs text-slate-300/80 glassy:text-slate-600">{activeStore.badge}</span>
                    </div>
                    <h3 className="text-base font-bold text-white glassy:text-slate-900">
                      CITIMART — {activeStore.name}
                    </h3>
                    <p className="text-xs text-slate-300/80 glassy:text-slate-600">
                      {activeStore.location} &middot; {activeStore.counters} &middot; {activeStore.sqft}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {STORES.map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => setSelectedMapStore(s.code)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                          selectedMapStore === s.code
                            ? "border-white/30 bg-gradient-to-r from-[#b52026] to-[#23407d] text-white shadow-md"
                            : "border-white/15 bg-white/10 text-slate-200 hover:border-white/30 hover:bg-white/20 hover:text-white glassy:border-slate-300/80 glassy:bg-white/75 glassy:text-slate-800 glassy:hover:bg-white"
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}

                    <a
                      href={directionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/35 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 glassy:border-emerald-400/60 glassy:text-emerald-800 transition-colors hover:bg-emerald-500/30"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      <span>Directions</span>
                    </a>

                    <a
                      href={searchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white glassy:border-slate-300/80 glassy:bg-white/75 glassy:text-slate-800 transition-colors hover:border-white/35 hover:bg-white/20 glassy:hover:bg-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Open in Google Maps</span>
                    </a>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-white/15 glassy:border-white/80 bg-slate-900 glassy:bg-white/80 shadow-inner">
                  <iframe
                    key={activeStore.code}
                    title={`CITIMART ${activeStore.name} Map`}
                    src={osmEmbedUrl}
                    className="h-64 w-full sm:h-80 lg:h-96 2xl:h-[28rem] border-0 block"
                    allowFullScreen
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 glassy:border-slate-200 bg-slate-950/90 glassy:bg-white/85 px-3.5 py-2 text-[11px] text-slate-300 glassy:text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-rose-400 glassy:text-rose-600" />
                      <span>{activeStore.mapQuery}</span>
                    </span>
                    <span className="font-mono text-slate-400 glassy:text-slate-600">
                      {lat.toFixed(4)}° N, {lng.toFixed(4)}° E
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </motion.section>

        {/* Retail Capabilities Grid */}
        <motion.section
          variants={itemVariants}
          className="space-y-4"
        >
          <div>
            <h2 className="text-xl font-bold text-slate-100 glassy:text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-rose-400 glassy:text-rose-600" />
              Retail &amp; FMCG Operating Modules
            </h2>
            <p className="text-xs text-slate-300/80 glassy:text-slate-600 mt-0.5">
              Engineered specifically for departmental and supermarket retail velocity
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 auto-rows-fr">
            {RETAIL_CAPABILITIES.map((cap) => (
              <motion.div
                key={cap.title}
                whileHover={{ y: -4, scale: 1.015 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="landing-glass-card flex h-full flex-col justify-between rounded-2xl border border-white/15 bg-gradient-to-br from-[#1b1018]/85 via-slate-950/85 to-[#122146]/85 glassy:bg-none p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl transition-all hover:border-rose-400/45 hover:shadow-[0_12px_28px_-8px_rgba(35,64,125,0.35)]"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="rounded-xl border border-white/15 bg-gradient-to-br from-[#b52026]/25 to-[#23407d]/35 glassy:bg-rose-500/10 glassy:bg-none glassy:border-rose-300/70 p-2.5 text-rose-200 glassy:text-rose-700">
                      <cap.icon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-200/80 glassy:text-blue-700">
                      {cap.badge}
                    </span>
                  </div>
                  <h3 className="font-semibold text-white glassy:text-slate-900 text-sm">{cap.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300/80 glassy:text-slate-600">{cap.body}</p>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-[11px] text-emerald-400/90 glassy:text-emerald-700 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Integrated</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Bottom CTA Card */}
        <motion.section
          variants={itemVariants}
          whileHover={{ scale: 1.01 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="landing-glass-card rounded-2xl border border-rose-500/30 bg-gradient-to-r from-[#b52026]/25 via-slate-900/80 to-[#23407d]/35 glassy:bg-none p-6 sm:p-8 backdrop-blur text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl"
        >
          <div>
            <h3 className="text-xl font-bold text-white glassy:text-slate-900">Ready to access your store's dashboard?</h3>
            <p className="mt-1 text-sm text-slate-300 glassy:text-slate-600">
              Sign in with your store manager credentials or administrator account.
            </p>
          </div>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <Button
              size="lg"
              className="bg-gradient-to-r from-[#b52026] to-[#23407d] font-semibold text-white border border-white/20 shadow-lg shadow-[#b52026]/25 hover:from-[#c8252c] hover:to-[#2b4d96] shrink-0 transition-all"
              onClick={() => navigate("/login")}
            >
              Enter CITIMART Portal <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </motion.section>
      </motion.div>      {/* =========================================================================
          FOCUSED PRODUCTION FOOTER: ABOUT CITIMART, TERMS OF USE, PRIVACY POLICY
          ========================================================================= */}
      <footer className="relative mt-12 w-full bg-transparent text-slate-300 glassy:text-slate-700 z-10 overflow-hidden">
        <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] px-4 sm:px-6 2xl:px-10 py-10 sm:py-14">
          {/* Header Bar */}
          <div className="text-center sm:text-left mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center">
                <img
                  src={citimartLogo}
                  alt="CITIMART Retail"
                  className="h-8 w-auto object-contain drop-shadow-sm"
                />
              </div>
              <div>
                <h3 className="text-base font-bold text-white glassy:text-slate-900 tracking-tight">
                  CITIMART Daily Operations Suite
                </h3>
                <p className="text-xs text-rose-200/90 glassy:text-blue-700 font-medium">
                  Corporate Governance, Operational Guidelines &amp; Telemetry Policies
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300 glassy:text-slate-700 font-mono">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>DPDP Act 2023 &middot; Zero Customer PII Architecture</span>
            </div>
          </div>

          {/* 3 Main Things: About, Terms of Use, Privacy Policy */}
          <div className="grid grid-cols-1 md:grid-cols-3 auto-rows-fr gap-6 text-left">
            {/* 1. About CITIMART */}
            <div className="landing-glass-card rounded-2xl border border-white/15 bg-gradient-to-br from-[#1b1018]/85 via-slate-950/85 to-[#122146]/85 glassy:bg-none p-5 sm:p-6 flex flex-col justify-between shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl hover:border-rose-400/50 transition-all group">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="rounded-xl border border-white/15 bg-gradient-to-br from-[#b52026]/25 to-[#23407d]/35 glassy:bg-rose-500/10 glassy:bg-none glassy:border-rose-300/70 p-2 text-rose-200 glassy:text-rose-700 group-hover:scale-105 transition-all">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-200 bg-[#b52026]/20 glassy:bg-rose-500/10 glassy:text-rose-700 glassy:border-rose-300/70 px-2.5 py-0.5 rounded-full border border-rose-400/30">
                    Corporate Profile
                  </span>
                </div>
                <h4 className="text-base font-bold text-white glassy:text-slate-900 group-hover:text-rose-200 glassy:group-hover:text-rose-700 transition-colors">
                  About CITIMART
                </h4>
                <p className="text-xs text-slate-300/80 glassy:text-slate-600 leading-relaxed">
                  Decades of retail legacy anchoring 3 premier Kolkata department stores—New Market, Hatibagan, and Chowringhee. Transforming daily store operations through real-time intraday sales pacing, hourly footfall telemetry, and floor velocity intelligence.
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-white/10 glassy:border-slate-300/60">
                <button
                  type="button"
                  onClick={() => openLegalDoc("about")}
                  className="w-full inline-flex items-center justify-between text-xs font-semibold text-rose-200 hover:text-white glassy:text-rose-700 glassy:hover:text-rose-900 transition-colors cursor-pointer group-hover:translate-x-0.5"
                >
                  <span>Explore Company &amp; Operations</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>

            {/* 2. Terms of Use */}
            <div className="landing-glass-card rounded-2xl border border-white/15 bg-gradient-to-br from-[#1b1018]/85 via-slate-950/85 to-[#122146]/85 glassy:bg-none p-5 sm:p-6 flex flex-col justify-between shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl hover:border-amber-400/50 transition-all group">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="rounded-xl border border-amber-400/25 bg-amber-500/15 p-2 text-amber-300 glassy:text-amber-700 glassy:border-amber-300/70 group-hover:scale-105 transition-all">
                    <Scale className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 bg-amber-500/15 glassy:text-amber-800 glassy:border-amber-300/70 px-2.5 py-0.5 rounded-full border border-amber-400/30">
                    Operating Rules
                  </span>
                </div>
                <h4 className="text-base font-bold text-white glassy:text-slate-900 group-hover:text-amber-200 glassy:group-hover:text-amber-700 transition-colors">
                  Terms of Use
                </h4>
                <p className="text-xs text-slate-300/80 glassy:text-slate-600 leading-relaxed">
                  Enterprise governance rules for store staff and administrators. Covers authorized credential security, strict multi-tenant store isolation (BOLA/IDOR prevention), truthful POS floor entry, trade secrets, and automated 00:00 IST midnight lock.
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-white/10 glassy:border-slate-300/60">
                <button
                  type="button"
                  onClick={() => openLegalDoc("terms")}
                  className="w-full inline-flex items-center justify-between text-xs font-semibold text-amber-300 hover:text-amber-200 glassy:text-amber-700 glassy:hover:text-amber-900 transition-colors cursor-pointer group-hover:translate-x-0.5"
                >
                  <span>Read Operating Terms</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>

            {/* 3. Privacy Policy */}
            <div className="landing-glass-card rounded-2xl border border-white/15 bg-gradient-to-br from-[#1b1018]/85 via-slate-950/85 to-[#122146]/85 glassy:bg-none p-5 sm:p-6 flex flex-col justify-between shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl hover:border-emerald-400/50 transition-all group">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/15 p-2 text-emerald-300 glassy:text-emerald-700 glassy:border-emerald-300/70 group-hover:scale-105 transition-all">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300 bg-emerald-500/15 glassy:text-emerald-800 glassy:border-emerald-300/70 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                    Compliance
                  </span>
                </div>
                <h4 className="text-base font-bold text-white glassy:text-slate-900 group-hover:text-emerald-200 glassy:group-hover:text-emerald-700 transition-colors">
                  Privacy Policy
                </h4>
                <p className="text-xs text-slate-300/80 glassy:text-slate-600 leading-relaxed">
                  Guaranteed Zero Customer PII collection—all billing data is processed purely as anonymous mathematical aggregates. Formulated under India&apos;s DPDP Act 2023, with Argon2id password hashing and revocable server-side Redis sessions.
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-white/10 glassy:border-slate-300/60">
                <button
                  type="button"
                  onClick={() => openLegalDoc("privacy")}
                  className="w-full inline-flex items-center justify-between text-xs font-semibold text-emerald-300 hover:text-emerald-200 glassy:text-emerald-700 glassy:hover:text-emerald-900 transition-colors cursor-pointer group-hover:translate-x-0.5"
                >
                  <span>Review Privacy Policy</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="mt-12 pt-6 border-t border-slate-800/70 glassy:border-slate-300/70 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 glassy:text-slate-600 text-center sm:text-left">
            <p>
              &copy; {new Date().getFullYear()} CITIMART Operations. All rights reserved. &middot; Kolkata, West Bengal, India.
            </p>

            <div className="flex items-center gap-4 text-xs">
              <button
                type="button"
                onClick={() => openLegalDoc("about")}
                className="hover:text-slate-300 glassy:hover:text-slate-900 transition-colors cursor-pointer"
              >
                About Us
              </button>
              <span>&middot;</span>
              <button
                type="button"
                onClick={() => openLegalDoc("terms")}
                className="hover:text-slate-300 glassy:hover:text-slate-900 transition-colors cursor-pointer"
              >
                Terms of Use
              </button>
              <span>&middot;</span>
              <button
                type="button"
                onClick={() => openLegalDoc("privacy")}
                className="hover:text-slate-300 glassy:hover:text-slate-900 transition-colors cursor-pointer"
              >
                Privacy Policy
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Legal & Governance Notice Modal */}
      <LegalNoticeModal
        open={isLegalModalOpen}
        onOpenChange={handleLegalModalClose}
        activeDoc={activeLegalDoc}
        onDocChange={(doc) => {
          setActiveLegalDoc(doc);
          window.history.replaceState(null, "", `#${doc}`);
        }}
      />
    </div>
  );
}
