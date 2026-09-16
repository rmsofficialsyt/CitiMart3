import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  Copy,
  Flame,
  Maximize2,
  Minimize2,
  RefreshCw,
  Send,
  Sparkles,
  Store,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@/lib/translations";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  engine?: string;
  timestamp: string;
}

interface AiChatbotProps {
  activeStore?: string;
  selectedDate?: string;
}

const PROMPT_TEMPLATES: Record<
  "en" | "hi" | "bn",
  Array<{ category: string; icon: typeof Sparkles; prompt: string; label: string }>
> = {
  en: [
    {
      category: "Sales & Target",
      icon: Flame,
      label: "Today's Target & Sales Status",
      prompt: "How is our store performing against target today? Show sales, target gap, and achievement %.",
    },
    {
      category: "Conversion & ATV",
      icon: Zap,
      label: "Boost ATV & Basket Size",
      prompt: "Suggest 3 proven tactics to increase ATV above ₹1,800 and boost basket size.",
    },
    {
      category: "Peak Hours",
      icon: Sparkles,
      label: "Peak Hours Strategy (3 PM - 9 PM)",
      prompt: "What are the priority action items for managers during peak shopping slots (3 PM - 9 PM)?",
    },
    {
      category: "Directives",
      icon: Store,
      label: "Operational Head's Directives",
      prompt: "What are the active operational directives and targets from the Operational Head?",
    },
    {
      category: "Formulas",
      icon: Bot,
      label: "KPI Formulas & Calculation",
      prompt: "Show me the exact mathematical formulas for Conversion %, ATV, SPH, and Basket Size.",
    },
  ],
  bn: [
    {
      category: "সেলস ও টার্গেট",
      icon: Flame,
      label: "আজকের সেলস ও টার্গেট স্ট্যাটাস",
      prompt: "আজকের সেলস, টার্গেট গ্যাপ এবং অ্যাচিভমেন্ট শতাংশের বিস্তারিত হিসেব দিন।",
    },
    {
      category: "কনভার্সন ও ATV",
      icon: Zap,
      label: "কনভার্সন ও ATV বাড়ানোর কৌশল",
      prompt: "আমাদের স্টোরের ATV ₹১,৮০০+ এ নিয়ে যেতে এবং কনভার্সন রেট বাড়াতে ৩টি সেরা কৌশল কী?",
    },
    {
      category: "পিক আওয়ার্স",
      icon: Sparkles,
      label: "পিক আওয়ার্স স্ট্র্যাটেজি (৩টা - ৯টা)",
      prompt: "পিক ট্রেডিং আওয়ারে (৩টা থেকে ৯টা) ফ্লোর সুপারভাইজারদের করণীয় কী কী?",
    },
    {
      category: "বসের নির্দেশনা",
      icon: Store,
      label: "রাফায়েল স্যারের নির্দেশাবলী",
      prompt: "রাফায়েল স্যারের সাম্প্রতিক সক্রিয় নির্দেশাবলী ও জরুরি নোটিশগুলো কী কী?",
    },
    {
      category: "সূত্রাবলী",
      icon: Bot,
      label: "মূল মেট্রিক্সের গাণিতিক সূত্র",
      prompt: "Conversion %, ATV, SPH এবং Basket Size গণনার অফিসিয়াল সূত্রগুলো দেখান।",
    },
  ],
  hi: [
    {
      category: "सेल्स व टारगेट",
      icon: Flame,
      label: "आज की बिक्री और टारगेट स्थिति",
      prompt: "आज की बिक्री, टारगेट गैप और अचीवमेंट प्रतिशत की पूरी रिपोर्ट बताएं।",
    },
    {
      category: "कन्वर्शन व ATV",
      icon: Zap,
      label: "ATV और बास्केट साइज बढ़ाएं",
      prompt: "स्टोर का ATV ₹1,800+ करने और कन्वर्शन रेट 70%+ रखने के 3 मुख्य तरीके बताएं।",
    },
    {
      category: "पीक ऑवर्स",
      icon: Sparkles,
      label: "पीक ऑवर्स मैनेजमेंट (3 PM - 9 PM)",
      prompt: "पीक ऑवर्स (3 PM से 9 PM) के दौरान फ्लोर मैनेजमेंट और कैशियर के लिए क्या जरूरी निर्देश हैं?",
    },
    {
      category: "निर्देश",
      icon: Store,
      label: "राफेल सर के हालिया निर्देश",
      prompt: "राफेल सर के एक्टिव ऑपरेशनल निर्देश और सेल्स टारगेट्स क्या हैं?",
    },
    {
      category: "सूत्र",
      icon: Bot,
      label: "KPI गणना और सूत्र",
      prompt: "कन्वर्शन रेट, ATV, SPH और बास्केट साइज की गणना के आधिकारिक फॉर्मूले बताएं।",
    },
  ],
};

export function AiChatbot({ activeStore = "NM", selectedDate }: AiChatbotProps) {
  const { user } = useAuth();
  const { language: globalLanguage } = useLanguage();
  const [chatLanguage, setChatLanguage] = useState<Language>(globalLanguage);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync with globalLanguage if not overridden locally
  useEffect(() => {
    setChatLanguage(globalLanguage);
  }, [globalLanguage]);

  // Initial welcome message tailored to language
  const getInitialMessage = (): ChatMessage => {
    const storeLabel =
      activeStore === "NM"
        ? "New Market"
        : activeStore === "HB"
        ? "Hatibagan"
        : activeStore === "CHW"
        ? "Chowringhee"
        : "All Stores";

    if (chatLanguage === "bn") {
      return {
        id: "welcome",
        role: "assistant",
        content: `নমস্কার ${user?.username || "ম্যানেজার"}! আমি **CITIMART AI ডিসিশন অ্যাডভাইজার**। বর্তমানে **${storeLabel}** এর লাইভ ডেটা সংযুক্ত রয়েছে। আপনি আজকের সেলস টার্গেট, কনভার্সন রেট, টাইম-স্লট স্ট্র্যাটেজি বা রাফায়েল স্যারের নির্দেশাবলী সম্পর্কিত যেকোনো প্রশ্ন করতে পারেন।`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        engine: "CITIMART Intelligence",
      };
    } else if (chatLanguage === "hi") {
      return {
        id: "welcome",
        role: "assistant",
        content: `नमस्ते ${user?.username || "मैनेजर"}! मैं **CITIMART AI डिसीजन एडवाइजर** हूँ। वर्तमान में **${storeLabel}** का लाइव डेटा कनेक्टेड है। आप आज के सेल्स टारगेट, कन्वर्शन रेट, पीक आवर्स रणनीति या ऑपरेशन्स हेड के निर्देशों से जुड़ा कोई भी सवाल पूछ सकते हैं।`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        engine: "CITIMART Intelligence",
      };
    }
    return {
      id: "welcome",
      role: "assistant",
      content: `Hello ${user?.username || "Manager"}! I am the **CITIMART AI Decision Advisor & Co-Pilot**. Connected to **${storeLabel}** live operational state. Ask me anything about today's target gaps, conversion pacing, ATV boosters, or Operational Head's directives.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      engine: "CITIMART Intelligence",
    };
  };

  const [messages, setMessages] = useState<ChatMessage[]>([getInitialMessage()]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on message additions
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Chat Mutation
  const chatMutation = useMutation({
    mutationFn: (msg: string) =>
      api.sendChatMessage({
        message: msg,
        conversation_history: messages.map((m) => ({ role: m.role, content: m.content })),
        store_code: activeStore,
        date_str: selectedDate,
        language: chatLanguage,
      }),
    onSuccess: (res) => {
      const assistantMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: res.reply,
        engine: res.engine,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    },
    onError: (err: Error) => {
      toast.error(`AI Assistant error: ${err.message}`);
      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content:
          chatLanguage === "bn"
            ? "দুঃখিত, সংযোগে ত্রুটি দেখা দিয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।"
            : chatLanguage === "hi"
            ? "क्षमा करें, नेटवर्क में त्रुटि हुई है। कृपया पुनः प्रयास करें।"
            : "Apologies, there was an issue processing your query. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    },
  });

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || chatMutation.isPending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    chatMutation.mutate(text);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearChat = () => {
    setMessages([getInitialMessage()]);
    toast.info("Conversation cleared.");
  };

  const activePrompts = PROMPT_TEMPLATES[chatLanguage] || PROMPT_TEMPLATES.en;

  return (
    <>
      {/* Floating Trigger Button */}
      <div className="fixed bottom-5 right-5 z-40">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className={`relative flex items-center gap-2.5 rounded-full px-4 py-3 text-sm font-bold text-white shadow-[0_8px_30px_rgba(79,70,229,0.35)] transition-all cursor-pointer ${
            isOpen
              ? "bg-slate-800 border border-slate-700 opacity-0 pointer-events-none"
              : "bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-blue-500 border border-indigo-400/40"
          }`}
          title="Open CITIMART AI Retail Decision Advisor"
        >
          {/* Glowing Pulse Ring */}
          <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 opacity-60 blur-[6px] animate-pulse" />

          <div className="relative flex items-center justify-center size-7 rounded-full bg-white/20 backdrop-blur-sm border border-white/30">
            <Sparkles className="size-4 text-amber-300 animate-spin" style={{ animationDuration: "8s" }} />
          </div>

          <div className="relative flex flex-col items-start leading-none text-left">
            <span className="text-xs font-black tracking-tight flex items-center gap-1.5">
              AI COPILOT
              <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
            </span>
            <span className="text-[10px] text-blue-200/90 font-medium">Store Advisor</span>
          </div>
        </motion.button>
      </div>

      {/* Slide-over / Modal Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`fixed z-50 flex flex-col bg-slate-950/95 backdrop-blur-xl border border-indigo-500/30 shadow-[0_20px_60px_rgba(0,0,0,0.7)] text-slate-100 transition-all ${
              isExpanded
                ? "inset-4 sm:inset-10 rounded-2xl"
                : "bottom-4 right-4 sm:bottom-6 sm:right-6 w-[94vw] sm:w-[460px] h-[85vh] sm:h-[620px] max-h-[85vh] rounded-2xl"
            }`}
          >
            {/* Header */}
            <div className="relative border-b border-indigo-500/20 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 p-3.5 sm:p-4 rounded-t-2xl">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative size-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 p-0.5 shadow-lg shrink-0 flex items-center justify-center">
                    <Bot className="size-5 text-white" />
                    <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 border-2 border-slate-950" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5">
                        CITIMART AI Copilot
                        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-indigo-300 border border-indigo-500/40">
                          {activeStore === "ALL" ? "All Stores" : activeStore}
                        </span>
                      </h3>
                    </div>
                    <p className="text-[11px] text-indigo-200/80 font-medium truncate">
                      Decision Advisor · Real-Time Operations Intelligence
                    </p>
                  </div>
                </div>

                {/* Header Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Chatbot Language Quick Selector */}
                  <div className="flex items-center rounded-lg bg-slate-900/80 p-0.5 border border-slate-800">
                    {(["en", "bn", "hi"] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setChatLanguage(lang)}
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                          chatLanguage === lang
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {lang === "en" ? "EN" : lang === "bn" ? "বাং" : "हिं"}
                      </button>
                    ))}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearChat}
                    className="size-7 text-slate-400 hover:text-white hover:bg-slate-800/60"
                    title="Clear Chat History"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="size-7 text-slate-400 hover:text-white hover:bg-slate-800/60 hidden sm:flex"
                    title={isExpanded ? "Minimize" : "Expand"}
                  >
                    {isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsOpen(false)}
                    className="size-7 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                    title="Close"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick Suggestion Chips */}
            <div className="border-b border-slate-800/60 bg-slate-900/40 px-3 py-2 overflow-x-auto no-scrollbar flex items-center gap-1.5">
              {activePrompts.map((p, idx) => {
                const Icon = p.icon;
                return (
                  <button
                    key={idx}
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

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
              {messages.map((m) => {
                const isUser = m.role === "user";
                const isCopied = copiedId === m.id;

                return (
                  <motion.div
                    key={m.id}
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
                      className={`group relative max-w-[85%] sm:max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed shadow-md ${
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

                      {/* Render text with Markdown formatting */}
                      <div className="whitespace-pre-wrap space-y-1.5">
                        {m.content.split("\n\n").map((para, pIdx) => {
                          // Check if header line
                          if (para.startsWith("### ")) {
                            return (
                              <h4 key={pIdx} className="font-bold text-amber-300 text-[13px] mt-1 mb-0.5">
                                {para.replace("### ", "")}
                              </h4>
                            );
                          }
                          return (
                            <p key={pIdx} className="leading-relaxed">
                              {para}
                            </p>
                          );
                        })}
                      </div>

                      {/* Footer Info */}
                      <div
                        className={`mt-1.5 flex items-center justify-between gap-2 text-[10px] ${
                          isUser ? "text-blue-200/80" : "text-slate-500"
                        }`}
                      >
                        {!isUser && m.engine && (
                          <span className="inline-flex items-center gap-1 font-mono text-[9px] text-indigo-400">
                            <Sparkles className="size-2.5" />
                            {m.engine}
                          </span>
                        )}
                        <span>{m.timestamp}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {/* Loading Indicator */}
              {chatMutation.isPending && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5"
                >
                  <div className="size-7 rounded-lg shrink-0 flex items-center justify-center bg-indigo-600 text-white">
                    <Bot className="size-3.5 animate-pulse" />
                  </div>
                  <div className="rounded-2xl rounded-tl-none bg-slate-900/90 border border-slate-800 px-4 py-3 text-xs text-slate-400 shadow flex items-center gap-2">
                    <span className="size-2 rounded-full bg-indigo-400 animate-ping" />
                    <span className="animate-pulse">
                      {chatLanguage === "bn"
                        ? "লাইভ মেট্রিক্স বিশ্লেষণ করা হচ্ছে..."
                        : chatLanguage === "hi"
                        ? "लाइव डेटा का विश्लेषण किया जा रहा है..."
                        : "Analyzing live store metrics..."}
                    </span>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="border-t border-slate-800/80 bg-slate-950/80 p-3 rounded-b-2xl">
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
                        ? "সেলস, টার্গেট, কনভার্সন বা নির্দেশাবলী নিয়ে প্রশ্ন করুন..."
                        : chatLanguage === "hi"
                        ? "सेल्स, टारगेट, कन्वर्शन या निर्देशों पर सवाल पूछें..."
                        : "Ask about sales, target gaps, ATV, or Operational Head's directives..."
                    }
                    className="w-full rounded-xl bg-slate-900/90 border border-slate-800 px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-inner"
                    disabled={chatMutation.isPending}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!inputMessage.trim() || chatMutation.isPending}
                  className="h-10 px-3.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-md border border-indigo-400/40 disabled:opacity-50 cursor-pointer"
                >
                  {chatMutation.isPending ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
