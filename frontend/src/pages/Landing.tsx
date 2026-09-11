import { motion } from "framer-motion";
import { ArrowRight, BarChart3, LineChart, ShieldCheck, Store, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { AccountPicker } from "@/components/AccountPicker";
import { Button } from "@/components/ui/button";
import citimartLogo from "@/assets/citimart-logo.png";

const STORES = [
  { name: "New Market", tag: "Flagship · Kolkata" },
  { name: "Hatibagan", tag: "North Kolkata" },
  { name: "Chowringhee", tag: "Central Kolkata" },
];

const FEATURES = [
  { icon: BarChart3, title: "Daily Operations", body: "Live per-store KPIs, manual entry, and same-day context." },
  { icon: LineChart, title: "Historical Analytics", body: "Executive overview, sales, conversion, product & profit." },
  { icon: TrendingUp, title: "Forecast & Analysis", body: "Walk-forward models, growth goals, morning huddle." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.08 * i, duration: 0.5 } }),
};

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b1220] text-slate-100">
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

      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 md:gap-16 md:py-16">
        {/* header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between"
        >
          <img src={citimartLogo} alt="CITIMART" className="h-9 w-auto rounded bg-white/95 p-1" />
        </motion.header>

        {/* hero */}
        <section className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <motion.h1
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="text-3xl leading-tight font-bold sm:text-4xl md:text-5xl"
            >
              <span className="text-blue-300">CITIMART</span> Sales KPI
              <br /> Dashboard Report
            </motion.h1>
            <motion.p
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-5 max-w-lg text-base text-slate-300"
            >
              One retail analytics workspace for three Kolkata stores — daily operations for
              store managers, full historical and forecast analytics for the admin.
            </motion.p>
            <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show" className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="bg-blue-500 text-white hover:bg-blue-400" onClick={() => navigate("/login")}>
                Sign in to continue <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <span className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs text-slate-300">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> Role-based access · store-scoped
              </span>
            </motion.div>
          </div>

          {/* sign-in grid */}
          <motion.div
            custom={3}
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-5"
          >
            <p className="mb-4 text-xs font-semibold tracking-wider text-slate-400">SIGN IN TO CONTINUE</p>
            <AccountPicker />
          </motion.div>
        </section>

        {/* stores */}
        <section className="grid gap-4 sm:grid-cols-3">
          {STORES.map((s, i) => (
            <motion.div
              key={s.name}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="rounded-xl border border-white/10 bg-white/5 p-5"
            >
              <Store className="h-5 w-5 text-blue-300" />
              <p className="mt-3 font-semibold">CITIMART — {s.name}</p>
              <p className="text-xs text-slate-400">{s.tag}</p>
            </motion.div>
          ))}
        </section>

        {/* features */}
        <section className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="rounded-xl border border-white/10 bg-white/5 p-5"
            >
              <f.icon className="h-5 w-5 text-blue-300" />
              <p className="mt-3 font-semibold">{f.title}</p>
              <p className="mt-1 text-sm text-slate-400">{f.body}</p>
            </motion.div>
          ))}
        </section>

        <footer className="pt-4 text-center text-xs text-slate-500">
          CITIMART Sales KPI Dashboard — internal analytics workspace. &copy; {new Date().getFullYear()} CITIMART. All Rights Reserved.
        </footer>
      </div>
    </div>
  );
}
