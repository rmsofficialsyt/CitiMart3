import type { Language } from "@/lib/translations";

/** Wording for the Advisor's Tier 2/3 signals (backend src/advisor/). Every
 *  number is formatted by the caller and comes from the backend evidence. */
export interface AdvisorStrings {
  insights: Record<
    string,
    { title: string; desc: (e: Record<string, string>) => string; action: string; tag: string }
  >;
  pacingSimilar: (days: number, on: string) => string;
  matched: Record<string, string>;

  billMix: string;
  bands: Record<"under_500" | "500_1500" | "over_1500", string>;
  today: string;
  norm: string;
  noNorm: string;
  largestBill: string;

  staffing: string;
  staffOnFloor: string;
  footfallPerStaff: string;
  expected: string;
  timesUnknown: string;

  stock: string;
  outOfStock: string;
  lowStock: string;
  slowMovers: (days: number) => string;
  transfers: string;
  send: (qty: number, store: string) => string;
  request: (qty: number, store: string) => string;
  createTransfer: string;
  transferCreated: string;
  transferFailed: string;

  whatIf: string;
  whatIfConv: string;
  whatIfAtv: string;
  whatIfFootfall: string;
  dayClose: string;
  monthClose: string;
  base: string;
  scenario: string;
  whatIfUnavailable: string;
  reset: string;

  explain: string;
  explainBtn: string;
  hideExplain: string;
  reasons: Record<string, string>;
  vsUsual: (pct: string, days: number) => string;
  noReasons: string;
  verdict: Record<"hit" | "missed" | "in_progress" | "no_target" | "no_data", string>;

  winRate: (rate: string, trials: number) => string;

  brief: string;
  morning: string;
  midday: string;
  evening: string;
  watchOuts: string;
  pace: Record<"behind" | "on_pace" | "ahead" | "target_hit" | "no_pace_curve" | "no_target" | "no_data", string>;
  expectedNow: (pct: string) => string;
  projectedClose: string;
  asOf: (time: string) => string;
  completedSlotsOnly: string;
  network: string;
  reviewOf: (date: string) => string;
  briefError: string;
  explainError: string;
  downloadPdf: string;
  downloadingPdf: string;
  downloadFailed: string;
}

const EN: AdvisorStrings = {
  insights: {
    conversion_leak: {
      title: "Conversion Leak",
      desc: (e) => `${e.slot}: footfall ${e.footfall} vs usual ${e.baseline_footfall}, but bills did not rise (${e.nob} vs ${e.baseline_nob}).`,
      action: "Put a second staffer on the floor and at trial rooms in this slot; greet and assist every walk-in.",
      tag: "CONVERSION LEAK",
    },
    atv_drop: {
      title: "ATV Dropped in a Slot",
      desc: (e) => `${e.slot}: ATV ${e.atv} vs this slot's usual ${e.baseline_atv} (−${e.drop_pct}).`,
      action: "Push combo offers and premium picks at the counter for the next slot.",
      tag: "ATV ALERT",
    },
    dead_hours: {
      title: "Hours With No Bills",
      desc: (e) => `No bill logged at ${e.hours}, an hour that usually has sales on this weekday.`,
      action: "Check whether bills were missed in the log; if the floor was quiet, run a floor promotion now.",
      tag: "DATA / TRAFFIC",
    },
    mix_small_heavy: {
      title: "Many Small Bills Today",
      desc: (e) => `${e.today_share_pct} of today's bills are under ₹500 (usual ${e.norm_share_pct}).`,
      action: "Upsell: suggest a second item or a combo at every small bill.",
      tag: "BILL MIX",
    },
    mix_large_heavy: {
      title: "Big Bills, Few Buyers",
      desc: (e) => `${e.today_share_pct} of bills are over ₹1,500 (usual ${e.norm_share_pct}). Value is fine; the lever is more buyers.`,
      action: "Drive footfall and conversion: entrance offers and quick help for browsers.",
      tag: "BILL MIX",
    },
    big_bill: {
      title: "One Large Bill",
      desc: (e) => `A single bill of ${e.largest_bill} is ${e.share_pct} of today's sales. Without it the day is at ${e.net_sales_without}.`,
      action: "Don't relax on this one sale; keep the rest of the floor at normal pace.",
      tag: "BILL MIX",
    },
    understaffed_peak: {
      title: "Understaffed Peak",
      desc: (e) => `${e.slot}: ${e.footfall_per_staff} shoppers per staff on the floor (usual load ${e.median_footfall_per_staff}, ${e.staff} staff).`,
      action: "Move a staffer onto the floor for this slot and keep breaks out of it.",
      tag: "STAFFING",
    },
    break_window: {
      title: "Best Slot for Breaks",
      desc: (e) => `${e.slot} is the quietest slot still ahead.`,
      action: "Schedule staff breaks in this slot.",
      tag: "STAFFING",
    },
    attendance_missing: {
      title: "Attendance Not Marked",
      desc: (e) => `No attendance logged yet today for ${e.active_staff} active staff. Staffing advice needs it.`,
      action: "Mark today's attendance under Staff Management.",
      tag: "STAFFING",
    },
    stock_out: {
      title: "Items Out of Stock",
      desc: (e) => `${e.count} item(s) out of stock: ${e.items}.`,
      action: "Raise a requisition or request a transfer for the out-of-stock items.",
      tag: "STOCK",
    },
    stock_low: {
      title: "Low Stock",
      desc: (e) => `${e.count} item(s) at or below reorder level: ${e.items}.`,
      action: "Reorder before these run out.",
      tag: "STOCK",
    },
    slow_movers: {
      title: "Slow Movers to Promote",
      desc: (e) => `${e.count} item(s) with no sale in ${e.days} days: ${e.items}.`,
      action: "Move slow movers to a front display and pair them with offers.",
      tag: "STOCK",
    },
    transfer_suggested: {
      title: "Inter-store Transfer Possible",
      desc: (e) => `${e.outbound} item(s) you can send, ${e.inbound} item(s) another store can send you.`,
      action: "Review the suggested transfers in the Stock panel below.",
      tag: "STOCK",
    },
  },
  pacingSimilar: (days, on) => `Pace curve learned from ${days} similar past days (${on})`,
  matched: { rain: "rainy", holiday: "holiday", no_holiday: "non-holiday" },

  billMix: "Bill-size mix",
  bands: { under_500: "Under ₹500", "500_1500": "₹500–1,500", over_1500: "Over ₹1,500" },
  today: "Today",
  norm: "Usual",
  noNorm: "Not enough past bills for a usual mix yet.",
  largestBill: "Largest bill",

  staffing: "Staff vs traffic",
  staffOnFloor: "Staff",
  footfallPerStaff: "Shoppers / staff",
  expected: "expected",
  timesUnknown: "Some check-in times are missing; those staff count for every slot.",

  stock: "Stock",
  outOfStock: "Out of stock",
  lowStock: "Low stock",
  slowMovers: (days) => `No sale in ${days} days`,
  transfers: "Suggested transfers",
  send: (qty, store) => `Send ${qty} to ${store}`,
  request: (qty, store) => `${store} can send ${qty}`,
  createTransfer: "Create transfer",
  transferCreated: "Transfer created.",
  transferFailed: "Transfer failed",

  whatIf: "What-if simulator",
  whatIfConv: "Conversion (pp)",
  whatIfAtv: "ATV (₹)",
  whatIfFootfall: "Footfall (%)",
  dayClose: "Day close",
  monthClose: "Month close",
  base: "Now",
  scenario: "Scenario",
  whatIfUnavailable: "Needs live conversion, ATV and a learned pace curve for an open day.",
  reset: "Reset",

  explain: "Why this result?",
  explainBtn: "Explain the day",
  hideExplain: "Hide",
  reasons: {
    traffic_down: "Fewer shoppers came in",
    traffic_up: "More shoppers came in",
    conversion_down: "Fewer visitors bought",
    conversion_up: "More visitors bought",
    atv_down: "Smaller bills (ATV down)",
    atv_up: "Bigger bills (ATV up)",
    conversion_leak: "Footfall spike without bills",
    atv_drop: "ATV dropped in a slot",
    short_staffed: "Fewer staff than usual",
    stock_out: "Items out of stock",
    holiday: "Holiday",
    election: "Election day",
    rain: "Rainy day",
    weekend: "Weekend",
    no_target: "No target set",
    attendance_missing: "Attendance not marked",
  },
  vsUsual: (pct, days) => `${pct} vs the usual ${days} same weekdays`,
  noReasons: "Not enough same-weekday history yet to attribute this day.",
  verdict: { hit: "Target hit", missed: "Target missed", in_progress: "In progress", no_target: "No target set", no_data: "Nothing logged" },

  winRate: (rate, trials) => `Worked ${rate} of ${trials} times`,

  brief: "Network brief",
  morning: "Morning brief",
  midday: "Midday brief",
  evening: "Evening debrief",
  pace: {
    behind: "Behind pace",
    on_pace: "On pace",
    ahead: "Ahead of pace",
    target_hit: "Target hit",
    no_pace_curve: "No pace curve yet",
    no_target: "No target set",
    no_data: "Nothing logged",
  },
  expectedNow: (pct) => `expected ${pct} by now`,
  projectedClose: "Projected close",
  asOf: (time) => `Today so far, as of ${time}`,
  completedSlotsOnly: "Drivers compare finished time slots only.",
  watchOuts: "Watch-outs",
  network: "Network",
  reviewOf: (date) => `Review of ${date}`,
  briefError: "Brief is unavailable right now.",
  explainError: "The explanation is unavailable right now.",
  downloadPdf: "Download PDF",
  downloadingPdf: "Preparing PDF…",
  downloadFailed: "PDF download failed",
};

const HI: AdvisorStrings = {
  insights: {
    conversion_leak: {
      title: "कन्वर्शन लीक",
      desc: (e) => `${e.slot}: फुटफॉल ${e.footfall} (सामान्य ${e.baseline_footfall}), पर बिल नहीं बढ़े (${e.nob} बनाम ${e.baseline_nob})।`,
      action: "इस स्लॉट में फ्लोर और ट्रायल रूम पर एक और स्टाफ लगाएँ; हर ग्राहक का स्वागत व मदद करें।",
      tag: "कन्वर्शन लीक",
    },
    atv_drop: {
      title: "स्लॉट में ATV घटा",
      desc: (e) => `${e.slot}: ATV ${e.atv}, इस स्लॉट का सामान्य ${e.baseline_atv} (−${e.drop_pct})।`,
      action: "अगले स्लॉट में काउंटर पर कॉम्बो ऑफ़र व प्रीमियम सामान सुझाएँ।",
      tag: "ATV अलर्ट",
    },
    dead_hours: {
      title: "बिना बिल के घंटे",
      desc: (e) => `${e.hours} पर कोई बिल दर्ज नहीं, जबकि इस वार इस घंटे आमतौर पर बिक्री होती है।`,
      action: "देखें कि बिल दर्ज करना छूटा तो नहीं; फ्लोर शांत था तो अभी प्रमोशन चलाएँ।",
      tag: "डेटा / ट्रैफ़िक",
    },
    mix_small_heavy: {
      title: "आज छोटे बिल ज़्यादा",
      desc: (e) => `आज के ${e.today_share_pct} बिल ₹500 से कम हैं (सामान्य ${e.norm_share_pct})।`,
      action: "अपसेल: हर छोटे बिल पर दूसरा सामान या कॉम्बो सुझाएँ।",
      tag: "बिल मिक्स",
    },
    mix_large_heavy: {
      title: "बड़े बिल, कम खरीदार",
      desc: (e) => `${e.today_share_pct} बिल ₹1,500 से ऊपर हैं (सामान्य ${e.norm_share_pct})। मूल्य ठीक है; ज़रूरत ज़्यादा खरीदारों की है।`,
      action: "फुटफॉल व कन्वर्शन बढ़ाएँ: प्रवेश पर ऑफ़र और ग्राहकों को तुरंत मदद।",
      tag: "बिल मिक्स",
    },
    big_bill: {
      title: "एक बड़ा बिल",
      desc: (e) => `${e.largest_bill} का एक बिल आज की बिक्री का ${e.share_pct} है। इसके बिना दिन ${e.net_sales_without} पर है।`,
      action: "इस एक बिक्री से ढील न दें; बाकी फ्लोर सामान्य गति पर रखें।",
      tag: "बिल मिक्स",
    },
    understaffed_peak: {
      title: "पीक पर स्टाफ कम",
      desc: (e) => `${e.slot}: प्रति स्टाफ ${e.footfall_per_staff} ग्राहक (सामान्य ${e.median_footfall_per_staff}, ${e.staff} स्टाफ)।`,
      action: "इस स्लॉट में एक स्टाफ फ्लोर पर लगाएँ और ब्रेक इससे बाहर रखें।",
      tag: "स्टाफिंग",
    },
    break_window: {
      title: "ब्रेक के लिए सही स्लॉट",
      desc: (e) => `आगे का सबसे शांत स्लॉट ${e.slot} है।`,
      action: "स्टाफ ब्रेक इसी स्लॉट में रखें।",
      tag: "स्टाफिंग",
    },
    attendance_missing: {
      title: "हाज़िरी नहीं लगी",
      desc: (e) => `${e.active_staff} सक्रिय स्टाफ की आज की हाज़िरी अभी दर्ज नहीं है। स्टाफिंग सलाह के लिए ज़रूरी है।`,
      action: "Staff Management में आज की हाज़िरी लगाएँ।",
      tag: "स्टाफिंग",
    },
    stock_out: {
      title: "सामान स्टॉक में नहीं",
      desc: (e) => `${e.count} सामान स्टॉक में नहीं: ${e.items}।`,
      action: "स्टॉक-आउट सामान के लिए रिक्विजिशन या ट्रांसफ़र अनुरोध करें।",
      tag: "स्टॉक",
    },
    stock_low: {
      title: "कम स्टॉक",
      desc: (e) => `${e.count} सामान रीऑर्डर स्तर पर या नीचे: ${e.items}।`,
      action: "खत्म होने से पहले दोबारा मँगाएँ।",
      tag: "स्टॉक",
    },
    slow_movers: {
      title: "धीमे बिकने वाले सामान",
      desc: (e) => `${e.days} दिनों में ${e.count} सामान नहीं बिके: ${e.items}।`,
      action: "इन्हें सामने डिस्प्ले पर रखें और ऑफ़र के साथ जोड़ें।",
      tag: "स्टॉक",
    },
    transfer_suggested: {
      title: "स्टोर-के-बीच ट्रांसफ़र संभव",
      desc: (e) => `आप ${e.outbound} सामान भेज सकते हैं, ${e.inbound} सामान दूसरा स्टोर भेज सकता है।`,
      action: "नीचे स्टॉक पैनल में सुझाए गए ट्रांसफ़र देखें।",
      tag: "स्टॉक",
    },
  },
  pacingSimilar: (days, on) => `${days} मिलते-जुलते पिछले दिनों (${on}) से सीखा गया गति वक्र`,
  matched: { rain: "बारिश", holiday: "छुट्टी", no_holiday: "बिना छुट्टी" },

  billMix: "बिल आकार मिक्स",
  bands: { under_500: "₹500 से कम", "500_1500": "₹500–1,500", over_1500: "₹1,500 से ऊपर" },
  today: "आज",
  norm: "सामान्य",
  noNorm: "सामान्य मिक्स के लिए अभी पर्याप्त पुराने बिल नहीं हैं।",
  largestBill: "सबसे बड़ा बिल",

  staffing: "स्टाफ बनाम ट्रैफ़िक",
  staffOnFloor: "स्टाफ",
  footfallPerStaff: "ग्राहक / स्टाफ",
  expected: "अनुमानित",
  timesUnknown: "कुछ चेक-इन समय नहीं हैं; वे स्टाफ हर स्लॉट में गिने गए हैं।",

  stock: "स्टॉक",
  outOfStock: "स्टॉक खत्म",
  lowStock: "कम स्टॉक",
  slowMovers: (days) => `${days} दिनों में कोई बिक्री नहीं`,
  transfers: "सुझाए गए ट्रांसफ़र",
  send: (qty, store) => `${store} को ${qty} भेजें`,
  request: (qty, store) => `${store} ${qty} भेज सकता है`,
  createTransfer: "ट्रांसफ़र बनाएँ",
  transferCreated: "ट्रांसफ़र बन गया।",
  transferFailed: "ट्रांसफ़र विफल",

  whatIf: "क्या-अगर सिम्युलेटर",
  whatIfConv: "कन्वर्शन (pp)",
  whatIfAtv: "ATV (₹)",
  whatIfFootfall: "फुटफॉल (%)",
  dayClose: "दिन-समापन",
  monthClose: "माह-समापन",
  base: "अभी",
  scenario: "परिदृश्य",
  whatIfUnavailable: "खुले दिन के लिए लाइव कन्वर्शन, ATV और सीखा गया गति वक्र चाहिए।",
  reset: "रीसेट",

  explain: "यह नतीजा क्यों?",
  explainBtn: "दिन समझाएँ",
  hideExplain: "छिपाएँ",
  reasons: {
    traffic_down: "कम ग्राहक आए",
    traffic_up: "ज़्यादा ग्राहक आए",
    conversion_down: "कम विज़िटर ने खरीदा",
    conversion_up: "ज़्यादा विज़िटर ने खरीदा",
    atv_down: "छोटे बिल (ATV कम)",
    atv_up: "बड़े बिल (ATV ज़्यादा)",
    conversion_leak: "भीड़ बढ़ी पर बिल नहीं",
    atv_drop: "स्लॉट में ATV घटा",
    short_staffed: "सामान्य से कम स्टाफ",
    stock_out: "सामान स्टॉक में नहीं",
    holiday: "छुट्टी",
    election: "चुनाव का दिन",
    rain: "बारिश का दिन",
    weekend: "सप्ताहांत",
    no_target: "टारगेट तय नहीं",
    attendance_missing: "हाज़िरी नहीं लगी",
  },
  vsUsual: (pct, days) => `पिछले ${days} समान वारों की तुलना में ${pct}`,
  noReasons: "इस दिन की वजह बताने के लिए अभी पर्याप्त इतिहास नहीं है।",
  verdict: { hit: "टारगेट पूरा", missed: "टारगेट चूका", in_progress: "जारी है", no_target: "टारगेट तय नहीं", no_data: "कुछ दर्ज नहीं" },

  winRate: (rate, trials) => `${trials} में से ${rate} बार असरदार`,

  brief: "नेटवर्क ब्रीफ",
  morning: "सुबह की ब्रीफ",
  midday: "दोपहर की ब्रीफ",
  evening: "शाम की डीब्रीफ",
  pace: {
    behind: "गति से पीछे",
    on_pace: "गति के अनुसार",
    ahead: "गति से आगे",
    target_hit: "टारगेट पूरा",
    no_pace_curve: "अभी गति वक्र नहीं",
    no_target: "टारगेट तय नहीं",
    no_data: "कुछ दर्ज नहीं",
  },
  expectedNow: (pct) => `अब तक अपेक्षित ${pct}`,
  projectedClose: "अनुमानित दिन-समापन",
  asOf: (time) => `आज अब तक, ${time} पर`,
  completedSlotsOnly: "कारण केवल पूरे हो चुके स्लॉट की तुलना करते हैं।",
  watchOuts: "ध्यान दें",
  network: "नेटवर्क",
  reviewOf: (date) => `${date} की समीक्षा`,
  briefError: "ब्रीफ अभी उपलब्ध नहीं है।",
  explainError: "विश्लेषण अभी उपलब्ध नहीं है।",
  downloadPdf: "PDF डाउनलोड करें",
  downloadingPdf: "PDF तैयार हो रहा है…",
  downloadFailed: "PDF डाउनलोड विफल",
};

const BN: AdvisorStrings = {
  insights: {
    conversion_leak: {
      title: "কনভার্সন লিক",
      desc: (e) => `${e.slot}: ফুটফল ${e.footfall} (স্বাভাবিক ${e.baseline_footfall}), কিন্তু বিল বাড়েনি (${e.nob} বনাম ${e.baseline_nob})।`,
      action: "এই স্লটে ফ্লোর ও ট্রায়াল রুমে আরেকজন স্টাফ দিন; প্রত্যেক ক্রেতাকে স্বাগত ও সাহায্য করুন।",
      tag: "কনভার্সন লিক",
    },
    atv_drop: {
      title: "স্লটে ATV কমেছে",
      desc: (e) => `${e.slot}: ATV ${e.atv}, এই স্লটের স্বাভাবিক ${e.baseline_atv} (−${e.drop_pct})।`,
      action: "পরের স্লটে কাউন্টারে কম্বো অফার ও প্রিমিয়াম পণ্য সাজেস্ট করুন।",
      tag: "ATV সতর্কতা",
    },
    dead_hours: {
      title: "বিলহীন ঘণ্টা",
      desc: (e) => `${e.hours}-এ কোনো বিল নেই, অথচ এই বারে এই ঘণ্টায় সাধারণত বিক্রি হয়।`,
      action: "বিল লগ করা বাদ পড়েছে কিনা দেখুন; ফ্লোর ফাঁকা থাকলে এখনই প্রোমোশন চালান।",
      tag: "ডেটা / ট্র্যাফিক",
    },
    mix_small_heavy: {
      title: "আজ ছোট বিল বেশি",
      desc: (e) => `আজকের ${e.today_share_pct} বিল ₹500-এর কম (স্বাভাবিক ${e.norm_share_pct})।`,
      action: "আপসেল: প্রতিটি ছোট বিলে দ্বিতীয় পণ্য বা কম্বো সাজেস্ট করুন।",
      tag: "বিল মিক্স",
    },
    mix_large_heavy: {
      title: "বড় বিল, কম ক্রেতা",
      desc: (e) => `${e.today_share_pct} বিল ₹1,500-এর বেশি (স্বাভাবিক ${e.norm_share_pct})। মূল্য ঠিক আছে; দরকার বেশি ক্রেতা।`,
      action: "ফুটফল ও কনভার্সন বাড়ান: প্রবেশপথে অফার ও দ্রুত সাহায্য।",
      tag: "বিল মিক্স",
    },
    big_bill: {
      title: "একটি বড় বিল",
      desc: (e) => `${e.largest_bill}-এর একটি বিল আজকের বিক্রির ${e.share_pct}। এটি বাদে দিন ${e.net_sales_without}-এ আছে।`,
      action: "এই একটি বিক্রিতে ঢিল দেবেন না; বাকি ফ্লোর স্বাভাবিক গতিতে রাখুন।",
      tag: "বিল মিক্স",
    },
    understaffed_peak: {
      title: "পিকে স্টাফ কম",
      desc: (e) => `${e.slot}: প্রতি স্টাফে ${e.footfall_per_staff} ক্রেতা (স্বাভাবিক ${e.median_footfall_per_staff}, ${e.staff} স্টাফ)।`,
      action: "এই স্লটে একজন স্টাফ ফ্লোরে দিন এবং বিরতি এর বাইরে রাখুন।",
      tag: "স্টাফিং",
    },
    break_window: {
      title: "বিরতির সেরা স্লট",
      desc: (e) => `সামনের সবচেয়ে শান্ত স্লট ${e.slot}।`,
      action: "স্টাফের বিরতি এই স্লটে রাখুন।",
      tag: "স্টাফিং",
    },
    attendance_missing: {
      title: "হাজিরা দেওয়া হয়নি",
      desc: (e) => `${e.active_staff} জন সক্রিয় স্টাফের আজকের হাজিরা এখনও নেই। স্টাফিং পরামর্শের জন্য দরকার।`,
      action: "Staff Management-এ আজকের হাজিরা দিন।",
      tag: "স্টাফিং",
    },
    stock_out: {
      title: "পণ্য স্টকে নেই",
      desc: (e) => `${e.count}টি পণ্য স্টকে নেই: ${e.items}।`,
      action: "স্টক-আউট পণ্যের জন্য রিকুইজিশন বা ট্রান্সফার অনুরোধ করুন।",
      tag: "স্টক",
    },
    stock_low: {
      title: "স্টক কম",
      desc: (e) => `${e.count}টি পণ্য রিঅর্ডার লেভেলে বা নিচে: ${e.items}।`,
      action: "শেষ হওয়ার আগে আবার অর্ডার দিন।",
      tag: "স্টক",
    },
    slow_movers: {
      title: "ধীরে বিক্রি হওয়া পণ্য",
      desc: (e) => `${e.days} দিনে ${e.count}টি পণ্য বিক্রি হয়নি: ${e.items}।`,
      action: "এগুলো সামনের ডিসপ্লেতে রাখুন ও অফারের সঙ্গে জুড়ুন।",
      tag: "স্টক",
    },
    transfer_suggested: {
      title: "স্টোরের মধ্যে ট্রান্সফার সম্ভব",
      desc: (e) => `আপনি ${e.outbound}টি পণ্য পাঠাতে পারেন, ${e.inbound}টি পণ্য অন্য স্টোর পাঠাতে পারে।`,
      action: "নিচের স্টক প্যানেলে প্রস্তাবিত ট্রান্সফার দেখুন।",
      tag: "স্টক",
    },
  },
  pacingSimilar: (days, on) => `${days}টি একই রকম পুরোনো দিন (${on}) থেকে শেখা গতি-রেখা`,
  matched: { rain: "বৃষ্টি", holiday: "ছুটি", no_holiday: "ছুটি নয়" },

  billMix: "বিলের আকার মিক্স",
  bands: { under_500: "₹500-এর কম", "500_1500": "₹500–1,500", over_1500: "₹1,500-এর বেশি" },
  today: "আজ",
  norm: "স্বাভাবিক",
  noNorm: "স্বাভাবিক মিক্সের জন্য এখনও যথেষ্ট পুরোনো বিল নেই।",
  largestBill: "সবচেয়ে বড় বিল",

  staffing: "স্টাফ বনাম ট্র্যাফিক",
  staffOnFloor: "স্টাফ",
  footfallPerStaff: "ক্রেতা / স্টাফ",
  expected: "আনুমানিক",
  timesUnknown: "কিছু চেক-ইন সময় নেই; সেই স্টাফ প্রতিটি স্লটে গোনা হয়েছে।",

  stock: "স্টক",
  outOfStock: "স্টক শেষ",
  lowStock: "স্টক কম",
  slowMovers: (days) => `${days} দিনে কোনো বিক্রি নেই`,
  transfers: "প্রস্তাবিত ট্রান্সফার",
  send: (qty, store) => `${store}-এ ${qty} পাঠান`,
  request: (qty, store) => `${store} ${qty} পাঠাতে পারে`,
  createTransfer: "ট্রান্সফার তৈরি করুন",
  transferCreated: "ট্রান্সফার তৈরি হয়েছে।",
  transferFailed: "ট্রান্সফার ব্যর্থ",

  whatIf: "কী-যদি সিমুলেটর",
  whatIfConv: "কনভার্সন (pp)",
  whatIfAtv: "ATV (₹)",
  whatIfFootfall: "ফুটফল (%)",
  dayClose: "দিন-শেষ",
  monthClose: "মাস-শেষ",
  base: "এখন",
  scenario: "পরিস্থিতি",
  whatIfUnavailable: "খোলা দিনের জন্য লাইভ কনভার্সন, ATV ও শেখা গতি-রেখা দরকার।",
  reset: "রিসেট",

  explain: "এই ফলাফল কেন?",
  explainBtn: "দিনটি ব্যাখ্যা করুন",
  hideExplain: "লুকান",
  reasons: {
    traffic_down: "কম ক্রেতা এসেছেন",
    traffic_up: "বেশি ক্রেতা এসেছেন",
    conversion_down: "কম ভিজিটর কিনেছেন",
    conversion_up: "বেশি ভিজিটর কিনেছেন",
    atv_down: "ছোট বিল (ATV কম)",
    atv_up: "বড় বিল (ATV বেশি)",
    conversion_leak: "ভিড় বাড়লেও বিল বাড়েনি",
    atv_drop: "স্লটে ATV কমেছে",
    short_staffed: "স্বাভাবিকের চেয়ে কম স্টাফ",
    stock_out: "পণ্য স্টকে নেই",
    holiday: "ছুটির দিন",
    election: "নির্বাচনের দিন",
    rain: "বৃষ্টির দিন",
    weekend: "সপ্তাহান্ত",
    no_target: "টার্গেট সেট হয়নি",
    attendance_missing: "হাজিরা দেওয়া হয়নি",
  },
  vsUsual: (pct, days) => `গত ${days}টি একই বারের তুলনায় ${pct}`,
  noReasons: "এই দিনের কারণ বিশ্লেষণের মতো যথেষ্ট ইতিহাস এখনও নেই।",
  verdict: { hit: "টার্গেট পূরণ", missed: "টার্গেট মিস", in_progress: "চলছে", no_target: "টার্গেট সেট হয়নি", no_data: "কিছু লগ হয়নি" },

  winRate: (rate, trials) => `${trials} বারের মধ্যে ${rate} কাজ করেছে`,

  brief: "নেটওয়ার্ক ব্রিফ",
  morning: "সকালের ব্রিফ",
  midday: "দুপুরের ব্রিফ",
  evening: "সন্ধ্যার ডিব্রিফ",
  pace: {
    behind: "গতির পিছনে",
    on_pace: "গতি অনুযায়ী",
    ahead: "গতির আগে",
    target_hit: "টার্গেট পূরণ",
    no_pace_curve: "এখনও গতি-রেখা নেই",
    no_target: "টার্গেট সেট হয়নি",
    no_data: "কিছু লগ হয়নি",
  },
  expectedNow: (pct) => `এখন পর্যন্ত প্রত্যাশিত ${pct}`,
  projectedClose: "আনুমানিক দিন-শেষ",
  asOf: (time) => `আজ এখন পর্যন্ত, ${time}`,
  completedSlotsOnly: "কারণগুলো শুধু শেষ হওয়া স্লটের তুলনা।",
  watchOuts: "নজরে রাখুন",
  network: "নেটওয়ার্ক",
  reviewOf: (date) => `${date}-এর পর্যালোচনা`,
  briefError: "ব্রিফ এখন উপলব্ধ নয়।",
  explainError: "বিশ্লেষণ এখন উপলব্ধ নয়।",
  downloadPdf: "PDF ডাউনলোড করুন",
  downloadingPdf: "PDF তৈরি হচ্ছে…",
  downloadFailed: "PDF ডাউনলোড ব্যর্থ",
};

export const ADVISOR_STRINGS: Record<Language, AdvisorStrings> = { en: EN, hi: HI, bn: BN };
