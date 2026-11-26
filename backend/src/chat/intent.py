"""Single source of truth for copilot query intent (EN / বাংলা / हिंदी).

Every routing decision in the chat pipeline -- which sub-agents run, which
tools DbOpsAgent calls, which fallback card the synthesizer renders, which
recovery window the target agent uses -- reads ONE `IntentResult` produced
here. Before this module each of those layers ran its own raw substring
keyword list, and they disagreed: "past 7 *operating* days" missed the
history table, "Week-over-Week" (hyphenated) missed WoW, "Compare…" in the
WoW preset fired the admin-only network ranking, "this month" in the
peak-day preset made the synthesizer answer with MTD, and a date such as
"14 Nov" silently switched the target agent to a 14-day window.

Rules that keep it predictable:
- The query is normalised first (lowercase, hyphens/underscores to spaces,
  Bengali/Devanagari digits to ASCII) so preset wording variants match.
- Intents are tested in a fixed SPECIFICITY ORDER; the first hit is
  `primary`, every later hit is a `secondary` (extra grounding data only).
- Indic words are matched with script-aware boundaries (`_bn`/`_hi`):
  Python's `\\b` is unreliable around Devanagari/Bengali combining marks
  (e.g. Hindi "कल" = yesterday must not match inside "कलेक्शन").
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# --- normalisation -----------------------------------------------------------

_DIGIT_MAP = str.maketrans("০১২৩৪৫৬৭৮৯०१२३४५६७८९", "01234567890123456789")
_SEPARATORS = re.compile(r"[\-_–—]+")
_WS = re.compile(r"\s+")


def normalize(query: str) -> str:
    text = (query or "").translate(_DIGIT_MAP).lower()
    text = _SEPARATORS.sub(" ", text)
    return _WS.sub(" ", text).strip()


def _bn(word: str) -> str:
    """Bengali word with a script-aware left boundary (suffixes like -এর allowed)."""
    return rf"(?<![ঀ-৿]){word}"


def _hi(word: str, whole: bool = False) -> str:
    """Hindi word with a script-aware left boundary (and right one if `whole`)."""
    right = r"(?![ऀ-ॿ])" if whole else ""
    return rf"(?<![ऀ-ॿ]){word}{right}"


def _any(*patterns: str) -> re.Pattern[str]:
    return re.compile("|".join(f"(?:{p})" for p in patterns))


# --- intent patterns ----------------------------------------------------------

_GREETING = _any(
    r"\b(hello|hi|hey|good (morning|afternoon|evening)|greetings|who are you|what is citimart( copilot)?)\b",
    _bn("নমস্কার"), _bn("হ্যালো"), _bn("সুপ্রভাত"), _bn("আপনি কে"), _bn("তুমি কে"),
    _hi("नमस्ते"), _hi("नमस्कार"), _hi("हेलो"), _hi("शुभ प्रभात"), _hi("आप कौन हैं"), _hi("तुम कौन हो"),
)

_HELP = _any(
    r"\b(help|guide|what can you do|capabilities|features|menu|user manual|how to use)\b",
    _bn("সাহায্য"), _bn("কী করতে পারো"), _bn("কীভাবে ব্যবহার করব"), _bn("কমান্ড"),
    _hi("मदद"), _hi("क्या कर सकते हो"), _hi("सहायता"), _hi("फीचर्स"), _hi("मेनू"),
)

_FORMULA = _any(
    r"\bformulas?\b", r"\bdefinitions?\b", r"\bhow (is|are) .{0,30} calculated\b",
    r"\bwhat (is|are|means?) (atv|upt|rpv|nob|conversion|sph|basket size)\b",
    r"\b(meaning|definition|formula) of (atv|upt|rpv|nob|conversion|upt)\b",
    r"\bhow (is|to calculate) (atv|conversion|upt|rpv|nob)\b",
    _bn("সূত্র"), _bn("সংজ্ঞা"), _bn("এটিভি কী"), _bn("কনভার্সন কী"), _bn("ইউপিটি কী"), _bn("হিসাব করা হয় কীভাবে"),
    _hi("सूत्र"), _hi("फॉर्मूल"), _hi("परिभाषा"), _hi("atv क्या है"), _hi("कन्वर्शन क्या है"), _hi("गणना कैसे"),
)

_TARGET_ADJUST = _any(
    r"\badjust(ed|ment)?\b", r"\bcarry ?forward\b", r"\brolling\b", r"\bdeficit\b",
    r"\brecovery\b", r"\ba_?t ?= ?t_?t",
    r"\bare we (hitting|reaching|achieving|meeting|on) (our )?targets?\b",
    r"\b(target|sales) (shortfall|deficit|remaining)\b",
    r"\bhow (far|much) (are we )?(from|to|is left for) (our )?targets?\b",
    r"\bhow much target (is )?(left|remaining)\b",
    r"\btarget (baki|baaki|kitna|koto)\b",
    _bn("অ্যাডজাস্টমেন্ট"), _bn("ক্যারি ফরোয়ার্ড"), _bn("রোলিং"), _bn("ডেফিসিট"), _bn("রিকভারি"), _bn("ঘাটতি"),
    _bn("টার্গেট কত বাকি"), _bn("টার্গেট কি পূরণ হয়েছে"), _bn("ঘাটতি কত"),
    _hi("एडजस्टमेंट"), _hi("समायोजन"), _hi("कैरी फॉरवर्ड"), _hi("रोलिंग"), _hi("डेफिसिट"), _hi("रिकवरी"),
    _hi("टारगेट कितना बाकी"), _hi("लक्ष्य कितना बाकी"), _hi("घाटा कितना"),
)
_SIMULATE = _any(r"\bsimulat", r"\boptions?\b", r"\bwhich (recovery|window|pace)\b", r"\bwindows\b",
                 r"\bvs\b|\bversus\b", _bn("তুলনা"), _bn("সিমুলেশন"), _hi("सिमुलेशन"), _hi("तुलना"), _hi("विकल्प"))

_WOW = _any(r"\bweek over week\b", r"\bwow\b", r"\bsame (week)?day (of the week )?(last|previous|prior) week\b",
            r"\bsame day of the week\b", r"\bsame weekday\b", r"\bprior weeks?\b",
            _bn("গত সপ্তাহের একই দিন"), _hi("पिछले हफ्ते इसी दिन"), _hi("पिछले सप्ताह इसी दिन"))

_PEAK_DIP = _any(
    r"\b(best|peak|highest|top|worst|lowest|weakest|dip) (sales )?(peak |dip )?(sales )?day\b",
    r"\b(best|worst) performing day\b",
    _bn("পিক ডে"), _bn("সর্বোচ্চ সেলসের দিন"), _bn("সর্বনিম্ন সেলসের দিন"), _bn("সেরা দিন"),
    _hi("पीक डे"), _hi("सबसे ज्यादा बिक्री वाला दिन"), _hi("सबसे कम बिक्री वाला दिन"), _hi("सबसे अच्छा दिन"),
)

# "past 7 days", "last 14 operating days", "বিগত 7 দিনের", "पिछले 7 दिनों"
_HISTORY_N = re.compile(
    r"(?:\b(?:past|last|previous|recent)|" + _bn("(?:বি)?গত") + "|" + _hi("पिछले") + r")\s+"
    r"(\d{1,2})\s+(?:operating |business |trading |working )?(?:days?\b|দিন|दिन)"
)
_HISTORY_WORDS = _any(r"\b(past|last|previous) (week|fortnight)\b", r"\bhistory table\b", r"\bdaily trend\b",
                      r"\bday by day\b", _bn("গত সপ্তাহ"), _hi("पिछले हफ्ते"))

_MONTH_NAMES_ALT = (
    "january|february|march|april|may|june|july|august|september|october|november|december"
    "|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec"
)

_YEAR_SUMMARY = _any(
    r"\b(full|entire|whole|this|current|past|previous|last)\s*(?:year|annual|yearly)\s*(?:sales|summary|summery|report|performance|numbers|figures|to date|total|status|kpis?)\b",
    r"\b(?:sales|summary|summery|report|performance|numbers|figures|kpis?)\s+(?:for|of|in|to)\s+(?:the\s+)?(?:full\s+|whole\s+|entire\s+|this\s+|current\s+|last\s+|previous\s+)?year\b",
    r"\bytd\b|\byear to date\b",
    r"\bannual (report|sales|summary|summery|kpis?|performance)\b",
    _bn("সারা বছরের"), _bn("পুরো বছরের"), _bn("বার্ষিক সেলস"), _bn("বার্ষিক রিপোর্ট"), _bn("চলতি বছরের সেলস"), _bn("বছরের সামারি"), _bn("বছরের রিপোর্ট"),
    _hi("पूरे साल"), _hi("सालाना बिक्री"), _hi("वार्षिक रिपोर्ट"), _hi("वार्षिक बिक्री"), _hi("इस साल की बिक्री"), _hi("साल का सारांश"), _hi("साल की रिपोर्ट"),
)

_MTD = _any(
    r"\b(previous|last|past|prior|current|this|full|entire) month('?s)?\b",
    r"\bmonth('?s)? (summary|summery|sales|report|performance|numbers|figures|to date|total|status)\b",
    r"\b(summary|summery|sales|report|performance|numbers|figures|status)\s+(?:for|of|in)\s+(?:the\s+)?(?:previous|last|past|prior|current|this)?\s*month\b",
    r"\b(?:previous|last|past|prior|current|this)\s+month\s+(?:full\s+)?(?:sales\s+)?(?:summary|summery|report|numbers|figures)\b",
    rf"\b({_MONTH_NAMES_ALT})\s*(?:month)?\s*(?:sales|report|summary|summery|performance|numbers|figures|status)\b",
    rf"\b(?:sales|report|summary|summery|performance|numbers|figures)\s+(?:for|in|of)\s+({_MONTH_NAMES_ALT})\b",
    r"\bmtd\b", r"\bmonth to date\b", r"\brun ?rate\b",
    _bn("চলতি মাস"), _bn("এই মাসের"), _bn("গত মাস"), _bn("গত মাসের"), _bn("আগের মাস"), _bn("পূর্ববর্তী মাস"),
    _bn("মাসের সেলস"), _bn("মাসিক সেলস"), _bn("মাসিক রিপোর্ট"), _bn("মাসের সামারি"),
    _hi("इस महीने"), _hi("महीने का"), _hi("पिछले महीने"), _hi("पिछले माह"), _hi("पिछला महीना"),
    _hi("महीने की बिक्री"), _hi("मासिक बिक्री"), _hi("मासिक रिपोर्ट"),
)

_YOY = _any(r"\byoy\b", r"\byear over year\b", r"\btally growth\b", r"\b(previous|last|prior) year\b",
            _bn("গত বছর"), _bn("পূর্ববর্তী বছর"), _bn("ট্যালি গ্রোথ"),
            _hi("पिछले साल"), _hi("पिछले वर्ष"), _hi("टैली ग्रोथ"))

_SURGE = _any(r"\bevening (peak|surge|rush)\b", r"\bpeak (hours?|surge|rush)\b", r"\b5 ?pm\b",
              r"\bon (track|pace)\b", r"\bprojected? (close|closing|sales)\b", r"\bhow will we close\b",
              _bn("সন্ধ্যা"), _bn("পিক আওয়ার"), _hi("शाम", whole=True), _hi("पीक ऑवर"))

_WEATHER = _any(r"\bweather\b", r"\brain", r"\btemperature\b", _bn("আবহাওয়া"), _bn("বৃষ্টি"),
                _hi("मौसम"), _hi("बारिश"))
_MARKET = _any(r"\bfestivals?\b", r"\bpuja\b", r"\bdiwali\b", r"\beid\b", r"\bwedding season\b",
               _bn("উৎসব"), _bn("পূজা"), _hi("त्योहार"))

_RANK_STRONG = _any(
    r"\brank(ing|ings)?\b", r"\bbenchmark", r"\bnetwork\b", r"\bleaderboard\b",
    r"\bwhich store is (winning|leading|ahead|top|best|first)\b",
    r"\bwho is (the )?(top|winning|leading|best) store\b",
    r"\bwho (is|made) (the )?(top|best|most|highest|leading) sales\b",
    r"\b(is|how is) (nm|new market|hb|hatibagan|chw|chowringhee) (beating|competing|performing against|doing compared to)\b",
    _bn("র‌্যাঙ্কিং"), _bn("কোন স্টোর এগিয়ে"), _bn("সেরা স্টোর"), _bn("কে এগিয়ে"), _bn("সবচেয়ে ভালো স্টোর"),
    _hi("रैंकिंग"), _hi("कौन सा स्टोर आगे"), _hi("सबसे अच्छा स्टोर"), _hi("नंबर वन स्टोर"),
)
_COMPARE = _any(r"\bcompar", _bn("তুলনা"), _hi("तुलना"))
_STORES = _any(r"\b(all|three|3|each|every|other) stores?\b", r"\bacross (all )?(the )?stores\b",
               r"new market.{0,40}hatibagan", r"\bstores\b",
               _bn("স্টোরের"), _bn("৩টি স্টোর"), "3টি স্টোর", _hi("स्टोर्स"), _hi("तीनों"))

_BILLS = _any(
    r"\b(highest|largest|biggest|single) (single )?(bill|purchase|transaction|ticket)\b",
    r"\bwho made the (largest|biggest|highest) purchase\b",
    r"\bticket size\b", r"\btransactions?\b(?! value)", r"\bbilling stream\b", r"\bbills\b",
    _bn("একক বিল"), _bn("টিকিট সাইজ"), _bn("লেনদেন"), _bn("সবচেয়ে বড় কেনাকাটা"), _bn("সর্বোচ্চ বিল"),
    _hi("सिंगल बिल"), _hi("टिकट साइज"), _hi("सबसे बड़ी खरीद"), _hi("सबसे बड़ा बिल"),
)

_REQUISITIONS = _any(r"\brequisitions?\b", r"\bstock\b", r"\binventory\b", _bn("রিকুইজিশন"), _bn("স্টক"),
                     _hi("रिक्विजिशन"), _hi("स्टॉक"))
_DIRECTIVES = _any(r"\bdirectives?\b", r"\bsop\b", r"\braphael\b", r"\bannouncements?\b", r"\bhead office\b",
                   _bn("নির্দেশ"), _bn("রাফায়েল"), _hi("निर्देश"), _hi("राफेल"))

_COACHING = _any(
    r"\btactics?\b", r"\bsuggest\b", r"\bhow (can|do|should|to)\b", r"\bstrateg", r"\bplaybook\b",
    r"\bchecklist\b", r"\btips?\b", r"\bways to\b",
    r"\bwhy is conversion (so )?(low|dropping|down|poor)\b",
    r"\bhow (can|to|do we) (increase|improve|boost|grow) (conversion|sales|footfall|atv)\b",
    r"\bwalkouts?\b|\bconverting shoppers\b|\bcustomer drops?\b",
    _bn("স্ট্র্যাটেজি"), _bn("কৌশল"), _bn("কীভাবে"), _bn("করণীয়"),
    _bn("কনভার্সন কেন কম"), _bn("কনভার্সন বাড়ানোর উপায়"), _bn("কাস্টমার চলে যাচ্ছে"),
    _hi("तरीके"), _hi("कैसे"), _hi("चेकलिस्ट"), _hi("उपाय"),
    _hi("कन्वर्शन कम क्यों"), _hi("कन्वर्शन कैसे बढ़ाएं"), _hi("ग्राहक क्यों लौट रहे"),
)

# Driver attribution: "why did we miss?" (src/advisor/explain.py).
_EXPLAIN_DAY = _any(
    r"\bwhy (did|do|have|are|were|was|is) (we|sales|the store|it|today|yesterday|our sales)\b.{0,40}"
    r"\b(miss|missed|low|lower|down|drop|dropped|fall|fell|short|bad|poor|weak|beat|exceed|exceeded|over)\b",
    r"\bwhat went (wrong|right)\b", r"\bexplain (the |this |that |to|yester)?day\b",
    r"\breasons? (for|behind) (the |our )?(miss|shortfall|low sales|drop|result)\b",
    r"\bwhy (did|have) we (miss|not hit|fall short|beat)\b",
    _bn("কেন টার্গেট মিস"), _bn("বিক্রি কেন কম"), _bn("কী ভুল হয়েছে"),
    _hi("टारगेट क्यों चूके"), _hi("बिक्री कम क्यों"), _hi("क्या गलत हुआ"),
)
# Network morning brief / evening debrief (src/advisor/brief.py).
_BRIEF = _any(
    # "evening" / "end of (the) day" brief: advisor_agent maps both to kind="evening",
    # but this rule used to miss them, so the question fell through to day_kpis.
    r"\b(morning|mid-?day|noon|afternoon|evening|tonight'?s|daily|network|store|end of (the )?day) brief(ing)?\b",
    r"\b(evening |end of day )?debrief\b",
    r"\bbrief me\b", r"\bday summary for (all|the network)\b",
    _bn("সকালের ব্রিফ"), _bn("দুপুরের ব্রিফ"), _bn("সন্ধ্যার ব্রিফ"),
    _hi("सुबह की ब्रीफ"), _hi("दोपहर की ब्रीफ"), _hi("शाम की ब्रीफ"),
)

_TIMESLOT = _any(r"\btime ?slots?\b", r"\bslots?\b", r"\bhourly\b", _bn("স্লট"), _hi("स्लॉट"))

_TODAY = _any(r"\btoday('?s)?\b", r"\bright now\b", r"\bso far\b", _bn("আজ"), _hi("आज", whole=True))

_WINDOW = re.compile(r"\b(7|14|30)\s*(?:days?|দিন|दिन|दिवसीय)")
_WINDOW_WORDS = {"seven": 7, "fourteen": 14, "thirty": 30, "fortnight": 14}

# Intents in specificity order. Earlier = more specific = wins `primary`.
INTENT_ORDER: tuple[str, ...] = (
    "greeting",
    "help",
    "formula",
    "brief",
    "explain_day",
    "target_simulate",
    "target_adjust",
    "wow",
    "peak_dip",
    "history_n_days",
    "year_summary",
    "mtd",
    "yoy",
    "surge",
    "weather",
    "market",
    "ranking",
    "coaching",
    "bills",
    "requisitions",
    "directives",
    "timeslot",
)

# Primary intents whose answer is advice, not a figure lookup.
ADVICE_INTENTS = frozenset({"greeting", "help", "coaching", "surge"})


@dataclass
class IntentResult:
    primary: str = "day_kpis"
    secondary: list[str] = field(default_factory=list)
    window_days: int | None = None        # target recovery window (7/14/30), only if stated
    history_days: int | None = None       # N in "past N days"
    explicit_today: bool = False
    normalized: str = ""
    # False when no regex rule matched and `primary` is only the day_kpis default;
    # src/chat/intent_router.py then asks the LLM to classify the question.
    matched: bool = True
    source: str = "regex"                  # "regex" | "llm" | "default"
    requested_metrics: list[str] = field(default_factory=list)

    @property
    def all(self) -> list[str]:
        return [self.primary, *self.secondary]

    def has(self, name: str) -> bool:
        return name in self.all


def _matches(intent: str, q: str) -> bool:
    if intent == "greeting":
        return bool(_GREETING.search(q))
    if intent == "help":
        return bool(_HELP.search(q))
    if intent == "formula":
        return bool(_FORMULA.search(q))
    if intent == "brief":
        return bool(_BRIEF.search(q))
    if intent == "explain_day":
        return bool(_EXPLAIN_DAY.search(q))
    if intent == "target_adjust":
        return bool(_TARGET_ADJUST.search(q))
    if intent == "target_simulate":
        if not _TARGET_ADJUST.search(q):
            return False
        distinct_windows = {m.group(1) for m in _WINDOW.finditer(q)}
        return bool(_SIMULATE.search(q)) or len(distinct_windows) >= 2
    if intent == "wow":
        return bool(_WOW.search(q))
    if intent == "peak_dip":
        return bool(_PEAK_DIP.search(q))
    if intent == "history_n_days":
        return bool(_HISTORY_N.search(q) or _HISTORY_WORDS.search(q))
    if intent == "year_summary":
        return bool(_YEAR_SUMMARY.search(q))
    if intent == "mtd":
        return bool(_MTD.search(q))
    if intent == "yoy":
        return bool(_YOY.search(q))
    if intent == "surge":
        return bool(_SURGE.search(q))
    if intent == "weather":
        return bool(_WEATHER.search(q))
    if intent == "market":
        return bool(_MARKET.search(q))
    if intent == "ranking":
        return bool(_RANK_STRONG.search(q) or (_COMPARE.search(q) and _STORES.search(q)))
    if intent == "bills":
        return bool(_BILLS.search(q))
    if intent == "requisitions":
        return bool(_REQUISITIONS.search(q))
    if intent == "directives":
        return bool(_DIRECTIVES.search(q))
    if intent == "coaching":
        return bool(_COACHING.search(q))
    if intent == "timeslot":
        return bool(_TIMESLOT.search(q))
    return False


def _history_days(q: str) -> int | None:
    m = _HISTORY_N.search(q)
    if m:
        n = int(m.group(1))
        return n if 1 <= n <= 90 else None
    if "fortnight" in q:
        return 14
    if _HISTORY_WORDS.search(q):
        return 7
    return None


def _window_days(q: str) -> int | None:
    m = _WINDOW.search(q)
    if m:
        return int(m.group(1))
    for word, n in _WINDOW_WORDS.items():
        if re.search(rf"\b{word}\b", q):
            return n
    return None


_FULL_REPORT = _any(
    r"\b(complete|full|entire|overall|detailed|everything|all kpis?|summary|overview|report)\b",
    _bn("সম্পূর্ণ"), _bn("বিস্তারিত"), _bn("রিপোর্ট"), _bn("সব"),
    _hi("पूरी"), _hi("संपूर्ण"), _hi("विस्तृत"), _hi("रिपोर्ट"), _hi("सभी"),
)
_NARROW_ONLY = _any(
    r"\b(only|just|specifically|exact|single)\b",
    _bn("শুধু"), _bn("কেবল"), _bn("মাত্র"),
    _hi("सिर्फ"), _hi("केवल"), _hi("बस"),
)

_METRIC_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("net_sales", _any(r"\b(net sales?|total sales?|revenue)\b", _bn("নেট সেলস"), _bn("মোট বিক্রি"), _hi("नेट सेल्स"), _hi("कुल बिक्री"), _hi("शुद्ध बिक्री"))),
    ("sales_target", _any(r"\b(sales targets?|targets?)\b", _bn("টার্গেট"), _bn("লক্ষ্য"), _hi("टारगेट"), _hi("लक्ष्य"))),
    ("achievement_pct", _any(r"\b(achievement|ach ?%|achieve)\b", _bn("অর্জন"), _bn("অ্যাচিভমেন্ট"), _hi("अचीवमेंट"), _hi("उपलब्धि"))),
    ("target_gap", _any(r"\b(target gap|gap|remaining|shortfall)\b", _bn("ঘাটতি"), _bn("বাকি"), _hi("अंतर"), _hi("गैप"))),
    ("footfall", _any(r"\b(footfall|visitors?|walk ?ins?|traffic)\b", _bn("ফুটফল"), _bn("ভিজিটর"), _hi("फुटफॉल"), _hi("ग्राहक"))),
    ("nob", _any(r"\b(nob|number of bills?|bills? counts?|total bills?|invoices?)\b", _bn("বিল সংখ্যা"), _bn("মোট বিল"), _bn("এনওবি"), _hi("बिल संख्या"), _hi("कुल बिल"), _hi("एनओबी"))),
    ("conversion_pct", _any(r"\b(conversion|conv ?%)\b", _bn("কনভার্সন"), _hi("कन्वर्शन"), _hi("कन्वर्जन"))),
    ("atv", _any(r"\b(atv|average transaction( value)?|avg transaction|average ticket|ticket size)\b", _bn("এটিভি"), _hi("एटीवी"), _hi("टिकट साइज"))),
    ("rpv", _any(r"\b(rpv|revenue per visitor)\b", _bn("আরপিভি"), _hi("आरपीवी"))),
    ("basket_size", _any(r"\b(basket size|upt|units per bill)\b", _bn("বাস্কেট"), _hi("बास्केट"))),
    ("largest_bill", _any(r"\b(largest bill|highest (single )?bill|biggest bill)\b", _bn("সর্বোচ্চ বিল"), _hi("सबसे बड़ा बिल"))),
    ("timeslots", _any(r"\b(time ?slots?|4 ?slots?|peak slot|rush hour|hourly)\b", _bn("টাইম স্লট"), _bn("স্লট"), _hi("टाइम स्लॉट"), _hi("स्लॉट"), _hi("पीक स्लॉट"))),
)


def extract_requested_metrics(normalized_query: str) -> list[str]:
    """Return specific KPI keys when the user asks for 1-3 focused metrics, else []."""
    if not normalized_query:
        return []
    hits = [key for key, pat in _METRIC_PATTERNS if pat.search(normalized_query)]
    if not hits:
        return []
    if _FULL_REPORT.search(normalized_query) and not _NARROW_ONLY.search(normalized_query):
        return []
    if len(hits) > 3:
        return []
    return hits


def detect_intent(query: str) -> IntentResult:
    q = normalize(query)
    hits = [name for name in INTENT_ORDER if _matches(name, q)]

    # target_simulate implies target_adjust; never list both.
    if "target_simulate" in hits and "target_adjust" in hits:
        hits.remove("target_adjust")
    # A 7-day *recovery window* is not a 7-day history table request.
    if any(h in hits for h in ("target_simulate", "target_adjust")) and "history_n_days" in hits:
        hits.remove("history_n_days")
    # "same day last week" also matches the generic "last week" history words.
    if "wow" in hits and "history_n_days" in hits and not _HISTORY_N.search(q):
        hits.remove("history_n_days")

    # A KPI formula answer needs no data, so other hits add nothing.
    if hits and hits[0] == "formula":
        hits = ["formula"]

    primary = hits[0] if hits else "day_kpis"
    # The single-day card already carries the 4-slot breakdown.
    if primary == "timeslot":
        primary, hits = "day_kpis", ["day_kpis", *hits]
    return IntentResult(
        primary=primary,
        secondary=hits[1:],
        window_days=_window_days(q) if primary.startswith("target") else None,
        history_days=_history_days(q),
        explicit_today=bool(_TODAY.search(q)),
        normalized=q,
        matched=bool(hits),
        source="regex" if hits else "default",
        requested_metrics=extract_requested_metrics(q) if primary == "day_kpis" else [],
    )
