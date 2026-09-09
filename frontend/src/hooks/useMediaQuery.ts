import { useEffect, useState } from "react";

/** Subscribes to a CSS media query from React. Used where a layout difference
 * can't be expressed in Tailwind alone -- i.e. where the *behaviour* changes,
 * not just the styling (the filter panel becoming a modal drawer, the nav tab
 * strips switching from wrap to horizontal scroll). Anything that's purely
 * visual should stay a `sm:`/`md:` class instead of coming through here, so
 * there's only one source of truth per rule. */
export function useMediaQuery(query: string): boolean {
  // Initialised from a real match on the first render (not `false` + an
  // effect), so a phone never paints one desktop frame before correcting
  // itself -- that flash is very visible on the filter drawer.
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches); // re-sync in case the query prop changed
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Tailwind's `lg` breakpoint (1024px) is where the sidebar filter panel stops
 * fitting alongside the main column -- 300px of a 768px tablet is already too
 * much. Below it, the panel is a drawer. */
export const MOBILE_QUERY = "(max-width: 1023px)";

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
