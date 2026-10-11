// Ekene demonstration dataset — what the v4 structure measures as: the
// numbers the truth files quote and the structure gates check. Everything
// here measures the model (geo.horizonDepthAt and the fault planes); none of
// it restates the design constants.

import { spillAnalysis, closureAt } from '../../packages/engines/lib/gridding/closure.js';
import { FRAME, LOCKED, STRUCTURE, SEISMIC } from './spine.mjs';

const DEG = Math.PI / 180;
const A = SEISMIC.anchor;
/** Inline number whose line passes through a given along-strike position a. */
export const inlineAtA = (a) => A.il + Math.round((a + A.half_m) / SEISMIC.bin_m);
export const xlineAtB = (b) => A.xl + Math.round((b + A.half_m) / SEISMIC.bin_m);
export const aOfInline = (il) => (il - A.il) * SEISMIC.bin_m - A.half_m;
export const bOfXline = (xl) => (xl - A.xl) * SEISMIC.bin_m - A.half_m;
/** The full survey's extent in the field frame (a along strike, b down dip). */
export const SURVEY = {
  aMin: aOfInline(SEISMIC.full.il0), aMax: aOfInline(SEISMIC.full.il0 + SEISMIC.full.nInline - 1),
  bMin: bOfXline(SEISMIC.full.xl0), bMax: bOfXline(SEISMIC.full.xl0 + SEISMIC.full.nXline - 1),
};
export const inSurvey = (a, b, margin = 0) => a >= SURVEY.aMin + margin && a <= SURVEY.aMax - margin && b >= SURVEY.bMin + margin && b <= SURVEY.bMax - margin;

/**
 * Walk down dip along one line of constant a and find where a horizon is
 * cut out by the main fault: its footwall cutoff (last node before the gap)
 * and hanging-wall cutoff (first node after it). Throw is the vertical
 * separation of the two cutoffs, heave the gap's width.
 */
export function cutoffsOnLine(geo, key, a, { step = 2 } = {}) {
  const { toXY } = geo.frame;
  let fw = null; let hw = null; let inGap = false;
  for (let b = SURVEY.bMin; b <= SURVEY.bMax; b += step) {
    const { x, y } = toXY(a, b);
    const z = geo.horizonDepthAt(key, x, y);
    const isHw = z !== null && geo.blockAt(x, y, z + 1e-6).hw;
    if (z !== null && !isHw) { fw = { b, z }; inGap = false; }
    else if (z === null && fw) inGap = true;
    else if (isHw && fw) { hw = { b, z }; break; }
  }
  if (!fw || !hw) return null;
  return { key, a, fw, hw, throw_m: hw.z - fw.z, heave_m: hw.b - fw.b };
}

/** The main fault's dip at a depth (from its plane, measured, not the design formula). */
export function mainFaultDipAt(geo, z) {
  const { Z } = geo.fault;
  let lo = -500; let hi = 20000;
  for (let i = 0; i < 70; i += 1) { const m = (lo + hi) / 2; if (Z(m) < z) lo = m; else hi = m; }
  const s = (lo + hi) / 2;
  return Math.atan((Z(s + 1) - Z(s - 1)) / 2) / DEG;
}

/** The Ekene Sand truth grid over the survey (elevation, TVDSS negative) and its closure. */
export function ekeneClosure(geo, { cell = 12.5 } = {}) {
  const x0 = -1500; const y0 = -400;
  const nx = Math.round(5200 / cell) + 1; const ny = Math.round(4700 / cell) + 1;
  const spec = { nx, ny, dx: cell, dy: cell, x0, y0 };
  const z = new Float64Array(nx * ny);
  let seed = -1; let best = -Infinity;
  for (let r = 0; r < ny; r += 1) {
    for (let c = 0; c < nx; c += 1) {
      const x = x0 + c * cell; const y = y0 + r * cell; const i = r * nx + c;
      z[i] = 1e30;
      const { a, b } = geo.frame.toAB(x, y);
      if (!inSurvey(a, b)) continue;
      const d = geo.horizonDepthAt('TOP_SAND', x, y);
      if (d === null) continue;
      z[i] = -(d - FRAME.kb_m);
      if (geo.blockAt(x, y, d + 1e-6).hw && z[i] > best) { best = z[i]; seed = i; }
    }
  }
  const sp = spillAnalysis(z, spec, { seed });
  const contact = -(LOCKED.owc_m - FRAME.kb_m);
  const at = closureAt(sp, spec, contact);
  const { a: ca, b: cb } = geo.frame.toAB(sp.crest.x, sp.crest.y);
  const { a: sa, b: sb } = geo.frame.toAB(sp.spill.x, sp.spill.y);
  return {
    spec, z, spill: sp,
    crest: { x: sp.crest.x, y: sp.crest.y, tvdss_m: -sp.crest.z, inline: inlineAtA(ca), xline: xlineAtB(cb) },
    spillPoint: { x: sp.spill.x, y: sp.spill.y, tvdss_m: -sp.spillZ, inline: inlineAtA(sa), xline: xlineAtB(sb) },
    contact_tvdss_m: -contact,
    area_km2: at.areaM2 / 1e6,
    grv_m3: at.grvM3,
    closedAtContact: at.closed,
    closure_m: sp.crest.z - sp.spillZ,
  };
}

/** The whole truth: fault geometry by depth, throw by horizon, secondary faults, closure. */
export function structureTruth(geo) {
  const keys = geo.keys;
  const aRef = 0;   // the centre of the survey, along strike
  const throws = keys.map((k) => cutoffsOnLine(geo, k, aRef)).filter(Boolean)
    .map((c) => ({ horizon: c.key, throw_m: c.throw_m, heave_m: c.heave_m, footwall_cutoff_md: c.fw.z, hangingwall_cutoff_md: c.hw.z }));
  const dips = [150, 500, 1000, 1500, 1800, 2000, 2200, 2400, 2600, STRUCTURE.main_fault.sole_md - 20]
    .map((z) => ({ depth_md: z, dip_deg: mainFaultDipAt(geo, z) }));
  // shallowest offset: the tip of the main fault (where its plane starts)
  const tipMd = geo.fault.Z(0);
  return {
    main_fault: {
      name: STRUCTURE.main_fault.name,
      type: 'listric normal growth fault, seaward dipping, soling into the Akata detachment',
      tip_md: tipMd, sole_md: STRUCTURE.main_fault.sole_md, dip_by_depth: dips,
      throw_by_horizon_at_survey_centre: throws,
    },
    ekene_east: { name: STRUCTURE.ekene_east.name, type: 'buried synthetic growth fault, tip below the Ekene Sand base', tip_md: STRUCTURE.ekene_east.tip_md, throw_m: STRUCTURE.ekene_east.throw_m },
    crestal: STRUCTURE.crestal.map((c) => ({ name: c.name, dips: c.dips, dip_deg: c.dip_deg, max_throw_m: c.max_throw_m, depth_range_md: [c.z_mid - c.half_height_m, c.z_mid + c.half_height_m] })),
  };
}
