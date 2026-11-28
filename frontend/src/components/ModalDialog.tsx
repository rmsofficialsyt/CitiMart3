import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Blocking modal built on the native <dialog> + showModal() (modern-web-guidance
 * "dialog", Rule 1). The browser supplies what the old hand-rolled
 * `fixed inset-0` overlays on the Stock / Staff pages were missing: the page
 * behind goes inert, focus is contained and returned to the opener, Esc and the
 * mobile back gesture close it, and it renders in the top layer. So: no
 * role="dialog", aria-modal, focus trap or Esc handler here on purpose.
 *
 * `open` is the source of truth; every close path (Esc, the X, a Cancel button
 * calling onClose) ends in the native `close` event, which calls onClose.
 * Scroll containment and the backdrop live in index.css (`.modal-dialog`).
 */
interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** "closerequest" (default) = Esc/back only; "any" also closes on a backdrop click.
   * Progressive enhancement: unsupported browsers keep Esc/back. */
  closedBy?: "any" | "closerequest";
}

export function ModalDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  closedBy = "closerequest",
}: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // React's autoFocus calls focus() at mount (before showModal) and never
      // renders the `autofocus` attribute, so the dialog's own focusing step
      // would land on the header's Close button. Mark the intended first stop
      // with data-autofocus instead.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // `closedby` is newer than React's DOM typings.
      {...({ closedby: closedBy } as Record<string, string>)}
      onClose={onClose}
      className={cn(
        "modal-dialog m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl",
        className,
      )}
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-3">
            <div className="min-w-0">
              {/* h1: the first heading in a modal's scope (guide: dialog > Accessibility). */}
              <h1 id={titleId} className="text-base font-bold text-foreground">
                {title}
              </h1>
              {description && (
                <p id={descId} className="mt-1 text-xs text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => ref.current?.close()}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="pt-4">{children}</div>
          {footer && <div className="mt-4 flex justify-end gap-2 border-t border-border/40 pt-3">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
