import { useEffect, useState } from "react";

import { Section } from "@/components/Section";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

/** The Daily Dashboard's top hero card -- store name plus a live-ticking
 * Indian-format date and clock (Asia/Kolkata), independent of any filter or
 * query: it's a wall-clock display, not data pulled from the backend. */
export function DailyHeroCard({ storeName }: { storeName: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Section className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Store</div>
          <h2 className="text-lg font-bold sm:text-xl">{storeName}</h2>
        </div>
        {/* Right-aligned only while it actually sits on the right -- once the
            flex row wraps on a phone the clock is on its own line, where
            right-alignment reads as a mistake. */}
        <div className="text-left sm:text-right">
          <div className="text-sm font-medium">{DATE_FORMATTER.format(now)}</div>
          <div className="text-muted-foreground font-mono text-base font-semibold tabular-nums sm:text-lg">
            {TIME_FORMATTER.format(now)}
          </div>
        </div>
      </div>
    </Section>
  );
}
