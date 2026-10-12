// Canvas sizing for the ReservoirCalc Pro previews (RCP preview sizing,
// 2026-10-12).
//
// The page root must have a height of its own. Under /dashboard the app sits
// in DashboardScope, which is only min-h-full, so an `h-full` root resolved
// to auto: the page took its content's height, the preview pane had no height
// to fill, and the 2D map fell back to a 150 px canvas in a tall empty panel.
// The root now takes the viewport height, the pattern most Suite studios use.
export const RCP_ROOT_CLASS = 'h-screen w-full overflow-hidden';

/** True when a Tailwind class string gives the element a definite height. */
export function hasDefiniteHeight(className = '') {
  return String(className)
    .split(/\s+/)
    .some((c) => c === 'h-screen' || c === 'h-dvh' || c === 'h-svh' || /^h-\[\d/.test(c) || /^h-\[calc\(/.test(c));
}

/**
 * Backing-store size for a canvas shown at cssW x cssH CSS pixels: whole
 * device pixels at the screen's pixel ratio (capped, 2 by default, so a 4K
 * panel does not cost four times the fill), never below 1.
 */
export function canvasBackingSize(cssW, cssH, devicePixelRatio = 1, maxDpr = 2) {
  const raw = Number(devicePixelRatio);
  const dpr = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 1, maxDpr);
  const w = Number.isFinite(cssW) && cssW > 0 ? cssW : 0;
  const h = Number.isFinite(cssH) && cssH > 0 ? cssH : 0;
  return {
    width: Math.max(1, Math.round(w * dpr)),
    height: Math.max(1, Math.round(h * dpr)),
    dpr,
  };
}

/**
 * Split view direction for a preview pane of w x h CSS px. Side by side
 * halves a pane that is not much wider than tall into two tall slivers, and
 * a map kept at true aspect then fills only a small part of each; so the
 * map and the 3D view sit side by side only when each half stays near
 * square or wider (w >= 1.5 h), and stack otherwise. An unmeasured pane
 * (0 or not finite) keeps side by side.
 */
export function splitDirection(w, h, minRowAspect = 1.5) {
  if (!(Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0)) return 'row';
  return w >= minRowAspect * h ? 'row' : 'column';
}
