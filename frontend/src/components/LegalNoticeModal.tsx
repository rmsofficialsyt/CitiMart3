import { useState, useMemo } from "react";
import {
  Building2,
  Scale,
  ShieldCheck,
  Search,
  Printer,
  Store,
  Clock,
  Lock,
  FileCheck2,
  AlertCircle,
  Database,
  Users,
  Layers,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  BadgeCheck,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import citimartLogo from "@/assets/citimart-logo.png";

export type LegalDocType = "about" | "terms" | "privacy";

interface LegalNoticeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeDoc: LegalDocType;
  onDocChange: (doc: LegalDocType) => void;
}

interface DocSection {
  id: string;
  title: string;
  icon: any;
  content: string;
}

/* =========================================================================
   DOCUMENT DATA DEFINITIONS
   ========================================================================= */

const ABOUT_SECTIONS: DocSection[] = [
  {
    id: "heritage",
    title: "1. Retail Heritage & Kolkata Footprint",
    icon: Store,
    content: `CITIMART is one of Kolkata's premier department store and supermarket chains, delivering quality fashion, groceries, FMCG goods, and household essentials to hundreds of thousands of retail shoppers. With decades of trusted retail experience, CITIMART anchors three landmark departmental flagships strategically situated across Greater Kolkata:

• New Market Flagship (Store Code: NM): Located at Lindsay Street, Central Kolkata. Spanning 18,500 sq.ft of multi-level shopping floor with 12 active POS billing counters.
• Hatibagan Hub (Store Code: HB): Located at Bidhan Sarani, North Kolkata. A high-density traditional cultural and retail epicenter spanning 14,200 sq.ft with 8 POS counters.
• Chowringhee Prime (Store Code: CHW): Located along JL Nehru Road, Central Kolkata. Prime commercial commuter artery spanning 16,000 sq.ft with 10 POS billing counters.`,
  },
  {
    id: "mission",
    title: "2. The Operational Problem & Daily Operations Suite",
    icon: Clock,
    content: `Historically in large multi-department retail, sales numbers, cashier counts, and footfalls were reviewed at end-of-day or through delayed spreadsheets—meaning remedial floor actions arrived after daily opportunities were already lost.

The CITIMART Daily Operations Suite transforms operations by providing real-time intraday operational telemetry. As cashiers complete transactions and floor sensors count visitors, Store Managers enter hourly metrics directly into the portal across 4 operational time slots:
• Slot 1: 10:30 AM – 01:59 PM (Morning Opening & Transit Rush)
• Slot 2: 02:00 PM – 04:59 PM (Afternoon Trading & Restock Phase)
• Slot 3: 05:00 PM – 07:59 PM (Evening Peak Shopping Surge)
• Slot 4: 08:00 PM – 11:59 PM (Night Settlement & Closing Flow)`,
  },
  {
    id: "metrics",
    title: "3. Mathematical KPIs & Floor Intelligence",
    icon: Layers,
    content: `The platform automatically aggregates raw store inputs into verified mathematical indicators recomputed live on read from MongoDB Atlas:

• Net Sales: Σ Bill Net Amounts across POS logs.
• Bill Quantity: Total items scanned and packed.
• Footfall: Walk-in counts measured at entrance portals.
• Number of Buyers (NOB): Unique paying transactions.
• Average Transaction Value (ATV): Net Sales ÷ NOB.
• Revenue Per Visitor (RPV): Net Sales ÷ Footfall.
• Units Per Transaction (Basket Size / UPT): Bill Quantity ÷ NOB.
• Floor Conversion Rate: (NOB ÷ Footfall) × 100%.
• Target Achievement %: (Net Sales ÷ Sales Target) × 100%.`,
  },
  {
    id: "leadership",
    title: "4. Executive Directives & Distributed Architecture",
    icon: Sparkles,
    content: `Operational alignment is maintained through direct coordination between executive leadership and store staff:

• Executive Directives: Instant high-priority broadcast directives from Operational Head Raphael Sir directly to store managers' consoles with mandatory acknowledgment.
• Zero-Staleness L2 Cache: Powered by an asynchronous Redis 7.4 cluster and distributed sliding-window limiters, delivering sub-10ms read latencies.
• Automated 00:00 IST Midnight Settlement: Automated distributed snapshotting that finalizes the trading day, generates executive PDF digests, and archives permanent audit records.`,
  },
];

const TERMS_SECTIONS: DocSection[] = [
  {
    id: "scope",
    title: "1. Scope & Binding Enterprise Agreement",
    icon: Scale,
    content: `This Terms of Use ("Agreement") constitutes a legally binding enterprise operating policy governing all access to and interaction with the CITIMART Daily Operations Suite ("Portal"). 

Access is strictly restricted to authorized employees, appointed store managers, and corporate administrators of CITIMART Retail Operations. By logging into this Portal or utilizing any integrated terminal API, the user unconditionally agrees to be bound by these operating stipulations, data integrity rules, and security guidelines.`,
  },
  {
    id: "credentials",
    title: "2. Authorized Accounts & Credential Security",
    icon: Lock,
    content: `• Fixed Operational Accounts: User accounts are pre-provisioned by Central Administration for designated store roles:
  - ADMINISTRATOR (Global executive oversight & target allocation)
  - CITIMART - NEW MARKET (Store Manager, NM Flagship)
  - CITIMART - HATIBAGAN (Store Manager, HB Hub)
  - CITIMART - CHOWRINGHEE (Store Manager, CHW Central)
• Prohibition of Credential Sharing: Store managers must keep authentication passwords and security tokens confidential. Under no circumstances may credentials be shared with counter cashiers, unauthorized personnel, or third-party contractors.
• Immediate Session Revocation: Active sessions are tracked via server-side Redis registries. Upon logout, suspension, or credential rotation, session validity is terminated instantly across all server replicas.`,
  },
  {
    id: "tenancy",
    title: "3. Store Tenancy & BOLA/IDOR Enforcement",
    icon: Users,
    content: `• Strict Tenant Isolation: To protect store performance autonomy and prevent unauthorized cross-store surveillance, Store Managers are strictly restricted to their designated branch (NM, HB, or CHW).
• Zero-Tolerance for BOLA/IDOR Exploitation: Any intentional attempt to bypass store-level access controls, alter store codes in API payloads, inspect another store's confidential billing entries, or execute broken object-level authorization (BOLA) attempts constitutes a severe security violation.
• Automatic Audit Flagging: Unauthorized access attempts trigger automated high-severity audit entries and immediate administrative lockouts.`,
  },
  {
    id: "data_integrity",
    title: "4. Operational Data Integrity & No Tampering",
    icon: FileCheck2,
    content: `• True & Accurate Floor Entry: Store staff are required to enter authentic, verified POS numbers (hourly bill count, net revenue, quantity, NOB, and customer footfall).
• Prohibition of Falsification: Intentionally inflating net sales, underreporting footfall to artificially boost conversion yields, or manipulating hourly numbers violates company conduct rules and retail audit regulations.
• Operational Window: Floor entry is permissible only during active trading hours (10:30 AM to 23:59 IST for the current calendar date). Backfilling past dates or altering closed periods without explicit administrative override is strictly prohibited.`,
  },
  {
    id: "midnight",
    title: "5. 00:00 IST Midnight Settlement & Distributed Lock",
    icon: Clock,
    content: `• Daily Cutoff: Every operational day closes at 23:59:59 IST.
• Automated Snapshotting: At 00:00:00 IST, a distributed Redis Redlock triggers the automated midnight settlement job across all stores. All hourly entries, bill totals, and footfalls are snapshot into permanent immutable records.
• Finality of Records: Once midnight settlement completes, daily metrics become permanently read-only and are finalized for executive PDF/Excel compilation and corporate accounting.`,
  },
  {
    id: "trade_secrets",
    title: "6. Commercial Trade Secrets & Intellectual Property",
    icon: Database,
    content: `• Proprietary Telemetry: All hourly trading statistics, average transaction values, category velocity curves, executive directives, and target formulas are protected trade secrets and proprietary property of CITIMART.
• Export Restrictions: Automated scraping, bot extraction, or unauthorized dissemination of store sales figures to competitors or external third parties is strictly prohibited and subject to legal prosecution under the Indian Information Technology Act, 2000 and applicable trade secrecy laws.`,
  },
  {
    id: "enforcement",
    title: "7. Rate Limiting, Violations & Disciplinary Action",
    icon: AlertCircle,
    content: `• Automated Sliding-Window Rate Limiting: Platform endpoints are protected by atomic Redis sliding-window limiters to safeguard system reliability against automated credential stuffing and resource exhaustion.
• Disciplinary Sanctions: Any violation of these Terms of Use will result in immediate suspension of portal credentials, formal internal disciplinary review, termination of employment, and statutory civil or criminal remedies where applicable.`,
  },
];

const PRIVACY_SECTIONS: DocSection[] = [
  {
    id: "dpdp",
    title: "1. Regulatory Framework & DPDP Act 2023 Alignment",
    icon: ShieldCheck,
    content: `CITIMART Retail Operations is committed to ethical data stewardship, information privacy, and cybersecurity excellence. This Privacy Policy outlines our data handling principles in compliance with the Digital Personal Data Protection (DPDP) Act, 2023 of India and industry information security benchmarks.

This policy applies specifically to the CITIMART Daily Operations Suite and governs how retail telemetry, staff authentication data, and operational audit records are processed, safeguarded, and retained.`,
  },
  {
    id: "zero_pii",
    title: "2. Zero Customer PII Harvesting Guarantee",
    icon: CheckCircle2,
    content: `• Explicit Privacy Guarantee: The CITIMART Daily Operations Suite is strictly an operational telemetry and floor management portal. It DOES NOT collect, record, or process any Personally Identifiable Information (PII) belonging to retail shoppers or consumer customers.
• No Customer Records: The portal does not store customer names, mobile telephone numbers, physical residential addresses, email IDs, credit/debit card numbers, UPI handles, or banking identifiers.
• Purely Aggregate Metrics: Billing data captured represents purely anonymous mathematical aggregates (e.g. Total Net Billing = ₹45,200; Number of Bills = 38; Footfall = 142) without connection to individual shopper identities.`,
  },
  {
    id: "staff_data",
    title: "3. Staff Operational Data Collected",
    icon: Users,
    content: `To ensure operational accountability and multi-tenant security, the Portal processes limited employee and administrative data:

• Identity & Credentials: Usernames, assigned store affiliations (NM, HB, CHW), and cryptographic password hashes processed via memory-hard Argon2id. Cleartext passwords are never stored or logged.
• Session Telemetry: IP addresses, browser user-agent strings, active login timestamps, and session identifiers stored securely within Redis session registries.
• Audit Logs: Timestamped records of managerial actions, including hourly bill submissions, footfall modifications, sales target updates, and executive directive acknowledgments.`,
  },
  {
    id: "security",
    title: "4. Cryptographic Security & Session Safeguards",
    icon: Lock,
    content: `• Ephemeral Access Tokens: Authorization utilizes short-lived JSON Web Tokens (JWTs) with a maximum lifetime of 15 minutes (≤ 900 seconds).
• Server-Revocable Rotating Refresh Tokens: Refresh tokens are transmitted strictly via secure, HttpOnly, SameSite cookies and tracked in Redis. Upon user sign-out, the session key is deleted from Redis, immediately rendering the token unusable across all server replicas.
• Transit & Rest Encryption: All data in transit is protected using TLS 1.3 encryption. Database persistence in MongoDB Atlas utilizes AES-256 volume encryption with strict firewall IP whitelisting.`,
  },
  {
    id: "third_party",
    title: "5. External Data Interfacing & Context",
    icon: Database,
    content: `• Kolkata Weather Context: To assist managers in understanding weather-induced footfall surges (e.g. monsoon showers or summer heatwaves), the platform queries public atmospheric forecasts from Open-Meteo for Kolkata geographic coordinates (22.57° N, 88.36° E).
• Zero Egress of Internal Data: No internal sales figures, staff identifiers, or store telemetry are shared with or transmitted to any third-party external service.`,
  },
  {
    id: "retention",
    title: "6. Data Retention & Multi-Tenant Separation",
    icon: FileCheck2,
    content: `• Strict Data Segregation: All operational data queries strictly enforce store-level isolation (store_id scoping) to prevent data co-mingling or cross-store leakage.
• Audit Log Retention: System audit logs and daily finalized snapshots are maintained for institutional compliance and internal retail audit reconciliation.
• Non-Repudiation: Once finalized during midnight settlement, operational records cannot be altered, ensuring full auditability.`,
  },
  {
    id: "contact",
    title: "7. Data Protection Office & Inquiries",
    icon: Building2,
    content: `For questions, data access verifications, or operational privacy inquiries, authorized personnel may contact:

CITIMART Retail Operations Directorate
Attn: Central Administrator & Information Security Officer
Flagship Office: Lindsay Street, New Market, Kolkata, West Bengal 700087
Internal Desk: Administrator Console & Security Compliance`,
  },
];

/* =========================================================================
   MAIN COMPONENT
   ========================================================================= */

export function LegalNoticeModal({
  open,
  onOpenChange,
  activeDoc,
  onDocChange,
}: LegalNoticeModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handlePrint = () => {
    window.print();
  };

  const sections = useMemo(() => {
    if (activeDoc === "about") return ABOUT_SECTIONS;
    if (activeDoc === "terms") return TERMS_SECTIONS;
    return PRIVACY_SECTIONS;
  }, [activeDoc]);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const q = searchQuery.toLowerCase();
    return sections.filter((s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q));
  }, [sections, searchQuery]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`sec-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const getDocDetails = () => {
    switch (activeDoc) {
      case "about":
        return {
          title: "About CITIMART Operations",
          badge: "Corporate Profile",
          icon: Building2,
          summary: "Decades of trusted retail legacy anchoring Kolkata's landmark department stores (New Market, Hatibagan, and Chowringhee) with real-time operational telemetry.",
          accentBorder: "border-blue-500/20",
          accentBg: "bg-blue-950/20",
          accentText: "text-blue-400",
        };
      case "terms":
        return {
          title: "Terms of Use",
          badge: "Operating Rules",
          icon: Scale,
          summary: "Enterprise governance, managerial credential protection, strict store isolation (BOLA/IDOR prevention), and automated 00:00 IST midnight lock.",
          accentBorder: "border-amber-500/20",
          accentBg: "bg-amber-950/20",
          accentText: "text-amber-400",
        };
      case "privacy":
        return {
          title: "Privacy Policy",
          badge: "Compliance",
          icon: ShieldCheck,
          summary: "Zero Customer PII Architecture and DPDP Act 2023 alignment. Cryptographic staff credential security with Argon2id and revocable Redis sessions.",
          accentBorder: "border-emerald-500/20",
          accentBg: "bg-emerald-950/20",
          accentText: "text-emerald-400",
        };
    }
  };

  const details = getDocDetails();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 
        CRITICAL RESOLUTION FIX:
        sm:max-w-5xl md:max-w-6xl lg:max-w-7xl xl:max-w-7xl overrides Dialog's default sm:max-w-sm
        w-[96vw] and h-[90vh] provide generous, widescreen reading resolution.
      */}
      <DialogContent className="w-[96vw] sm:max-w-5xl md:max-w-6xl lg:max-w-7xl xl:max-w-7xl h-[90vh] max-h-[94vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-950 border border-slate-800 text-slate-100 shadow-2xl rounded-2xl">
        {/* Header Bar */}
        <DialogHeader className="p-5 sm:p-6 pb-4 border-b border-slate-800/80 bg-slate-900/70 backdrop-blur shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mr-8">
            <div className="flex items-center gap-3">
              <div className="shrink-0 rounded-xl bg-white p-2 shadow-sm border border-slate-200/50 flex items-center justify-center">
                <img src={citimartLogo} alt="CITIMART Logo" className="h-7 w-auto object-contain" />
              </div>
              <div>
                <DialogTitle className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <span>CITIMART Daily Operations Suite</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Governance &amp; Legal
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-0.5">
                  Official operational guidelines, network telemetry profile, and statutory DPDP compliance.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-8 text-xs border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Print / Save PDF
              </Button>
            </div>
          </div>

          {/* Navigation Tabs & Search Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-2">
            <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onDocChange("about");
                  setSearchQuery("");
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  activeDoc === "about"
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20 font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                About CITIMART
              </button>
              <button
                type="button"
                onClick={() => {
                  onDocChange("terms");
                  setSearchQuery("");
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  activeDoc === "terms"
                    ? "bg-amber-600 text-white shadow-sm shadow-amber-500/20 font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <Scale className="h-3.5 w-3.5" />
                Terms of Use
              </button>
              <button
                type="button"
                onClick={() => {
                  onDocChange("privacy");
                  setSearchQuery("");
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  activeDoc === "privacy"
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-500/20 font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Privacy Policy
              </button>
            </div>

            {/* Quick Clause Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <Input
                type="text"
                placeholder="Search clause or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-500 focus-visible:ring-blue-500/40"
              />
            </div>
          </div>
        </DialogHeader>

        {/* Spacious Widescreen Body: Sidebar + Main Document Content */}
        <div className="flex-1 flex overflow-hidden min-h-0 bg-slate-950">
          {/* Left Navigation Sidebar (Desktop widescreen) */}
          <div className="hidden lg:flex flex-col w-72 shrink-0 border-r border-slate-800/80 bg-slate-900/40 p-5 space-y-5 overflow-y-auto">
            <div className={`rounded-xl border ${details.accentBorder} ${details.accentBg} p-3.5 space-y-1.5`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${details.accentText}`}>
                  {details.badge}
                </span>
                <details.icon className={`h-4 w-4 ${details.accentText}`} />
              </div>
              <h4 className="text-sm font-bold text-white">{details.title}</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">{details.summary}</p>
            </div>

            {/* Table of Contents Index */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block px-1">
                Table of Contents ({sections.length} Sections)
              </span>
              <div className="space-y-1">
                {sections.map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => scrollToSection(sec.id)}
                    className="w-full text-left p-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <span className="truncate pr-1">{sec.title}</span>
                    <ChevronRight className="h-3 w-3 text-slate-600 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Institutional Metadata Panel */}
            <div className="pt-4 border-t border-slate-800/80 space-y-2 text-[11px] text-slate-500">
              <div className="flex items-center justify-between">
                <span>Jurisdiction:</span>
                <span className="text-slate-300 font-medium">Kolkata, WB</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Network Scope:</span>
                <span className="text-slate-300 font-medium">NM, HB, CHW</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Effective Date:</span>
                <span className="text-slate-300 font-medium">November 2026</span>
              </div>
              <div className="flex items-center justify-between">
                <span>DPDP Act Status:</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <BadgeCheck className="h-3 w-3" /> Fully Aligned
                </span>
              </div>
            </div>
          </div>

          {/* Right Main Document Content Area */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 lg:p-10 space-y-6 text-slate-300 text-sm sm:text-base leading-relaxed scrollbar-thin scrollbar-thumb-slate-700">
            {/* Banner Card */}
            <div className={`rounded-xl border ${details.accentBorder} ${details.accentBg} p-5 space-y-2`}>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2.5">
                <details.icon className={`h-5 w-5 ${details.accentText}`} />
                {details.title}
              </h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                {details.summary}
              </p>
            </div>

            {/* Section Cards */}
            {filteredSections.map((sec) => (
              <div
                key={sec.id}
                id={`sec-${sec.id}`}
                className="scroll-mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-5 sm:p-6 space-y-3 hover:border-slate-700/80 transition-all"
              >
                <h4 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2.5">
                  <sec.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${details.accentText} shrink-0`} />
                  {sec.title}
                </h4>
                <div className="text-slate-300 whitespace-pre-line text-xs sm:text-sm leading-relaxed">
                  {sec.content}
                </div>
              </div>
            ))}

            {filteredSections.length === 0 && (
              <div className="text-center py-16 text-slate-500 text-xs sm:text-sm">
                No matching sections found for "{searchQuery}". Try searching for another topic or clear the search.
              </div>
            )}
          </div>
        </div>

        {/* Footer Meta Bar */}
        <div className="p-3 sm:px-6 border-t border-slate-800/80 bg-slate-900/70 backdrop-blur flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Kolkata Departmental Stores Operational Network (Lindsay St &middot; Bidhan Sarani &middot; JL Nehru Rd)</span>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <span>Effective: November 2026</span>
            <span>&middot;</span>
            <span>Version 3.4 Operational Build</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
