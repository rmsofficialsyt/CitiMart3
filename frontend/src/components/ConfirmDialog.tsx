import type { ReactNode } from "react";

import { ModalDialog } from "@/components/ModalDialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmation step for irreversible actions (stock dispatch/receive, deleting
 * a slip, discarding unsaved attendance). Replaces bare window.confirm(), which
 * can't say what will happen, can't carry a reason field, and is blocked in
 * some embedded browsers. Cancel gets initial focus -- the guide's rule for a
 * destructive confirmation is that the *safe* action takes initial focus, so a
 * stray Enter never confirms.
 */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional extra fields, e.g. a reason textarea. */
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  pending = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" data-autofocus onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={onConfirm}
            className={tone === "danger" ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-indigo-600 text-white hover:bg-indigo-700"}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? null}
    </ModalDialog>
  );
}
