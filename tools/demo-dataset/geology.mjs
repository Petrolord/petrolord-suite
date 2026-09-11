// Ekene demonstration dataset — structure, faulting and well geometry.
// ============================================================================
// The Ekene Sand surface is NOT invented here. It is the surface the central
// gridding engine produces from the six locked well picks, which is what makes
// the NG5 volumetrics (169 oil cells, 20.2818603515625 m maximum oil column)
// reproduce. Every other horizon hangs off it, and every added well takes its
// pick from it.
// ============================================================================

import { topsToPoints, specForPoints } from '../../packages/engines/engines/mapping/surface.js';
import { gridSurface } from '../../packages/engines/lib/gridding/gridding.js';
import { sampleAtXY, isNull } from '../../packages/engines/lib/gridding/gridmath.js';

import {
  LOCKED, LOCKED_WELLS, LOCKED_E7, GRID, FRAME, HORIZONS, horizonByKey, FAULT, PLATFORM,
} from './spine.mjs';
import { makeRbf } from './rbf.mjs';

const DEG = Math.PI / 180;

// --------------------------------------------------------------- surfaces ---

function wellsForEngine() {
  return LOCKED_WELLS.map((w) => ({
    name: w.name,
    surface_x: w.x,
    surface_y: w.y,
    tops: [
      { name: 'TOP_SAND', md_m: w.top_sand },
      { name: 'BASE_SAND', md_m: w.base_sand },
    ],
  }));
}

export function makeGeology() {
  const engineWells = wellsForEngine();
  const topPts = topsToPoints(engineWells, 'TOP_SAND');
  const spec = specForPoints(topPts, GRID.cell_m, GRID.pad_cells);
  const opts = { maxExtrapolation: GRID.max_extrapolation_m };
  const top = gridSurface(topPts, spec, opts);
  const base = gridSurface(topsToPoints(engineWells, 'BASE_SAND'), spec, opts);

  // The engine stores surfaces as elevation, negative down (the MS5 rule), so
  // a depth below KB is the negated grid value.
  const depthFrom = (z, x, y) => {
    const v = sampleAtXY(z, spec, x, y);
    return isNull(v) ? null : -v;
  };

  // Grid sample: null outside the control hull, which is correct for a map.
  const topSandGridAt = (x, y) => depthFrom(top.z, x, y);
  const baseSandGridAt = (x, y) => depthFrom(base.z, x, y);

  // Smooth interpolant: exact at every locked pick including the Ekene-7
  // appraisal, defined everywhere. This is the field's structural truth, and
  // the one the seismic and the log synthesis are built from.
  const topSandAt = makeRbf([
    ...LOCKED_WELLS.map((w) => ({ x: w.x, y: w.y, z: w.top_sand })),
    { x: LOCKED_E7.x, y: LOCKED_E7.y, z: LOCKED_E7.top_sand },
  ]);
  const baseSandAt = makeRbf(
    LOCKED_WELLS.map((w) => ({ x: w.x, y: w.y, z: w.base_sand })),
  );

  const E1 = LOCKED_WELLS[0];
  const topSandAtE1 = topSandAt(E1.x, E1.y);       // 1548 by construction

  // Fault trace: a straight line through (x_at_top_sand, PLATFORM.y) on the
  // design strike. Returns the fault's x at a given y.
  const faultXAt = (y) =>
    FAULT.x_at_top_sand + Math.tan(FAULT.strike_deg * DEG) * (y - PLATFORM.y);

  // Downthrown to the east (basinward).
  const faultSide = (x, y) => (x > faultXAt(y) ? 'east' : 'west');

  const throwAt = (depthMd) => {
    const p = FAULT.throw_profile;
    if (depthMd <= p[0][0]) return 0;
    for (let i = 1; i < p.length; i += 1) {
      if (depthMd <= p[i][0]) {
        const [d0, t0] = p[i - 1];
        const [d1, t1] = p[i];
        return t0 + ((t1 - t0) * (depthMd - d0)) / (d1 - d0);
      }
    }
    return p[p.length - 1][1];
  };

  // Depth below KB of a horizon at a map location. Relief is carried in
  // proportion to alpha (a drape anticline over a deeper growth structure),
  // then the growth fault drops the eastern block.
  function horizonDepthAt(key, x, y) {
    const h = horizonByKey[key];
    if (!h) throw new Error(`unknown horizon ${key}`);
    if (h.key === 'SEABED') return FRAME.mudline_md;
    const ts = topSandAt(x, y);
    if (key === 'TOP_SAND') return ts;
    if (key === 'BASE_SAND') return baseSandAt(x, y);
    const unfaulted = h.e1 + h.alpha * (ts - topSandAtE1);
    const t = throwAt(unfaulted);
    return faultSide(x, y) === 'east' ? unfaulted + t : unfaulted;
  }

  return {
    spec, topGrid: top, baseGrid: base,
    topSandAt, baseSandAt, topSandGridAt, baseSandGridAt, topSandAtE1,
    faultXAt, faultSide, throwAt, horizonDepthAt,
    horizonKeys: HORIZONS.map((h) => h.key),
  };
}

// ------------------------------------------------------------ trajectories ---

// Minimum curvature step between two stations.
function minCurvStep(md0, inc0, azi0, md1, inc1, azi1) {
  const dMd = md1 - md0;
  const i0 = inc0 * DEG; const i1 = inc1 * DEG;
  const a0 = azi0 * DEG; const a1 = azi1 * DEG;
  const cosDl = Math.cos(i1 - i0) - Math.sin(i0) * Math.sin(i1) * (1 - Math.cos(a1 - a0));
  const dl = Math.acos(Math.min(1, Math.max(-1, cosDl)));
  const rf = dl < 1e-9 ? 1 : (2 / dl) * Math.tan(dl / 2);
  return {
    dTvd: (dMd / 2) * (Math.cos(i0) + Math.cos(i1)) * rf,
    dNs: (dMd / 2) * (Math.sin(i0) * Math.cos(a0) + Math.sin(i1) * Math.cos(a1)) * rf,
    dEw: (dMd / 2) * (Math.sin(i0) * Math.sin(a0) + Math.sin(i1) * Math.sin(a1)) * rf,
    dlsDeg: dl / DEG,
  };
}

// Solve the hold inclination of a build-and-hold that reaches horizontal
// displacement H at true vertical depth tvdT.
function solveBuildHold({ kop, buildRatePer30m, tvdT, H }) {
  const r = (30 * 180) / (buildRatePer30m * Math.PI);   // build radius, m
  const f = (thetaDeg) => {
    const th = thetaDeg * DEG;
    const s = (tvdT - kop - r * Math.sin(th)) / Math.cos(th);
    if (s < 0) return Infinity;
    return r * (1 - Math.cos(th)) + s * Math.sin(th) - H;
  };
  let lo = 0.001; let hi = 75;
  if (f(hi) < 0) throw new Error(`build-and-hold cannot reach H=${H} by tvd=${tvdT}`);
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid; else lo = mid;
  }
  const theta = (lo + hi) / 2;
  const th = theta * DEG;
  const buildLen = (theta / buildRatePer30m) * 30;
  return { theta, r, buildLen, holdStart: kop + buildLen };
}

// Station list for a well. Vertical wells are exactly vertical; deviated wells
// are build-and-hold from the platform to their bottomhole target.
export function buildSurvey(well, geo, { stationStep = 30 } = {}) {
  const td = well.td ?? FRAME.td_md;
  if (well.kind === 'vertical') {
    const st = [];
    for (let md = 0; md <= td + 1e-9; md += stationStep) {
      st.push({ md, inc: 0, azi: 0, tvd: md, ns: 0, ew: 0, x: well.x, y: well.y, dls: 0 });
    }
    if (st[st.length - 1].md < td) {
      st.push({ md: td, inc: 0, azi: 0, tvd: td, ns: 0, ew: 0, x: well.x, y: well.y, dls: 0 });
    }
    return { stations: st, surface: { x: well.x, y: well.y }, plan: { kind: 'vertical' } };
  }

  // Deviated: from the platform to (well.x, well.y) at the Oboro Sand.
  const dx = well.x - PLATFORM.x;
  const dy = well.y - PLATFORM.y;
  const H = Math.hypot(dx, dy);
  const aziTrue = (Math.atan2(dx, dy) / DEG + 360) % 360;
  const tvdT = geo.horizonDepthAt('OBORO', well.x, well.y) ?? 1845;
  const kop = 400;
  const buildRate = 2.5;
  const { theta, buildLen, holdStart } = solveBuildHold({
    kop, buildRatePer30m: buildRate, tvdT, H,
  });

  const incAt = (md) => {
    if (md <= kop) return 0;
    if (md >= holdStart) return theta;
    return ((md - kop) / buildLen) * theta;
  };

  const mds = [];
  for (let md = 0; md <= td + 1e-9; md += stationStep) mds.push(md);
  for (const m of [kop, holdStart, td]) if (!mds.some((v) => Math.abs(v - m) < 1e-6)) mds.push(m);
  mds.sort((a, b) => a - b);

  const stations = [];
  let tvd = 0; let ns = 0; let ew = 0;
  stations.push({ md: 0, inc: 0, azi: aziTrue, tvd: 0, ns: 0, ew: 0, x: PLATFORM.x, y: PLATFORM.y, dls: 0 });
  for (let i = 1; i < mds.length; i += 1) {
    const md0 = mds[i - 1]; const md1 = mds[i];
    const s = minCurvStep(md0, incAt(md0), aziTrue, md1, incAt(md1), aziTrue);
    tvd += s.dTvd; ns += s.dNs; ew += s.dEw;
    stations.push({
      md: md1, inc: incAt(md1), azi: aziTrue, tvd, ns, ew,
      x: PLATFORM.x + ew, y: PLATFORM.y + ns,
      dls: (s.dlsDeg / (md1 - md0)) * 30,
    });
  }
  return {
    stations,
    surface: { x: PLATFORM.x, y: PLATFORM.y },
    plan: { kind: 'build-and-hold', kop, buildRate, holdInclination: theta, azimuth: aziTrue, target: { x: well.x, y: well.y, tvd: tvdT } },
  };
}

// TVD (below KB) at a measured depth, by interpolation on the survey.
export function tvdAtMd(stations, md) {
  if (md <= stations[0].md) return md;
  for (let i = 1; i < stations.length; i += 1) {
    if (md <= stations[i].md) {
      const a = stations[i - 1]; const b = stations[i];
      const f = (md - a.md) / (b.md - a.md);
      return a.tvd + f * (b.tvd - a.tvd);
    }
  }
  const last = stations[stations.length - 1];
  return last.tvd + (md - last.md) * Math.cos(last.inc * DEG);
}

export function xyAtMd(stations, md) {
  if (md <= stations[0].md) return { x: stations[0].x, y: stations[0].y };
  for (let i = 1; i < stations.length; i += 1) {
    if (md <= stations[i].md) {
      const a = stations[i - 1]; const b = stations[i];
      const f = (md - a.md) / (b.md - a.md);
      return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
    }
  }
  const last = stations[stations.length - 1];
  return { x: last.x, y: last.y };
}

// Where the wellbore crosses each horizon, in MD. Walks the trajectory, so a
// deviated well picks its tops at the map position it actually occupies.
export function topsForWell(well, survey, geo) {
  const td = survey.stations[survey.stations.length - 1].md;
  const out = [];
  for (const h of HORIZONS) {
    let prev = null;
    let hit = null;
    for (let md = 0; md <= td; md += 1) {
      const tvd = tvdAtMd(survey.stations, md);
      const { x, y } = xyAtMd(survey.stations, md);
      const hz = geo.horizonDepthAt(h.key, x, y);
      if (hz === null) { prev = null; continue; }
      const diff = tvd - hz;
      if (prev !== null && prev < 0 && diff >= 0) {
        const f = -prev / (diff - prev);
        hit = md - 1 + f;
        break;
      }
      prev = diff;
    }
    if (hit !== null && hit <= td) {
      const tvd = tvdAtMd(survey.stations, hit);
      const { x, y } = xyAtMd(survey.stations, hit);
      out.push({ key: h.key, name: h.name, md: hit, tvd, tvdss: tvd - FRAME.kb_m, x, y, age_ma: h.age_ma, type: h.type });
    }
  }
  return out;
}
