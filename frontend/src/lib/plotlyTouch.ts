import type { Config, Layout } from "plotly.js-dist-min";

/** True on a touch-primary device (phone/tablet). Read once per render rather
 * than subscribed to, because it only changes if the input device itself
 * changes -- and a stale value here costs nothing more than a modebar. */
export function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(pointer: coarse)").matches
    : false;
}

/** Plotly's default `dragmode: "zoom"` swallows touch-drag inside the plot
 * area, so on a phone a page with five charts is effectively unscrollable --
 * every swipe that starts on a figure draws a zoom box instead of scrolling
 * the page. `dragmode: false` gives the gesture back to the document while
 * leaving tap-to-see-tooltip working.
 *
 * The modebar goes with it: its zoom/pan buttons only make sense alongside
 * drag interactions, it can't be revealed by hover on a touch device anyway
 * (so it would have to sit permanently on top of an already-short 320px
 * figure), and the "View Table" toggle under each chart is the better way to
 * read exact values on a small screen.
 *
 * Both are no-ops on a mouse pointer -- desktop charts keep drag-zoom, the
 * hover modebar, and every other Plotly default exactly as before. */
export function touchLayout(layout: Partial<Layout>): Partial<Layout> {
  return isCoarsePointer() ? { ...layout, dragmode: false } : layout;
}

export function touchConfig(config: Partial<Config>): Partial<Config> {
  return isCoarsePointer() ? { ...config, displayModeBar: false, scrollZoom: false } : config;
}
