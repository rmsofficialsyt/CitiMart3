import { motion } from "framer-motion";
import {
  Calendar,
  CheckCircle2,
  Compass,
  HelpCircle,
  Lightbulb,
  Sparkles,
  Store,
  Target,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Language } from "@/lib/translations";

interface GuideRule {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  goodExample: string;
  avoidExample?: string;
}

interface QuickExample {
  label: string;
  prompt: string;
  adminOnly?: boolean;
}

interface GuideCopy {
  headerTitle: string;
  headerSubtitle: string;
  rulesHeading: string;
  examplesHeading: string;
  goodLabel: string;
  avoidLabel: string;
  formulaTitle: string;
  formulaPattern: string;
  formulaHint: string;
  quickTipButtonTitle: string;
  rules: GuideRule[];
  examples: QuickExample[];
}

const GUIDE_COPY: Record<Language, GuideCopy> = {
  en: {
    headerTitle: "How to Fetch Exact Data",
    headerSubtitle: "Follow these 4 rules so the Co-Pilot queries the exact MongoDB records.",
    rulesHeading: "4 Rules for Accurate Answers",
    examplesHeading: "Try a Verified Query",
    goodLabel: "Ask",
    avoidLabel: "Avoid",
    formulaTitle: "Quick Query Formula",
    formulaPattern: "[Date / Range] + [Store] + [KPI or Report]",
    formulaHint: "Keep one clear metric per question. Check the Store · Date badge on the reply to verify scope.",
    quickTipButtonTitle: "Query tips for accurate data",
    rules: [
      {
        icon: Calendar,
        title: "1. Give a Specific Date or Range",
        description:
          "Use today, yesterday, an exact date (18 Nov or 2026-11-20), past 7 days, MTD, or WoW (same weekday last week).",
        goodExample: "Yesterday's net sales & 4-time-slot breakdown",
        avoidExample: "How were sales recently?",
      },
      {
        icon: Store,
        title: "2. Mind Your Store Scope",
        description:
          "Store Managers automatically query their assigned store. Admins can name NM (New Market), HB (Hatibagan), CHW (Chowringhee), or compare all stores.",
        goodExample: "Compare all stores for yesterday / HB past 7 days",
        avoidExample: "Check the other branch (non-admin)",
      },
      {
        icon: Target,
        title: "3. Ask One Clear Metric or Report",
        description:
          "Name the exact report: net sales, footfall, NOB, ATV, conversion %, 7-day rolling target adjustment, highest single bill, requisitions, directives, or KPI formula.",
        goodExample: "Simulate 7 vs 14 vs 30-day target recovery",
        avoidExample: "Tell me everything about sales, weather, and bills",
      },
      {
        icon: CheckCircle2,
        title: "4. Verify Scope & Dashboard Links",
        description:
          "Every reply displays a Store · Date badge showing what MongoDB returned, plus clickable chips to open that exact day in the dashboard.",
        goodExample: "Click the Store · Date chip under any reply to inspect raw bills",
      },
    ],
    examples: [
      {
        label: "Today's Net Sales Only",
        prompt: "What is today's net sales only?",
      },
      {
        label: "Yesterday's 4-Slot Sales",
        prompt: "Show yesterday's net sales, target achievement %, footfall, conversion %, ATV, and 4-time-slot breakdown.",
      },
      {
        label: "Past 7 Days Table",
        prompt: "Show a day-by-day table of our past 7 operating days with net sales, targets, footfall, bills, and ATV.",
      },
      {
        label: "MTD Pacing & Run-Rate",
        prompt: "Calculate our Month-To-Date (MTD) cumulative sales, achievement %, and required daily run-rate.",
      },
      {
        label: "7 vs 14 vs 30-Day Recovery",
        prompt: "Simulate rolling deficit recovery across 7-day vs 14-day vs 30-day windows.",
      },
      {
        label: "Compare All Stores",
        prompt: "Compare and rank NM, HB, and CHW stores on net sales and target achievement.",
        adminOnly: true,
      },
    ],
  },
  bn: {
    headerTitle: "সঠিক তথ্য খোঁজার নির্দেশিকা",
    headerSubtitle: "মঙ্গোডিবি থেকে নির্ভুল ডেটা পেতে এই ৪টি নিয়ম অনুসরণ করুন।",
    rulesHeading: "নির্ভুল উত্তরের ৪টি নিয়ম",
    examplesHeading: "যাচাইকৃত প্রশ্ন চেষ্টা করুন",
    goodLabel: "লিখুন",
    avoidLabel: "এড়িয়ে চলুন",
    formulaTitle: "দ্রুত প্রশ্নের ফর্মুলা",
    formulaPattern: "[তারিখ / সময়সীমা] + [স্টোর] + [KPI বা রিপোর্ট]",
    formulaHint: "প্রতি প্রশ্নে একটি স্পষ্ট বিষয় রাখুন। উত্তরের নিচে Store · Date ব্যাজ দেখে স্কোপ যাচাই করুন।",
    quickTipButtonTitle: "সঠিক তথ্য পাওয়ার টিপস",
    rules: [
      {
        icon: Calendar,
        title: "১. নির্দিষ্ট তারিখ বা সময়সীমা উল্লেখ করুন",
        description:
          "আজ, গতকাল, নির্দিষ্ট তারিখ (যেমন 2026-11-20 বা 18 Nov), গত ৭ দিন, MTD বা WoW (গত সপ্তাহের একই দিন) ব্যবহার করুন।",
        goodExample: "গতকালের নেট সেলস ও ৪টি টাইম-স্লট রিপোর্ট দেখাও",
        avoidExample: "ইদানীং সেলস কেমন হচ্ছে?",
      },
      {
        icon: Store,
        title: "২. স্টোর স্কোপ সম্পর্কে স্পষ্ট থাকুন",
        description:
          "স্টোর ম্যানেজাররা কেবল নিজের স্টোরের তথ্য দেখেন। অ্যাডমিনরা NM, HB, CHW নাম উল্লেখ করতে বা সব স্টোরের তুলনা চাইতে পারেন।",
        goodExample: "গতকাল সব স্টোরের তুলনা দেখাও / HB গত ৭ দিন",
        avoidExample: "অন্য ব্রাঞ্চের সেলস দেখাও (ম্যানেজার হলে)",
      },
      {
        icon: Target,
        title: "৩. এক প্রশ্নে একটি স্পষ্ট KPI বা রিপোর্ট চান",
        description:
          "নেট সেলস, ফুটফল, NOB, ATV, কনভার্সন %, ৭-দিনের টার্গেট অ্যাডজাস্টমেন্ট, সর্বোচ্চ বিল, রিকুইজিশন বা KPI সূত্র স্পষ্ট করে লিখুন।",
        goodExample: "৭ বনাম ১৪ বনাম ৩০ দিনের টার্গেট রিকভারি সিমুলেট করো",
        avoidExample: "সেলস, আবহাওয়া ও সব বিল একসাথে বলো",
      },
      {
        icon: CheckCircle2,
        title: "৪. Store · Date ব্যাজ ও ড্যাশবোর্ড লিংক যাচাই করুন",
        description:
          "প্রতিটি উত্তরের নিচে থাকা Store · Date ব্যাজ ও ড্যাশবোর্ড লিংক চিপে ক্লিক করে সরাসরি আসল রেকর্ড দেখতে পারবেন।",
        goodExample: "উত্তরের নিচের ড্যাশবোর্ড লিংকে ক্লিক করে মূল তথ্য দেখুন",
      },
    ],
    examples: [
      {
        label: "আজকের শুধু নেট সেলস",
        prompt: "আজকের শুধু নেট সেলস কত?",
      },
      {
        label: "গতকালের ৪-স্লট সেলস",
        prompt: "গতকালের সম্পূর্ণ সেলস রিপোর্ট, টার্গেট অ্যাচিভমেন্ট %, ফুটফল, কনভার্সন %, ATV এবং ৪টি টাইম-স্লট দেখাও।",
      },
      {
        label: "গত ৭ দিনের টেবিল",
        prompt: "গত ৭ কার্যদিবসের নেট সেলস, টার্গেট, ফুটফল, বিল ও ATV-এর দৈনিক টেবিল দেখাও।",
      },
      {
        label: "MTD পেসিং ও রান-রেট",
        prompt: "চলতি মাসের MTD মোট সেলস, অ্যাচিভমেন্ট % এবং বাকি দিনের প্রয়োজনীয় দৈনিক রান-রেট হিসাব করো।",
      },
      {
        label: "৭ বনাম ১৪ বনাম ৩০ দিন রিকভারি",
        prompt: "৭ দিন, ১৪ দিন ও ৩০ দিনের রোলিং ডেফিসিট রিকভারি সিমুলেট করো।",
      },
      {
        label: "সব স্টোরের তুলনা",
        prompt: "নেট সেলস ও টার্গেট অ্যাচিভমেন্টের ভিত্তিতে NM, HB এবং CHW স্টোরের তুলনা দেখাও।",
        adminOnly: true,
      },
    ],
  },
  hi: {
    headerTitle: "सटीक डेटा पाने की गाइड",
    headerSubtitle: "MongoDB से बिल्कुल सही आंकड़े पाने के लिए इन 4 नियमों का पालन करें।",
    rulesHeading: "सटीक उत्तर के 4 नियम",
    examplesHeading: "सत्यापित प्रश्न आज़माएँ",
    goodLabel: "पूछें",
    avoidLabel: "बचें",
    formulaTitle: "त्वरित प्रश्न फ़ॉर्मूला",
    formulaPattern: "[तारीख / अवधि] + [स्टोर] + [KPI या रिपोर्ट]",
    formulaHint: "एक प्रश्न में एक स्पष्ट विषय पूछें। उत्तर के नीचे Store · Date बैज से स्कोप जांचें।",
    quickTipButtonTitle: "सटीक डेटा पूछने के टिप्स",
    rules: [
      {
        icon: Calendar,
        title: "1. स्पष्ट तारीख या अवधि लिखें",
        description:
          "आज, कल, सटीक तारीख (जैसे 2026-11-20 या 18 Nov), पिछले 7 दिन, MTD, या WoW (पिछले हफ्ते का वही दिन) का उपयोग करें।",
        goodExample: "कल की नेट सेल्स और 4-टाइम-स्लॉट रिपोर्ट दिखाओ",
        avoidExample: "हाल ही में बिक्री कैसी रही?",
      },
      {
        icon: Store,
        title: "2. स्टोर स्कोप स्पष्ट रखें",
        description:
          "स्टोर मैनेजर केवल अपने स्टोर का डेटा देखते हैं। एडमिन NM, HB, CHW का नाम लिख सकते हैं या सभी स्टोर्स की तुलना पूछ सकते हैं।",
        goodExample: "कल के लिए सभी स्टोर्स की तुलना करें / HB पिछले 7 दिन",
        avoidExample: "दूसरे स्टोर की बिक्री दिखाओ (मैनेजर होने पर)",
      },
      {
        icon: Target,
        title: "3. एक स्पष्ट मेट्रिक या रिपोर्ट पूछें",
        description:
          "नेट सेल्स, फुटफॉल, NOB, ATV, कन्वर्शन %, 7-दिन रोलिंग टारगेट एडजस्टमेंट, सबसे बड़ा बिल, रिक्विजिशन या KPI फ़ॉर्मूला स्पष्ट लिखें।",
        goodExample: "7 बनाम 14 बनाम 30-दिन की टारगेट रिकवरी सिमुलेट करें",
        avoidExample: "बिक्री, मौसम और सभी बिल एक साथ बताओ",
      },
      {
        icon: CheckCircle2,
        title: "4. Store · Date बैज और डैशबोर्ड लिंक जांचें",
        description:
          "हर उत्तर में Store · Date बैज दिखता है और डैशबोर्ड चिप्स पर क्लिक करके आप सीधे उस दिन के रिकॉर्ड खोल सकते हैं।",
        goodExample: "रॉ डेटा देखने के लिए उत्तर के नीचे डैशबोर्ड लिंक पर क्लिक करें",
      },
    ],
    examples: [
      {
        label: "आज की सिर्फ नेट सेल्स",
        prompt: "आज की सिर्फ नेट सेल्स क्या है?",
      },
      {
        label: "कल की 4-स्लॉट बिक्री",
        prompt: "कल की पूरी सेल्स रिपोर्ट, टारगेट अचीवमेंट %, फुटफॉल, कन्वर्शन %, ATV और 4-टाइम-स्लॉट विवरण दिखाएं।",
      },
      {
        label: "पिछले 7 दिनों की तालिका",
        prompt: "पिछले 7 कार्यदिवसों की नेट सेल्स, टारगेट, फुटफॉल, बिल और ATV की दैनिक तालिका दिखाएं।",
      },
      {
        label: "MTD पेसिंग और रन-रेट",
        prompt: "इस महीने की MTD कुल बिक्री, अचीवमेंट % और बाकी दिनों का आवश्यक दैनिक रन-रेट निकालें।",
      },
      {
        label: "7 बनाम 14 बनाम 30-दिन रिकवरी",
        prompt: "7-दिन, 14-दिन और 30-दिन की विंडो में रोलिंग डेफिसिट रिकवरी सिमुलेट करें।",
      },
      {
        label: "सभी स्टोर्स की तुलना",
        prompt: "नेट सेल्स और टारगेट अचीवमेंट के आधार पर NM, HB और CHW स्टोर्स की तुलना और रैंकिंग दिखाएं।",
        adminOnly: true,
      },
    ],
  },
};

interface ChatUsageGuideProps {
  language: Language;
  activeStore: string;
  isAdmin: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

export function ChatUsageGuide({
  language,
  activeStore,
  isAdmin,
  onClose,
  onSelectPrompt,
}: ChatUsageGuideProps) {
  const copy = GUIDE_COPY[language] || GUIDE_COPY.en;
  const visibleExamples = copy.examples.filter((ex) => !ex.adminOnly || isAdmin);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute inset-0 top-[57px] z-30 bg-slate-950/98 backdrop-blur-md flex flex-col"
    >
      {/* Guide Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-2.5 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <Compass className="size-4 text-amber-400" />
          <div>
            <span className="text-xs font-bold text-slate-100 block">{copy.headerTitle}</span>
            <span className="text-[10px] text-slate-400 block">{copy.headerSubtitle}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-300 border border-blue-500/30">
            {activeStore}
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            className="size-7 text-slate-400 hover:text-slate-200"
            title="Close guide"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {/* Formula Banner */}
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/30 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-300">
            <Lightbulb className="size-3.5 text-amber-400 shrink-0" />
            <span>{copy.formulaTitle}</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-slate-100 bg-slate-950/70 rounded-lg px-2.5 py-1.5 border border-slate-800">
            {copy.formulaPattern}
          </p>
        </div>

        {/* 4 Rules */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
            {copy.rulesHeading}
          </p>
          {copy.rules.map((rule) => {
            const Icon = rule.icon;
            return (
              <div
                key={rule.title}
                className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <div className="size-6 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0">
                    <Icon className="size-3.5" />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-100">{rule.title}</h4>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300 pl-8">{rule.description}</p>
                <div className="pl-8 space-y-1 text-[10px]">
                  <div className="flex items-start gap-1.5 text-emerald-300">
                    <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold border border-emerald-500/30">
                      {copy.goodLabel}
                    </span>
                    <span className="font-mono text-slate-200 pt-0.5">"{rule.goodExample}"</span>
                  </div>
                  {rule.avoidExample && (
                    <div className="flex items-start gap-1.5 text-rose-300">
                      <span className="shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 font-semibold border border-rose-500/30">
                        {copy.avoidLabel}
                      </span>
                      <span className="font-mono text-slate-400 pt-0.5">"{rule.avoidExample}"</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Try Verified Examples */}
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
            {copy.examplesHeading}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visibleExamples.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  onClose();
                  onSelectPrompt(ex.prompt);
                }}
                className="flex items-center gap-1.5 rounded-full bg-slate-800/80 hover:bg-indigo-600/30 hover:border-indigo-500/50 border border-slate-700/60 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:text-white transition cursor-pointer"
              >
                <Sparkles className="size-3 text-amber-400 shrink-0" />
                <span>{ex.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface ChatQueryTipPopoverProps {
  language: Language;
  isAdmin: boolean;
  onSelectPrompt: (prompt: string) => void;
}

export function ChatQueryTipPopover({
  language,
  isAdmin,
  onSelectPrompt,
}: ChatQueryTipPopoverProps) {
  const copy = GUIDE_COPY[language] || GUIDE_COPY.en;
  const quickExamples = copy.examples.filter((ex) => !ex.adminOnly || isAdmin).slice(0, 3);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={copy.quickTipButtonTitle}
          aria-label={copy.quickTipButtonTitle}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 size-6 rounded-md flex items-center justify-center text-slate-400 hover:text-amber-300 hover:bg-slate-800/80 transition cursor-pointer"
        >
          <HelpCircle className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72 rounded-xl border border-slate-700/80 bg-slate-900/95 backdrop-blur-xl p-3 text-slate-100 shadow-2xl"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
            <Lightbulb className="size-3.5 shrink-0" />
            <span>{copy.formulaTitle}</span>
          </div>
          <p className="font-mono text-[10px] text-indigo-200 bg-slate-950/80 rounded-lg px-2 py-1.5 border border-slate-800">
            {copy.formulaPattern}
          </p>
          <p className="text-[11px] leading-relaxed text-slate-300">{copy.formulaHint}</p>
          <div className="pt-1 border-t border-slate-800/80 flex flex-wrap gap-1">
            {quickExamples.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => onSelectPrompt(ex.prompt)}
                className="rounded-full bg-slate-800 hover:bg-indigo-600/40 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-200 hover:text-white transition cursor-pointer"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
