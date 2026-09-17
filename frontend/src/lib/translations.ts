export type Language = "en" | "hi" | "bn";

export interface Translations {
  // Settings & General
  language: string;
  languageSelect: string;
  english: string;
  hindi: string;
  bengali: string;
  theme: string;
  account: string;
  switchAccount: string;
  logout: string;
  settingsTitle: string;
  valueForMoney: string;
  live: string;
  activeStores: string;
  reportingPeriod: string;
  lastWorkbookRefresh: string;

  // Boss Alert Banner & Directives
  urgentInstruction: string;
  executiveDirective: string;
  fromRaphaelSir: string;
  readAndAcknowledge: string;
  dismissSession: string;
  bossDirectivesTitle: string;
  bossDirectivesSubtitle: string;
  activeDirectivesTab: string;
  directivesLogTab: string;
  createDirectiveTab: string;
  markAcknowledged: string;
  acknowledgedBadge: string;
  noActiveDirectives: string;

  // Manager User Guide
  guideTitle: string;
  guideSubtitle: string;
  viewGuide: string;
  hideGuide: string;
  step1Title: string;
  step1Header: string;
  step1Desc: string;
  step2Title: string;
  step2Header: string;
  step2Desc: string;
  step3Title: string;
  step3Header: string;
  step3Net: string;
  step3Qty: string;
  step3Nob: string;
  step3Action: string;
  step4Title: string;
  step4Header: string;
  step4Desc: string;
  step4Safety: string;
  resetFaqTitle: string;
  resetFaqDesc: string;
  correctFaqTitle: string;
  correctFaqDesc: string;

  // AI Decision Advisor & Store Co-Pilot
  aiTitle: string;
  aiSubtitle: string;
  liveIntelligence: string;
  operatingWindow: string;
  slotBenchmark: string;
  liveAch: string;
  tacticalDirectives: string;
  tacticalSub: string;
  managerChecklist: string;
  markAll: string;
  resetTasks: string;
  copied: string;
  copyAction: string;
  collapseHub: string;
  expandHub: string;

  // AI Insights Categories
  categoryRecovery: string;
  categoryPace: string;
  categoryMomentum: string;
  categoryConversion: string;
  categoryAtv: string;
  categoryBasket: string;
  categorySteady: string;

  // Dynamic AI Insight Strings
  insightClosingTitle: string;
  insightClosingDesc: (remaining: string) => string;
  insightClosingAction: string;

  insightLaggingTitle: (slot: string) => string;
  insightLaggingDesc: (ach: string, exp: number) => string;
  insightLaggingAction: string;

  insightCrushingTitle: string;
  insightCrushingDesc: (ach: string, exp: number) => string;
  insightCrushingAction: string;

  insightConversionTitle: string;
  insightConversionDesc: (footfall: string, conv: string) => string;
  insightConversionAction: string;

  insightAtvTitle: string;
  insightAtvDesc: (atv: string, nob: string, extra: string) => string;
  insightAtvAction: string;

  insightBasketTitle: string;
  insightBasketDesc: (basket: string) => string;
  insightBasketAction: string;

  insightBalancedTitle: string;
  insightBalancedDesc: (sales: string, footfall: string, conv: string) => string;
  insightBalancedAction: string;

  // Checklist Tasks
  task1: string;
  task2: string;
  task3: string;
  task4: string;

  // Target Adjustment Alert
  targetAdjustmentAlert: string;
  positiveMomentumSurplus: string;
  targetTrackingOnTrack: string;
  cumulativeRecoveryMode: (prevDate: string) => string;
  rollingRecoveryMode: (window: number, policy: string) => string;
  shortfallHeading: (shortfall: string) => string;
  surplusHeading: (surplus: string) => string;
  exactMatchHeading: (prevDate: string) => string;
  shortfallDesc: (prevDate: string, target: string, adminTarget: string) => string;
  surplusDesc: (prevActual: string, prevTarget: string, prevDate: string, adminTarget: string) => string;
  exactMatchDesc: (prevTarget: string, prevDate: string, store: string) => string;
  adminSetTarget: string;
  primaryBaseline: string;
  adjustedRecoveryGoal: string;
  targetGoal: string;
  includesDeficit: (shortfall: string) => string;
  plusBuffer: (surplus: string) => string;
  noDeficit: string;
  recoveryStatus: string;
  rem: string;
  notSet: string;

  // Rolling Target Adjustment Engine Details
  scheduledCarryLabel: string;
  outstandingDeficitLabel: string;
  liveNetSalesLabel: string;
  originalGapLabel: string;
  adjustedGapLabel: string;
  recoveredTodayLabel: string;
  trueSurplusLabel: string;
  onTrackLabel: string;
  activeBucketsPaceLabel: string;
  activeDeficitBuckets: string;
  bucketFifoRank: string;
  bucketStore: string;
  bucketAge: string;
  bucketOriginDate: string;
  bucketInitialDeficit: string;
  bucketRecoveredSoFar: string;
  bucketRemainingDeficit: string;
  bucketHorizonSpan: string;
  bucketRecoveryEnd: string;
  bucketDaysRemaining: string;
  bucketDailyPace: string;
  bucketStatusCol: string;
  bucketTotals: string;
  bucketNextInLine: string;
  bucketInQueue: string;
  bucketTotalBacklog: string;
  bucketTotalCleared: string;
  fifoRecoveryRule: string;
  window7Days: string;
  window14Days: string;
  window30Days: string;
  monthEndClosePolicy: string;
  trueRollingPolicy: string;
  viewDeficitBuckets: string;
  hideDeficitBuckets: string;
}


export const TRANSLATIONS: Record<Language, Translations> = {
  en: {
    language: "Language",
    languageSelect: "Choose Display Language",
    english: "English",
    hindi: "Hindi (हिंदी)",
    bengali: "Bengali (বাংলা)",
    theme: "Theme / Appearance",
    account: "Account",
    switchAccount: "Switch Account:",
    logout: "Log Out",
    settingsTitle: "Settings & Preferences",
    valueForMoney: "Value for Money Re-defined",
    live: "Live",
    activeStores: "Active stores",
    reportingPeriod: "Reporting period",
    lastWorkbookRefresh: "Last workbook refresh",

    urgentInstruction: "URGENT INSTRUCTION",
    executiveDirective: "EXECUTIVE DIRECTIVE",
    fromRaphaelSir: "From Operational Head",
    readAndAcknowledge: "Read & Acknowledge",
    dismissSession: "Dismiss for this session",
    bossDirectivesTitle: "Executive Directives & Store Notices",
    bossDirectivesSubtitle: "Official operational instructions and floor notices issued by Operational Head",
    activeDirectivesTab: "Active Directives",
    directivesLogTab: "Directives Log",
    createDirectiveTab: "New Directive",
    markAcknowledged: "Acknowledge Directive",
    acknowledgedBadge: "Acknowledged",
    noActiveDirectives: "No active directives right now.",

    guideTitle: "Manager's User Guide: How to use Manual Data Entry",
    guideSubtitle: "Simple step-by-step instructions for logging Footfall, Billing details, NOB, and Remarks.",
    viewGuide: "View Guide",
    hideGuide: "Hide Guide",
    step1Title: "1. Time Stamp",
    step1Header: "Store hours: 10:30 AM – 11:59 PM",
    step1Desc: "Choose the clock time of your entry. The system automatically assigns it to the matching 3-hour Time Slot (e.g., 11:00 AM – 01:59 PM).",
    step2Title: "2. Footfall Entry",
    step2Header: "Customer Walk-ins",
    step2Desc: "Count the visitors entering your store during the time-slot. Enter the number and click \"Update Footfall\".",
    step3Title: "3. Billing & NOB",
    step3Header: "Sales & Item Quantities",
    step3Net: "Net Amount (₹): Total money collected from customers.",
    step3Qty: "Bill Qty (units sold): Total physical pieces/articles sold.",
    step3Nob: "NOB (Buyers): Number of purchasing bills (receipts).",
    step3Action: "Click \"Update Bills & NOB\".",
    step4Title: "4. Day Closing",
    step4Header: "Remarks & Final Submission",
    step4Desc: "Add optional Remarks (rain, festive rush, offers). At night closing, review totals and click \"Final Submission\".",
    step4Safety: "🛡️ Safety Net: If you forget to submit before leaving, the system automatically finalizes your day at 00:00 midnight!",
    resetFaqTitle: "🔄 What does the \"Reset\" button do?",
    resetFaqDesc: "Clicking Reset only clears the input boxes in that section if you made a typing mistake before saving, and resets the Time Stamp to current time. Reset will NEVER delete saved database records.",
    correctFaqTitle: "💡 How to correct saved entries:",
    correctFaqDesc: "To edit or delete an entry you already saved, scroll down to the Logged Footfall or Logged Bills & NOB tables below and click Edit or Delete.",

    aiTitle: "CITIMART AI Decision Advisor & Store Co-Pilot",
    aiSubtitle: "Autonomous tactical floor nudges, slot pacing & conversion triggers for",
    liveIntelligence: "Live Intelligence",
    operatingWindow: "Operating Window",
    slotBenchmark: "Slot Target Benchmark",
    liveAch: "Live Achievement",
    tacticalDirectives: "Tactical Floor Directives",
    tacticalSub: "Real-time store floor optimization",
    managerChecklist: "Manager Floor Execution Checklist",
    markAll: "Mark All",
    resetTasks: "Reset",
    copied: "Copied!",
    copyAction: "Copy action to clipboard",
    collapseHub: "Collapse Hub",
    expandHub: "Expand Hub",

    categoryRecovery: "RECOVERY SPRINT",
    categoryPace: "PACE ACCELERATION",
    categoryMomentum: "MOMENTUM RECORD",
    categoryConversion: "CONVERSION ENGINE",
    categoryAtv: "ATV EXPANSION",
    categoryBasket: "BASKET GROWTH",
    categorySteady: "STEADY EXECUTION",

    insightClosingTitle: "Closing Slot Recovery Sprint",
    insightClosingDesc: (remaining) => `Store has ${remaining} remaining in final operational hours. Maximize billing speed and promote immediate impulse buys.`,
    insightClosingAction: "Focus all staff on billing counters and push quick add-ons (socks, belts, small accessories) to every customer in line.",

    insightLaggingTitle: (slot) => `Pace Lag in ${slot}`,
    insightLaggingDesc: (ach, exp) => `Current achievement (${ach}) is below expected pace (${exp}%) for this time slot.`,
    insightLaggingAction: "Activate floor announcements for high-margin deals and position team members at category hotspots.",

    insightCrushingTitle: "Target Outperformance Momentum",
    insightCrushingDesc: (ach, exp) => `Strong run rate! Store is at ${ach} vs ${exp}% benchmark. Push for historic day record.`,
    insightCrushingAction: "Maintain stock replenishment and focus on premium merchandise upselling.",

    insightConversionTitle: "Footfall-to-Buyer Conversion Alert",
    insightConversionDesc: (footfall, conv) => `Footfall is healthy (${footfall}), but conversion is only ${conv}. Customers are browsing without purchasing.`,
    insightConversionAction: "Instruct staff to greet every customer, assist with size searches, and open additional fitting rooms.",

    insightAtvTitle: "ATV Upselling Opportunity",
    insightAtvDesc: (atv, nob, extra) => `Average Transaction Value is ${atv}. Lifting ATV by just ₹150 across ${nob} buyers will yield +${extra} additional sales.`,
    insightAtvAction: "Introduce multi-buy pairings: 'Buy 2 get 10% off' or billing counter accessory combos.",

    insightBasketTitle: "Basket Size Enhancement",
    insightBasketDesc: (basket) => `Current basket size is ${basket} items/bill. Cross-merchandise matching apparel accessories near cash counters.`,
    insightBasketAction: "Train cashier staff to suggest 1 complimentary item (socks, hosiery, impulse accessories) at final checkout.",

    insightBalancedTitle: "Operations Balanced & Optimal",
    insightBalancedDesc: (sales, footfall, conv) => `Metrics across Net Sales (${sales}), Footfall (${footfall}), and Conversion (${conv}) are within optimal operating bands.`,
    insightBalancedAction: "Continue standard operational cadence and maintain prompt data entry.",

    task1: "Promote combo bundles & add-on accessories at billing counters",
    task2: "Deploy active floor attendants near high-traffic entrance displays",
    task3: "Monitor trial rooms and provide styling assistance to increase basket size",
    task4: "Ensure fast-checkout lane is active during peak time slot",

    targetAdjustmentAlert: "Target Adjustment Alert",
    positiveMomentumSurplus: "Positive Momentum Surplus",
    targetTrackingOnTrack: "Target Tracking On Track",
    cumulativeRecoveryMode: (prevDate) => `Cumulative Recovery Mode · Carried forward from previous day (${prevDate})`,
    rollingRecoveryMode: (window, policy) => `Rolling Recovery Engine · ${window}-Day Rolling (${policy === "MONTH_END_CLOSE" ? "Month-End Close" : "True Rolling"})`,
    shortfallHeading: (shortfall) => `Unachieved Deficit Carry Forward: +${shortfall}`,
    surplusHeading: (surplus) => `Surplus Buffer Achieved: +${surplus}`,
    exactMatchHeading: (prevDate) => `Target Met Exactly (${prevDate})`,
    shortfallDesc: (prevDate, target, adminTarget) => `Unresolved deficit is dynamically redistributed across future days. Recommended operational pace target for ${prevDate} onwards is ${target}. (* Note: Official Admin Sales Target in the primary KPI card remains ${adminTarget}).`,
    surplusDesc: (prevActual, prevTarget, prevDate, adminTarget) => `Excellent performance! Achieved ${prevActual} vs ${prevTarget} (${prevDate}). Excess sales pay down historical deficit or provide a performance cushion towards today's target of ${adminTarget}.`,
    exactMatchDesc: (prevTarget, prevDate, store) => `Operations met target of ${prevTarget} (${prevDate}) for store ${store}. Continue steady operations to meet target.`,

    adminSetTarget: "Admin Set Target",
    primaryBaseline: "Primary baseline (T_t)",
    adjustedRecoveryGoal: "Adjusted Target (A_t)",
    targetGoal: "Target Goal",
    includesDeficit: (shortfall) => `+${shortfall} scheduled carry (C_t)`,
    plusBuffer: (surplus) => `+${surplus} buffer`,
    noDeficit: "No active deficit",
    recoveryStatus: "Recovery Pace",
    rem: "Rem:",
    notSet: "Not set",

    scheduledCarryLabel: "Scheduled Carry Today (C_t)",
    outstandingDeficitLabel: "Total Outstanding Deficit (P_t)",
    liveNetSalesLabel: "Live Net Sales (S_t)",
    originalGapLabel: "Original Target Gap (D_t)",
    adjustedGapLabel: "Adjusted Recovery Gap",
    recoveredTodayLabel: "Recovered Today (R_t)",
    trueSurplusLabel: "True Surplus Buffer",
    onTrackLabel: "On Track",
    activeBucketsPaceLabel: "Active Buckets & Horizon",
    activeDeficitBuckets: "Active Deficit Buckets",
    bucketFifoRank: "FIFO Priority",
    bucketStore: "Store",
    bucketAge: "Deficit Age",
    bucketOriginDate: "Origin Date",
    bucketInitialDeficit: "Initial Deficit",
    bucketRecoveredSoFar: "Recovered (Paid)",
    bucketRemainingDeficit: "Remaining Deficit",
    bucketHorizonSpan: "Recovery Horizon",
    bucketRecoveryEnd: "Recovery Deadline",
    bucketDaysRemaining: "Days Left",
    bucketDailyPace: "Scheduled Carry Today",
    bucketStatusCol: "Queue Status",
    bucketTotals: "Consolidated Deficit Totals",
    bucketNextInLine: "Next in Line (Active Payer)",
    bucketInQueue: "In Queue (FIFO)",
    bucketTotalBacklog: "Total Backlog",
    bucketTotalCleared: "Total Cleared to Date",
    fifoRecoveryRule: "FIFO Recovery Rule: Excess sales above original target recover oldest deficits first.",
    window7Days: "7-Day Rolling",
    window14Days: "14-Day Rolling",
    window30Days: "30-Day Rolling",
    monthEndClosePolicy: "Month-End Close",
    trueRollingPolicy: "True Rolling",
    viewDeficitBuckets: "View Deficit Buckets",
    hideDeficitBuckets: "Hide Deficit Buckets",
  },


  hi: {
    language: "भाषा",
    languageSelect: "प्रदर्शन भाषा चुनें (Choose Language)",
    english: "English (अंग्रेज़ी)",
    hindi: "हिंदी (Hindi)",
    bengali: "বাংলা (Bengali)",
    theme: "थीम / रूप-रंग",
    account: "खाता (Account)",
    switchAccount: "खाता बदलें (Switch Account):",
    logout: "लॉग आउट (Log Out)",
    settingsTitle: "सेटिंग्स और प्राथमिकताएं",
    valueForMoney: "वैल्यू फॉर मनी री-डिफाइंड",
    live: "लाइव",
    activeStores: "सक्रिय स्टोर",
    reportingPeriod: "रिपोर्टिंग अवधि",
    lastWorkbookRefresh: "अंतिम वर्कबुक रिफ्रेश",

    urgentInstruction: "अति आवश्यक निर्देश (URGENT)",
    executiveDirective: "कार्यकारी निर्देश (DIRECTIVE)",
    fromRaphaelSir: "ऑपरेशन्स हेड द्वारा",
    readAndAcknowledge: "पढ़ें और स्वीकार करें",
    dismissSession: "इस सत्र के लिए हटाएं",
    bossDirectivesTitle: "कार्यकारी निर्देश और स्टोर सूचनाएं",
    bossDirectivesSubtitle: "ऑपरेशन्स हेड द्वारा जारी आधिकारिक परिचालन निर्देश और फ्लोर अलर्ट",
    activeDirectivesTab: "सक्रिय निर्देश",
    directivesLogTab: "निर्देश लॉग",
    createDirectiveTab: "नया निर्देश",
    markAcknowledged: "निर्देश स्वीकार करें",
    acknowledgedBadge: "स्वीकृत (Acknowledged)",
    noActiveDirectives: "इस समय कोई सक्रिय निर्देश नहीं है।",

    guideTitle: "मैनेजर गाइड: मैन्युअल डेटा एंट्री का सही उपयोग कैसे करें",
    guideSubtitle: "फुटफॉल, बिलिंग विवरण, NOB (खरीदार संख्या) और टिप्पणियों को दर्ज करने के आसान चरण।",
    viewGuide: "गाइड देखें (View Guide)",
    hideGuide: "गाइड छिपाएं (Hide Guide)",
    step1Title: "1. समय स्टैम्प (Time Stamp)",
    step1Header: "स्टोर समय: सुबह 10:30 से रात 11:59 तक",
    step1Desc: "अपनी प्रविष्टि का घड़ी का समय चुनें। सिस्टम स्वचालित रूप से इसे उपयुक्त 3-घंटे के टाइम स्लॉट (जैसे 11:00 AM – 01:59 PM) में जोड़ देता है।",
    step2Title: "2. फुटफॉल प्रविष्टि (Footfall)",
    step2Header: "स्टोर में आने वाले कुल ग्राहक",
    step2Desc: "इस टाइम-स्लॉट के दौरान स्टोर में प्रवेश करने वाले ग्राहकों की संख्या गिनें, संख्या दर्ज करें और \"Update Footfall\" पर क्लिक करें।",
    step3Title: "3. बिलिंग और खरीदार संख्या (NOB)",
    step3Header: "बिक्री और वस्तुओं की मात्रा",
    step3Net: "नेट अमाउंट (₹): ग्राहकों से प्राप्त कुल बिक्री राशि (रुपये में)।",
    step3Qty: "बिल मात्रा (Qty): बेची गई कुल वस्तुओं/कपड़ों की भौतिक संख्या।",
    step3Nob: "NOB (खरीदार): कटे हुए कुल बिलों (रसीदों) की संख्या।",
    step3Action: "\"Update Bills & NOB\" बटन पर क्लिक करें।",
    step4Title: "4. दिन की समाप्ति (Day Closing)",
    step4Header: "टिप्पणी और अंतिम सबमिशन",
    step4Desc: "वैकल्पिक टिप्पणी लिखें (बारिश, त्योहारी भीड़, विशेष ऑफर)। रात में क्लोजिंग के समय कुल योग की जांच करें और \"Final Submission\" पर क्लिक करें।",
    step4Safety: "🛡️ सुरक्षा कवच: यदि आप जाने से पहले सबमिट करना भूल जाते हैं, तो सिस्टम रात 00:00 बजे स्वचालित रूप से आपके दिन को फाइनल सबमिट कर देता है!",
    resetFaqTitle: "🔄 \"Reset\" बटन क्या करता है?",
    resetFaqDesc: "रीसेट पर क्लिक करने से केवल उस सेक्शन के इनपुट बॉक्स खाली होते हैं यदि आपने टाइपिंग में कोई गलती की है। रीसेट कभी भी पहले से सेव किए गए डेटाबेस रिकॉर्ड को डिलीट नहीं करता।",
    correctFaqTitle: "💡 सेव की गई प्रविष्टियों को कैसे सुधारें?",
    correctFaqDesc: "पहले से सेव की गई एंट्री को संपादित या हटाने के लिए, नीचे 'Logged Footfall' या 'Logged Bills & NOB' टेबल में जाएं और Edit या Delete पर क्लिक करें।",

    aiTitle: "CITIMART AI निर्णय सलाहकार और स्टोर को-पायलट",
    aiSubtitle: "स्वचालित रणनीतिक फ्लोर सुझाव, स्लॉट पेसिंग और बिक्री रूपांतरण ट्रिगर - स्टोर:",
    liveIntelligence: "लाइव इंटेलिजेंस",
    operatingWindow: "ऑपरेटिंग विंडो (समय सीमा)",
    slotBenchmark: "स्लॉट लक्ष्य बेंचमार्क",
    liveAch: "लाइव उपलब्धि (Live Achievement)",
    tacticalDirectives: "रणनीतिक फ्लोर निर्देश (Tactical Directives)",
    tacticalSub: "रीयल-टाइम स्टोर फ्लोर बिक्री सुधार",
    managerChecklist: "मैनेजर फ्लोर क्रियान्वयन चेकलिस्ट",
    markAll: "सभी चुनें (Mark All)",
    resetTasks: "रीसेट (Reset)",
    copied: "कॉपी हुआ!",
    copyAction: "निर्देश कॉपी करें",
    collapseHub: "हब समेटें",
    expandHub: "हब खोलें",

    categoryRecovery: "रिकवरी स्प्रिंट",
    categoryPace: "पेस त्वरण",
    categoryMomentum: "रिकॉर्ड मोमेंटम",
    categoryConversion: "कन्वर्जन इंजन",
    categoryAtv: "ATV वृद्धि",
    categoryBasket: "बास्केट साइज",
    categorySteady: "संतुलित परिचालन",

    insightClosingTitle: "क्लोजिंग स्लॉट रिकवरी स्प्रिंट",
    insightClosingDesc: (remaining) => `स्टोर के पास अंतिम परिचालन घंटों में लक्ष्य का ${remaining} बाकी है। बिलिंग स्पीड बढ़ाएं और तत्काल आवेग खरीदारी (Impulse buys) को बढ़ावा दें।`,
    insightClosingAction: "सभी कर्मचारियों को बिलिंग काउंटरों पर केंद्रित करें और कतार में खड़े हर ग्राहक को छोटे ऐड-ऑन (मोजे, बेल्ट, एक्सेसरीज) का सुझाव दें।",

    insightLaggingTitle: (slot) => `${slot} में गति धीमी (Pace Lag)`,
    insightLaggingDesc: (ach, exp) => `वर्तमान उपलब्धि (${ach}) इस समय स्लॉट के अपेक्षित लक्ष्य (${exp}%) से पीछे चल रही है।`,
    insightLaggingAction: "हाई-मार्जिन डील्स के लिए फ्लोर घोषणाएं शुरू करें और टीम के सदस्यों को मुख्य बिक्री क्षेत्रों में तैनात करें।",

    insightCrushingTitle: "लक्ष्य से बेहतर प्रदर्शन का मोमेंटम",
    insightCrushingDesc: (ach, exp) => `शानदार रन रेट! स्टोर ${ach} पर है जबकि मानक ${exp}% था। ऐतिहासिक रिकॉर्ड बनाने के लिए जोर लगाएं।`,
    insightCrushingAction: "स्टॉक की पुनःपूर्ति बनाए रखें और प्रीमियम उत्पादों की अप-सेलिंग पर ध्यान दें।",

    insightConversionTitle: "फुटफॉल-से-खरीदार कन्वर्जन अलर्ट",
    insightConversionDesc: (footfall, conv) => `फुटफॉल अच्छा है (${footfall}), लेकिन कन्वर्जन केवल ${conv} है। ग्राहक बिना खरीदे बाहर जा रहे हैं।`,
    insightConversionAction: "कर्मचारियों को हर ग्राहक का स्वागत करने, साइज खोजने में मदद करने और अतिरिक्त ट्रायल रूम खोलने का निर्देश दें।",

    insightAtvTitle: "ATV अप-सेलिंग का अवसर",
    insightAtvDesc: (atv, nob, extra) => `औसत बिल मूल्य (ATV) ${atv} है। यदि ${nob} खरीदारों में केवल ₹150 की वृद्धि होती है, तो +${extra} की अतिरिक्त बिक्री होगी।`,
    insightAtvAction: "मल्टी-बाय पेयरिंग लागू करें: '2 खरीदें 10% छूट पाएं' या कैश काउंटर एक्सेसरी कॉम्बो।",

    insightBasketTitle: "बास्केट साइज (Basket Size) में सुधार",
    insightBasketDesc: (basket) => `वर्तमान बास्केट साइज ${basket} वस्तुएं प्रति बिल है। कैश काउंटर के पास मैचिंग एक्सेसरीज रखें।`,
    insightBasketAction: "कैशियर टीम को फाइनल बिलिंग के समय कम से कम 1 पूरक वस्तु (मोजे, रुमाल, एक्सेसरी) सुझाने के लिए कहें।",

    insightBalancedTitle: "परिचालन संतुलित और उत्तम",
    insightBalancedDesc: (sales, footfall, conv) => `नेट बिक्री (${sales}), फुटफॉल (${footfall}), और कन्वर्जन (${conv}) के सभी आंकड़े इष्टतम स्तर पर हैं।`,
    insightBalancedAction: "नियमित परिचालन गति जारी रखें और समय पर डेटा प्रविष्टि सुनिश्चित करें।",

    task1: "बिलिंग काउंटर पर कॉम्बो बंडल और ऐड-ऑन एक्सेसरीज को बढ़ावा दें",
    task2: "मुख्य प्रवेश द्वार के डिस्प्ले के पास सक्रिय फ्लोर अटेंडेंट तैनात करें",
    task3: "ट्रायल रूम पर नजर रखें और बास्केट साइज बढ़ाने के लिए स्टाइलिंग सहायता दें",
    task4: "पीक टाइम स्लॉट में फास्ट-चेकआउट लेन सक्रिय रखना सुनिश्चित करें",

    targetAdjustmentAlert: "लक्ष्य समायोजन अलर्ट (Target Adjustment)",
    positiveMomentumSurplus: "सकारात्मक अधिशेष (Positive Surplus)",
    targetTrackingOnTrack: "लक्ष्य ट्रैकिंग ट्रैक पर (On Track)",
    cumulativeRecoveryMode: (prevDate) => `संचयी रिकवरी मोड · पिछले दिन (${prevDate}) से आगे लाया गया`,
    rollingRecoveryMode: (window, policy) => `रोलिंग रिकवरी इंजन · ${window}-दिवसीय रोलिंग (${policy === "MONTH_END_CLOSE" ? "महीने के अंत में क्लोज" : "ट्रू रोलिंग"})`,
    shortfallHeading: (shortfall) => `अप्राप्त घाटा आगे लाया गया (Deficit Carry Forward): +${shortfall}`,
    surplusHeading: (surplus) => `सकारात्मक अधिशेष कुशन: +${surplus} हासिल किया`,
    exactMatchHeading: (prevDate) => `लक्ष्य पूर्णतः प्राप्त (${prevDate})`,
    shortfallDesc: (prevDate, target, adminTarget) => `बचे हुए घाटे को ${prevDate} से आगे भविष्य के दिनों में पुनर्वितरित किया गया है। आज का अनुशंसित परिचालन पेस लक्ष्य ${target} है। (* नोट: प्राथमिक KPI कार्ड में आधिकारिक एडमिन बिक्री लक्ष्य ${adminTarget} ही रहेगा)।`,


    surplusDesc: (prevActual, prevTarget, prevDate, adminTarget) => `शानदार प्रदर्शन! ${prevTarget} के मुकाबले ${prevActual} अर्जित किया (${prevDate})। अतिरिक्त बिक्री पिछले घाटे को कम करती है या आज के ${adminTarget} के लक्ष्य में सहायता देती है।`,
    exactMatchDesc: (prevTarget, prevDate, store) => `स्टोर ${store} के लिए ${prevTarget} का लक्ष्य (${prevDate}) पूर्णतः प्राप्त हुआ। लक्ष्य प्राप्त करने के लिए स्थिर संचालन जारी रखें।`,
    adminSetTarget: "एडमिन निर्धारित लक्ष्य",
    primaryBaseline: "प्राथमिक आधार रेखा (T_t)",
    adjustedRecoveryGoal: "समायोजित लक्ष्य (A_t)",
    targetGoal: "लक्ष्य गोल",
    includesDeficit: (shortfall) => `+${shortfall} निर्धारित कैरी (C_t)`,
    plusBuffer: (surplus) => `+${surplus} बफर`,
    noDeficit: "कोई सक्रिय घाटा नहीं",
    recoveryStatus: "रिकवरी पेस",
    rem: "शेष:",
    notSet: "निर्धारित नहीं",

    scheduledCarryLabel: "आज का निर्धारित कैरी (C_t)",
    outstandingDeficitLabel: "कुल बकाया घाटा (P_t)",
    liveNetSalesLabel: "लाइव नेट बिक्री (S_t)",
    originalGapLabel: "मूल लक्ष्य अंतर (D_t)",
    adjustedGapLabel: "समायोजित रिकवरी अंतर",
    recoveredTodayLabel: "आज रिकवर हुआ (R_t)",
    trueSurplusLabel: "शुद्ध अधिशेष बफर",
    onTrackLabel: "ट्रैक पर",
    activeBucketsPaceLabel: "सक्रिय बकेट और समयसीमा",
    activeDeficitBuckets: "सक्रिय घाटा बकेट (Active Deficit Buckets)",
    bucketFifoRank: "FIFO प्राथमिकता",
    bucketStore: "स्टोर",
    bucketAge: "घाटे की अवधि",
    bucketOriginDate: "उत्पत्ति तिथि",
    bucketInitialDeficit: "प्रारंभिक घाटा",
    bucketRecoveredSoFar: "रिकवर हुआ (भुगतान)",
    bucketRemainingDeficit: "शेष घाटा",
    bucketHorizonSpan: "रिकवरी समयसीमा",
    bucketRecoveryEnd: "अंतिम तिथि",
    bucketDaysRemaining: "शेष दिन",
    bucketDailyPace: "आज का निर्धारित कैरी",
    bucketStatusCol: "कतार स्थिति",
    bucketTotals: "कुल घाटा बैकलॉग योग",
    bucketNextInLine: "भुगतान हेतु पहला (सक्रिय)",
    bucketInQueue: "कतार में (FIFO)",
    bucketTotalBacklog: "कुल बैकलॉग",
    bucketTotalCleared: "अब तक कुल चुकता",
    fifoRecoveryRule: "FIFO नियम: मूल लक्ष्य से अधिक बिक्री सबसे पहले पुराने घाटे को चुकाती है।",
    window7Days: "7-दिवसीय रोलिंग",
    window14Days: "14-दिवसीय रोलिंग",
    window30Days: "30-दिवसीय रोलिंग",
    monthEndClosePolicy: "महीने के अंत में क्लोज",
    trueRollingPolicy: "ट्रू रोलिंग",
    viewDeficitBuckets: "घाटा बकेट देखें",
    hideDeficitBuckets: "घाटा बकेट छिपाएं",
  },


  bn: {
    language: "ভাষা",
    languageSelect: "ডিসপ্লে ভাষা নির্বাচন করুন (Choose Language)",
    english: "English (ইংরেজি)",
    hindi: "हिंदी (হিন্দি)",
    bengali: "বাংলা (Bengali)",
    theme: "থিম / চেহারা",
    account: "অ্যাকাউন্ট (Account)",
    switchAccount: "অ্যাকাউন্ট পরিবর্তন করুন:",
    logout: "লগ আউট (Log Out)",
    settingsTitle: "সেটিংস এবং পছন্দসমূহ",
    valueForMoney: "ভ্যালু ফর মানি রি-ডিফাইনড",
    live: "লাইভ",
    activeStores: "সক্রিয় স্টোর",
    reportingPeriod: "রিপোর্টিং সময়কাল",
    lastWorkbookRefresh: "সর্বশেষ ওয়ার্কবুক রিফ্রেশ",

    urgentInstruction: "জরুরি নির্দেশিকা (URGENT)",
    executiveDirective: "কার্যনির্বাহী নির্দেশিকা (DIRECTIVE)",
    fromRaphaelSir: "অপারেশনস হেড থেকে",
    readAndAcknowledge: "পড়ুন এবং নিশ্চিত করুন",
    dismissSession: "এই সেশনের জন্য বন্ধ করুন",
    bossDirectivesTitle: "কার্যনির্বাহী নির্দেশিকা এবং স্টোর নোটিশ",
    bossDirectivesSubtitle: "অপারেশনস হেড দ্বারা জারি করা অফিসিয়াল অপারেশনাল নির্দেশিকা ও ফ্লোর নোটিশ",
    activeDirectivesTab: "সক্রিয় নির্দেশিকা",
    directivesLogTab: "নির্দেশিকা লগ",
    createDirectiveTab: "নতুন নির্দেশিকা",
    markAcknowledged: "নির্দেশিকা নিশ্চিত করুন",
    acknowledgedBadge: "নিশ্চিতকৃত (Acknowledged)",
    noActiveDirectives: "এই মুহূর্তে কোনো সক্রিয় নির্দেশিকা নেই।",

    guideTitle: "ম্যানেজার গাইড: ম্যানুয়াল ডেটা এন্ট্রি কীভাবে সঠিকভাবে ব্যবহার করবেন",
    guideSubtitle: "ফুটফল, বিলিং বিবরণ, NOB (ক্রেতা সংখ্যা) এবং মন্তব্য নথিভুক্ত করার সহজ ও স্পষ্ট নির্দেশিকা।",
    viewGuide: "গাইড দেখুন (View Guide)",
    hideGuide: "গাইড বন্ধ করুন (Hide Guide)",
    step1Title: "১. টাইম স্ট্যাম্প (Time Stamp)",
    step1Header: "দোকানের সময়: সকাল ১০:৩০ – রাত ১১:৫৯",
    step1Desc: "আপনার এন্ট্রির ঘড়ির সময় নির্বাচন করুন। সিস্টেম স্বয়ংক্রিয়ভাবে এটিকে সংশ্লিষ্ট ৩ ঘণ্টার টাইম স্লটে (যেমন ১১:০০ AM – ০১:৫৯ PM) অন্তর্ভুক্ত করে দেবে।",
    step2Title: "২. ফুটফল এন্ট্রি (Footfall)",
    step2Header: "দোকানে আগত মোট ক্রেতা",
    step2Desc: "এই টাইম স্লটে আপনার দোকানে প্রবেশকারী ক্রেতাদের সংখ্যা গণনা করুন, সংখ্যাটি লিখুন এবং \"Update Footfall\" বাটনে ক্লিক করুন।",
    step3Title: "৩. বিলিং ও ক্রেতা সংখ্যা (NOB)",
    step3Header: "বিক্রয় ও সামগ্রীর পরিমাণ",
    step3Net: "নেট অ্যামাউন্ট (₹): ক্রেতাদের থেকে সংগৃহীত মোট বিক্রির টাকা।",
    step3Qty: "বিল পরিমাণ (Qty): মোট বিক্রীত শারীরিক জিনিস/পোশাকের সংখ্যা।",
    step3Nob: "NOB (ক্রেতা সংখ্যা): মোট কাটা বিল বা ক্যাশ মেমোর সংখ্যা।",
    step3Action: "\"Update Bills & NOB\" বাটনে ক্লিক করুন।",
    step4Title: "৪. দিনের সমাপ্তি (Day Closing)",
    step4Header: "মন্তব্য ও চূড়ান্ত সাবমিশন",
    step4Desc: "ঐচ্ছিক মন্তব্য লিখুন (বৃষ্টি, উৎসবের ভিড়, বিশেষ অফার)। রাতে দোকান বন্ধের সময়, মোট হিসেব মিলিয়ে \"Final Submission\" এ ক্লিক করুন।",
    step4Safety: "🛡️ সুরক্ষা কবচ: আপনি যদি বের হওয়ার আগে সাবমিট করতে ভুলে যান, সিস্টেম রাত ১২:০০ টায় স্বয়ংক্রিয়ভাবে আপনার দিনের হিসেব ফাইনাল সাবমিট করে দেবে!",
    resetFaqTitle: "🔄 \"Reset\" বাটনটি কী করে?",
    resetFaqDesc: "রিসেট বাটনে ক্লিক করলে কেবল সেই নির্দিষ্ট সেকশনের ভুল ইনপুট খালি হয়। রিসেট কখনই ডেটাবেসে ইতিমধ্যে সেভ হওয়া কোনো রেকর্ড মুছে ফেলে না।",
    correctFaqTitle: "💡 সেভ করা এন্ট্রি কীভাবে সংশোধন করবেন?",
    correctFaqDesc: "পূর্বে সেভ করা এন্ট্রি এডিট বা ডিলিট করতে নিচে 'Logged Footfall' অথবা 'Logged Bills & NOB' টেবিলে গিয়ে Edit বা Delete এ ক্লিক করুন।",

    aiTitle: "CITIMART AI সিদ্ধান্ত উপদেষ্টা এবং স্টোর কো-পাইলট",
    aiSubtitle: "স্বয়ংক্রিয় কৌশলগত ফ্লোর পরামর্শ, টাইম-স্লট পেসিং এবং বিক্রয় রূপান্তর সতর্কতা - স্টোর:",
    liveIntelligence: "লাইভ ইন্টেলিজেন্স",
    operatingWindow: "অপারেটিং উইন্ডো (সময়কাল)",
    slotBenchmark: "স্লট লক্ষ্যমাত্রা বেঞ্চমার্ক",
    liveAch: "লাইভ অর্জন (Live Achievement)",
    tacticalDirectives: "কৌশলগত ফ্লোর নির্দেশিকা (Tactical Directives)",
    tacticalSub: "রিয়েল-টাইম স্টোর ফ্লোর বিক্রয় বৃদ্ধি",
    managerChecklist: "ম্যানেজার ফ্লোর এক্সিকিউশন চেকলিস্ট",
    markAll: "সব সম্পন্ন (Mark All)",
    resetTasks: "রিসেট (Reset)",
    copied: "কপি হয়েছে!",
    copyAction: "নির্দেশনা কপি করুন",
    collapseHub: "সংক্ষেপ করুন",
    expandHub: "সম্প্রসারিত করুন",

    categoryRecovery: "রিকভারি স্প্রিন্ট",
    categoryPace: "গতি ত্বরণ",
    categoryMomentum: "রেকর্ড মোমেন্টাম",
    categoryConversion: "রূপান্তর ইঞ্জিন",
    categoryAtv: "ATV বৃদ্ধি",
    categoryBasket: "বাস্কেট সাইজ",
    categorySteady: "স্থিতিশীল পরিচালনা",

    insightClosingTitle: "ক্লোজিং স্লট রিকভারি স্প্রিন্ট",
    insightClosingDesc: (remaining) => `দোকানের চূড়ান্ত কার্যসময়ে লক্ষ্যমাত্রার ${remaining} বাকি রয়েছে। বিলিং গতি বাড়ান এবং তাত্ক্ষণিক ছোট সামগ্রী কেনার জন্য উৎসাহিত করুন।`,
    insightClosingAction: "সমস্ত কর্মীদের বিলিং কাউন্টারে মনোনিবেশ করতে বলুন এবং লাইনে থাকা প্রতিটি ক্রেতাকে দ্রুত ছোট পণ্য (মোজা, বেল্ট, এক্সেসরিজ) অফার করুন।",

    insightLaggingTitle: (slot) => `${slot}-এ গতি ধীর (Pace Lag)`,
    insightLaggingDesc: (ach, exp) => `বর্তমান অর্জন (${ach}) এই টাইম স্লটের প্রত্যাশিত গতির (${exp}%) নিচে রয়েছে।`,
    insightLaggingAction: "উচ্চ মার্জিনের অফারগুলির জন্য ফ্লোর ঘোষণা চালু করুন এবং মূল পণ্য অঞ্চলে টিম সদস্যদের মোতায়েন করুন।",

    insightCrushingTitle: "টার্গেট অতিক্রম করার জোরদার মোমেন্টাম",
    insightCrushingDesc: (ach, exp) => `দুর্দান্ত বিক্রয় গতি! স্টোর ${ach}-এ রয়েছে যেখানে বেঞ্চমার্ক ছিল ${exp}%। আজকের ঐতিহাসিক রেকর্ড গড়ার জন্য চেষ্টা চালিয়ে যান।`,
    insightCrushingAction: "স্টক রিফিল নিশ্চিত রাখুন এবং প্রিমিয়াম পোশাক আপ-সেলিংয়ের ওপর জোর দিন।",

    insightConversionTitle: "ফুটফল থেকে ক্রেতা রূপান্তর সতর্কতা",
    insightConversionDesc: (footfall, conv) => `ফুটফল বেশ ভালো (${footfall}), কিন্তু রূপান্তর মাত্র ${conv}। বহু ক্রেতা না কিনে ফিরে যাচ্ছেন।`,
    insightConversionAction: "কর্মীদের প্রতিটি ক্রেতাকে স্বাগত জানাতে, সঠিক মাপ খুঁজে দিতে এবং অতিরিক্ত ট্রায়াল রুম খুলে দেওয়ার নির্দেশ দিন।",

    insightAtvTitle: "ATV আপ-সেলিংয়ের সুযোগ",
    insightAtvDesc: (atv, nob, extra) => `গড় বিলের পরিমাণ (ATV) ${atv}। ${nob} জন ক্রেতার থেকে মাত্র ₹১৫০ করে বৃদ্ধি করলে +${extra} অতিরিক্ত বিক্রয় অর্জিত হবে।`,
    insightAtvAction: "মাল্টি-বাই পেয়ারিং অফার দিন: '২টি কিনলে ১০% ছাড়' বা ক্যাশ কাউন্টার এক্সেসরি কম্বো।",

    insightBasketTitle: "বাস্কেট সাইজ (Basket Size) বৃদ্ধি",
    insightBasketDesc: (basket) => `বর্তমান বাস্কেট সাইজ ${basket} টি পণ্য প্রতি বিলে। ক্যাশ কাউন্টারের কাছে মানানসই এক্সেসরিজ প্রদর্শন করুন।`,
    insightBasketAction: "ক্যাশিয়ার কর্মীদের চূড়ান্ত বিলিংয়ের সময় অন্তত ১টি অতিরিক্ত পণ্য (মোজা, রুমাল, ছোট এক্সেসরিজ) সাজেস্ট করার প্রশিক্ষণ দিন।",

    insightBalancedTitle: "পরিচালনা সুষম এবং সন্তোষজনক",
    insightBalancedDesc: (sales, footfall, conv) => `নেট সেলস (${sales}), ফুটফল (${footfall}), এবং কনভার্সন (${conv})-এর প্রতিটি সূচক সন্তোষজনক রয়েছে।`,
    insightBalancedAction: "নিয়মিত গতিবিধি বজায় রাখুন এবং সঠিক সময়ে ডেটা এন্ট্রি নিশ্চিত করুন।",

    task1: "বিলিং কাউন্টারে কম্বো বান্ডিল এবং ছোট এক্সেসরিজ অফার করুন",
    task2: "প্রধান প্রবেশদ্বারের ডিসপ্লের কাছে সক্রিয় ফ্লোর অ্যাটেন্ডেন্ট রাখুন",
    task3: "ট্রায়াল রুমে নজর রাখুন এবং বাস্কেট সাইজ বাড়াতে স্টাইলিং সহায়তা দিন",
    task4: "পিক টাইম স্লটে ফাস্ট-চেকআউট লাইন চালু রাখা নিশ্চিত করুন",

    targetAdjustmentAlert: "টার্গেট সমন্বয় সতর্কতা (Target Adjustment)",
    positiveMomentumSurplus: "ইতিবাচক উদ্বৃত্ত কুশন (Positive Surplus)",
    targetTrackingOnTrack: "টার্গেট ট্র্যাকিং সঠিক পথে (On Track)",
    cumulativeRecoveryMode: (prevDate) => `ক্রমযোজিত রিকভারি মোড · পূর্ববর্তী দিন (${prevDate}) থেকে সমন্বিত`,
    rollingRecoveryMode: (window, policy) => `রোলিং রিকভারি ইঞ্জিন · ${window}-দিনের রোলিং (${policy === "MONTH_END_CLOSE" ? "মাস সমাপ্তিতে ক্লোজ" : "ট্রু রোলিং"})`,
    shortfallHeading: (shortfall) => `অনাদায়ী ঘাটতি সমন্বিত (Deficit Carry Forward): +${shortfall}`,
    surplusHeading: (surplus) => `ইতিবাচক উদ্বৃত্ত কুশন: +${surplus} অর্জিত`,
    exactMatchHeading: (prevDate) => `লক্ষ্যমাত্রা সম্পূর্ণ অর্জিত (${prevDate})`,
    shortfallDesc: (prevDate, target, adminTarget) => `বাকি থাকা ঘাটতি ${prevDate} থেকে আগামী দিনগুলিতে গতিশীলভাবে ভাগ করে দেওয়া হয়েছে। আজকের প্রস্তাবিত পরিচালন লক্ষ্যমাত্রা ${target}। (* উল্লেখ্য: প্রাথমিক KPI কার্ডে অফিসিয়াল অ্যাডমিন সেলস টার্গেট ${adminTarget} অপরিবর্তিত থাকবে)।`,


    surplusDesc: (prevActual, prevTarget, prevDate, adminTarget) => `চমৎকার কার্যক্ষমতা! ${prevTarget} লক্ষ্যমাত্রার বিপরীতে ${prevActual} অর্জিত হয়েছে (${prevDate})। অতিরিক্ত বিক্রয় পূর্ববর্তী ঘাটতি পূরণ করে বা আজকের ${adminTarget} লক্ষ্য অর্জনে সহায়তা করে।`,
    exactMatchDesc: (prevTarget, prevDate, store) => `স্টোর ${store}-এর ${prevTarget} লক্ষ্যমাত্রা (${prevDate}) সঠিকভাবে অর্জিত হয়েছে। লক্ষ্যমাত্রা অর্জনে অবিচল পরিচালনা বজায় রাখুন।`,
    adminSetTarget: "অ্যাডমিন নির্ধারিত লক্ষ্য",
    primaryBaseline: "প্রাথমিক বেসলাইন (T_t)",
    adjustedRecoveryGoal: "সমন্বিত লক্ষ্য (A_t)",
    targetGoal: "টার্গেট লক্ষ্য",
    includesDeficit: (shortfall) => `+${shortfall} নির্ধারিত ক্যারি (C_t)`,
    plusBuffer: (surplus) => `+${surplus} বাফার`,
    noDeficit: "কোনো সক্রিয় ঘাটতি নেই",
    recoveryStatus: "রিকভারি পেস",
    rem: "বাকি:",
    notSet: "নির্ধারিত নয়",

    scheduledCarryLabel: "আজকের নির্ধারিত ক্যারি (C_t)",
    outstandingDeficitLabel: "মোট বকেয়া ঘাটতি (P_t)",
    liveNetSalesLabel: "লাইভ নেট বিক্রয় (S_t)",
    originalGapLabel: "মূল লক্ষ্যমাত্রার ব্যবধান (D_t)",
    adjustedGapLabel: "সমন্বিত রিকভারি ব্যবধান",
    recoveredTodayLabel: "আজ রিকভার হয়েছে (R_t)",
    trueSurplusLabel: "প্রকৃত উদ্বৃত্ত বাফার",
    onTrackLabel: "সঠিক পথে",
    activeBucketsPaceLabel: "সক্রিয় বাকেট ও সময়সীমা",
    activeDeficitBuckets: "সক্রিয় ঘাটতি বাকেট (Active Deficit Buckets)",
    bucketFifoRank: "FIFO অগ্রাধিকার",
    bucketStore: "স্টোর",
    bucketAge: "ঘাটতির বয়স",
    bucketOriginDate: "উৎপত্তি তারিখ",
    bucketInitialDeficit: "প্রাথমিক ঘাটতি",
    bucketRecoveredSoFar: "রিকভার হয়েছে (পরিশোধ)",
    bucketRemainingDeficit: "বাকি ঘাটতি",
    bucketHorizonSpan: "রিকভারি সময়সীমা",
    bucketRecoveryEnd: "শেষ সময়সীমা",
    bucketDaysRemaining: "বাকি দিন",
    bucketDailyPace: "আজকের নির্ধারিত ক্যারি",
    bucketStatusCol: "সারির স্ট্যাটাস",
    bucketTotals: "মোট ঘাটতি ব্যাকলগ সমষ্টি",
    bucketNextInLine: "পরিশোধের জন্য প্রথম (সক্রিয়)",
    bucketInQueue: "সারিতে (FIFO)",
    bucketTotalBacklog: "মোট ব্যাকলগ",
    bucketTotalCleared: "এখন পর্যন্ত মোট পরিশোধ",
    fifoRecoveryRule: "FIFO নিয়ম: মূল লক্ষ্যমাত্রার অতিরিক্ত বিক্রয় সবার আগে পুরানো ঘাটতি পূরণ করে।",
    window7Days: "৭-দিনের রোলিং",
    window14Days: "১৪-দিনের রোলিং",
    window30Days: "৩০-দিনের রোলিং",
    monthEndClosePolicy: "মাস সমাপ্তিতে ক্লোজ",
    trueRollingPolicy: "ট্রু রোলিং",
    viewDeficitBuckets: "ঘাটতি বাকেট দেখুন",
    hideDeficitBuckets: "ঘাটতি বাকেট লুকান",
  },

};
