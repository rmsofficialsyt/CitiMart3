import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glassPanelVariants = cva(
  "relative overflow-hidden transition-[box-shadow,transform,background-color,border-color] duration-200",
  {
    variants: {
      variant: {
        panel: "rounded-2xl p-5",
        card: "rounded-xl p-4",
        pill: "rounded-full px-4 py-2",
      },
      elevation: {
        base: "border border-[var(--glassy-border,var(--border))] bg-[var(--glassy-surface,var(--card))] shadow-[var(--glassy-shadow-base,0_8px_32px_rgba(15,23,42,0.08))]",
        raised:
          "border border-[var(--glassy-border-strong,var(--border))] bg-[var(--glassy-surface-raised,var(--card))] shadow-[var(--glassy-shadow-raised,0_14px_40px_rgba(15,23,42,0.14))]",
      },
      interactive: {
        true: "hover:-translate-y-0.5 hover:shadow-[var(--glassy-shadow-raised,0_14px_40px_rgba(15,23,42,0.14))] active:translate-y-0",
        false: "",
      },
    },
    defaultVariants: {
      variant: "panel",
      elevation: "base",
      interactive: false,
    },
  },
);

export interface GlassPanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassPanelVariants> {}

/**
 * Liquid-glass container mirroring alexburlis/glassyui's GlassPanel API.
 * Uses semantic `--glassy-*` tokens when `.glassy` is active and falls back
 * cleanly to standard card tokens under Light, Dark, and Neon themes.
 */
export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, variant, elevation, interactive, children, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="glass-panel"
      className={cn(
        "lg-glass-surface",
        glassPanelVariants({ variant, elevation, interactive }),
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
GlassPanel.displayName = "GlassPanel";
