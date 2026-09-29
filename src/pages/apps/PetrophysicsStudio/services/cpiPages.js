// Log plot (CPI) pages for the PDF report (AppUpgrade PETRO-U2-003,
// 2026-09-29). A partner reads an interpretation from its computer-processed
// interpretation plot: the tracks over each zone, with the header and the
// zone's numbers on the same page. The picture comes from the live track
// viewer (the same painter and layout as the screen and the PNG button);
// this module only decides which depth window each zone page shows.

/** Margin above and below a zone on its page: a tenth of its thickness, at least 3 m. */
export const CPI_PAD_FRACTION = 0.1;
export const CPI_PAD_MIN_M = 3;

/**
 * The depth window for one zone's page: the zone plus a margin either side
 * so both boundaries are visible, clamped to the logged interval.
 * @param {{top_md_m: number, base_md_m: number}} zone
 * @param {ArrayLike<number>} depth MD, metres, ascending
 * @returns {?{top: number, base: number}} null when the zone misses the log
 */
export function cpiWindow(zone, depth) {
  if (!depth?.length) return null;
  const d0 = depth[0];
  const d1 = depth[depth.length - 1];
  const t = Number(zone.top_md_m);
  const b = Number(zone.base_md_m);
  if (!(b > t) || b < d0 || t > d1) return null;
  const pad = Math.max(CPI_PAD_MIN_M, (b - t) * CPI_PAD_FRACTION);
  return { top: Math.max(d0, t - pad), base: Math.min(d1, b + pad) };
}

/**
 * One image per zone through a renderer (the track viewer's renderWindow).
 * Zones that miss the log are skipped and named.
 * @param {Array} zones
 * @param {ArrayLike<number>} depth
 * @param {(win: {top, base, width, height, scale}) => HTMLCanvasElement} render
 * @returns {{pages: Array<{zoneId, top, base, dataUrl, width, height}>, skipped: string[]}}
 */
export function cpiImages(zones, depth, render, { width = 760, height = 1000, scale = 2 } = {}) {
  const pages = [];
  const skipped = [];
  for (const z of zones || []) {
    const win = cpiWindow(z, depth);
    if (!win) { skipped.push(z.name); continue; }
    const canvas = render({ ...win, width, height, scale });
    pages.push({ zoneId: z.id, ...win, dataUrl: canvas.toDataURL('image/png'), width, height });
  }
  return { pages, skipped };
}
