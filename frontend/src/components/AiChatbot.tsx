import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDown,
  ArrowUpRight,
  Award,
  Bot,
  Calendar,
  Check,
  Clock,
  CloudRain,
  Copy,
  CornerDownRight,
  ExternalLink,
  Flame,
  HelpCircle,
  History,
  IndianRupee,
  Layers,
  Link2,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Store,
  Target,
  Trash2,
  TrendingUp,
  User,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { useNavigate, useSearchParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { ChatQueryTipPopover, ChatUsageGuide } from "@/components/ChatUsageGuide";
import { CHAT_USAGE_QUERY_KEY, ChatUsageMeter } from "@/components/ChatUsageMeter";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { appHref, isAppHref, isHttpUrl, isIsoDate, storeSelForCode } from "@/lib/appLinks";
import { remarkChatLinks } from "@/lib/chatLinkify";
import type { Language } from "@/lib/translations";
import type { ChatLink, TurnLimits, TurnUsage } from "@/lib/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  engine?: string;
  /** Store + date the backend actually answered for, e.g. "NM · 2026-11-20". */
  scope?: string;
  storeCode?: string;
  targetDate?: string;
  /** Backend-built navigation chips + web sources (src/chat/links.py). */
  links?: ChatLink[];
  /** Follow-up questions offered under the latest reply. */
  suggestions?: string[];
  timestamp: string;
}

// Session ids are generated server-side; anything else in ?chat= is ignored, so a
// crafted link can't steer the transcript fetch at another API path.
const SESSION_ID_RE = /^[A-Za-z0-9_-]{6,80}$/;

const fmtTime = (ts?: string) =>
  (ts ? new Date(ts) : new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Stored transcript rows (GET /api/daily/chat/sessions/{id}) -> chat messages. */
function toChatMessages(rows: any[]): ChatMessage[] {
  return rows.map((m: any, idx: number) => {
    const meta = m.metadata || {};
    return {
      id: `restored_${idx}_${m.timestamp || Date.now()}`,
      role: m.role as "user" | "assistant",
      content: m.content,
      engine: meta.engine || "citimart-memory",
      scope: meta.store_code && meta.target_date ? `${meta.store_code} · ${meta.target_date}` : undefined,
      storeCode: meta.store_code,
      targetDate: meta.target_date,
      links: Array.isArray(meta.links) ? meta.links : undefined,
      suggestions: Array.isArray(meta.suggestions) ? meta.suggestions : undefined,
      timestamp: fmtTime(m.timestamp),
    };
  });
}

/** Store code of the last assistant turn in a transcript (what the chat was about). */
function transcriptStore(rows: any[]): string | undefined {
  for (let i = rows.length - 1; i >= 0; i--) {
    const code = rows[i]?.metadata?.store_code;
    if (rows[i]?.role === "assistant" && code) return String(code).toUpperCase();
  }
  return undefined;
}

// Markdown for assistant replies (GFM tables, bold, lists). react-markdown never
// renders raw HTML from the model, so a reply cannot inject markup. Links (`a`)
// are added per message in `markdownComponentsFor`, which only lets through
// in-app links and the reply's own backend-provided sources.
const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => <h4 className="font-bold text-amber-300 text-[13px] mt-1 mb-0.5">{children}</h4>,
  h2: ({ children }) => <h4 className="font-bold text-amber-300 text-[13px] mt-1 mb-0.5">{children}</h4>,
  h3: ({ children }) => <h4 className="font-bold text-amber-300 text-[13px] mt-1 mb-0.5">{children}</h4>,
  h4: ({ children }) => <h4 className="font-bold text-amber-300 text-[13px] mt-1 mb-0.5">{children}</h4>,
  p: ({ children }) => <p className="leading-relaxed whitespace-pre-wrap">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-slate-50">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 space-y-0.5">{children}</ol>,
  code: ({ children }) => <code className="rounded bg-slate-800 px-1 font-mono text-[11px]">{children}</code>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2 rounded-lg border border-slate-700/60 bg-slate-950/60 p-1">
      <table className="w-full text-left text-[11px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-slate-700 bg-slate-800/80 text-slate-300">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-slate-800/60 font-mono">{children}</tbody>,
  tr: ({ children }) => <tr className="hover:bg-indigo-950/30 transition-colors">{children}</tr>,
  th: ({ children }) => <th className="p-1.5 font-semibold text-center first:text-left">{children}</th>,
  td: ({ children }) => <td className="p-1.5 text-center first:text-left text-slate-200">{children}</td>,
};

interface AiChatbotProps {
  activeStore?: string;
  selectedDate?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  showFloatingTrigger?: boolean;
}

export interface PresetItem {
  id: string;
  category: "all" | "sales" | "history" | "target_adjust" | "conversion" | "peakhours" | "market" | "benchmark" | "sop" | "formula";
  categoryLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  prompt: string;
}

const PRESET_CATEGORIES: { id: PresetItem["category"]; labelEn: string; labelBn: string; labelHi: string }[] = [
  { id: "all", labelEn: "All Presets", labelBn: "সকল প্রশ্ন", labelHi: "सभी प्रश्न" },
  { id: "history", labelEn: "📅 History & Sales", labelBn: "📅 পূর্বের সেলস ও ইতিহাস", labelHi: "📅 पिछली बिक्री व इतिहास" },
  { id: "target_adjust", labelEn: "🎯 Target Recovery", labelBn: "🎯 টার্গেট অ্যাডজাস্টমেন্ট", labelHi: "🎯 टारगेट रिकवरी" },
  { id: "sales", labelEn: "📈 Sales & Targets", labelBn: "📈 সেলস ও টার্গেট", labelHi: "📈 सेल्स व टारगेट" },
  { id: "conversion", labelEn: "⚡ Conversion & ATV", labelBn: "⚡ কনভার্সন ও ATV", labelHi: "⚡ कन्वर्शन व ATV" },
  { id: "peakhours", labelEn: "⏰ Peak Hours Pacing", labelBn: "⏰ পিক আওয়ার্স স্ট্র্যাটেজি", labelHi: "⏰ पीक ऑवर्स रणनीति" },
  { id: "market", labelEn: "🌦️ Market & Weather", labelBn: "🌦️ আবহাওয়া ও বাজার ইনটেল", labelHi: "🌦️ मौसम व बाज़ार" },
  { id: "benchmark", labelEn: "🏬 Store Benchmark", labelBn: "🏬 ৩টি স্টোরের তুলনা", labelHi: "🏬 स्टोर्स तुलना" },
  { id: "sop", labelEn: "📋 SOP & Directives", labelBn: "📋 বসের নির্দেশনা", labelHi: "📋 मुख्य निर्देश" },
  { id: "formula", labelEn: "📐 KPI Formulas", labelBn: "📐 গাণিতিক সূত্র", labelHi: "📐 आधिकारिक सूत्र" },
];

const PROMPT_PRESETS: Record<"en" | "hi" | "bn", PresetItem[]> = {
  en: [
    {
      id: "hist_yesterday",
      category: "history",
      categoryLabel: "History & Sales",
      icon: History,
      label: "Yesterday's Full Sales & 4-Slot Pacing",
      prompt: "Show yesterday's complete sales report including net sales, target achievement %, footfall, conversion %, ATV, and 4-time-slot breakdown.",
    },
    {
      id: "hist_7days",
      category: "history",
      categoryLabel: "History & Sales",
      icon: Calendar,
      label: "Past 7 Days Daily Sales Trend Table",
      prompt: "Show a day-by-day table of our past 7 operating days with net sales, targets, footfall, bills, ATV, and overall daily averages.",
    },
    {
      id: "hist_mtd",
      category: "history",
      categoryLabel: "History & Sales",
      icon: TrendingUp,
      label: "Month-To-Date (MTD) Sales Pacing",
      prompt: "Calculate our Month-To-Date (MTD) cumulative sales, active days, achievement %, and required daily run-rate for the rest of the month.",
    },
    {
      id: "hist_peak_day",
      category: "history",
      categoryLabel: "History & Sales",
      icon: Award,
      label: "Best Peak Day vs Lowest Dip Day",
      prompt: "What was our highest sales peak day and lowest sales dip day this month, and what were the contributing factors?",
    },
    {
      id: "hist_wow",
      category: "history",
      categoryLabel: "History & Sales",
      icon: ArrowUpDown,
      label: "Week-over-Week (WoW) Comparison",
      prompt: "Compare our performance against the same weekday last week and two weeks ago (Week-over-Week momentum).",
    },
    {
      id: "target_7d",
      category: "target_adjust",
      categoryLabel: "Target Recovery",
      icon: Target,
      label: "7-Day Rolling Target Adjustment (At = Tt + Ct)",
      prompt: "Calculate our 7-day rolling target adjustment (At = Tt + Ct). Show original target, carry-forward, adjusted target, and remaining balance.",
    },
    {
      id: "target_sim",
      category: "target_adjust",
      categoryLabel: "Target Recovery",
      icon: Sparkles,
      label: "Simulate 7-Day vs 14-Day vs 30-Day Recovery",
      prompt: "Simulate rolling deficit recovery across 7-day vs 14-day vs 30-day windows. Which recovery pace is safest for our store?",
    },
    {
      id: "sales_today",
      category: "sales",
      categoryLabel: "Sales & Targets",
      icon: Flame,
      label: "Today's Target vs Actual & Gap",
      prompt: "How is our store performing against target today? Show net sales, target gap, and achievement %.",
    },
    {
      id: "sales_yoy",
      category: "sales",
      categoryLabel: "Sales & Targets",
      icon: TrendingUp,
      label: "YoY Growth Benchmark",
      prompt: "What is our YoY growth comparing current operating performance against the previous year same day?",
    },
    {
      id: "sales_bills",
      category: "sales",
      categoryLabel: "Sales & Targets",
      icon: IndianRupee,
      label: "Highest Single Bill & Transactions",
      prompt: "What is our highest single bill, average ticket size, and recent billing stream today?",
    },
    {
      id: "conv_boost",
      category: "conversion",
      categoryLabel: "Conversion & ATV",
      icon: Zap,
      label: "Boost Conversion Above 70%",
      prompt: "Suggest 3 proven floor-level tactics to increase customer conversion rate above 70%.",
    },
    {
      id: "atv_lift",
      category: "conversion",
      categoryLabel: "Conversion & ATV",
      icon: Sparkles,
      label: "Lift ATV Above ₹1,800 & UPB 2.8+",
      prompt: "How can cashiers and sales staff actively push Average Transaction Value (ATV) above ₹1,800 and basket size above 2.8?",
    },
    {
      id: "peak_evening",
      category: "peakhours",
      categoryLabel: "Peak Hours Pacing",
      icon: Clock,
      label: "Evening Surge Playbook (5 PM - 8 PM)",
      prompt: "What is the priority checklist for floor supervisors during the primary evening peak surge (5 PM - 8 PM)?",
    },
    {
      id: "market_weather",
      category: "market",
      categoryLabel: "Market & Weather",
      icon: CloudRain,
      label: "Kolkata Weather & Footfall Forecast",
      prompt: "What is the live Kolkata weather and rain probability today, and how will it impact afternoon and evening footfall in New Market, Hatibagan, and Chowringhee?",
    },
    {
      id: "market_festivals",
      category: "market",
      categoryLabel: "Market & Weather",
      icon: Store,
      label: "Kolkata Festivals & Shopping Rush",
      prompt: "What upcoming Kolkata festivals, weekend dates, and wedding season surges should we prepare inventory and extra staff for?",
    },
    {
      id: "bench_ranking",
      category: "benchmark",
      categoryLabel: "Store Benchmark",
      icon: Store,
      label: "Compare All 3 Kolkata Stores",
      prompt: "Compare live sales, target achievement, and ATV across New Market, Hatibagan, and Chowringhee.",
    },
    {
      id: "stock_req",
      category: "sop",
      categoryLabel: "SOP & Directives",
      icon: Layers,
      label: "Product Requisitions & Stock Shortage",
      prompt: "Show the latest product requisition slips, pending stock demands, and urgent items.",
    },
    {
      id: "sop_directives",
      category: "sop",
      categoryLabel: "SOP & Directives",
      icon: Store,
      label: "Operational Head's Active Directives",
      prompt: "What are the latest operational directives and urgent announcements from the Operational Head (Raphael Sir)?",
    },
    {
      id: "formula_all",
      category: "formula",
      categoryLabel: "KPI Formulas",
      icon: Bot,
      label: "All Official KPI Formulas",
      prompt: "Show the complete mathematical formulas for Conversion %, ATV, Basket Size, SPH, and Tally Growth %.",
    },
  ],
  bn: [
    {
      id: "hist_yesterday",
      category: "history",
      categoryLabel: "পূর্বের সেলস",
      icon: History,
      label: "গতকালের পূর্ণাঙ্গ সেলস ও ৪-স্লট রিপোর্ট",
      prompt: "গতকালের সম্পূর্ণ সেলস রিপোর্ট দিন—যার মধ্যে নেট সেলস, টার্গেট অর্জন, ফুটফল, কনভার্সন %, ATV এবং ৪টি সময়ভিত্তিক স্লটের হিসেব থাকবে।",
    },
    {
      id: "hist_7days",
      category: "history",
      categoryLabel: "পূর্বের সেলস",
      icon: Calendar,
      label: "বিগত ৭ দিনের দৈনিক সেলস টেবিল",
      prompt: "বিগত ৭ দিনের দৈনিক সেলস, টার্গেট, ফুটফল, বিল সংখ্যা ও ATV সম্বলিত একটি টেবিল এবং দৈনিক গড় দেখান।",
    },
    {
      id: "hist_mtd",
      category: "history",
      categoryLabel: "পূর্বের সেলস",
      icon: TrendingUp,
      label: "চলতি মাসের MTD সেলস ও প্রয়োজনীয় রান-রেট",
      prompt: "চলতি মাসের MTD মোট সেলস, সক্রিয় দিন, অর্জন % এবং বাকি দিনগুলির জন্য প্রয়োজনীয় দৈনিক রান-রেট হিসেব করুন।",
    },
    {
      id: "hist_peak_day",
      category: "history",
      categoryLabel: "পূর্বের সেলস",
      icon: Award,
      label: "মাসের সর্বোচ্চ ও সর্বনিম্ন সেলসের দিন",
      prompt: "এই মাসে আমাদের স্টোরের সর্বোচ্চ সেলসের দিন (পিক ডে) এবং সর্বনিম্ন সেলসের দিন কোনটি ছিল এবং তার মেট্রিক্স কী?",
    },
    {
      id: "target_7d",
      category: "target_adjust",
      categoryLabel: "টার্গেট রিকভারি",
      icon: Target,
      label: "৭ দিনের রোলিং টার্গেট অ্যাডজাস্টমেন্ট (At = Tt + Ct)",
      prompt: "আমাদের ৭ দিনের রোলিং টার্গেট অ্যাডজাস্টমেন্ট (At = Tt + Ct) হিসেব করুন। মূল টার্গেট, ক্যারি-ফরোয়ার্ড এবং সমন্বিত টার্গেট দেখান।",
    },
    {
      id: "target_sim",
      category: "target_adjust",
      categoryLabel: "টার্গেট রিকভারি",
      icon: Sparkles,
      label: "৭ বনাম ১৪ বনাম ৩০ দিনের রিকভারি সিমুলেশন",
      prompt: "৭ দিন, ১৪ দিন এবং ৩০ দিনের রোলিং ডেফিসিট রিকভারি উইন্ডোর তুলনা করুন। আমাদের স্টোরের জন্য কোনটি সবচেয়ে নিরাপদ?",
    },
    {
      id: "sales_today",
      category: "sales",
      categoryLabel: "সেলস ও টার্গেট",
      icon: Flame,
      label: "আজকের সেলস ও টার্গেট গ্যাপ",
      prompt: "আজকের সেলস, টার্গেট গ্যাপ এবং অর্জন শতাংশের বিস্তারিত হিসেব দিন।",
    },
    {
      id: "sales_yoy",
      category: "sales",
      categoryLabel: "সেলস ও টার্গেট",
      icon: TrendingUp,
      label: "YoY গ্রোথ পেস ও তুলনা",
      prompt: "পূর্ববর্তী বছরের একই দিনের তুলনায় বর্তমান সেলসের ট্যালি গ্রোথ পেস কত শতাংশ?",
    },
    {
      id: "sales_bills",
      category: "sales",
      categoryLabel: "সেলস ও টার্গেট",
      icon: IndianRupee,
      label: "সর্বোচ্চ একক বিল ও বিলিং স্ট্রিম",
      prompt: "আজকের সর্বোচ্চ একক বিল, গড় টিকিট সাইজ ও সাম্প্রতিক বিলিং স্ট্রিম দেখান।",
    },
    {
      id: "conv_boost",
      category: "conversion",
      categoryLabel: "কনভার্সন ও ATV",
      icon: Zap,
      label: "কনভার্সন রেট ৭০%+ করার উপায়",
      prompt: "আমাদের স্টোরের কনভার্সন রেট ৭০%+ এ নিয়ে যেতে ৩টি কার্যকর ফ্লোর স্ট্র্যাটেজি কী?",
    },
    {
      id: "atv_lift",
      category: "conversion",
      categoryLabel: "কনভার্সন ও ATV",
      icon: Sparkles,
      label: "ATV ₹১,৮০০+ ও UPB ২.৮+ এ উন্নীত করা",
      prompt: "ক্যাশ ডেস্কে ক্রস-সেলিং বাড়িয়ে কীভাবে ATV ₹১,৮০০+ এবং বাস্কেট সাইজ ২.৮+ এ নিয়ে যাওয়া যায়?",
    },
    {
      id: "peak_evening",
      category: "peakhours",
      categoryLabel: "পিক আওয়ার্স",
      icon: Clock,
      label: "সন্ধ্যার পিক রাশ (৫টা - ৮টা)",
      prompt: "সন্ধ্যার প্রধান পিক আওয়ারে (৫টা থেকে ৮টা) ফ্লোর সুপারভাইজারদের অগ্রাধিকারমূলক করণীয় কী?",
    },
    {
      id: "market_weather",
      category: "market",
      categoryLabel: "আবহাওয়া ও বাজার",
      icon: CloudRain,
      label: "কলকাতার লাইভ আবহাওয়া ও ফুটফল পূর্বাভাস",
      prompt: "আজ কলকাতার লাইভ আবহাওয়া ও বৃষ্টির সম্ভাবনা কেমন এবং এটি নিউ মার্কেট, হাতিবাগান ও চৌরঙ্গীর ফুটফলে কী প্রভাব ফেলবে?",
    },
    {
      id: "bench_ranking",
      category: "benchmark",
      categoryLabel: "স্টোর তুলনা",
      icon: Store,
      label: "৩টি স্টোরের লাইভ তুলনা",
      prompt: "নিউ মার্কেট, হাতিবাগান ও চৌরঙ্গী—৩টি স্টোরের লাইভ সেলস ও অ্যাচিভমেন্ট তুলনা দেখান।",
    },
    {
      id: "stock_req",
      category: "sop",
      categoryLabel: "বসের নির্দেশ",
      icon: Layers,
      label: "প্রোডাক্ট রিকুইজিশন ও স্টক ঘাটতি",
      prompt: "সাম্প্রতিক প্রোডাক্ট রিকুইজিশন স্লিপ ও অপেক্ষমাণ জরুরি পণ্যের তালিকা দেখান।",
    },
    {
      id: "sop_directives",
      category: "sop",
      categoryLabel: "বসের নির্দেশ",
      icon: Store,
      label: "রাফায়েল স্যারের সাম্প্রতিক নির্দেশ",
      prompt: "রাফায়েল স্যারের সাম্প্রতিক সক্রিয় নির্দেশাবলী ও জরুরি নোটিশগুলো কী কী?",
    },
    {
      id: "formula_all",
      category: "formula",
      categoryLabel: "সূত্রাবলী",
      icon: Bot,
      label: "মূল মেট্রিক্সের গাণিতিক সূত্র",
      prompt: "Conversion %, ATV, Basket Size, SPH এবং Tally Growth গণনার অফিসিয়াল সূত্রগুলো দেখান।",
    },
  ],
  hi: [
    {
      id: "hist_yesterday",
      category: "history",
      categoryLabel: "पिछली बिक्री",
      icon: History,
      label: "कल की पूरी बिक्री व ४-स्लॉट रिपोर्ट",
      prompt: "कल की पूरी बिक्री रिपोर्ट दें, जिसमें नेट सेल्स, टारगेट अचीवमेंट %, फुटफॉल, कन्वर्शन दर, ATV और ४-टाइम स्लॉट ब्रेकडाउन शामिल हो।",
    },
    {
      id: "hist_7days",
      category: "history",
      categoryLabel: "पिछली बिक्री",
      icon: Calendar,
      label: "पिछले 7 दिनों की दैनिक बिक्री तालिका",
      prompt: "पिछले 7 दिनों की दैनिक बिक्री, टारगेट, फुटफॉल, बिल और ATV की तालिका और कुल औसत दिखाएं।",
    },
    {
      id: "hist_mtd",
      category: "history",
      categoryLabel: "पिछली बिक्री",
      icon: TrendingUp,
      label: "इस महीने की MTD बिक्री व रन-रेट",
      prompt: "इस महीने की MTD कुल बिक्री, सक्रिय दिन, अचीवमेंट % और शेष दिनों के लिए आवश्यक दैनिक रन-रेट बताएं।",
    },
    {
      id: "hist_peak_day",
      category: "history",
      categoryLabel: "पिछली बिक्री",
      icon: Award,
      label: "महीने का सबसे अच्छा व सबसे धीमा दिन",
      prompt: "इस महीने हमारे स्टोर का सबसे ज्यादा बिक्री वाला दिन (पीक डे) और सबसे कम बिक्री वाला दिन कौन सा था?",
    },
    {
      id: "target_7d",
      category: "target_adjust",
      categoryLabel: "टारगेट रिकवरी",
      icon: Target,
      label: "7-दिवसीय रोलिंग टारगेट एडजस्टमेंट (At = Tt + Ct)",
      prompt: "हमारी 7-दिवसीय रोलिंग टारगेट एडजस्टमेंट (At = Tt + Ct) की गणना करें और मूल लक्ष्य, कैरी-फॉरवर्ड व नया लक्ष्य दिखाएं।",
    },
    {
      id: "target_sim",
      category: "target_adjust",
      categoryLabel: "टारगेट रिकवरी",
      icon: Sparkles,
      label: "7 बनाम 14 बनाम 30 दिन रिकवरी सिमुलेशन",
      prompt: "7 दिन, 14 दिन और 30 दिन की डेफिसिट रिकवरी विंडो का तुलनात्मक सिमुलेशन दिखाएं।",
    },
    {
      id: "sales_today",
      category: "sales",
      categoryLabel: "सेल्स व टारगेट",
      icon: Flame,
      label: "आज की बिक्री और टारगेट स्थिति",
      prompt: "आज की बिक्री, टारगेट गैप और अचीवमेंट प्रतिशत की पूरी रिपोर्ट बताएं।",
    },
    {
      id: "sales_yoy",
      category: "sales",
      categoryLabel: "सेल्स व टारगेट",
      icon: TrendingUp,
      label: "YoY ग्रोथ गति व तुलना",
      prompt: "पिछले वर्ष के समान दिन के मुकाबले वर्तमान शुद्ध बिक्री की टैली ग्रोथ क्या है?",
    },
    {
      id: "sales_bills",
      category: "sales",
      categoryLabel: "सेल्स व टारगेट",
      icon: IndianRupee,
      label: "अधिकतम सिंगल बिल व ट्रांजैक्शन",
      prompt: "आज का सबसे बड़ा सिंगल बिल, औसत टिकट साइज और हालिया बिलिंग स्ट्रीम बताएं।",
    },
    {
      id: "conv_boost",
      category: "conversion",
      categoryLabel: "कन्वर्शन व ATV",
      icon: Zap,
      label: "कन्वर्शन रेट 70%+ कैसे करें",
      prompt: "स्टोर का कन्वर्शन रेट 70%+ रखने और कस्टमर ड्रॉप कम करने के 3 मुख्य तरीके बताएं।",
    },
    {
      id: "atv_lift",
      category: "conversion",
      categoryLabel: "कन्वर्शन व ATV",
      icon: Sparkles,
      label: "ATV ₹1,800+ व UPB 2.8+ करने के उपाय",
      prompt: "कैशियर द्वारा क्रॉस-सेलिंग करके एवरेज टिकट साइज ₹1,800+ और बास्केट साइज 2.8+ कैसे ले जाएं?",
    },
    {
      id: "peak_evening",
      category: "peakhours",
      categoryLabel: "पीक ऑवर्स",
      icon: Clock,
      label: "शाम का पीक समय (5 PM - 8 PM)",
      prompt: "शाम के मुख्य पीक ऑवर्स (5 PM से 8 PM) के दौरान फ्लोर मैनेजमेंट की चेकलिस्ट क्या है?",
    },
    {
      id: "market_weather",
      category: "market",
      categoryLabel: "मौसम व बाज़ार",
      icon: CloudRain,
      label: "कोलकाता मौसम व फुटफॉल पूर्वानुमान",
      prompt: "आज कोलकाता का मौसम और बारिश का पूर्वानुमान क्या है, और यह न्यू मार्केट, हाथीबागान व चौरंगी के फुटफॉल को कैसे प्रभावित करेगा?",
    },
    {
      id: "bench_ranking",
      category: "benchmark",
      categoryLabel: "स्टोर्स तुलना",
      icon: Store,
      label: "तीनों स्टोर्स की लाइव तुलना",
      prompt: "न्यू मार्केट, हाथीबागान और चौरंगी तीनों स्टोर्स की लाइव बिक्री और अचीवमेंट की तुलना करें।",
    },
    {
      id: "stock_req",
      category: "sop",
      categoryLabel: "मुख्य निर्देश",
      icon: Layers,
      label: "प्रोडक्ट रिक्विजिशन व स्टॉक कमी",
      prompt: "हालिया प्रोडक्ट रिक्विजिशन स्लिप्स, पेंडिंग स्टॉक डिमांड और अर्जेंट आइटम्स की सूची दिखाएं।",
    },
    {
      id: "sop_directives",
      category: "sop",
      categoryLabel: "मुख्य निर्देश",
      icon: Store,
      label: "राफेल सर के हालिया निर्देश",
      prompt: "राफेल सर के एक्टिव ऑपरेशनल निर्देश और सेल्स टारगेट्स क्या हैं?",
    },
    {
      id: "formula_all",
      category: "formula",
      categoryLabel: "सूत्र",
      icon: Bot,
      label: "KPI गणना और आधिकारिक सूत्र",
      prompt: "कन्वर्शन रेट, ATV, बास्केट साइज, SPH और टैली ग्रोथ के आधिकारिक फॉर्मूले बताएं।",
    },
  ],
};

export function AiChatbot({
  activeStore = "NM",
  selectedDate,
  isOpen: controlledIsOpen,
  onOpenChange,
  showFloatingTrigger = false,
}: AiChatbotProps) {
  const { language: globalLanguage } = useLanguage();
  const [chatLanguage, setChatLanguage] = useState<Language>(globalLanguage);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const setIsOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof value === "function" ? value(isOpen) : value;
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(nextVal);
    }
    onOpenChange?.(nextVal);
  };

  const [isExpanded, setIsExpanded] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<PresetItem["category"]>("all");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Most recent turn's usage, shown in the usage meter before its refetch lands.
  const [lastTurnUsage, setLastTurnUsage] = useState<{ usage: TurnUsage | null; limits: TurnLimits | null } | null>(null);
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);
  const [showGuideDrawer, setShowGuideDrawer] = useState(false);
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const rawChatParam = searchParams.get("chat");
  const linkedSessionId = rawChatParam && SESSION_ID_RE.test(rawChatParam) ? rawChatParam : null;
  const sessionKey = (store: string) => `citimart_ai_active_session_${store}`;

  /** Open an in-app link; on small screens / expanded mode, get the chat out of the way. */
  const openAppLink = (href: string) => {
    navigate(href);
    if (isExpanded) setIsExpanded(false);
    if (window.matchMedia("(max-width: 1023px)").matches) setIsOpen(false);
  };

  const onLinkClick = (e: React.MouseEvent, href: string) => {
    // Let ctrl/cmd/shift/middle-click open a new tab natively — the href is real.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openAppLink(href);
  };

  const shareUrl = (sid: string) => `${window.location.origin}${appHref({ chat: sid })}`;
  const copyShareLink = (sid: string | null, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!sid) return;
    navigator.clipboard.writeText(shareUrl(sid));
    toast.success("Conversation link copied — it opens for you and the admin only.");
  };

  /** Markdown components for one reply: in-app links navigate, its own sources open externally, anything else is plain text. */
  const markdownComponentsFor = (m: ChatMessage): Components => {
    const sources = new Set((m.links || []).filter((l) => l.kind === "source").map((l) => l.href));
    return {
      ...MARKDOWN_COMPONENTS,
      a: ({ children, href }) => {
        if (isAppHref(href)) {
          return (
            <a
              href={href}
              onClick={(e) => onLinkClick(e, href)}
              className="text-sky-300 underline decoration-dotted underline-offset-2 hover:text-sky-200 hover:decoration-solid"
              title="Open in the app"
            >
              {children}
            </a>
          );
        }
        if (isHttpUrl(href) && sources.has(href)) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline">
              {children}
            </a>
          );
        }
        // Model-written or unknown links are not clickable (no phishing via a reply).
        return <span className="text-slate-200">{children}</span>;
      },
    };
  };

  const getWelcomeMessage = (lang: Language): ChatMessage => {
    const welcomeMap: Record<Language, string> = {
      en: `👋 **Welcome to CITIMART Retail AI Co-Pilot!**\n\nI am your dedicated operations assistant for **${activeStore}**.\n\n- Full MongoDB live database & 79+ days historical operations records\n- Yesterday's full sales, 4-time-slot breakdown & past 7-day tables\n- 7/14/30-day Rolling Deficit Target Adjustment (A(t) = T(t) + C(t))\n- Real-time Kolkata weather & floor conversion tactics (>70%)\n\n*Select a preset below or ask any operational query.*`,
      bn: `👋 **সিটিমার্ট রিটেইল এআই কো-পাইলটে স্বাগতম!**\n\nআমি **${activeStore}** স্টোরের আপনার সার্বক্ষণিক অপারেশন অ্যাসিস্ট্যান্ট।\n\n- লাইভ মঙ্গোডিবি ও বিগত ৭৯+ দিনের ঐতিহাসিক সেলস রেকর্ড অ্যাক্সেস\n- গতকালের সেলস, ৪টি সময়ভিত্তিক স্লট ও বিগত ৭ দিনের পারফরম্যান্স টেবিল\n- ৭/১৪/৩০ দিনের রোলিং টার্গেট রিকভারি (A(t) = T(t) + C(t))\n- কলকাতার আবহাওয়া ও ফ্লোর কনভার্সন বৃদ্ধির কৌশল (>৭০%)\n\n*নিচের প্রিসেট বেছে নিন বা আপনার প্রশ্ন লিখুন।*`,
      hi: `👋 **सिटीमार्ट रिटेल AI को-पायलट में आपका स्वागत है!**\n\nमैं **${activeStore}** स्टोर के लिए आपका समर्पित ऑपरेशंस असिस्टेंट हूँ।\n\n- लाइव मोंगोडीबी व पिछले 79+ दिनों के ऐतिहासिक रिकॉर्ड्स तक पूरी पहुंच\n- कल की कुल बिक्री, ४-टाइम स्लॉट व पिछले 7 दिनों की दैनिक तालिका\n- 7/14/30-दिवसीय रोलिंग डेफिसिट टारगेट रिकवरी (A(t) = T(t) + C(t))\n- कोलकाता का लाइव मौसम व फ्लोर कन्वर्शन दर बढ़ाने के उपाय (>70%)\n\n*नीचे दिए गए प्रीसेट चुनें या अपना प्रश्न पूछें।*`,
    };
    return {
      id: "welcome",
      role: "assistant",
      content: welcomeMap[lang] || welcomeMap.en,
      engine: "citimart-multi-agent-system",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  };

  useEffect(() => {
    setChatLanguage(globalLanguage);
  }, [globalLanguage]);

  // Restore active session from localStorage on store change or mount
  useEffect(() => {
    // A shared conversation link (?chat=) takes precedence; the effect below loads it.
    if (linkedSessionId) return;
    const storageKey = sessionKey(activeStore);
    const savedSessionId = localStorage.getItem(storageKey);
    if (savedSessionId) {
      api.getChatSessionHistory(savedSessionId)
        .then((res) => {
          if (res.messages && res.messages.length > 0) {
            setMessages(toChatMessages(res.messages));
            setActiveSessionId(savedSessionId);
          } else {
            setActiveSessionId(null);
            setMessages([getWelcomeMessage(chatLanguage)]);
          }
        })
        .catch(() => {
          localStorage.removeItem(storageKey);
          setActiveSessionId(null);
          setMessages([getWelcomeMessage(chatLanguage)]);
        });
    } else {
      setActiveSessionId(null);
      setMessages([getWelcomeMessage(chatLanguage)]);
    }
  }, [activeStore]);

  // Shared conversation link: /app?chat=<session_id>. The backend only returns a
  // session to its owner or an admin, so anyone else gets a 404 -> toast.
  useEffect(() => {
    if (rawChatParam === null) return;
    const dropParam = () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("chat");
          return next;
        },
        { replace: true },
      );
    if (!linkedSessionId) {
      toast.error("That conversation link is not valid.");
      setMessages([getWelcomeMessage(chatLanguage)]);
      dropParam();
      return;
    }
    let cancelled = false;
    api.getChatSessionHistory(linkedSessionId)
      .then((res) => {
        if (cancelled) return;
        const rows = res.messages || [];
        if (rows.length === 0) throw new Error("empty");
        const store = transcriptStore(rows);
        const storeSel = storeSelForCode(store);
        if (isAdmin && store && storeSel && store !== activeStore) {
          // Switch the app to that chat's store; the store-change restore effect
          // then picks this session up from localStorage.
          localStorage.setItem(sessionKey(store), linkedSessionId);
          navigate(appHref({ store: storeSel }), { replace: true });
        } else {
          setMessages(toChatMessages(rows));
          setActiveSessionId(linkedSessionId);
          localStorage.setItem(sessionKey(activeStore), linkedSessionId);
          dropParam();
        }
        setIsOpen(true);
        toast.success("Opened shared conversation.");
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("This conversation isn't available to your account.");
        setMessages([getWelcomeMessage(chatLanguage)]);
        dropParam();
      });
    return () => {
      cancelled = true;
    };
  }, [rawChatParam]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const chatMutation = useMutation({
    mutationFn: async ({ message, lang }: { message: string; lang: Language }) => {
      return api.sendChatMessage({
        message,
        session_id: activeSessionId,
        store_code: activeStore,
        target_date: selectedDate,
        language: lang,
      });
    },
    onSuccess: (data) => {
      setLastTurnUsage({ usage: data.usage ?? null, limits: data.limits ?? null });
      void queryClient.invalidateQueries({ queryKey: [CHAT_USAGE_QUERY_KEY] });
      if (data.session_id) {
        setActiveSessionId(data.session_id);
        localStorage.setItem(`citimart_ai_active_session_${activeStore}`, data.session_id);
      }
      const assistantMsg: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: data.reply || "No response received.",
        engine: data.engine || "gemini",
        scope: data.store_code && data.target_date ? `${data.store_code} · ${data.target_date}` : undefined,
        storeCode: data.store_code,
        targetDate: data.target_date,
        links: data.links,
        suggestions: data.suggestions,
        timestamp: fmtTime(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    },
    onError: (err: any) => {
      const errMsg = err?.response?.data?.detail || err?.message || "Failed to communicate with AI Chatbot.";
      toast.error(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: `⚠️ **Error:** ${errMsg}\n\nPlease verify network connection or your session access.`,
          engine: "error-handler",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    },
  });

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || chatMutation.isPending) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    chatMutation.mutate({ message: text, lang: chatLanguage });
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    const storageKey = `citimart_ai_active_session_${activeStore}`;
    localStorage.removeItem(storageKey);
    setLastTurnUsage(null);
    setActiveSessionId(null);
    setMessages([getWelcomeMessage(chatLanguage)]);
    setShowSessionDrawer(false);
    toast.info("Started fresh shift conversation.");
  };

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await api.listChatSessions(activeStore);
      setSessionsList(res.sessions || []);
    } catch {
      toast.error("Failed to load shift conversations");
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleOpenDrawer = () => {
    setConfirmClearAll(false);
    setShowSessionDrawer(true);
    fetchSessions();
  };

  const handleClearAllSessions = async () => {
    setIsClearingAll(true);
    try {
      const res = await api.clearChatSessions(activeStore);
      setConfirmClearAll(false);
      // Re-fetch: an admin's list also shows other users' chats, which are kept.
      const remaining = (await api.listChatSessions(activeStore)).sessions || [];
      setSessionsList(remaining);
      if (activeSessionId && !remaining.some((s) => s.session_id === activeSessionId)) {
        localStorage.removeItem(`citimart_ai_active_session_${activeStore}`);
        setLastTurnUsage(null);
        setActiveSessionId(null);
        setMessages([getWelcomeMessage(chatLanguage)]);
      }
      toast.success(
        res.deleted > 0
          ? `Cleared ${res.deleted} shift conversation${res.deleted === 1 ? "" : "s"}.`
          : "You have no conversations of your own to clear here.",
      );
    } catch (err) {
      // Surface the server's reason (e.g. "405 Method Not Allowed" from a backend
      // that predates this route, or "Store not accessible.") instead of a bare failure.
      const reason = err instanceof Error && err.message ? `: ${err.message}` : "";
      toast.error(`Failed to clear shift conversations${reason}`);
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleSelectSession = async (sess: any) => {
    try {
      const res = await api.getChatSessionHistory(sess.session_id);
      if (res.messages && res.messages.length > 0) {
        setMessages(toChatMessages(res.messages));
        setLastTurnUsage(null);
        setActiveSessionId(sess.session_id);
        localStorage.setItem(`citimart_ai_active_session_${activeStore}`, sess.session_id);
        setShowSessionDrawer(false);
        toast.success(`Loaded "${sess.title || "Shift Conversation"}"`);
      }
    } catch {
      toast.error("Failed to load conversation history");
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await api.deleteChatSession(sessionId);
      setSessionsList((prev) => prev.filter((s) => s.session_id !== sessionId));
      if (activeSessionId === sessionId) {
        handleClearHistory();
      }
      toast.success("Shift conversation deleted.");
    } catch {
      toast.error("Failed to delete session");
    }
  };

  const currentPresets = PROMPT_PRESETS[chatLanguage] || PROMPT_PRESETS.en;
  const filteredPresets = selectedCategory === "all"
    ? currentPresets
    : currentPresets.filter((p) => p.category === selectedCategory);

  const getCategoryLabel = (cat: typeof PRESET_CATEGORIES[0]) => {
    if (chatLanguage === "bn") return cat.labelBn;
    if (chatLanguage === "hi") return cat.labelHi;
    return cat.labelEn;
  };

  return (
    <>
      {/* Floating Trigger Button (Optional fallback, disabled by default in favor of TopBar circular trigger) */}
      {showFloatingTrigger && (
        <div className="fixed bottom-5 right-5 z-40">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen((prev) => !prev)}
            className="relative flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-2.5 py-1.5 text-white shadow-xl hover:shadow-indigo-500/30 transition-all border border-indigo-400/40 cursor-pointer h-8"
            aria-label="Open AI Assistant"
          >
            <div className="relative">
              <Bot className="size-3.5" />
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 animate-pulse border border-slate-900" />
            </div>
            <span className="text-[11px] font-bold tracking-tight hidden sm:inline">CITIMART AI</span>
            <span className="rounded bg-indigo-500/40 px-1 py-0.2 text-[9px] font-mono tracking-tight text-indigo-100">
              {activeStore}
            </span>
          </motion.button>
        </div>
      )}

      {/* Slide-over / Modal Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className={`fixed z-50 flex flex-col bg-slate-950/95 backdrop-blur-xl border border-slate-800 shadow-2xl rounded-2xl overflow-hidden transition-all ${
              isExpanded
                ? "inset-4 sm:inset-10"
                : "top-16 right-3 sm:right-6 w-[94vw] sm:w-[500px] h-[640px] max-h-[calc(100vh-5rem)]"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3 bg-gradient-to-r from-slate-900/90 via-indigo-950/40 to-slate-900/90">
              <div className="flex items-center gap-2.5">
                <div className="relative size-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md border border-indigo-400/30">
                  <Bot className="size-5" />
                  <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-100 tracking-wide">
                      CITIMART AI Co-Pilot
                    </h3>
                    <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">
                      {activeStore}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    Multi-Agent LangGraph • 79+ Days DB
                  </p>
                </div>
              </div>

              {/* Actions & Language Selector */}
              <div className="flex items-center gap-1">
                <ChatUsageMeter
                  sessionId={activeSessionId}
                  lastTurn={lastTurnUsage?.usage}
                  lastLimits={lastTurnUsage?.limits}
                />
                {/* Language Switcher */}
                <div className="flex items-center bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/60 mr-1">
                  {(["en", "bn", "hi"] as Language[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setChatLanguage(l)}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase transition cursor-pointer ${
                        chatLanguage === l
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                      title={l === "en" ? "English" : l === "bn" ? "বাংলা" : "हिंदी"}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-7 ${
                    showGuideDrawer
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "text-slate-400 hover:text-amber-300 hover:bg-slate-800/60"
                  }`}
                  onClick={() => {
                    setShowSessionDrawer(false);
                    setShowGuideDrawer((prev) => !prev);
                  }}
                  title="How to ask for accurate data"
                >
                  <HelpCircle className="size-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-7 ${
                    showSessionDrawer
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                  onClick={() => {
                    setShowGuideDrawer(false);
                    if (showSessionDrawer) {
                      setShowSessionDrawer(false);
                    } else {
                      handleOpenDrawer();
                    }
                  }}
                  title="Past Shift Conversations"
                >
                  <History className="size-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-40"
                  onClick={() => copyShareLink(activeSessionId)}
                  disabled={!activeSessionId}
                  title={activeSessionId ? "Copy link to this conversation" : "Ask a question first to get a link"}
                >
                  <Link2 className="size-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  onClick={handleClearHistory}
                  title="Clear conversation"
                >
                  <Trash2 className="size-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 hidden sm:inline-flex"
                  onClick={() => setIsExpanded((prev) => !prev)}
                  title={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-slate-400 hover:text-rose-400 hover:bg-slate-800/60"
                  onClick={() => setIsOpen(false)}
                  title="Close"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {/* Usage Guide Drawer Overlay */}
            <AnimatePresence>
              {showGuideDrawer && (
                <ChatUsageGuide
                  language={chatLanguage}
                  activeStore={activeStore}
                  isAdmin={isAdmin}
                  onClose={() => setShowGuideDrawer(false)}
                  onSelectPrompt={(prompt) => handleSendMessage(prompt)}
                />
              )}
            </AnimatePresence>

            {/* Past Shift Conversations Drawer Overlay */}
            <AnimatePresence>
              {showSessionDrawer && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute inset-0 top-[57px] z-30 bg-slate-950/98 backdrop-blur-md flex flex-col"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-2.5 bg-slate-900/80">
                    <div className="flex items-center gap-2">
                      <History className="size-4 text-indigo-400" />
                      <span className="text-xs font-bold text-slate-200">Past Shift Conversations</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmClearAll(true)}
                        disabled={isLoadingSessions || isClearingAll || sessionsList.length === 0}
                        className="h-7 text-[11px] border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-rose-600 hover:text-white hover:border-rose-500 flex items-center gap-1.5 disabled:opacity-40"
                        title="Delete all your conversations for this store"
                      >
                        <Trash2 className="size-3" />
                        <span>Clear All</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClearHistory}
                        className="h-7 text-[11px] border-slate-700 bg-slate-800/80 hover:bg-indigo-600 hover:text-white flex items-center gap-1.5"
                      >
                        <Plus className="size-3" />
                        <span>New Shift Chat</span>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setShowSessionDrawer(false)}
                        className="size-7 text-slate-400 hover:text-slate-200"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Clear-all confirmation (inline, so it can't be a stray single click) */}
                  {confirmClearAll && (
                    <div
                      role="alertdialog"
                      aria-label="Confirm clearing all conversations"
                      className="mx-3 mt-3 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3"
                    >
                      <p className="text-xs font-semibold text-rose-200">
                        Delete all your {activeStore} shift conversations?
                      </p>
                      <p className="mt-1 text-[11px] text-rose-200/70">
                        This permanently removes every message in them and can't be undone.
                        {isAdmin && " Store managers' conversations are not affected."}
                      </p>
                      <div className="mt-2.5 flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmClearAll(false)}
                          disabled={isClearingAll}
                          className="h-7 text-[11px] text-slate-300 hover:text-white"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleClearAllSessions}
                          disabled={isClearingAll}
                          className="h-7 text-[11px] bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5"
                        >
                          {isClearingAll ? <RefreshCw className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                          <span>{isClearingAll ? "Clearing..." : "Delete All"}</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* List of Sessions */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {isLoadingSessions ? (
                      <div className="flex items-center justify-center p-8 text-slate-400 text-xs gap-2">
                        <RefreshCw className="size-4 animate-spin text-indigo-400" />
                        <span>Loading shift conversations...</span>
                      </div>
                    ) : sessionsList.length === 0 ? (
                      <div className="text-center p-8 text-slate-500 text-xs">
                        No previous shift conversations recorded for {activeStore}.
                      </div>
                    ) : (
                      sessionsList.map((s) => {
                        const isActive = s.session_id === activeSessionId;
                        const phaseLabels: Record<string, string> = {
                          morning_briefing: "🌅 Morning Briefing",
                          midday_pacing: "☀️ Mid-day Pacing",
                          evening_surge: "🌆 Evening Surge",
                          night_closing: "🌙 Night Closing",
                        };
                        const phaseName = phaseLabels[s.shift_phase] || s.shift_phase || "Shift Chat";
                        const updatedDate = s.updated_at
                          ? new Date(s.updated_at).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "";

                        return (
                          <div
                            key={s.session_id}
                            onClick={() => handleSelectSession(s)}
                            className={`group flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                              isActive
                                ? "bg-indigo-950/60 border-indigo-500/60 text-slate-100 shadow-md"
                                : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700 text-slate-300"
                            }`}
                          >
                            <div className="flex-1 min-w-0 pr-2">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                                  {phaseName}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {updatedDate}
                                </span>
                              </div>
                              <p className="text-xs font-medium truncate text-slate-200">
                                {s.title || "Retail Shift Conversation"}
                              </p>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {s.message_count || 0} messages • Store: {s.store_code || activeStore}
                              </div>
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => copyShareLink(s.session_id, e)}
                              className="size-7 text-slate-500 hover:text-sky-300 hover:bg-sky-500/10 shrink-0 opacity-80 group-hover:opacity-100"
                              title="Copy link to this conversation"
                            >
                              <Link2 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => handleDeleteSession(e, s.session_id)}
                              className="size-7 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 shrink-0 opacity-80 group-hover:opacity-100"
                              title="Delete shift conversation"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Presets Header Ribbon */}
            <div className="border-b border-slate-800/70 bg-slate-900/60 px-3 py-2 space-y-1.5">
              {/* Category Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                {PRESET_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition cursor-pointer border ${
                      selectedCategory === cat.id
                        ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
                        : "bg-slate-800/70 text-slate-300 border-slate-700/50 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {getCategoryLabel(cat)}
                  </button>
                ))}
              </div>

              {/* Granular Preset Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {filteredPresets.slice(0, 10).map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSendMessage(p.prompt)}
                      disabled={chatMutation.isPending}
                      className="shrink-0 flex items-center gap-1.5 rounded-full bg-slate-800/80 hover:bg-indigo-600/30 hover:border-indigo-500/50 border border-slate-700/60 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition cursor-pointer shadow-sm"
                    >
                      <Icon className="size-3 text-indigo-400" />
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                const isCopied = copiedId === m.id;
                const isLatest = idx === messages.length - 1;
                const msgStore = (m.storeCode || activeStore).toUpperCase();
                const msgStoreSel = storeSelForCode(isAdmin ? msgStore : user?.storeCode || msgStore);
                const appChips = (m.links || []).filter((l) => l.kind === "app" && isAppHref(l.href));
                const sourceChips = (m.links || []).filter((l) => l.kind === "source" && isHttpUrl(l.href));
                const scopeHref =
                  msgStoreSel && isIsoDate(m.targetDate ?? null)
                    ? appHref({ store: msgStoreSel, view: "history", date: m.targetDate })
                    : null;

                return (
                  <div key={m.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`size-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold shadow ${
                        isUser
                          ? "bg-gradient-to-tr from-blue-600 to-cyan-500 text-white"
                          : "bg-gradient-to-tr from-indigo-600 to-purple-600 text-white border border-indigo-400/40"
                      }`}
                    >
                      {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                    </div>

                    {/* Bubble Content */}
                    <div
                      className={`group relative max-w-[92%] sm:max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed shadow-md ${
                        isUser
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none"
                          : "bg-slate-900/90 text-slate-200 border border-slate-800 rounded-tl-none"
                      }`}
                    >
                      {/* Copy Action on Hover */}
                      {!isUser && (
                        <button
                          onClick={() => handleCopy(m.content, m.id)}
                          className="absolute -top-2 -right-2 hidden group-hover:flex size-6 items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white shadow transition cursor-pointer"
                          title="Copy response"
                        >
                          {isCopied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                        </button>
                      )}

                      {/* Assistant replies are markdown; user text stays plain. */}
                      {isUser ? (
                        <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                      ) : (
                        <div className="space-y-2">
                          <ReactMarkdown
                            remarkPlugins={[
                              remarkGfm,
                              [remarkChatLinks, { storeCode: msgStore, isAdmin, userStoreCode: user?.storeCode }],
                            ]}
                            components={markdownComponentsFor(m)}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      )}

                      {/* Navigation chips (backend-built) */}
                      {!isUser && appChips.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {appChips.map((l) => (
                            <a
                              key={l.href}
                              href={l.href}
                              onClick={(e) => onLinkClick(e, l.href)}
                              className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10.5px] font-medium text-sky-200 hover:bg-sky-500/25 hover:text-white transition"
                            >
                              <ArrowUpRight className="size-3" />
                              {l.label}
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Web sources the answer drew on */}
                      {!isUser && sourceChips.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sources</div>
                          {sourceChips.map((l) => (
                            <a
                              key={l.href}
                              href={l.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 truncate text-[10.5px] text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
                              title={l.href}
                            >
                              <ExternalLink className="size-3 shrink-0" />
                              <span className="truncate">{l.label}</span>
                              <span className="shrink-0 text-slate-500">· {new URL(l.href).hostname}</span>
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Footer Info */}
                      <div
                        className={`mt-2 flex items-center justify-between gap-2 text-[10px] ${
                          isUser ? "text-blue-200/80" : "text-slate-500"
                        }`}
                      >
                        {!isUser && m.engine && (
                          <span className="inline-flex items-center gap-1 font-mono text-[9px] text-indigo-400">
                            <Sparkles className="size-2.5" />
                            {m.engine}
                          </span>
                        )}
                        {!isUser && m.scope && (scopeHref ? (
                          <a
                            href={scopeHref}
                            onClick={(e) => onLinkClick(e, scopeHref)}
                            className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] text-sky-300 hover:bg-sky-500/20 hover:text-white transition"
                            title="Open this store and date in History"
                          >
                            {m.scope} ↗
                          </a>
                        ) : (
                          <span
                            className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] text-slate-300"
                            title="Store and date these figures are for"
                          >
                            {m.scope}
                          </span>
                        ))}
                        <span>{m.timestamp}</span>
                      </div>
                    </div>
                  </motion.div>
                  {/* Follow-up suggestions under the latest reply */}
                  {!isUser && isLatest && !chatMutation.isPending && (m.suggestions?.length ?? 0) > 0 && (
                    <div className="ml-9 mt-1.5 flex flex-wrap gap-1.5">
                      {m.suggestions!.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleSendMessage(s)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-700/70 bg-slate-900/80 px-2.5 py-1 text-[10.5px] text-slate-300 hover:border-indigo-500/60 hover:bg-indigo-600/25 hover:text-white transition cursor-pointer"
                        >
                          <CornerDownRight className="size-3 text-indigo-400" />
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  </div>
                );
              })}

              {/* Typing / Thinking Indicator */}
              {chatMutation.isPending && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-slate-400 text-xs pl-2"
                >
                  <div className="size-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
                    <RefreshCw className="size-3.5 animate-spin" />
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-indigo-300">
                    <span>Multi-Agent Swarm Reasoning</span>
                    <span className="flex gap-0.5">
                      <span className="size-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="size-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="size-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="border-t border-slate-800 p-3 bg-slate-900/90">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={
                      chatLanguage === "bn"
                        ? "আপনার প্রশ্ন লিখুন (যেমন: গতকালের সেলস ও স্লট কত?)..."
                        : chatLanguage === "hi"
                        ? "अपना प्रश्न लिखें (जैसे: कल की कुल बिक्री और पीक स्लॉट क्या थे?)..."
                        : "Ask about yesterday's sales, 7-day table, rolling target recovery..."
                    }
                    disabled={chatMutation.isPending}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-3.5 pr-9 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                  <ChatQueryTipPopover
                    language={chatLanguage}
                    isAdmin={isAdmin}
                    onSelectPrompt={(prompt) => handleSendMessage(prompt)}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!inputMessage.trim() || chatMutation.isPending}
                  className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-3.5 py-2.5 text-white shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  <Send className="size-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
