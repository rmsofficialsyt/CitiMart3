import { useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Flame,
  Layers,
  LineChart,
  LogIn,
  MapPin,
  PackageCheck,
  Percent,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { STORE_NAME_BY_CODE } from "@/lib/authUsers";
import citimartLogo from "@/assets/citimart-logo.png";

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
    counters: "12 POS Counters",
    sqft: "18,500 sq.ft Floor",
    username: STORE_NAME_BY_CODE.NM,
  },
  {
    code: "HB" as const,
    name: "Hatibagan",
    badge: "North Hub",
    location: "Bidhan Sarani, North Kolkata",
    counters: "8 POS Counters",
    sqft: "14,200 sq.ft Floor",
    username: STORE_NAME_BY_CODE.HB,
  },
  {
    code: "CHW" as const,
    name: "Chowringhee",
    badge: "Prime Central",
    location: "JL Nehru Road, Central Kolkata",
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

export function Landing() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<StoreKey>("all");
  const [hoveredPoint, setHoveredPoint] = useState<HourlyPoint | null>(null);

  // Fetch authentic previous day / latest telemetry directly from MongoDB
  const { data: heroData } = useQuery({
    queryKey: ["landing-hero"],
    queryFn: () => api.landingHero(),
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
    <div className="relative min-h-screen overflow-hidden bg-[#090e1a] text-slate-100 selection:bg-blue-600 selection:text-white">
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
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
              <stop offset="35%" stopColor="#06b6d4" stopOpacity="0.8" />
              <stop offset="70%" stopColor="#10b981" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="bgAreaGradPrimary" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
              <stop offset="50%" stopColor="#10b981" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#090e1a" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="bgLineGradSecondary" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines */}
          <line x1="0" y1="120" x2="1440" y2="120" stroke="rgba(255,255,255,0.03)" strokeDasharray="6 6" />
          <line x1="0" y1="240" x2="1440" y2="240" stroke="rgba(255,255,255,0.03)" strokeDasharray="6 6" />
          <line x1="0" y1="360" x2="1440" y2="360" stroke="rgba(255,255,255,0.03)" strokeDasharray="6 6" />
          <line x1="0" y1="480" x2="1440" y2="480" stroke="rgba(255,255,255,0.03)" strokeDasharray="6 6" />

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
            fill="#06b6d4"
            animate={{ r: [4, 7, 4], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <motion.circle
            cx="920"
            cy="110"
            r="6"
            fill="#10b981"
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

        {/* Ambient Glowing Orbs */}
        <motion.div
          aria-hidden
          className="absolute -top-[20%] left-[5%] h-[42rem] w-[42rem] rounded-full bg-blue-600/20 blur-[120px]"
          animate={{
            x: [0, 40, 0],
            y: [0, 30, 0],
            scale: [1, 1.12, 1],
          }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute top-[30%] -right-[10%] h-[38rem] w-[38rem] rounded-full bg-emerald-500/15 blur-[130px]"
          animate={{
            x: [0, -45, 0],
            y: [0, 40, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#090e1a_75%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex max-w-6xl flex-col gap-12 px-4 py-6 sm:px-6 md:gap-16 md:py-10"
      >
        {/* Navigation Header */}
        <motion.header
          variants={itemVariants}
          className="flex items-center justify-between gap-4 border-b border-white/10 pb-5"
        >
          <motion.div
            whileHover={{ scale: 1.03 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="inline-flex items-center rounded-xl bg-white px-3.5 py-2 shadow-md border border-slate-200/60 transition-shadow hover:shadow-lg"
          >
            <img
              src={citimartLogo}
              alt="CITIMART - Value for Money Re-defined"
              className="h-9 w-auto sm:h-11 object-contain"
            />
          </motion.div>

          <div className="flex items-center gap-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="hidden sm:inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-medium text-emerald-400 backdrop-blur"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Store Operations Active (10:30 AM – 11:59 PM)</span>
            </motion.div>

            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button
                size="sm"
                className="bg-blue-600 font-semibold text-white shadow-md shadow-blue-600/30 hover:bg-blue-500 transition-colors"
                onClick={() => navigate("/login")}
              >
                <LogIn className="h-4 w-4 mr-1.5" />
                Portal Access
              </Button>
            </motion.div>
          </div>
        </motion.header>

        {/* Hero Section */}
        <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div variants={itemVariants}>
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-300 backdrop-blur mb-4 shadow-xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
              Retail & FMCG Commercial Intelligence
            </motion.div>

            <h1 className="text-3xl leading-[1.15] font-extrabold sm:text-4xl md:text-5xl tracking-tight">
              Real-Time Retail Analytics &{" "}
              <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
                Daily Store Operations
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-base text-slate-300 leading-relaxed">
              CITIMART's unified retail operations platform for store managers and leadership. Track live hourly
              POS throughput, footfall conversion yield, basket sizes, and automated store performance digests.
            </p>

            {/* Quick Metrics Bar */}
            <div className="mt-6 flex flex-wrap gap-2.5">
              <motion.span
                whileHover={{ y: -2 }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10"
              >
                <Store className="h-3.5 w-3.5 text-blue-400" /> 3 Flagship Stores
              </motion.span>
              <motion.span
                whileHover={{ y: -2 }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10"
              >
                <Clock className="h-3.5 w-3.5 text-amber-400" /> 12-Hour Operational Slots
              </motion.span>
              <motion.span
                whileHover={{ y: -2 }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Role-Scoped Security
              </motion.span>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Button
                  size="lg"
                  className="bg-blue-600 px-6 font-semibold text-white shadow-xl shadow-blue-600/35 hover:bg-blue-500 transition-colors"
                  onClick={() => navigate("/login")}
                >
                  Launch Portal <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
              <p className="text-xs text-slate-400">
                Internal workspace for store managers & admin
              </p>
            </div>
          </motion.div>

          {/* Interactive Retail & FMCG Telemetry Showcase Card with Smooth SVG Line Graph */}
          <motion.div
            variants={itemVariants}
            whileHover={{ y: -3 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-blue-950/50 p-5 sm:p-6 backdrop-blur-xl shadow-2xl transition-shadow hover:shadow-blue-500/10"
          >
            {/* Store Tab Switcher */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-4">
              <div className="flex items-center gap-1.5 rounded-lg bg-white/5 p-1 border border-white/10">
                {(
                  [
                    { id: "all", label: "All Stores" },
                    { id: "NM", label: "New Market" },
                    { id: "HB", label: "Hatibagan" },
                    { id: "CHW", label: "Chowringhee" },
                  ] as const
                ).map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative rounded-md px-2.5 py-1 text-xs font-semibold transition-colors duration-150 ${
                        active
                          ? "text-white"
                          : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="activeStoreTab"
                          className="absolute inset-0 rounded-md bg-blue-600 shadow-md shadow-blue-600/40"
                          transition={{ type: "spring", stiffness: 500, damping: 32 }}
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                <Activity className="h-3 w-3 animate-pulse" /> Live Telemetry
              </span>
            </div>

            {/* Sub-header info */}
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-200">{data.name}</p>
                <p className="text-[11px] text-slate-400">{data.subtitle}</p>
              </div>
              <motion.div
                key={`peak-${activeTab}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1 text-[11px] text-amber-300 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md"
              >
                <Flame className="h-3 w-3 text-amber-400 shrink-0 animate-bounce" />
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
                className="mt-4 grid grid-cols-2 gap-3"
              >
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="rounded-xl border border-white/10 bg-white/5 p-3.5 transition-colors hover:border-emerald-500/30 hover:bg-white/[0.08]"
                >
                  <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <Receipt className="h-3.5 w-3.5 text-emerald-400" /> POS Net Sales
                  </p>
                  <p className="mt-1 text-lg font-extrabold text-emerald-300 tracking-tight">{data.sales}</p>
                  <p className="mt-0.5 text-[10px] text-emerald-400 font-semibold">{data.salesGrowth}</p>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="rounded-xl border border-white/10 bg-white/5 p-3.5 transition-colors hover:border-indigo-500/30 hover:bg-white/[0.08]"
                >
                  <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-indigo-400" /> Store Footfall
                  </p>
                  <p className="mt-1 text-lg font-extrabold text-indigo-200 tracking-tight">{data.footfall}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">Visitors today</p>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="rounded-xl border border-white/10 bg-white/5 p-3.5 transition-colors hover:border-blue-500/30 hover:bg-white/[0.08]"
                >
                  <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <Percent className="h-3.5 w-3.5 text-blue-400" /> Conversion Rate
                  </p>
                  <p className="mt-1 text-lg font-extrabold text-blue-300 tracking-tight">{data.conversion}</p>
                  <p className="mt-0.5 text-[10px] text-emerald-400 font-semibold">High floor yield</p>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="rounded-xl border border-white/10 bg-white/5 p-3.5 transition-colors hover:border-amber-500/30 hover:bg-white/[0.08]"
                >
                  <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                    <ShoppingBag className="h-3.5 w-3.5 text-amber-400" /> Average Bill (ATV)
                  </p>
                  <p className="mt-1 text-lg font-extrabold text-amber-200 tracking-tight">{data.atv}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">Basket: {data.basket}</p>
                </motion.div>
              </motion.div>
            </AnimatePresence>

            {/* Smooth Animated SVG Line Graph Card */}
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <LineChart className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Hourly Sales Trajectory Curve</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-medium">
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
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="50%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                    <linearGradient id="cardAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                      <stop offset="80%" stopColor="#3b82f6" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Guide Lines */}
                  <line x1="20" y1="20" x2="380" y2="20" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <line x1="20" y1="60" x2="380" y2="60" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                  <line x1="20" y1="100" x2="380" y2="100" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />

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
                          stroke="#0f172a"
                          strokeWidth="1.5"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* X-axis Labels */}
              <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium px-1 mt-1">
                {data.hourlyPoints.map((pt) => (
                  <span
                    key={pt.time}
                    className={`transition-colors ${
                      pt.isPeak
                        ? "text-emerald-400 font-bold"
                        : hoveredPoint?.time === pt.time
                        ? "text-sky-300 font-semibold"
                        : "text-slate-400"
                    }`}
                  >
                    {pt.time}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        {/* Store Network Section */}
        <motion.section
          variants={itemVariants}
          className="space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Store className="h-5 w-5 text-blue-400" />
                CITIMART Retail Network — Kolkata
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Prime retail flagships equipped with real-time operations tracking
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {STORES.map((s) => (
              <motion.button
                key={s.name}
                type="button"
                whileHover={{ y: -5, scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => navigate(`/login?account=${encodeURIComponent(s.username)}`)}
                className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-5 text-left transition-all duration-200 hover:border-blue-400/50 hover:bg-white/[0.08] hover:shadow-xl hover:shadow-blue-500/10"
              >
                <div className="flex items-start justify-between">
                  <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400 group-hover:bg-blue-500/20 group-hover:scale-110 transition-all">
                    <Store className="h-5 w-5" />
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-blue-300">
                    {s.badge}
                  </span>
                </div>

                <h3 className="mt-4 font-bold text-slate-100 text-base group-hover:text-blue-300 transition-colors">
                  CITIMART — {s.name}
                </h3>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                  <MapPin className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  {s.location}
                </p>

                <div className="mt-4 border-t border-white/10 pt-3 flex items-center justify-between text-[11px] text-slate-300">
                  <span>{s.counters}</span>
                  <span className="text-slate-400">{s.sqft}</span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs font-semibold text-blue-400 opacity-80 group-hover:opacity-100 transition-opacity">
                  <span>Open Store Manager Login</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </motion.button>
            ))}
          </div>
        </motion.section>

        {/* Retail Capabilities Grid */}
        <motion.section
          variants={itemVariants}
          className="space-y-4"
        >
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-400" />
              Retail & FMCG Operating Modules
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Engineered specifically for departmental and supermarket retail velocity
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {RETAIL_CAPABILITIES.map((cap) => (
              <motion.div
                key={cap.title}
                whileHover={{ y: -4, scale: 1.015 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col justify-between hover:border-white/25 transition-all hover:bg-white/[0.08]"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-300">
                      <cap.icon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {cap.badge}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-100 text-sm">{cap.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{cap.body}</p>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-[11px] text-emerald-400/90 font-medium">
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
          className="rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-900/40 via-slate-900/70 to-indigo-900/40 p-6 sm:p-8 backdrop-blur text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl"
        >
          <div>
            <h3 className="text-xl font-bold text-white">Ready to access your store's dashboard?</h3>
            <p className="mt-1 text-sm text-slate-300">
              Sign in with your store manager credentials or administrator account.
            </p>
          </div>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <Button
              size="lg"
              className="bg-blue-600 font-semibold text-white shadow-lg shadow-blue-600/35 hover:bg-blue-500 shrink-0 transition-colors"
              onClick={() => navigate("/login")}
            >
              Enter CITIMART Portal <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </motion.section>

        {/* Footer */}
        <footer className="border-t border-white/10 pt-6 text-center text-xs text-slate-500 space-y-2 pb-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 text-slate-400">
            <div className="shrink-0 rounded bg-white px-1.5 py-0.5 shadow-sm border border-slate-200/40 flex items-center justify-center">
              <img
                src={citimartLogo}
                alt="CITIMART Logo"
                className="h-6 sm:h-7 w-auto object-contain"
              />
            </div>
            <span>CITIMART Sales KPI Dashboard &mdash; Retail Operations Intelligence.</span>
          </div>
          <p>&copy; {new Date().getFullYear()} CITIMART Operations. All Rights Reserved. &middot; Kolkata, India</p>
        </footer>
      </motion.div>
    </div>
  );
}
