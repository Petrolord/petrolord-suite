// Plot composer math (W1.4): true-scale PDF plots of the map and
// section windows. Pure functions — the dialog owns canvas cropping
// and jsPDF calls; everything about paper geometry, scale arithmetic,
// and crop windows lives here so it is testable.
//
// Conventions: paper in mm; ground scale "1:S" means S ground metres
// per plotted metre, i.e. 1000/S mm of paper per ground metre. Section
// vertical scale is ms per paper cm (time sections have no ground
// vertical unit).

export const PAPER_SIZES = {
  a4: { label: 'A4', w: 210, h: 297 },
  a3: { label: 'A3', w: 297, h: 420 },
  letter: { label: 'Letter', w: 216, h: 279 },
};

export const MARGIN_MM = 12;
export const TITLE_BLOCK_MM = 26;

/** Paper layout: outer frame, image box, and title block strip. */
export function paperLayout(paperKey, orientation = 'landscape') {
  const p = PAPER_SIZES[paperKey];
  if (!p) throw new Error(`Unknown paper size: ${paperKey}`);
  const wMm = orientation === 'landscape' ? Math.max(p.w, p.h) : Math.min(p.w, p.h);
  const hMm = orientation === 'landscape' ? Math.min(p.w, p.h) : Math.max(p.w, p.h);
  const frame = {
    x: MARGIN_MM, y: MARGIN_MM, w: wMm - 2 * MARGIN_MM, h: hMm - 2 * MARGIN_MM,
  };
  return {
    wMm,
    hMm,
    frame,
    imageBox: {
      x: frame.x, y: frame.y, w: frame.w, h: frame.h - TITLE_BLOCK_MM,
    },
    titleBlock: {
      x: frame.x, y: frame.y + frame.h - TITLE_BLOCK_MM, w: frame.w, h: TITLE_BLOCK_MM,
    },
  };
}

/** Round UP to the classic map-scale series (1, 2, 2.5, 5 x 10^n). */
export function niceScale(raw) {
  if (!(raw > 0)) return 1000;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * mag >= raw - 1e-9) return m * mag;
  }
  return 10 * mag;
}

export const SCALE_CHOICES = [
  1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000,
];

/** Smallest nice scale that fits the whole snapshot in the image box. */
export function suggestScale({ widthPx, heightPx, metersPerPx }, box) {
  const worldW = widthPx * metersPerPx;
  const worldH = heightPx * metersPerPx;
  return niceScale(Math.max((worldW * 1000) / box.w, (worldH * 1000) / box.h));
}

/** mm of paper per ground metre at 1:scale. */
export const mmPerMeter = (scale) => 1000 / scale;

/**
 * Crop window (in source pixels, centered) so the plotted image fills
 * the box at EXACTLY 1:scale horizontally. Vertically: maps are
 * isotropic (same scale); sections use msPerCm (time per paper cm).
 * @returns {{sx, sy, sw, sh, wMm, hMm}} source rect + plotted size
 */
export function cropForScale({
  widthPx, heightPx, metersPerPx, msPerPx = null,
}, { scale, msPerCm = null }, box) {
  const pxPerMmX = scale / (1000 * metersPerPx);          // source px per paper mm
  const pxPerMmY = msPerPx != null && msPerCm != null
    ? msPerCm / (10 * msPerPx)                            // sections: time scale
    : pxPerMmX;                                           // maps: isotropic
  if (!(pxPerMmX > 0) || !(pxPerMmY > 0)) throw new Error('Scale must be positive.');
  const sw = Math.min(widthPx, box.w * pxPerMmX);
  const sh = Math.min(heightPx, box.h * pxPerMmY);
  return {
    sx: (widthPx - sw) / 2,
    sy: (heightPx - sh) / 2,
    sw,
    sh,
    wMm: sw / pxPerMmX,
    hMm: sh / pxPerMmY,
  };
}

/** Scale bar for the plot: a nice ground length at most maxMm long. */
export function plotScaleBar(scale, maxMm = 60) {
  const maxMeters = (maxMm * scale) / 1000;
  const mag = 10 ** Math.floor(Math.log10(maxMeters));
  let best = mag;
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * mag <= maxMeters + 1e-9) best = m * mag;
  }
  return {
    meters: best,
    mm: (best * 1000) / scale,
    label: best >= 1000 ? `${best / 1000} km` : `${best} m`,
  };
}

/** Title-block rows (label/value pairs) — one place for the copy. */
export function titleBlockRows({
  title, volumeName, crsName, scaleText, author, dateStr, extra = [],
}) {
  return [
    ['Title', title || volumeName || 'Seismic plot'],
    ['Volume', volumeName || ''],
    ['CRS', crsName || 'not set'],
    ['Scale', scaleText],
    ['By', [author, dateStr].filter(Boolean).join(' · ')],
    ...extra,
  ].filter(([, v]) => v !== '');
}
