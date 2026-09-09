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
    <div className={cn("bg-card mb-4 rounded-xl border p-3 sm:p-4", className)}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
