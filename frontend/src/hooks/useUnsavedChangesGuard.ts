import { useEffect } from "react";

/** Ask before a reload / tab close drops unsaved edits (e.g. a half-marked
 * attendance roster). In-app navigation is handled by the page itself. */
export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
