import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glassButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "lg-glass-surface border border-[var(--glassy-border-strong,var(--border))] bg-[var(--glassy-surface-raised,var(--card))] text-foreground shadow-[var(--glassy-shadow-base,0_4px_16px_rgba(15,23,42,0.08))] hover:brightness-105 active:scale-[0.98]",
        prominent:
          "border border-white/30 bg-primary text-primary-foreground shadow-[0_8px_24px_color-mix(in_oklch,var(--primary)_35%,transparent),inset_0_1px_0_rgba(255,255,255,0.38)] hover:brightness-110 active:scale-[0.98]",
        soft:
          "lg-glass-surface border border-[var(--glassy-border,var(--border))] bg-[var(--glassy-surface,var(--muted))] text-foreground/90 hover:bg-muted/80 active:scale-[0.98]",
        ghost:
          "border border-transparent bg-transparent text-foreground hover:bg-muted/60 active:scale-[0.98]",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-lg",
        md: "h-9 px-4 py-2",
        lg: "h-11 px-6 text-base rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  asChild?: boolean;
}

/**
 * Liquid-glass action button mirroring alexburlis/glassyui's GlassButton API.
 */
export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp
        ref={ref}
        data-slot="glass-button"
        className={cn(glassButtonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
GlassButton.displayName = "GlassButton";
