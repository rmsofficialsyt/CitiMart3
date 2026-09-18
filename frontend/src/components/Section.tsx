import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Section({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  /** Optional control rendered at the right edge of the title row (e.g. an
   * admin's threshold-edit gear next to a gauge). Only shows when `title` is set. */
  action?: ReactNode;
}) {
  return (
    <div className={cn("glossy-card bg-card/90 mb-4 rounded-2xl border border-border p-3.5 sm:p-5 shadow-xl backdrop-blur-xl transition-all", className)}>
      {title && (
        <div className="mb-3.5 flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
          <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
