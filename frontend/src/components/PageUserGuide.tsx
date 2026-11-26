import { BookOpen, ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { useLanguage } from "@/context/LanguageContext";

export interface GuideStep {
  icon: LucideIcon;
  colorClass: string;
  title: string;
  header: string;
  description?: string;
  bullets?: string[];
  actionNote?: string;
  safetyNote?: string;
}

export interface GuideFaq {
  title: string;
  description: string;
}

interface PageUserGuideProps {
  title: string;
  subtitle: string;
  steps: GuideStep[];
  faqs?: GuideFaq[];
  className?: string;
}

/** Collapsible 4-step manager manual data-entry guide matching ManualEntryDashboard. */
export function PageUserGuide({
  title,
  subtitle,
  steps,
  faqs = [],
  className = "mb-4",
}: PageUserGuideProps) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <div
      className={`${className} overflow-hidden rounded-xl border border-blue-500/30 bg-blue-500/5 transition-all`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-blue-500/10 sm:px-5 cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <BookOpen className="h-5 w-5 text-blue-400 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-foreground sm:text-base">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-blue-400 shrink-0">
          <span>{open ? t.hideGuide : t.viewGuide}</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60 p-4 pt-3 sm:p-5 sm:pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm"
                >
                  <div
                    className={`mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${step.colorClass}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{step.title}</span>
                  </div>
                  <p className="text-xs font-medium text-foreground">{step.header}</p>
                  {step.description && (
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  )}
                  {step.bullets && step.bullets.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground leading-relaxed">
                      {step.bullets.map((b) => (
                        <li key={b}>• {b}</li>
                      ))}
                    </ul>
                  )}
                  {step.actionNote && (
                    <p className="mt-1 text-xs text-muted-foreground">{step.actionNote}</p>
                  )}
                  {step.safetyNote && (
                    <p className="mt-1.5 rounded bg-emerald-500/10 p-1 text-[11px] text-emerald-400">
                      {step.safetyNote}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {faqs.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              {faqs.map((faq) => (
                <div key={faq.title} className="flex items-start gap-2">
                  <span className="font-semibold text-foreground shrink-0">{faq.title}</span>
                  <span>{faq.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
