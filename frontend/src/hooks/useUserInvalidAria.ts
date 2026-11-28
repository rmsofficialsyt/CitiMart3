import { useEffect, type RefObject } from "react";

/**
 * Keeps `aria-invalid` in step with CSS `:user-invalid` for every field in a
 * form (modern-web-guidance "validate-input-after-interaction" > Consistent
 * ARIA Experience). `:user-invalid` drives the red border only after the user
 * has edited + left a field or tried to submit, but it does not touch ARIA,
 * so without this a screen reader hears nothing. Fields start at
 * aria-invalid="false" (Firefox/Safari otherwise expose an empty `required`
 * field as invalid from first paint).
 *
 * A field that sets `data-error="<id>"` gets that error element listed in its
 * aria-describedby only while invalid -- referencing it in markup would read
 * the hidden message from page load.
 */
export function useUserInvalidAria(formRef: RefObject<HTMLFormElement | null>, active = true): void {
  useEffect(() => {
    const form = formRef.current;
    if (!form || !active) return;

    const isField = (el: EventTarget | null): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;

    const linkError = (el: HTMLElement, shown: boolean) => {
      const errorId = el.dataset.error;
      if (!errorId) return;
      const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((id) => id && id !== errorId);
      if (shown) ids.push(errorId);
      if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
      else el.removeAttribute("aria-describedby");
    };

    const sync = (target: EventTarget | null) => {
      if (!isField(target)) return;
      let invalid = false;
      try {
        invalid = target.matches(":user-invalid");
      } catch {
        invalid = false; // selector unsupported: leave the native bubble to speak
      }
      target.setAttribute("aria-invalid", invalid ? "true" : "false");
      linkError(target, invalid);
    };

    form.querySelectorAll("input, select, textarea").forEach((el) => sync(el));

    const onBlur = (e: Event) => sync(e.target);
    const onInput = (e: Event) => sync(e.target);
    // A failed submit fires `invalid` (non-bubbling) on each failing field.
    const onInvalid = (e: Event) => queueMicrotask(() => sync(e.target));

    form.addEventListener("blur", onBlur, true);
    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput, true);
    form.addEventListener("invalid", onInvalid, true);
    return () => {
      form.removeEventListener("blur", onBlur, true);
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onInput, true);
      form.removeEventListener("invalid", onInvalid, true);
    };
  }, [formRef, active]);
}
