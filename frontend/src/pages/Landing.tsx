import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
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
import citimartLogo from "@/assets/citimart-logo.png";

const STORES = [
  {
    code: "NM",
    name: "New Market",
    badge: "Flagship Retail",
    location: "Lindsay Street, Central Kolkata",
    counters: "12 POS Counters",
    sqft: "18,500 sq.ft Floor",
  },
  {
    code: "HB",
    name: "Hatibagan",
    badge: "North Hub",
    location: "Bidhan Sarani, North Kolkata",
    counters: "8 POS Counters",
    sqft: "14,200 sq.ft Floor",
  },
  {
    code: "CHW",
    name: "Chowringhee",
    badge: "Prime Central",
    location: "JL Nehru Road, Central Kolkata",
    counters: "10 POS Counters",
    sqft: "16,000 sq.ft Floor",
  },
];

const FMCG_CATEGORIES = [
  { name: "Apparel & Fashion", icon: ShoppingBag, growth: "+14.2%" },
  { name: "FMCG & Groceries", icon: ShoppingCart, growth: "+18.6%" },
  { name: "Personal Care", icon: PackageCheck, growth: "+9.8%" },
  { name: "Home Essentials", icon: Layers, growth: "+11.4%" },
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

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.07 * i, duration: 0.45 } }),
};

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0f1d] text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Background visual atmosphere */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(55rem 55rem at 10% 15%, oklch(0.44 0.18 260 / 0.45), transparent 60%)," +
            "radial-gradient(50rem 50rem at 90% 25%, oklch(0.52 0.2 165 / 0.35), transparent 55%)," +
            "radial-gradient(60rem 60rem at 50% 90%, oklch(0.4 0.16 280 / 0.4), transparent 60%)",
        }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent,#0a0f1d_80%)]" />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-4 py-6 sm:px-6 md:gap-16 md:py-10">
        {/* Navigation Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex items-center justify-between gap-4 border-b border-white/10 pb-5"
        >
          <div className="inline-flex items-center rounded-xl bg-white px-3.5 py-2 shadow-md border border-slate-200/60">
            <img
              src={citimartLogo}
              alt="CITIMART - Value for Money Re-defined"
              className="h-9 w-auto sm:h-11 object-contain"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-medium text-emerald-400 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Store Operations Online (10:30 AM – 11:59 PM)</span>
            </div>

            <Button
              size="sm"
              className="bg-blue-600 font-semibold text-white shadow-md shadow-blue-600/30 hover:bg-blue-500"
              onClick={() => navigate("/login")}
            >
              <LogIn className="h-4 w-4 mr-1.5" />
              Portal Access
            </Button>
          </div>
        </motion.header>

        {/* Hero Section */}
        <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <motion.div
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-300 backdrop-blur mb-4"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              Retail & FMCG Commercial Intelligence
            </motion.div>

            <motion.h1
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="text-3xl leading-[1.15] font-extrabold sm:text-4xl md:text-5xl tracking-tight"
            >
              Real-Time Retail Analytics &{" "}
              <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
                Daily Store Operations
              </span>
            </motion.h1>

            <motion.p
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-4 max-w-xl text-base text-slate-300 leading-relaxed"
            >
              CITIMART's unified retail operations platform for store managers and leadership. Track live hourly
              POS throughput, footfall conversion yield, basket sizes, and automated store performance digests.
            </motion.p>

            {/* Quick Metrics Bar */}
            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-6 flex flex-wrap gap-2.5"
            >
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                <Store className="h-3.5 w-3.5 text-blue-400" /> 3 Flagship Stores
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                <Clock className="h-3.5 w-3.5 text-amber-400" /> 12-Hour Operational Slots
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Role-Scoped Security
              </span>
            </motion.div>

            <motion.div
              custom={4}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-8 flex items-center gap-4"
            >
              <Button
                size="lg"
                className="bg-blue-600 px-6 font-semibold text-white shadow-xl shadow-blue-600/30 hover:bg-blue-500"
                onClick={() => navigate("/login")}
              >
                Launch Portal <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <p className="text-xs text-slate-400">
                Internal system for store managers & admin
              </p>
            </motion.div>
          </div>

          {/* Retail & FMCG Telemetry Showcase Card */}
          <motion.div
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-blue-950/40 p-6 backdrop-blur-xl shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-emerald-500/20 p-1.5 text-emerald-400">
                  <Activity className="h-4 w-4 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Live Retail Telemetry
                  </h3>
                  <p className="text-[11px] text-slate-400">Kolkata Store Network Live Feed</p>
                </div>
              </div>
              <span className="rounded-md bg-blue-500/20 px-2.5 py-1 text-[11px] font-semibold text-blue-300">
                Today's Operations
              </span>
            </div>

            {/* KPI grid showcase */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Receipt className="h-3.5 w-3.5 text-emerald-400" /> POS Net Sales
                </p>
                <p className="mt-1 text-lg font-extrabold text-emerald-300">₹4,86,250</p>
                <p className="mt-0.5 text-[10px] text-emerald-400 font-semibold">+8.4% vs target</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-indigo-400" /> Store Footfall
                </p>
                <p className="mt-1 text-lg font-extrabold text-indigo-200">3,420</p>
                <p className="mt-0.5 text-[10px] text-slate-400">Visitors logged</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Percent className="h-3.5 w-3.5 text-blue-400" /> Conversion Rate
                </p>
                <p className="mt-1 text-lg font-extrabold text-blue-300">36.2%</p>
                <p className="mt-0.5 text-[10px] text-emerald-400 font-semibold">Healthy Yield</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <ShoppingBag className="h-3.5 w-3.5 text-amber-400" /> Average Bill (ATV)
                </p>
                <p className="mt-1 text-lg font-extrabold text-amber-200">₹1,240</p>
                <p className="mt-0.5 text-[10px] text-slate-400">Basket: 3.8 units</p>
              </div>
            </div>

            {/* FMCG Department breakdown mini-bar */}
            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
                <span>Departmental Contribution</span>
                <span className="text-[11px] text-emerald-400">Live Mix</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {FMCG_CATEGORIES.map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <cat.icon className="h-3 w-3 text-blue-300" />
                      <span className="truncate">{cat.name}</span>
                    </span>
                    <span className="font-semibold text-emerald-400">{cat.growth}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        {/* Store Network Section */}
        <section className="space-y-4">
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
            {STORES.map((s, i) => (
              <motion.div
                key={s.name}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-5 transition-all duration-200 hover:border-blue-400/40 hover:bg-white/[0.07]"
              >
                <div className="flex items-start justify-between">
                  <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                    <Store className="h-5 w-5" />
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-blue-300">
                    {s.badge}
                  </span>
                </div>

                <h3 className="mt-4 font-bold text-slate-100 text-base">
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
              </motion.div>
            ))}
          </div>
        </section>

        {/* Retail Capabilities Grid */}
        <section className="space-y-4">
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
            {RETAIL_CAPABILITIES.map((cap, i) => (
              <motion.div
                key={cap.title}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col justify-between hover:border-white/20 transition"
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
        </section>

        {/* Bottom CTA Card */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-900/40 via-slate-900/60 to-indigo-900/40 p-6 sm:p-8 backdrop-blur text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6"
        >
          <div>
            <h3 className="text-xl font-bold text-white">Ready to access your store's dashboard?</h3>
            <p className="mt-1 text-sm text-slate-300">
              Sign in with your store manager credentials or administrator account.
            </p>
          </div>
          <Button
            size="lg"
            className="bg-blue-600 font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 shrink-0"
            onClick={() => navigate("/login")}
          >
            Enter CITIMART Portal <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </motion.section>

        {/* Footer */}
        <footer className="border-t border-white/10 pt-6 text-center text-xs text-slate-500 space-y-1 pb-6">
          <p>CITIMART Sales KPI Dashboard &mdash; Retail Operations Intelligence.</p>
          <p>&copy; {new Date().getFullYear()} CITIMART. All Rights Reserved. &middot; Kolkata, India</p>
        </footer>
      </div>
    </div>
  );
}

