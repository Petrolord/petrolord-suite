// Wells on the seismic (tester feedback 2026-09-22: "Wells don't appear
// on the seismic ... when a well can't be drawn, the well list must say
// why"). Suite-side wrapper over the vendored wellSection engine (never
// edited from here): it resolves each visible well's time-depth
// relationship, builds its lattice path in TWT, and returns a REASON for
// every well it cannot draw instead of dropping it silently.
//
// T(z) rule (plan decision #4, unchanged): the well's own checkshots
// (a committed tie-derived set first), else the volume's velocity model
// inverted, else no relationship. There is deliberately no default
// velocity: a well without a time-depth relationship is reported, never
// guessed into place.

import {
  makeTvdssToTwt, buildWellLatticePath, normalizeStations, projectWellToSection,
} from '../engine/wellSection';
import { cellSpacing } from '../engine/surveyGeometry';

export const WELL_REASONS = {
  noTdr: 'No time-depth relationship; add checkshots or a time-depth table in Well Data Manager, or save a velocity model for this volume.',
  noPath: 'No well path; add a TD or a deviation survey in Well Data Manager.',
  outsideArea: 'The well path does not cross this survey.',
  outsideWindow: 'The well is outside the survey time window.',
};

/** Default corridor half-width in lattice cells (the engine default). */
export const DEFAULT_CORRIDOR_CELLS = 1.5;

// accepts anything as a time: tells "off the survey" from "off the window"
const ANY_TIME = { toTwtMs: () => 0, source: 'probe' };

/**
 * @param {Object} p
 * @param {Array} p.wells visible wells in the volume's frame (placeWellsForHost)
 * @param {{nIl:number, nXl:number, ns:number}} p.geom
 * @param {number} p.dtUs
 * @param {?Object} p.affine surveyAffine(manifest.geometry)
 * @param {?Object} p.velocity normalized velocity model for display
 * @param {?Array} p.boundaries layer-cake boundary grids
 * @param {(well: Object) => Array} p.checkshotsOf effective checkshot rows
 * @returns {{sections: Array, skipped: {id, name, code, reason}[]}}
 */
export function buildWellSections({
  wells, geom, dtUs, affine, velocity = null, boundaries = null, checkshotsOf,
}) {
  const sections = [];
  const skipped = [];
  if (!wells || !wells.length || !geom || !affine || !dtUs) return { sections, skipped };
  const maxTwtMs = ((geom.ns - 1) * dtUs) / 1000;
  const skip = (w, code) => skipped.push({ id: w.id, name: w.name, code, reason: WELL_REASONS[code] });
  for (const w of wells) {
    if (!normalizeStations(w)) { skip(w, 'noPath'); continue; }
    const timeConv = makeTvdssToTwt({
      checkshots: checkshotsOf ? checkshotsOf(w) : w.checkshots,
      velocity,
      boundaries,
      dtUs,
      maxTwtMs,
    });
    if (!timeConv) { skip(w, 'noTdr'); continue; }
    const built = buildWellLatticePath(w, { affine, timeConv, geom, dtUs });
    if (!built) {
      const lateral = buildWellLatticePath(w, { affine, timeConv: ANY_TIME, geom, dtUs });
      skip(w, lateral ? 'outsideWindow' : 'outsideArea');
      continue;
    }
    sections.push({
      id: w.id, name: w.name, color: w.color, source: timeConv.source, ...built,
      // U2-017: published pay zones (Petrophysics) on the well track
      pay: payIntervals(w.zones),
    });
  }
  return { sections, skipped };
}

/**
 * Projection corridor half-widths in lattice cells from a distance in
 * metres ("Well projection distance"): perpendicular to an inline the
 * step is the inline spacing, perpendicular to a crossline the
 * crossline spacing. null metres = the engine default.
 * @returns {{inline: number, xline: number}}
 */
export function corridorCells(distanceM, affine) {
  const d = Number(distanceM);
  if (!affine || !(d > 0)) {
    return { inline: DEFAULT_CORRIDOR_CELLS, xline: DEFAULT_CORRIDOR_CELLS };
  }
  const sp = cellSpacing(affine);
  return {
    inline: sp.il > 0 ? d / sp.il : DEFAULT_CORRIDOR_CELLS,
    xline: sp.xl > 0 ? d / sp.xl : DEFAULT_CORRIDOR_CELLS,
  };
}

/**
 * What a section window draws for one well on an inline or crossline:
 * the corridor-projected path (null entries pen-break) and the tops that
 * fall inside the corridor, as {trace, s} in section coordinates
 * (s = TWT sample).
 * @param {{points: Array, tops?: Array}} well a buildWellSections entry
 * @param {'inline'|'xline'} orientation
 * @param {number} index section line index
 * @param {number} [maxDist] corridor half-width in cells
 * @returns {{path: ?Array, tops: {name, trace, s}[]}}
 */
export function wellSectionMarks(well, orientation, index, maxDist = DEFAULT_CORRIDOR_CELLS) {
  const path = projectWellToSection(well.points, orientation, index, maxDist);
  const tops = [];
  for (const tp of well.tops || []) {
    const at = projectWellToSection([tp], orientation, index, maxDist);
    if (at && at[0] && at[0].s != null) tops.push({ name: tp.name, trace: at[0].trace, s: at[0].s });
  }
  return { path, tops };
}

// ---- U2-017: pay zones on the well track ------------------------------------
// Petrophysics Studio publishes zone summaries to the well registry
// (geo_wells_zones, properties.published_at with net_m, ntg, phi_avg,
// sw_avg). A zone with published net pay is drawn as a thick band along
// the well path on sections; an unpublished zone is not pay evidence and
// is left out.

/** Published zones with net pay above zero, in MD (m). */
export function payIntervals(zones) {
  const out = [];
  for (const z of zones || []) {
    const p = z?.properties || {};
    const top = Number(z?.top_md_m);
    const base = Number(z?.base_md_m);
    const net = Number(p.net_m);
    if (!p.published_at || !(net > 0) || !Number.isFinite(top) || !Number.isFinite(base) || !(base > top)) continue;
    out.push({
      name: z.name, top, base, net, ntg: Number.isFinite(Number(p.ntg)) ? Number(p.ntg) : null,
    });
  }
  return out.sort((a, b) => a.top - b.top);
}

/** Per path point: inside a pay interval (by MD)? */
export function payMask(points, intervals) {
  const m = new Uint8Array((points || []).length);
  if (!intervals || !intervals.length) return m;
  (points || []).forEach((q, i) => {
    const md = Number(q?.md);
    if (Number.isFinite(md) && intervals.some((iv) => md >= iv.top && md <= iv.base)) m[i] = 1;
  });
  return m;
}
