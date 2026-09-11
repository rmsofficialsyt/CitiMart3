import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileText,
  LineChart,
  LogIn,
  MapPin,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { AccountPicker } from "@/components/AccountPicker";
import { Button } from "@/components/ui/button";
import { STORE_NAME_BY_CODE } from "@/lib/authUsers";
import citimartLogo from "@/assets/citimart-logo.png";

const STORES = [
  {
    code: "NM" as const,
    name: "New Market",
    tag: "Flagship Store",
    location: "Central Kolkata · Lindsay Street",
    username: STORE_NAME_BY_CODE.NM,
  },
  {
    code: "HB" as const,
    name: "Hatibagan",
    tag: "North Kolkata Hub",
    location: "North Kolkata · Shyambazar",
    username: STORE_NAME_BY_CODE.HB,
  },
  {
    code: "CHW" as const,
    name: "Chowringhee",
    tag: "Prime Boulevard",
    location: "Central Kolkata · JL Nehru Road",
    username: STORE_NAME_BY_CODE.CHW,
  },
];

const FEATURES = [
  {
    icon: BarChart3,
    badge: "Real-Time Tracking",
    title: "Daily Operations & Live KPIs",
    body: "Store managers log hourly footfall, bill amount, and NOB with automatic 12-hour time slot assignment and live KPI calculation.",
  },
  {
    icon: LineChart,
    badge: "Deep Analytics",
    title: "Historical Trends & Performance",
    body: "Multi-store comparative tables, date range filters, basket size, ATV, RPV, and conversion rates across all Kolkata locations.",
  },
  {
    icon: FileText,
    badge: "Executive Export",
    title: "Instant PDF Reports",
    body: "Generate styled executive daily summary reports with embedded gauge charts, KPI cards, and hourly breakdowns with one click.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.08 * i, duration: 0.5 } }),
};

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b1220] text-slate-100 selection:bg-blue-500 selection:text-white">
      {/* animated gradient mesh */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60rem 60rem at 15% 10%, oklch(0.42 0.16 265 / 0.55), transparent 60%)," +
            "radial-gradient(50rem 50rem at 85% 20%, oklch(0.6 0.19 258 / 0.45), transparent 55%)," +
            "radial-gradient(55rem 55rem at 50% 100%, oklch(0.55 0.18 300 / 0.4), transparent 60%)",
        }}
        animate={{ scale: [1, 1.08, 1], rotate: [0, 3, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent,#0b1220_75%)]" />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 md:gap-14 md:py-12">
        {/* header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between gap-4"
        >
          <div className="inline-flex items-center rounded-xl bg-white px-3 py-1.5 shadow-md border border-slate-200/50">
            <img
              src={citimartLogo}
              alt="CITIMART - Value for Money Re-defined"
              className="h-10 w-auto sm:h-12 object-contain"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Store Operations Active
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
              onClick={() => navigate("/login")}
            >
              <LogIn className="h-4 w-4 mr-1.5 text-blue-400" />
              Sign in
            </Button>
          </div>
        </motion.header>

        {/* hero */}
        <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <motion.div
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-300 backdrop-blur mb-4"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Retail Intelligence & Operations Portal
            </motion.div>

            <motion.h1
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="text-3xl leading-tight font-extrabold sm:text-4xl md:text-5xl tracking-tight"
            >
              <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-200 bg-clip-text text-transparent">
                CITIMART
              </span>{" "}
              Sales KPI & Operations Portal
            </motion.h1>

            <motion.p
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-4 max-w-xl text-base text-slate-300 leading-relaxed"
            >
              One unified retail management system for three Kolkata locations. Empowering store managers
              with live hourly data capture, and administrators with comprehensive analytics, targets, and PDF reporting.
            </motion.p>

            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-6 flex flex-wrap items-center gap-3"
            >
              <Button
                size="lg"
                className="bg-blue-600 font-semibold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500"
                onClick={() => navigate("/login")}
              >
                Sign In to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                Role-Based & Store-Scoped Access
              </span>
            </motion.div>
          </div>

          {/* sign-in grid */}
          <motion.div
            custom={4}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-md shadow-2xl"
          >
            <div className="flex items-center justify-between mb-3.5">
              <p className="text-xs font-bold tracking-wider uppercase text-slate-400">
                Choose Account To Sign In
              </p>
              <span className="text-[11px] text-blue-300">4 Accounts Available</span>
            </div>
            <AccountPicker />
          </motion.div>
        </section>

        {/* stores section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Store className="h-5 w-5 text-blue-400" />
                Kolkata Store Locations
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Select your store below for direct manager login
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {STORES.map((s, i) => (
              <motion.button
                key={s.name}
                type="button"
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                onClick={() => navigate(`/login?account=${encodeURIComponent(s.username)}`)}
                className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-5 text-left transition-all duration-200 hover:border-blue-400/60 hover:bg-white/10 hover:shadow-lg hover:shadow-blue-500/10"
              >
                <div className="flex items-start justify-between">
                  <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400 group-hover:bg-blue-500/20">
                    <Store className="h-5 w-5" />
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-blue-300">
                    {s.tag}
                  </span>
                </div>
                <h3 className="mt-4 font-bold text-slate-100 group-hover:text-blue-300 transition-colors">
                  CITIMART — {s.name}
                </h3>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                  <MapPin className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  {s.location}
                </p>
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
                  <span>Sign in as Manager</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        {/* features section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-400" />
              Core System Capabilities
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Comprehensive analytics, operational data entry, and executive reporting
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-300">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {f.badge}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-100 text-sm">{f.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{f.body}</p>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-[11px] text-emerald-400/90 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Enterprise Ready</span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* footer */}
        <footer className="border-t border-white/10 pt-6 text-center text-xs text-slate-500 space-y-1">
          <p>
            CITIMART Sales KPI Dashboard &mdash; Internal Retail Analytics Workspace.
          </p>
          <p>
            &copy; {new Date().getFullYear()} CITIMART. All Rights Reserved. &middot; Kolkata, India
          </p>
        </footer>
      </div>
    </div>
  );
}

