// Ekene demonstration dataset — the build, shared by the generator and the
// gate test so they can never drift apart.

import { topsToPoints, specForPoints } from '../../packages/engines/engines/mapping/surface.js';
import { gridSurface } from '../../packages/engines/lib/gridding/gridding.js';
import { isNull } from '../../packages/engines/lib/gridding/gridmath.js';

import { LOCKED, LOCKED_WELLS, ADDED_WELLS, GRID } from './spine.mjs';
import { makeGeology, buildSurvey, topsForWell, tvdAtMd } from './geology.mjs';
import { synthesiseWell } from './rockmodel.mjs';

export const VSH_CUT = 0.35;

export function engineWellsFrom(list, topKey = 'TOP_SAND') {
  return list.map((w) => ({
    name: w.name, surface_x: w.x, surface_y: w.y,
    tops: [
      { name: 'TOP_SAND', md_m: w.top_sand },
      ...(w.base_sand != null ? [{ name: 'BASE_SAND', md_m: w.base_sand }] : []),
    ],
  })).filter((w) => w.tops.some((t) => t.name === topKey && Number.isFinite(t.md_m)));
}

/** Grid a set of TOP_SAND control points and count what sits above the contact. */
export function volumetricsOf(list) {
  const pts = topsToPoints(engineWellsFrom(list), 'TOP_SAND');
  const spec = specForPoints(pts, GRID.cell_m, GRID.pad_cells);
  const g = gridSurface(pts, spec, { maxExtrapolation: GRID.max_extrapolation_m });
  let oilCells = 0; let maxColumn = 0;
  for (const v of g.z) {
    if (isNull(v)) continue;
    const depth = -v;
    if (depth < LOCKED.owc_m) {
      oilCells += 1;
      maxColumn = Math.max(maxColumn, LOCKED.owc_m - depth);
    }
  }
  return { spec, z: g.z, live: g.live, oilCells, maxColumn };
}

/** The locked case: the six development wells, nothing else. */
export const lockedVolumetrics = () => volumetricsOf(LOCKED_WELLS);

export function wellList(geo) {
  return [
    ...LOCKED_WELLS.map((w) => ({
      ...w, kind: 'vertical', curves: 'full',
      td: w.name === 'Ekene-1' ? 2250 : 1700,
      purpose: w.name === 'Ekene-1' ? 'discovery well; the series hero' : w.role,
    })),
    ...ADDED_WELLS.map((w) => ({
      ...w,
      top_sand: w.top_sand ?? geo.topSandAt(w.x, w.y),
      base_sand: geo.horizonDepthAt('BASE_SAND', w.x, w.y),
    })),
  ];
}

function ekeneStats(geo, wells, tuning) {
  let net = 0; let gross = 0; let phiSum = 0;
  for (const w of wells) {
    if (!LOCKED_WELLS.some((l) => l.name === w.name)) continue;
    const survey = buildSurvey(w, geo);
    const tops = topsForWell(w, survey, geo);
    for (const r of synthesiseWell({ well: w, tops, survey, tvdAtMd, geo, tuning })) {
      if (r.layerKey !== 'EKENE') continue;
      gross += 1;
      if (r.vsh <= VSH_CUT) { net += 1; phiSum += r.phit; }
    }
  }
  return { ntg: net / gross, phiNet: phiSum / net };
}

/**
 * Solve the two free parameters of the reservoir facies model so the Ekene
 * Sand reproduces the LOCKED net to gross and net porosity. The threshold is
 * bisected; net porosity is affine in the scale (the clay-bound term does not
 * scale) so two evaluations solve it exactly.
 */
export function solveTuning(geo, wells) {
  let lo = 0.4; let hi = 0.95;
  for (let i = 0; i < 44; i += 1) {
    const mid = (lo + hi) / 2;
    if (ekeneStats(geo, wells, { shaleBedThreshold: mid, phiScale: 1 }).ntg < LOCKED.ntg) lo = mid;
    else hi = mid;
  }
  const shaleBedThreshold = (lo + hi) / 2;
  const m1 = ekeneStats(geo, wells, { shaleBedThreshold, phiScale: 1 }).phiNet;
  const m2 = ekeneStats(geo, wells, { shaleBedThreshold, phiScale: 1.1 }).phiNet;
  const slope = (m2 - m1) / 0.1;
  const phiScale = (LOCKED.phi - (m1 - slope)) / slope;
  const tuning = { shaleBedThreshold, phiScale };
  return { tuning, stats: ekeneStats(geo, wells, tuning) };
}

/** Everything downstream needs: geology, tuning, and every well synthesised. */
export function buildKit() {
  const geo = makeGeology();
  const wells = wellList(geo);
  const { tuning, stats } = solveTuning(geo, wells);
  const built = wells.map((w) => {
    const survey = buildSurvey(w, geo);
    const tops = topsForWell(w, survey, geo);
    const rows = w.curves === 'none'
      ? []
      : synthesiseWell({ well: w, tops, survey, tvdAtMd, geo, tuning });
    return { well: w, survey, tops, rows };
  });
  return { geo, wells, tuning, stats, built };
}
