import { useState, useEffect, useCallback } from "react";
import {
  Calculator,
  Percent,
  Target,
  TrendingUp,
  Users,
  Receipt,
  RotateCcw,
  Sparkles,
  ArrowUpRight,
  Clock,
  History,
  Delete,
  Equal,
  Coins,
  ArrowLeftRight,
  RefreshCw,
  Globe,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtCurrency, fmtPercent, fmtNumber, fmtDecimalOrZero } from "@/lib/format";

interface BusinessCalculatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CalcHistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: string;
}

// 1 INR = X units of currency (Baseline fallback rates for offline operation)
const BASE_FALLBACK_RATES: Record<string, number> = {
  INR: 1,
  BDT: 1.392,    // 1 BDT ≈ 0.718 INR (Kolkata tourist corridor)
  USD: 0.0115,   // 1 USD ≈ 86.95 INR
  EUR: 0.0111,   // 1 EUR ≈ 90.10 INR
  GBP: 0.00925,  // 1 GBP ≈ 108.10 INR
  AED: 0.0423,   // 1 AED ≈ 23.64 INR
  SAR: 0.0432,   // 1 SAR ≈ 23.15 INR
  SGD: 0.0156,   // 1 SGD ≈ 64.10 INR
  AUD: 0.0182,   // 1 AUD ≈ 54.95 INR
  CAD: 0.0165,   // 1 CAD ≈ 60.60 INR
  THB: 0.3920,   // 1 THB ≈ 2.55 INR
  JPY: 1.7850,   // 100 JPY ≈ 56.02 INR
  KWD: 0.00355,  // 1 KWD ≈ 281.70 INR
};

const CURRENCY_INFO: Record<string, { name: string; symbol: string; flag: string }> = {
  INR: { name: "Indian Rupee", symbol: "₹", flag: "🇮🇳" },
  BDT: { name: "Bangladeshi Taka", symbol: "৳", flag: "🇧🇩" },
  USD: { name: "US Dollar", symbol: "$", flag: "🇺🇸" },
  EUR: { name: "Euro", symbol: "€", flag: "🇪🇺" },
  GBP: { name: "British Pound", symbol: "£", flag: "🇬🇧" },
  AED: { name: "UAE Dirham", symbol: "AED", flag: "🇦🇪" },
  SAR: { name: "Saudi Riyal", symbol: "SAR", flag: "🇸🇦" },
  SGD: { name: "Singapore Dollar", symbol: "S$", flag: "🇸🇬" },
  AUD: { name: "Australian Dollar", symbol: "A$", flag: "🇦🇺" },
  CAD: { name: "Canadian Dollar", symbol: "C$", flag: "🇨🇦" },
  THB: { name: "Thai Baht", symbol: "฿", flag: "🇹🇭" },
  JPY: { name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
  KWD: { name: "Kuwaiti Dinar", symbol: "KD", flag: "🇰🇼" },
};

export function BusinessCalculatorModal({
  open,
  onOpenChange,
}: BusinessCalculatorModalProps) {
  // Active Tab
  const [activeTab, setActiveTab] = useState<string>("desk");

  // --- TAB 1: RETAIL DESK CALCULATOR STATE ---
  const [displayValue, setDisplayValue] = useState<string>("0");
  const [equation, setEquation] = useState<string>("");
  const [prevOperand, setPrevOperand] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForNewOperand, setWaitingForNewOperand] = useState<boolean>(false);
  const [calcHistory, setCalcHistory] = useState<CalcHistoryItem[]>([]);

  // --- TAB 2: REAL-TIME CURRENCY & FOREX CONVERTER STATE ---
  const [rates, setRates] = useState<Record<string, number>>(BASE_FALLBACK_RATES);
  const [isLiveRates, setIsLiveRates] = useState<boolean>(false);
  const [ratesLastUpdated, setRatesLastUpdated] = useState<string>("Offline baseline");
  const [isFetchingRates, setIsFetchingRates] = useState<boolean>(false);

  const [currencyAmount, setCurrencyAmount] = useState<number>(100);
  const [fromCurrency, setFromCurrency] = useState<string>("USD");
  const [toCurrency, setToCurrency] = useState<string>("INR");

  // Foreign Tourist Bill Tender Settlement Helper
  const [storeBillInr, setStoreBillInr] = useState<number>(3500);
  const [tenderForeignCurrency, setTenderForeignCurrency] = useState<string>("USD");
  const [tenderForeignAmount, setTenderForeignAmount] = useState<number>(50);

  // --- TAB 3: TARGET DEFICIT & ROLLING RECOVERY STATE ---
  const [targetSales, setTargetSales] = useState<number>(350000);
  const [actualSales, setActualSales] = useState<number>(240000);
  const [recoveryDays, setRecoveryDays] = useState<number>(7);
  const [remainingHours, setRemainingHours] = useState<number>(4);

  // --- TAB 4: RETAIL KPI COMPOUNDER STATE ---
  const [footfall, setFootfall] = useState<number>(1200);
  const [conversionRate, setConversionRate] = useState<number>(68);
  const [atv, setAtv] = useState<number>(1550);
  const [upt, setUpt] = useState<number>(2.4);

  // --- TAB 5: MARGIN, MARKUP & PROMO ROI STATE ---
  const [sellingPrice, setSellingPrice] = useState<number>(1999);
  const [costPrice, setCostPrice] = useState<number>(1100);
  const [promoDiscountPct, setPromoDiscountPct] = useState<number>(15);

  // --- TAB 6: GST & TAX REALIZATION STATE ---
  const [grossBillAmount, setGrossBillAmount] = useState<number>(25000);
  const [gstRate, setGstRate] = useState<number>(12); // 5%, 12%, 18%

  // --- TAB 7: STAFF PRODUCTIVITY STATE ---
  const [staffSales, setStaffSales] = useState<number>(300000);
  const [floorStaffCount, setFloorStaffCount] = useState<number>(14);
  const [operatingHours, setOperatingHours] = useState<number>(12);
  const [peakSharePct, setPeakSharePct] = useState<number>(45); // 5 PM - 8 PM (3 hrs)

  // --- LIVE CURRENCY RATE FETCHER ---
  const fetchLiveRates = useCallback(async () => {
    setIsFetchingRates(true);
    try {
      // 100% free open exchange rate API (zero API key required)
      const res = await fetch("https://open.er-api.com/v6/latest/INR");
      if (res.ok) {
        const data = await res.json();
        if (data && data.rates) {
          setRates((prev) => ({ ...prev, ...data.rates }));
          setIsLiveRates(true);
          setRatesLastUpdated(new Intl.DateTimeFormat("en-IN", { timeStyle: "short" }).format(new Date()));
        }
      }
    } catch {
      // Fallback seamlessly to local rates if offline
      setIsLiveRates(false);
    } finally {
      setIsFetchingRates(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchLiveRates();
    }
  }, [open, fetchLiveRates]);

  // --- DESK CALCULATOR LOGIC ---
  const inputDigit = useCallback((digit: string) => {
    if (waitingForNewOperand) {
      setDisplayValue(digit);
      setWaitingForNewOperand(false);
    } else {
      setDisplayValue((prev) => (prev === "0" ? digit : prev + digit));
    }
  }, [waitingForNewOperand]);

  const inputDecimal = useCallback(() => {
    if (waitingForNewOperand) {
      setDisplayValue("0.");
      setWaitingForNewOperand(false);
      return;
    }
    if (!displayValue.includes(".")) {
      setDisplayValue((prev) => prev + ".");
    }
  }, [displayValue, waitingForNewOperand]);

  const clearAll = useCallback(() => {
    setDisplayValue("0");
    setEquation("");
    setPrevOperand(null);
    setOperation(null);
    setWaitingForNewOperand(false);
  }, []);

  const clearEntry = useCallback(() => {
    setDisplayValue("0");
  }, []);

  const deleteLastChar = useCallback(() => {
    if (waitingForNewOperand) return;
    setDisplayValue((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
  }, [waitingForNewOperand]);

  const calculate = useCallback((first: number, second: number, op: string): number => {
    switch (op) {
      case "+":
        return first + second;
      case "−":
      case "-":
        return first - second;
      case "×":
      case "*":
        return first * second;
      case "÷":
      case "/":
        return second !== 0 ? first / second : 0;
      default:
        return second;
    }
  }, []);

  const performOperation = useCallback((nextOp: string) => {
    const inputValue = parseFloat(displayValue);

    if (prevOperand === null) {
      setPrevOperand(inputValue);
      setEquation(`${inputValue} ${nextOp}`);
    } else if (operation) {
      const current = prevOperand || 0;
      const res = calculate(current, inputValue, operation);
      setPrevOperand(res);
      setDisplayValue(String(res));
      setEquation(`${res} ${nextOp}`);
    }

    setWaitingForNewOperand(true);
    setOperation(nextOp);
  }, [calculate, displayValue, operation, prevOperand]);

  const handleEquals = useCallback(() => {
    if (operation === null || prevOperand === null) return;
    const inputValue = parseFloat(displayValue);
    const res = calculate(prevOperand, inputValue, operation);
    const eq = `${prevOperand} ${operation} ${inputValue} =`;

    setDisplayValue(String(res));
    setEquation(eq);
    setPrevOperand(null);
    setOperation(null);
    setWaitingForNewOperand(true);

    // Record history
    setCalcHistory((prev) => [
      {
        id: String(Date.now()),
        expression: eq,
        result: String(res),
        timestamp: new Intl.DateTimeFormat("en-IN", { timeStyle: "short" }).format(new Date()),
      },
      ...prev.slice(0, 19),
    ]);
  }, [calculate, displayValue, operation, prevOperand]);

  const applyGst = useCallback((rate: number) => {
    const val = parseFloat(displayValue) || 0;
    const res = val * (1 + rate / 100);
    const eq = `${val} + ${rate}% GST =`;
    setDisplayValue(String(Math.round(res * 100) / 100));
    setEquation(eq);
    setWaitingForNewOperand(true);
    setCalcHistory((prev) => [
      {
        id: String(Date.now()),
        expression: eq,
        result: String(Math.round(res * 100) / 100),
        timestamp: new Intl.DateTimeFormat("en-IN", { timeStyle: "short" }).format(new Date()),
      },
      ...prev.slice(0, 19),
    ]);
  }, [displayValue]);

  const extractGst = useCallback((rate: number) => {
    const val = parseFloat(displayValue) || 0;
    const base = val / (1 + rate / 100);
    const tax = val - base;
    const eq = `${val} - ${rate}% GST Base =`;
    setDisplayValue(String(Math.round(base * 100) / 100));
    setEquation(`${eq} (Tax: ₹${Math.round(tax)})`);
    setWaitingForNewOperand(true);
    setCalcHistory((prev) => [
      {
        id: String(Date.now()),
        expression: eq,
        result: String(Math.round(base * 100) / 100),
        timestamp: new Intl.DateTimeFormat("en-IN", { timeStyle: "short" }).format(new Date()),
      },
      ...prev.slice(0, 19),
    ]);
  }, [displayValue]);

  const applyDiscount = useCallback((pct: number) => {
    const val = parseFloat(displayValue) || 0;
    const res = val * (1 - pct / 100);
    const eq = `${val} − ${pct}% Off =`;
    setDisplayValue(String(Math.round(res * 100) / 100));
    setEquation(eq);
    setWaitingForNewOperand(true);
    setCalcHistory((prev) => [
      {
        id: String(Date.now()),
        expression: eq,
        result: String(Math.round(res * 100) / 100),
        timestamp: new Intl.DateTimeFormat("en-IN", { timeStyle: "short" }).format(new Date()),
      },
      ...prev.slice(0, 19),
    ]);
  }, [displayValue]);

  // Keyboard shortcut listener for Desk Calc
  useEffect(() => {
    if (!open || activeTab !== "desk") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        inputDigit(e.key);
      } else if (e.key === ".") {
        e.preventDefault();
        inputDecimal();
      } else if (e.key === "+" || e.key === "-" || e.key === "*" || e.key === "/") {
        e.preventDefault();
        const map: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
        performOperation(map[e.key] || e.key);
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        handleEquals();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        deleteLastChar();
      } else if (e.key === "Escape" || e.key.toLowerCase() === "c") {
        clearAll();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, activeTab, inputDigit, inputDecimal, performOperation, handleEquals, deleteLastChar, clearAll]);

  // --- CURRENCY CONVERSION COMPUTATIONS ---
  const fromRate = rates[fromCurrency] || 1;
  const toRate = rates[toCurrency] || 1;
  // 1 fromCurrency in INR = (1 / fromRate)
  // converted = (currencyAmount / fromRate) * toRate
  const convertedAmount = fromRate > 0 ? (currencyAmount / fromRate) * toRate : 0;
  const unitExchangeRate = fromRate > 0 ? toRate / fromRate : 0;

  const swapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  // Tourist Tender Calculations
  const tenderRate = rates[tenderForeignCurrency] || 1;
  const tenderInrEquivalent = tenderRate > 0 ? tenderForeignAmount / tenderRate : 0;
  const tenderChangeDueInr = tenderInrEquivalent - storeBillInr;

  // --- OTHER RETAIL FORMULA COMPUTATIONS ---

  // 1. Target Recovery
  const deficit = Math.max(0, targetSales - actualSales);
  const achievementPct = targetSales > 0 ? (actualSales / targetSales) * 100 : 0;
  const dailyRecoveryRequired = recoveryDays > 0 ? deficit / recoveryDays : 0;
  const newAdjustedTarget = targetSales + dailyRecoveryRequired;
  const hourlyRunRateNeeded = remainingHours > 0 ? deficit / remainingHours : 0;

  // 2. Retail KPI Compounder
  const projectedBills = Math.round(footfall * (conversionRate / 100));
  const projectedSales = Math.round(projectedBills * atv);
  const rpv = footfall > 0 ? Math.round(projectedSales / footfall) : 0;
  const totalUnits = Math.round(projectedBills * upt);
  const aur = upt > 0 ? Math.round(atv / upt) : 0;

  // Sensitivity Simulations:
  const simBillsConv = Math.round(footfall * ((conversionRate + 5) / 100));
  const simSalesConv = Math.round(simBillsConv * atv);
  const convSalesDelta = simSalesConv - projectedSales;

  const simSalesAtv = Math.round(projectedBills * (atv + 150));
  const atvSalesDelta = simSalesAtv - projectedSales;

  // 3. Margin & Promo ROI
  const originalGrossProfit = Math.max(0, sellingPrice - costPrice);
  const originalMarginPct = sellingPrice > 0 ? (originalGrossProfit / sellingPrice) * 100 : 0;
  const originalMarkupPct = costPrice > 0 ? (originalGrossProfit / costPrice) * 100 : 0;
  const discountedPrice = Math.max(0, sellingPrice * (1 - promoDiscountPct / 100));
  const postDiscountProfit = Math.max(0, discountedPrice - costPrice);
  const postDiscountMarginPct = discountedPrice > 0 ? (postDiscountProfit / discountedPrice) * 100 : 0;
  const breakevenLiftPct =
    originalMarginPct > promoDiscountPct
      ? (promoDiscountPct / (originalMarginPct - promoDiscountPct)) * 100
      : 0;

  // 4. GST & Realization
  const gstMultiplier = 1 + gstRate / 100;
  const taxableBase = grossBillAmount > 0 ? grossBillAmount / gstMultiplier : 0;
  const totalGst = grossBillAmount - taxableBase;
  const cgst = totalGst / 2;
  const sgst = totalGst / 2;
  const netRealizationPct = grossBillAmount > 0 ? (taxableBase / grossBillAmount) * 100 : 0;

  // 5. Staff Productivity (SPH / SPA)
  const sph = operatingHours > 0 ? Math.round(staffSales / operatingHours) : 0;
  const spa = floorStaffCount > 0 ? Math.round(staffSales / floorStaffCount) : 0;
  const peakSales = (staffSales * peakSharePct) / 100;
  const peakHourSph = Math.round(peakSales / 3); // 3-hr evening window (5 PM - 8 PM)
  const sphPerStaff = floorStaffCount > 0 ? Math.round(sph / floorStaffCount) : 0;

  // Format large display value with commas
  const formattedDisplay = (() => {
    const num = parseFloat(displayValue);
    if (isNaN(num)) return displayValue;
    if (displayValue.endsWith(".")) return num.toLocaleString("en-IN") + ".";
    if (displayValue.includes(".")) {
      const parts = displayValue.split(".");
      return parseFloat(parts[0]).toLocaleString("en-IN") + "." + parts[1];
    }
    return num.toLocaleString("en-IN");
  })();

  const supportedCurrencies = Object.keys(CURRENCY_INFO);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-background/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-border/80 bg-gradient-to-r from-muted/50 via-background to-muted/30">
          <div className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-3">
              <div className="p-2 sm:p-2.5 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-md">
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-xl font-bold flex items-center gap-2 text-foreground">
                  CITIMART Business Calculator
                  <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Retail Pro
                  </span>
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                  Interactive retail keypad, real-time forex currency converter, target deficit recovery, KPI simulator & GST analyzer.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Tabbed Navigation */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex flex-wrap sm:grid sm:grid-cols-7 w-full h-auto p-1 bg-muted/60 rounded-xl mb-4 gap-1">
              <TabsTrigger value="desk" className="text-xs py-2 flex items-center gap-1.5 cursor-pointer font-bold">
                <Calculator className="h-3.5 w-3.5 text-emerald-500" />
                <span>Desk Calc</span>
              </TabsTrigger>
              <TabsTrigger value="currency" className="text-xs py-2 flex items-center gap-1.5 cursor-pointer font-bold">
                <Coins className="h-3.5 w-3.5 text-teal-500" />
                <span>Forex Live</span>
              </TabsTrigger>
              <TabsTrigger value="target" className="text-xs py-2 flex items-center gap-1.5 cursor-pointer">
                <Target className="h-3.5 w-3.5 text-blue-500" />
                <span>Target</span>
              </TabsTrigger>
              <TabsTrigger value="kpis" className="text-xs py-2 flex items-center gap-1.5 cursor-pointer">
                <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
                <span>KPI Sim</span>
              </TabsTrigger>
              <TabsTrigger value="margin" className="text-xs py-2 flex items-center gap-1.5 cursor-pointer">
                <Percent className="h-3.5 w-3.5 text-amber-500" />
                <span>Margin ROI</span>
              </TabsTrigger>
              <TabsTrigger value="gst" className="text-xs py-2 flex items-center gap-1.5 cursor-pointer">
                <Receipt className="h-3.5 w-3.5 text-cyan-500" />
                <span>GST Tax</span>
              </TabsTrigger>
              <TabsTrigger value="staff" className="text-xs py-2 flex items-center gap-1.5 cursor-pointer">
                <Users className="h-3.5 w-3.5 text-purple-500" />
                <span>SPH Staff</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: RETAIL DESK CALCULATOR KEYPAD */}
            <TabsContent value="desk" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Main Calculator Engine */}
                <div className="lg:col-span-2 space-y-3 p-4 rounded-2xl border border-border bg-card shadow-sm">
                  {/* Digital LCD Display */}
                  <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 text-right shadow-inner select-none font-mono">
                    <div className="text-xs font-medium text-slate-400 h-5 overflow-hidden truncate">
                      {equation || "\u00A0"}
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight overflow-x-auto truncate">
                      ₹ {formattedDisplay}
                    </div>
                  </div>

                  {/* Business Quick Shortcut Buttons */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[11px] h-8 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30"
                      onClick={() => applyGst(5)}
                      title="Add 5% GST (Apparel ≤ ₹1,000)"
                    >
                      +5% GST
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[11px] h-8 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30"
                      onClick={() => applyGst(12)}
                      title="Add 12% GST (Apparel > ₹1,000)"
                    >
                      +12% GST
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[11px] h-8 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30"
                      onClick={() => applyGst(18)}
                      title="Add 18% GST (Accessories)"
                    >
                      +18% GST
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[11px] h-8 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30"
                      onClick={() => extractGst(12)}
                      title="Extract 12% GST Base Value"
                    >
                      -12% Base
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[11px] h-8 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30"
                      onClick={() => applyDiscount(10)}
                      title="Apply 10% Promotional Discount"
                    >
                      -10% Off
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[11px] h-8 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30"
                      onClick={() => applyDiscount(20)}
                      title="Apply 20% Promotional Discount"
                    >
                      -20% Off
                    </Button>
                  </div>

                  {/* Standard Keypad Grid */}
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-12 text-sm font-bold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20"
                      onClick={clearAll}
                    >
                      AC
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-12 text-sm font-bold"
                      onClick={clearEntry}
                    >
                      C
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-12 text-sm font-bold"
                      onClick={deleteLastChar}
                    >
                      <Delete className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-12 text-base font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      onClick={() => performOperation("÷")}
                    >
                      ÷
                    </Button>

                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={() => inputDigit("7")}>
                      7
                    </Button>
                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={() => inputDigit("8")}>
                      8
                    </Button>
                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={() => inputDigit("9")}>
                      9
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-12 text-base font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      onClick={() => performOperation("×")}
                    >
                      ×
                    </Button>

                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={() => inputDigit("4")}>
                      4
                    </Button>
                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={() => inputDigit("5")}>
                      5
                    </Button>
                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={() => inputDigit("6")}>
                      6
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-12 text-base font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      onClick={() => performOperation("−")}
                    >
                      −
                    </Button>

                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={() => inputDigit("1")}>
                      1
                    </Button>
                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={() => inputDigit("2")}>
                      2
                    </Button>
                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={() => inputDigit("3")}>
                      3
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-12 text-base font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      onClick={() => performOperation("+")}
                    >
                      +
                    </Button>

                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={() => inputDigit("0")}>
                      0
                    </Button>
                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={() => inputDigit("00")}>
                      00
                    </Button>
                    <Button type="button" variant="outline" className="h-12 text-base font-bold" onClick={inputDecimal}>
                      .
                    </Button>
                    <Button
                      type="button"
                      className="h-12 text-base font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer"
                      onClick={handleEquals}
                    >
                      <Equal className="h-5 w-5" />
                    </Button>
                  </div>
                </div>

                {/* Calculation Tape / Audit History Drawer */}
                <div className="p-4 rounded-2xl border border-border bg-card shadow-sm flex flex-col justify-between max-h-[420px]">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-border/80">
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        <History className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Audit Tape History</span>
                      </div>
                      {calcHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCalcHistory([])}
                          className="text-[10px] text-muted-foreground hover:text-red-500 underline cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="mt-2 space-y-2 overflow-y-auto max-h-[310px] pr-1">
                      {calcHistory.length === 0 ? (
                        <div className="py-12 text-center text-xs text-muted-foreground">
                          No recent calculations logged. Punch numbers or use GST shortcuts.
                        </div>
                      ) : (
                        calcHistory.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => {
                              setDisplayValue(item.result);
                              setEquation(item.expression);
                            }}
                            className="p-2 rounded-lg bg-muted/40 hover:bg-muted/70 border border-border/50 text-right cursor-pointer transition-colors"
                          >
                            <div className="text-[10px] text-muted-foreground font-mono flex justify-between">
                              <span>{item.timestamp}</span>
                              <span>{item.expression}</span>
                            </div>
                            <div className="text-sm font-bold font-mono text-foreground mt-0.5">
                              ₹ {parseFloat(item.result).toLocaleString("en-IN")}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] text-muted-foreground pt-2 border-t border-border/60">
                    ⌨️ <strong>Keyboard enabled:</strong> Use Numpad, Enter (=), Esc (AC), and Backspace.
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: REAL-TIME CURRENCY & FOREX CONVERTER */}
            <TabsContent value="currency" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3 text-xs text-teal-700 dark:text-teal-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 shrink-0 text-teal-500" />
                  <span>
                    Live tourist & international currency calculator. Tailored for New Market & Chowringhee shoppers.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                    <span className={`inline-block size-2 rounded-full ${isLiveRates ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                    {isLiveRates ? `Live: ${ratesLastUpdated}` : "Offline Baseline"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px] cursor-pointer"
                    disabled={isFetchingRates}
                    onClick={fetchLiveRates}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${isFetchingRates ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Instant Currency Converter */}
                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-teal-500" /> Currency Conversion
                  </h4>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Amount</Label>
                    <Input
                      type="number"
                      value={currencyAmount || ""}
                      onChange={(e) => setCurrencyAmount(Number(e.target.value) || 0)}
                      className="font-mono text-base font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-5 gap-2 items-center pt-1">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[11px] text-muted-foreground">From</Label>
                      <select
                        value={fromCurrency}
                        onChange={(e) => setFromCurrency(e.target.value)}
                        className="w-full text-xs font-semibold rounded-md border border-input bg-background p-2"
                      >
                        {supportedCurrencies.map((c) => (
                          <option key={c} value={c}>
                            {CURRENCY_INFO[c]?.flag} {c} — {CURRENCY_INFO[c]?.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex justify-center pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8 rounded-full cursor-pointer hover:bg-muted"
                        onClick={swapCurrencies}
                        title="Swap currencies"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>

                    <div className="col-span-2 space-y-1">
                      <Label className="text-[11px] text-muted-foreground">To</Label>
                      <select
                        value={toCurrency}
                        onChange={(e) => setToCurrency(e.target.value)}
                        className="w-full text-xs font-semibold rounded-md border border-input bg-background p-2"
                      >
                        {supportedCurrencies.map((c) => (
                          <option key={c} value={c}>
                            {CURRENCY_INFO[c]?.flag} {c} — {CURRENCY_INFO[c]?.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Converted Output Display */}
                  <div className="p-3.5 rounded-xl bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-transparent border border-teal-500/20 text-center mt-2">
                    <span className="text-[11px] text-muted-foreground">
                      {currencyAmount.toLocaleString()} {fromCurrency} =
                    </span>
                    <div className="text-2xl sm:text-3xl font-black text-foreground mt-0.5 tracking-tight font-mono">
                      {CURRENCY_INFO[toCurrency]?.symbol}{" "}
                      {convertedAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-1">
                      Exchange Rate: 1 {fromCurrency} = {unitExchangeRate.toFixed(4)} {toCurrency}
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-muted-foreground font-semibold">Quick Amounts:</span>
                    {[50, 100, 500, 1000, 5000].map((amt) => (
                      <Button
                        key={amt}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => setCurrencyAmount(amt)}
                      >
                        {amt}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Foreign Tourist Bill Tender Settlement Assistant */}
                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>Tourist Bill Settlement</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        Cashier Tool
                      </span>
                    </h4>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Citimart Bill Amount (INR ₹)</Label>
                      <Input
                        type="number"
                        value={storeBillInr || ""}
                        onChange={(e) => setStoreBillInr(Number(e.target.value) || 0)}
                        className="font-mono text-sm font-bold"
                        placeholder="e.g. 3500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Customer Tenders In</Label>
                        <select
                          value={tenderForeignCurrency}
                          onChange={(e) => setTenderForeignCurrency(e.target.value)}
                          className="w-full text-xs font-semibold rounded-md border border-input bg-background p-2"
                        >
                          {supportedCurrencies
                            .filter((c) => c !== "INR")
                            .map((c) => (
                              <option key={c} value={c}>
                                {CURRENCY_INFO[c]?.flag} {c}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Foreign Note Handed</Label>
                        <Input
                          type="number"
                          value={tenderForeignAmount || ""}
                          onChange={(e) => setTenderForeignAmount(Number(e.target.value) || 0)}
                          className="font-mono text-sm font-bold"
                          placeholder="e.g. 50"
                        />
                      </div>
                    </div>

                    {/* Settlement Deconstruction Card */}
                    <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Tender Value in INR:</span>
                        <span className="font-bold text-foreground">
                          ₹{tenderInrEquivalent.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-t border-border/40 pt-1">
                        <span className="text-muted-foreground">Bill Amount:</span>
                        <span className="font-bold text-foreground">₹{storeBillInr.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-border/40 pt-1 font-bold text-sm">
                        <span className={tenderChangeDueInr >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"}>
                          {tenderChangeDueInr >= 0 ? "Change Due to Customer:" : "Shortfall Due from Customer:"}
                        </span>
                        <span className={tenderChangeDueInr >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"}>
                          ₹{Math.abs(tenderChangeDueInr).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20 text-[10px] text-teal-800 dark:text-teal-200">
                    💡 <strong>Cash Desk Directive:</strong> Return change strictly in Indian Rupees (INR) and stamp foreign currency voucher with cashier ID.
                  </div>
                </div>
              </div>

              {/* Major Retail Currencies Rate Matrix */}
              <div className="rounded-xl border border-border/80 bg-card p-3 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Kolkata Retail Footfall Foreign Exchange Rates Matrix
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                  {["BDT", "USD", "EUR", "GBP", "AED", "SAR"].map((code) => {
                    const r = rates[code] || 1;
                    const oneForeignInInr = r > 0 ? 1 / r : 0;
                    return (
                      <div key={code} className="p-2 rounded-lg border border-border/50 bg-muted/30">
                        <div className="flex items-center justify-between text-muted-foreground text-[10px]">
                          <span>{CURRENCY_INFO[code]?.flag} {code}</span>
                          <span>1 {code}</span>
                        </div>
                        <div className="text-sm font-bold font-mono text-foreground mt-0.5">
                          ₹{oneForeignInInr.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          ₹5,000 = {((5000 * r)).toFixed(0)} {code}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: TARGET DEFICIT & ROLLING RECOVERY */}
            <TabsContent value="target" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-blue-500" />
                <span>
                  Calculates rolling deficit recovery ($A_t = T_t + C_t / N$) and immediate hourly run-rate required to close today's shortfall.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-blue-500" /> Store Target Inputs
                  </h4>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Today's Store Target ($T_t$ ₹)</Label>
                    <Input
                      type="number"
                      value={targetSales || ""}
                      onChange={(e) => setTargetSales(Number(e.target.value) || 0)}
                      className="font-mono text-sm"
                      placeholder="e.g. 350000"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Actual Net Sales Achieved So Far ($S_t$ ₹)</Label>
                    <Input
                      type="number"
                      value={actualSales || ""}
                      onChange={(e) => setActualSales(Number(e.target.value) || 0)}
                      className="font-mono text-sm"
                      placeholder="e.g. 240000"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Recovery Window ($N$ Days)</Label>
                      <select
                        value={recoveryDays}
                        onChange={(e) => setRecoveryDays(Number(e.target.value))}
                        className="w-full text-xs rounded-md border border-input bg-background p-2 font-medium"
                      >
                        <option value={7}>7 Days (CITIMART Standard)</option>
                        <option value={14}>14 Days (Conservative)</option>
                        <option value={30}>30 Days (Month Pacing)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Remaining Hours Today</Label>
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        value={remainingHours || ""}
                        onChange={(e) => setRemainingHours(Number(e.target.value) || 1)}
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs mt-2 cursor-pointer"
                    onClick={() => {
                      setTargetSales(350000);
                      setActualSales(240000);
                      setRecoveryDays(7);
                      setRemainingHours(4);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset Default Values
                  </Button>
                </div>

                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>Operational Diagnostics</span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          achievementPct >= 90
                            ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                            : achievementPct >= 70
                            ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                            : "bg-red-500/10 text-red-600 border border-red-500/20"
                        }`}
                      >
                        {achievementPct >= 90 ? "Target On-Track" : achievementPct >= 70 ? "Attention Needed" : "Severe Gap"}
                      </span>
                    </h4>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                        <span className="text-[11px] text-muted-foreground">Current Achievement</span>
                        <div className="text-xl font-black text-foreground mt-0.5">{fmtPercent(achievementPct)}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                        <span className="text-[11px] text-muted-foreground">Shortfall / Deficit ($C_t$)</span>
                        <div className="text-xl font-black text-red-600 dark:text-red-400 mt-0.5">
                          {fmtCurrency(deficit)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between py-1.5 border-b border-border/60">
                        <span className="text-muted-foreground">New Daily Target ($A_t$ for {recoveryDays} days):</span>
                        <span className="font-bold font-mono text-foreground text-sm">{fmtCurrency(newAdjustedTarget)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-border/60">
                        <span className="text-muted-foreground">Required Daily Carry-Forward ($C_t / N$):</span>
                        <span className="font-bold font-mono text-amber-600 dark:text-amber-400 text-sm">
                          +{fmtCurrency(dailyRecoveryRequired)}/day
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-muted-foreground">Hourly Sales Needed for Today ({remainingHours} hrs left):</span>
                        <span className="font-bold font-mono text-blue-600 dark:text-blue-400 text-sm">
                          {fmtCurrency(hourlyRunRateNeeded)}/hr
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 text-[11px] text-muted-foreground">
                    💡 <strong>Floor Directive:</strong>{" "}
                    {deficit === 0
                      ? "Target achieved! Maintain cashier cross-selling to build rolling buffer."
                      : `Ensure all checkout lanes are open during evening surge to generate ${fmtCurrency(hourlyRunRateNeeded)} per hour.`}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 4: RETAIL KPI COMPOUNDER */}
            <TabsContent value="kpis" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 shrink-0 text-indigo-500" />
                <span>
                  Simulates the retail revenue compounder: <strong>Net Sales = Footfall × (Conversion % / 100) × ATV</strong>.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-indigo-500" /> Retail Metrics Setup
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Store Footfall (Walk-ins)</Label>
                      <Input
                        type="number"
                        value={footfall || ""}
                        onChange={(e) => setFootfall(Number(e.target.value) || 0)}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Conversion Rate (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={conversionRate || ""}
                        onChange={(e) => setConversionRate(Number(e.target.value) || 0)}
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Average Ticket Value (ATV ₹)</Label>
                      <Input
                        type="number"
                        value={atv || ""}
                        onChange={(e) => setAtv(Number(e.target.value) || 0)}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Basket Size (UPT)</Label>
                      <Input
                        type="number"
                        step={0.1}
                        value={upt || ""}
                        onChange={(e) => setUpt(Number(e.target.value) || 1)}
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <span className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Store Tier Presets:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="text-[11px] h-7 px-2"
                        onClick={() => {
                          setFootfall(1600);
                          setConversionRate(72);
                          setAtv(1850);
                          setUpt(2.6);
                        }}
                      >
                        New Market Peak
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="text-[11px] h-7 px-2"
                        onClick={() => {
                          setFootfall(1100);
                          setConversionRate(65);
                          setAtv(1400);
                          setUpt(2.2);
                        }}
                      >
                        Hatibagan Regular
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="text-[11px] h-7 px-2"
                        onClick={() => {
                          setFootfall(850);
                          setConversionRate(62);
                          setAtv(1600);
                          setUpt(2.3);
                        }}
                      >
                        Chowringhee
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Compounded Financial Forecast
                    </h4>

                    <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 text-center">
                      <span className="text-xs font-medium text-muted-foreground">Projected Total Net Sales</span>
                      <div className="text-2xl sm:text-3xl font-black text-foreground mt-0.5 tracking-tight">
                        {fmtCurrency(projectedSales)}
                      </div>
                      <div className="flex items-center justify-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>Bills: <strong className="text-foreground">{fmtNumber(projectedBills)}</strong></span>
                        <span>•</span>
                        <span>RPV: <strong className="text-foreground">{fmtCurrency(rpv)}</strong></span>
                        <span>•</span>
                        <span>Units: <strong className="text-foreground">{fmtNumber(totalUnits)}</strong></span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                        What-If Growth Sensitivity
                      </span>

                      <div className="p-2.5 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-foreground">+5% Conversion Boost</span>
                          <p className="text-[11px] text-muted-foreground">Reaching {(conversionRate + 5).toFixed(0)}% conversion</p>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            +{fmtCurrency(convSalesDelta)}
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-foreground">+₹150 Cashier ATV Push</span>
                          <p className="text-[11px] text-muted-foreground">Lifting ATV to {fmtCurrency(atv + 150)}</p>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            +{fmtCurrency(atvSalesDelta)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 text-[11px] text-muted-foreground">
                    Average Unit Retail (AUR): <strong>{fmtCurrency(aur)}</strong> per piece sold.
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 5: MARGIN, MARKUP & PROMO ROI */}
            <TabsContent value="margin" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <Percent className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>
                  Evaluates merchandise gross margins and calculates required sales volume lift to breakeven after promotional discounts.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 text-emerald-500" /> Pricing & Cost Inputs
                  </h4>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Selling Price / Tag MRP (₹)</Label>
                    <Input
                      type="number"
                      value={sellingPrice || ""}
                      onChange={(e) => setSellingPrice(Number(e.target.value) || 0)}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Cost of Goods Sold (COGS ₹)</Label>
                    <Input
                      type="number"
                      value={costPrice || ""}
                      onChange={(e) => setCostPrice(Number(e.target.value) || 0)}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-semibold">Planned Promotional Discount (%)</Label>
                      <span className="font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                        {promoDiscountPct}%
                      </span>
                    </div>
                    <Input
                      type="range"
                      min={0}
                      max={50}
                      step={5}
                      value={promoDiscountPct}
                      onChange={(e) => setPromoDiscountPct(Number(e.target.value))}
                      className="cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                      <span>0%</span>
                      <span>10%</span>
                      <span>20%</span>
                      <span>30%</span>
                      <span>40%</span>
                      <span>50%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Profitability & Breakeven Analysis
                    </h4>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                        <span className="text-[11px] text-muted-foreground">Original Margin %</span>
                        <div className="text-xl font-black text-foreground mt-0.5">{fmtPercent(originalMarginPct)}</div>
                        <span className="text-[10px] text-muted-foreground">Markup: {fmtPercent(originalMarkupPct)}</span>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                        <span className="text-[11px] text-muted-foreground">Post-Discount Margin %</span>
                        <div className="text-xl font-black text-foreground mt-0.5">{fmtPercent(postDiscountMarginPct)}</div>
                        <span className="text-[10px] text-muted-foreground">Price: {fmtCurrency(discountedPrice)}</span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                        <ArrowUpRight className="h-4 w-4" />
                        <span>Required Volume Lift to Breakeven</span>
                      </div>
                      <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                        +{fmtPercent(breakevenLiftPct)}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        To generate the same total gross profit with this {promoDiscountPct}% discount, your floor staff must sell at least{" "}
                        <strong>{fmtPercent(breakevenLiftPct)} more units</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 text-[11px] text-muted-foreground">
                    Profit Per Unit: <strong>{fmtCurrency(postDiscountProfit)}</strong> (down from {fmtCurrency(originalGrossProfit)}).
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 6: GST & TAX REALIZATION */}
            <TabsContent value="gst" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-700 dark:text-cyan-300 flex items-center gap-2">
                <Receipt className="h-4 w-4 shrink-0 text-cyan-500" />
                <span>
                  Extracts statutory CGST & SGST (West Bengal) tax components and calculates net realization for retail bill collections.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 text-cyan-500" /> Bill & Tax Slabs
                  </h4>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Total Gross Collection / Bill Amount (₹)</Label>
                    <Input
                      type="number"
                      value={grossBillAmount || ""}
                      onChange={(e) => setGrossBillAmount(Number(e.target.value) || 0)}
                      className="font-mono text-sm"
                      placeholder="e.g. 25000"
                    />
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs font-semibold">Indian Retail GST Slabs</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setGstRate(5)}
                        className={`p-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                          gstRate === 5
                            ? "bg-cyan-500/15 border-cyan-500 text-cyan-700 dark:text-cyan-300 font-bold"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <div>5% GST</div>
                        <span className="text-[10px] text-muted-foreground">Apparel ≤ ₹1,000</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setGstRate(12)}
                        className={`p-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                          gstRate === 12
                            ? "bg-cyan-500/15 border-cyan-500 text-cyan-700 dark:text-cyan-300 font-bold"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <div>12% GST</div>
                        <span className="text-[10px] text-muted-foreground">Apparel &gt; ₹1,000</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setGstRate(18)}
                        className={`p-2 rounded-lg text-xs font-medium border text-center transition-all cursor-pointer ${
                          gstRate === 18
                            ? "bg-cyan-500/15 border-cyan-500 text-cyan-700 dark:text-cyan-300 font-bold"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <div>18% GST</div>
                        <span className="text-[10px] text-muted-foreground">Accessories/Bags</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Tax Deconstruction & Realization
                    </h4>

                    <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Gross Amount:</span>
                        <span className="font-mono font-bold text-foreground text-sm">{fmtCurrency(grossBillAmount)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs border-t border-border/40 pt-1.5">
                        <span className="text-muted-foreground">Net Taxable Revenue:</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          {fmtCurrency(taxableBase)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Central GST ({gstRate / 2}% CGST):</span>
                        <span className="font-mono text-foreground">{fmtCurrency(cgst)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">West Bengal GST ({gstRate / 2}% SGST):</span>
                        <span className="font-mono text-foreground">{fmtCurrency(sgst)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs border-t border-border/40 pt-1.5 font-bold">
                        <span className="text-foreground">Total Statutory Tax Liability:</span>
                        <span className="font-mono text-red-600 dark:text-red-400">{fmtCurrency(totalGst)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-800 dark:text-cyan-200">
                    Net Store Realization: <strong>{fmtDecimalOrZero(netRealizationPct, 1)}%</strong> of gross collection.
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 7: SPH & STAFF PRODUCTIVITY */}
            <TabsContent value="staff" className="space-y-4 m-0 focus-visible:outline-none">
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-purple-700 dark:text-purple-300 flex items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-purple-500" />
                <span>
                  Tracks floor associate throughput: <strong>Sales Per Hour (SPH)</strong> and <strong>Sales Per Associate (SPA)</strong>.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-purple-500" /> Floor & Staff Setup
                  </h4>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Store Net Sales (₹)</Label>
                    <Input
                      type="number"
                      value={staffSales || ""}
                      onChange={(e) => setStaffSales(Number(e.target.value) || 0)}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Active Floor Staff</Label>
                      <Input
                        type="number"
                        min={1}
                        value={floorStaffCount || ""}
                        onChange={(e) => setFloorStaffCount(Number(e.target.value) || 1)}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Operating Hours</Label>
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        value={operatingHours || ""}
                        onChange={(e) => setOperatingHours(Number(e.target.value) || 12)}
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center text-xs">
                      <Label className="font-semibold">Evening Surge Share % (5 PM - 8 PM)</Label>
                      <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{peakSharePct}%</span>
                    </div>
                    <Input
                      type="range"
                      min={20}
                      max={70}
                      step={5}
                      value={peakSharePct}
                      onChange={(e) => setPeakSharePct(Number(e.target.value))}
                      className="cursor-pointer"
                    />
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-xl border border-border bg-card/60 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Productivity Benchmark KPIs
                    </h4>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                        <span className="text-[11px] text-muted-foreground">Sales Per Hour (SPH)</span>
                        <div className="text-xl font-black text-foreground mt-0.5">{fmtCurrency(sph)}/hr</div>
                        <span className="text-[10px] text-muted-foreground">{fmtCurrency(sphPerStaff)}/hr/staff</span>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/40 border border-border/60">
                        <span className="text-[11px] text-muted-foreground">Sales Per Associate (SPA)</span>
                        <div className="text-xl font-black text-foreground mt-0.5">{fmtCurrency(spa)}</div>
                        <span className="text-[10px] text-muted-foreground">Across {floorStaffCount} associates</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Evening Surge Target (5 PM - 8 PM)</span>
                      </div>
                      <div className="text-xl font-black text-purple-600 dark:text-purple-400">
                        {fmtCurrency(peakHourSph)}/hour
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Floor supervisors must deploy {Math.ceil(floorStaffCount * 0.75)} associates directly to fitting rooms and billing counters.
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 text-[11px] text-muted-foreground">
                    CITIMART Standard: Keep average SPH above ₹20,000 during active shift hours.
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
