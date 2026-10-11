// Ekene demonstration dataset — kit v4 structure: a Niger Delta growth fault.
// ============================================================================
// v3 carried the field's growth fault as a vertical step on a straight trace,
// with throw a function of depth only. It read as a cartoon on the seismic.
// v4 models the structure the way a Niger Delta interpreter draws it:
//
//   - the Ekene Growth Fault is a seaward-dipping LISTRIC normal fault: about
//     80 degrees near the seabed, flattening progressively into a detachment
//     in the deep, overpressured Akata shale. It is arcuate in map view,
//     concave to the basin, and reaches up to about 100 ms TWT;
//   - its hanging wall moves over that curved plane (vertical-shear
//     construction), which bends the hanging-wall beds back toward the fault:
//     an asymmetric rollover anticline, the Ekene trap;
//   - the horizons are growth horizons: each older horizon has moved further
//     (more heave), so displacement diminishes upward and the hanging-wall
//     packages thicken toward the fault;
//   - smaller faults sit around the rollover crest: a buried synthetic fault
//     (Ekene East, active until Ekene Sand time, the throw the deep tops of
//     the eastern wells have always carried) and a crestal graben of a
//     synthetic and an antithetic fault, plus a second antithetic fault
//     beyond Ekene-1.
//
// THE WELLS DO NOT MOVE. Every well's tops, logs, survey and checkshots are
// v3's, byte for byte (the Petrophysics, Correlation and QI lessons are
// recorded on them). They are built from the v3 model (geology.mjs,
// makeWellControl), and this structure honours every one of their picks: the
// design surfaces are fitted to the picks and a residual field, exact at
// every pick and fading to zero away from the wells, carries them the rest of
// the way. No well path crosses any fault (gated in the tests).
//
// Coordinates: (a, b) is the field frame rotated to the fault: a along strike
// (N20E, the survey's inline azimuth), b down dip toward the basin (N110E).
// Depths are metres below KB, positive down, like every other depth here.
// ============================================================================

import { HORIZONS, horizonByKey, FRAME, STRUCTURE } from './spine.mjs';

const DEG = Math.PI / 180;

// ------------------------------------------------------------------ noise ---

function hash(n) {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
/** Value noise in two dimensions, seeded, in [0, 1]. */
function noise2(seed, x, y) {
  const i = Math.floor(x); const j = Math.floor(y);
  const fx = smooth(x - i); const fy = smooth(y - j);
  const h = (p, q) => hash(seed * 374761393 + p * 668265263 + q * 1274126177);
  const a = h(i, j); const b = h(i + 1, j); const c = h(i, j + 1); const d = h(i + 1, j + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** Fractal 2D noise in [-1, 1]; `scale` in metres is the largest feature. */
export function fbm2(seed, x, y, scale, octaves = 3) {
  let s = 0; let amp = 1; let norm = 0; let f = 1 / scale;
  for (let o = 0; o < octaves; o += 1) {
    // each octave rotated so no grid direction survives
    const r = 0.5 + o * 1.1; const cr = Math.cos(r); const sr = Math.sin(r);
    s += amp * noise2(seed + o * 7919, (x * cr - y * sr) * f, (x * sr + y * cr) * f);
    norm += amp; amp *= 0.5; f *= 2.13;
  }
  return (s / norm - 0.5) * 2;
}

// ------------------------------------------------------------------ frame ---

export function makeFrame({ cx, cy, strike_deg: strikeDeg }) {
  const sp = Math.sin(strikeDeg * DEG); const cp = Math.cos(strikeDeg * DEG);
  return {
    toAB: (x, y) => { const dx = x - cx; const dy = y - cy; return { a: dx * sp + dy * cp, b: dx * cp - dy * sp }; },
    toXY: (a, b) => ({ x: cx + a * sp + b * cp, y: cy + a * cp - b * sp }),
  };
}

// ------------------------------------------------------------ the faults ---

/**
 * The main fault's depth Z(s) at a horizontal distance s down dip of its
 * trace. The dip falls with depth on a logistic (steep near the top,
 * flattening progressively), integrated at 1 m, and the plane is soled into
 * the detachment with a smooth minimum, so there is no kink anywhere.
 */
export function makeListric({ tipMd, dipTopDeg, flattenMidMd, flattenWidthM, soleMd }) {
  const dipAt = (z) => dipTopDeg / (1 + Math.exp((z - flattenMidMd) / flattenWidthM));
  const zs = [tipMd]; const ss = [0];
  let z = tipMd; let s = 0;
  const zEnd = soleMd + 400;
  while (z < zEnd && s < 20000) {
    s += 1 / Math.tan(dipAt(z + 0.5) * DEG); z += 1;
    zs.push(z); ss.push(s);
  }
  const k = 12;   // m, the width of the smooth sole
  const raw = (q) => {
    if (q <= 0) return tipMd + q * Math.tan(dipTopDeg * DEG);
    if (q >= ss[ss.length - 1]) return zs[zs.length - 1];
    let lo = 0; let hi = ss.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= q) lo = m; else hi = m; }
    return zs[lo] + ((q - ss[lo]) / (ss[hi] - ss[lo])) * (zs[hi] - zs[lo]);
  };
  // smooth minimum of the raw plane and the sole
  const Z = (q) => {
    const r = raw(q);
    const d = (soleMd - r) / k;
    return d > 30 ? r : soleMd - k * Math.log1p(Math.exp(d));
  };
  return { Z, dipAt };
}

/** Throw envelope of a finite fault: 1 at the centre, 0 at the tip line. */
const ellipse = (u, v) => Math.max(0, 1 - u * u - v * v);
const cosTaper = (x, full, zero) => {
  const ax = Math.abs(x);
  if (ax <= full) return 1;
  if (ax >= zero) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * ((ax - full) / (zero - full))));
};

// ------------------------------------------------- residual interpolation ---

/** Gaussian radial interpolant, exact at every point, zero far away. */
function makeGauss(input, sigma) {
  // picks closer than a few metres (deviated wells share the platform's
  // vertical top hole) are one control point
  const points = [];
  for (const p of input) {
    const q = points.find((o) => Math.hypot(o.x - p.x, o.y - p.y) < 5);
    if (!q) points.push({ ...p, k: 1 });
    else { q.r = (q.r * q.k + p.r) / (q.k + 1); q.k += 1; }
  }
  const n = points.length;
  if (!n) return () => 0;
  const k = (dx, dy) => Math.exp(-(dx * dx + dy * dy) / (sigma * sigma));
  const A = points.map((p) => points.map((q) => k(p.x - q.x, p.y - q.y)));
  const b = points.map((p) => p.r);
  // Gauss-Jordan with partial pivoting
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let piv = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let q = c; q <= n; q += 1) M[r][q] -= f * M[c][q];
    }
  }
  const w = M.map((row, i) => row[n] / row[i]);
  return (x, y) => {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += w[i] * k(x - points[i].x, y - points[i].y);
    return s;
  };
}

// --------------------------------------------------------------- the model ---

// Horizons the structure carries, top down. DETACH is seismic-only: the level
// the main fault soles into, never reached by a well.
const KEYS = HORIZONS.filter((h) => h.key !== 'SEABED').map((h) => h.key);

/**
 * Build the v4 structure.
 * @param control  the v3 well-control model (geology.mjs makeWellControl)
 * @param wellPicks [{ name, x, y, picks: [{ key, x, y, tvd }] }]: every
 *                  well's tops, where its path crosses each horizon
 */
export function makeStructure({ wellPicks }) {
  const S = STRUCTURE;
  const frame = makeFrame(S.frame);
  const MF = S.main_fault;
  const fault = makeListric({
    tipMd: MF.tip_md, dipTopDeg: MF.dip_top_deg, flattenMidMd: MF.flatten_mid_md,
    flattenWidthM: MF.flatten_width_m, soleMd: MF.sole_md,
  });
  const wiggle = (a) => {
    // a smooth, non-periodic wander of the trace (two octaves of value noise)
    let w = 0; let amp = 1; let f = 1 / 500;
    for (let o = 0; o < 2; o += 1) {
      const t = a * f + 17.3 * o; const i = Math.floor(t);
      w += amp * ((hash(911 + o * 7 + i * 668265263) + (hash(911 + o * 7 + (i + 1) * 668265263) - hash(911 + o * 7 + i * 668265263)) * smooth(t - i)) - 0.5);
      amp *= 0.5; f *= 2.3;
    }
    return 2 * w * MF.trace_wiggle_m;
  };
  const traceB = (a) => MF.trace_b0 + MF.trace_k * (a - MF.trace_a0) ** 2 + wiggle(a);
  const heaveTaper = (a) => 1 - MF.heave_taper * ((a - MF.trace_a0) / 1600) ** 2;
  const heave = (key, a) => (MF.heave_m[key] ?? 0) * heaveTaper(a);
  /** Depth of the main fault under (a, b); -Infinity west of the trace (all footwall). */
  const mainFaultZ = (a, b) => { const s = b - traceB(a); return s > 0 ? fault.Z(s) : -Infinity; };

  // the shape every horizon shares, scaled by alpha (relief grows with depth):
  // plunge along strike at both ends and steepening toward the basin
  const SH = S.shape;
  const shape = (a, b) => {
    const da = (a - SH.a_c) / (a < SH.a_c ? SH.stretch_sw : SH.stretch_ne);
    const db = b > SH.b_c ? (b - SH.b_c) / SH.stretch_sea : 0;
    const R = Math.hypot(da, db);
    const { x, y } = frame.toXY(a, b);
    return SH.q * Math.max(0, R - SH.r0) ** 2 + SH.undulation_m * fbm2(53, x, y, SH.undulation_scale_m, 2);
  };

  // Ekene East: a buried synthetic growth fault inside the hanging wall
  const F2 = S.ekene_east;
  const f2B = (a) => F2.b_at_tip + F2.curve_k * (a - F2.a_mid) ** 2;
  const f2Taper = (a) => cosTaper(a - F2.a_mid, F2.full_half_length_m, F2.tip_half_length_m);
  const f2Z = (a, b) => {
    const d = b - f2B(a);
    if (d < 0 || f2Taper(a) <= 0) return null;
    return F2.tip_md + (d * Math.tan(F2.dip_deg * DEG)) / (1 + d / F2.listric_m);
  };
  const f2Throw = (key, a) => (F2.throw_m[key] ?? 0) * f2Taper(a);

  // crestal faults: finite, with an elliptical throw envelope and reverse drag
  const CR = S.crestal.map((c) => ({ ...c, dir: c.dips === 'east' ? 1 : -1, tan: Math.tan(c.dip_deg * DEG) }));
  const crestalZ = (c, a, b) => {
    // plane: b = b_mid + dir * (z - z_mid) / tan  ->  z = z_mid + dir * (b - b_mid) * tan
    const z = c.z_mid + c.dir * (b - c.b_mid) * c.tan;
    const e = ellipse((a - c.a_mid) / c.half_length_m, (z - c.z_mid) / c.half_height_m);
    return e > 0 ? z : null;
  };
  /** Vertical displacement of a horizon at depth z0 by crestal fault c, on the given side. */
  const crestalDisp = (c, a, b, z0, hw) => {
    const e = ellipse((a - c.a_mid) / c.half_length_m, (z0 - c.z_mid) / c.half_height_m);
    if (e <= 0) return 0;
    const bPlane = c.b_mid + (c.dir * (z0 - c.z_mid)) / c.tan;
    const d = Math.abs(b - bPlane);
    if (d >= c.drag_m) return 0;
    const t = c.max_throw_m * e ** 0.75;
    const f = (1 - d / c.drag_m) ** 2;
    return (hw ? 0.5 : -0.5) * t * f;
  };

  // ---- the design surfaces, fitted to the picks ---------------------------
  // hanging wall (vertical shear): material now at b came from b - h; it sits
  // at its regional depth there plus the fall of the fault between the two
  const regional = { };   // key -> { D, G }
  const alphaOf = (key) => horizonByKey[key].alpha;
  // syn-depositional thickening on top of the kinematics: each package
  // thickens toward the fault, older ones more, fading over growth_decay_m
  // from the horizon's cutoff
  const cutS = {};
  const sAtDepth = (z) => { let lo = -500; let hi = 20000; for (let i = 0; i < 60; i += 1) { const m = (lo + hi) / 2; if (fault.Z(m) < z) lo = m; else hi = m; } return (lo + hi) / 2; };
  for (const key of KEYS) cutS[key] = sAtDepth(MF.cutoff_ref_md[key] ?? 2000);
  const growth = (key, s) => (MF.growth_m[key] ?? 0) * Math.exp(-Math.max(0, s - cutS[key]) / MF.growth_decay_m);
  // the footwall's own regional: the fitted plane at the hinge (where the
  // fault cuts the field's horizons), and from there a gentle common dip
  // both ways, with only the along-strike plunge of the shared shape, so the
  // footwall packages are flat and parallel, landward and under the hanging
  // wall alike. The hanging wall keeps the fitted plane (hwDesign).
  const RF = S.footwall_regional;
  const fwRegional = (key, a, b) => {
    const { D, G } = regional[key];
    return D + G * RF.b_hinge + RF.dip * (b - RF.b_hinge) + alphaOf(key) * shape(a, Math.min(b, SH.b_c));
  };
  const hwDesign = (key, a, b, f2East) => {
    const { D, G } = regional[key];
    const h = heave(key, a);
    const s = b - traceB(a);
    const bo = b - h;
    return D + G * bo + alphaOf(key) * shape(a, bo) + fault.Z(s) - fault.Z(s - h)
      + growth(key, s) * heaveTaper(a)
      + (f2East ? f2Throw(key, a) : 0);
  };
  const f2EastAt = (a, b, z) => { const zp = f2Z(a, b); return zp !== null && z < zp; };

  // least squares for D and G per horizon, over every pick
  for (const key of KEYS) {
    let n = 0; let sb = 0; let sbb = 0; let sr = 0; let sbr = 0;
    for (const w of wellPicks) {
      for (const p of w.picks) {
        if (p.key !== key || p.belowTd) continue;
        const { a, b } = frame.toAB(p.x, p.y);
        regional[key] = { D: 0, G: 0 };
        const rest = hwDesign(key, a, b, f2EastAt(a, b, p.tvd));
        const bo = b - heave(key, a);
        const r = p.tvd - rest;     // = D + G * bo
        n += 1; sb += bo; sbb += bo * bo; sr += r; sbr += bo * r;
      }
    }
    // a horizon only a well or two reach takes the regional dip of the one
    // above it and is levelled on its picks
    const prevKey = KEYS[KEYS.indexOf(key) - 1];
    const G = n >= 3 ? (n * sbr - sb * sr) / (n * sbb - sb * sb) : regional[prevKey].G;
    const D = (sr - G * sb) / n;
    regional[key] = { D, G };
  }

  // the residual: exact at every pick, gone a few hundred metres away
  const residual = {};
  const residualStats = {};
  for (const key of KEYS) {
    const pts = [];
    for (const w of wellPicks) {
      for (const p of w.picks) {
        if (p.key !== key || p.belowTd) continue;
        const { a, b } = frame.toAB(p.x, p.y);
        pts.push({ x: p.x, y: p.y, r: p.tvd - hwDesign(key, a, b, f2EastAt(a, b, p.tvd)), well: w.name });
      }
    }
    residual[key] = makeGauss(pts, S.residual_sigma_m);
    // floors under the TDs, added only where the horizon would rise above one
    let added = false;
    for (const w of wellPicks) {
      for (const p of w.picks) {
        if (p.key !== key || !p.belowTd) continue;
        const { a, b } = frame.toAB(p.x, p.y);
        const d = hwDesign(key, a, b, f2EastAt(a, b, p.tvd));
        if (d + residual[key](p.x, p.y) < p.tvd) { pts.push({ x: p.x, y: p.y, r: p.tvd - d, well: `${w.name} (floor)` }); added = true; }
      }
    }
    if (added) residual[key] = makeGauss(pts, S.residual_sigma_m);
    residualStats[key] = pts.map((p) => ({ well: p.well, r: p.r }));
  }

  // ---- horizon depth in a block -------------------------------------------
  // block: { hw: main-fault hanging wall?, f2East: east of Ekene East?,
  //          crestal: [{ c, hw }] the crestal faults this column crosses }
  function horizonIn(key, a, b, x, y, block) {
    if (key === 'DETACH') {
      // the detachment: the sole, a few metres under it, with gentle relief
      // that only ever goes down (the plane never cuts it)
      return MF.sole_md + 6 + 18 * (0.5 + 0.5 * fbm2(77, x, y, 1400, 2));
    }
    if (!block.hw) return fwRegional(key, a, b);
    let z = hwDesign(key, a, b, block.f2East) + residual[key](x, y);
    for (const { c, hw } of block.crestal) z += crestalDisp(c, a, b, z, hw);
    return z;
  }

  /**
   * The column under (x, y): the blocks the faults cut it into, top down,
   * each with the depth range it occupies and its horizon depths.
   */
  function blocksAt(x, y) {
    const { a, b } = frame.toAB(x, y);
    const zf = mainFaultZ(a, b);
    const blocks = [];
    if (zf > 0) {
      // hanging wall, cut further by the secondary faults that live in it
      const cuts = [];
      const zp2 = f2Z(a, b);
      if (zp2 !== null && zp2 < zf) cuts.push({ z: zp2, kind: 'f2' });
      for (const c of CR) {
        const zc = crestalZ(c, a, b);
        if (zc !== null && zc < zf) cuts.push({ z: zc, kind: 'crestal', c });
      }
      cuts.sort((p, q) => p.z - q.z);
      const presentCrestal = cuts.filter((u) => u.kind === 'crestal');
      let zTop = 0;
      for (let i = 0; i <= cuts.length; i += 1) {
        const zBot = i < cuts.length ? cuts[i].z : zf;
        // sides: above a cut is its hanging wall
        // east of the Ekene East trace the column is its hanging wall down to
        // the plane, or all the way to the main fault where it has soled out
        const f2East = zp2 !== null && (zp2 >= zf || zTop < zp2);
        const crestal = presentCrestal.map((u) => ({ c: u.c, hw: zTop < u.z }));
        blocks.push({ zTop, zBot, block: { hw: true, f2East, crestal }, fault: i > 0 ? cuts[i - 1].kind : null });
        zTop = zBot;
      }
      blocks.push({ zTop: zf, zBot: Infinity, block: { hw: false, f2East: false, crestal: [] }, fault: 'main' });
    } else {
      blocks.push({ zTop: 0, zBot: Infinity, block: { hw: false, f2East: false, crestal: [] }, fault: null });
    }
    for (const bl of blocks) {
      const z = {};
      for (const key of [...KEYS, 'DETACH']) z[key] = horizonIn(key, a, b, x, y, bl.block);
      // a horizon never rises above the one over it in the same block
      let prev = FRAME.mudline_md;
      for (const key of [...KEYS, 'DETACH']) { if (z[key] < prev) z[key] = prev; prev = z[key]; }
      bl.z = z;
    }
    // the fault planes crossing this column, with their local dip (as a
    // tangent), for the seismic's tapered cut-offs and damage zones
    const planes = [];
    if (zf > 0) {
      const s0 = b - traceB(a);
      // zMin/zMax: the depths the plane spans in this neighbourhood (its tip
      // above, its tip line below); nothing is cut outside them
      planes.push({ z: zf, tan: Math.max(1e-3, (fault.Z(s0 + 1) - fault.Z(s0 - 1)) / 2), kind: 'main', zMin: MF.tip_md, zMax: Infinity });
      const zp2 = f2Z(a, b);
      if (zp2 !== null && zp2 < zf) {
        const d = b - f2B(a);
        planes.push({ z: zp2, tan: Math.tan(F2.dip_deg * DEG) / (1 + d / F2.listric_m) ** 2, kind: 'f2', zMin: F2.tip_md, zMax: zf });
      }
      for (const c of CR) {
        const zc = crestalZ(c, a, b);
        if (zc !== null && zc < zf) {
          const u = (a - c.a_mid) / c.half_length_m; const hh = c.half_height_m * Math.sqrt(Math.max(0, 1 - u * u));
          planes.push({ z: zc, tan: c.tan, kind: 'crestal', zMin: c.z_mid - hh, zMax: c.z_mid + hh });
        }
      }
    }
    return { a, b, zf, blocks, planes };
  }

  /** Depth of a horizon where it exists in the column under (x, y), or null (cut out by a fault). */
  function horizonDepthAt(key, x, y) {
    if (key === 'SEABED') return FRAME.mudline_md;
    const { blocks } = blocksAt(x, y);
    for (const bl of blocks) {
      const z = bl.z[key];
      if (z >= bl.zTop && z < bl.zBot) return z;
    }
    return null;
  }

  /** Hanging-wall depth of a horizon (where it is, or would be, on the rollover), with no secondary faults. */
  function hangingWallDepthAt(key, x, y) {
    const { a, b } = frame.toAB(x, y);
    return hwDesign(key, a, b, false) + residual[key](x, y);
  }

  /** Which block a point at depth z under (x, y) is in. */
  function blockAt(x, y, z) {
    const col = blocksAt(x, y);
    const bl = col.blocks.find((q) => z >= q.zTop && z < q.zBot);
    // above its tip the Ekene East Fault does not exist: no side to be on
    const f2 = z < F2.tip_md ? 'above-ekene-east' : (bl.block.f2East ? 'ekene-east-hw' : 'ekene-east-fw');
    const id = !bl.block.hw ? 'main-footwall'
      : ['main-hangingwall', f2,
        ...bl.block.crestal.map((u) => `${u.c.name}:${u.hw ? 'hw' : 'fw'}`)].join('/');
    return { id, hw: bl.block.hw, f2East: bl.block.f2East };
  }

  /** Every fault plane's depth under (x, y) (null where it is absent), for the gates and the sticks. */
  function faultDepthsAt(x, y) {
    const { a, b } = frame.toAB(x, y);
    const zf = mainFaultZ(a, b);
    const out = { [MF.name]: zf > 0 ? zf : null };
    const z2 = f2Z(a, b);
    out[F2.name] = z2 !== null && (zf <= 0 || z2 < zf) ? z2 : null;
    for (const c of CR) {
      const zc = crestalZ(c, a, b);
      out[c.name] = zc !== null && zf > 0 && zc < zf ? zc : null;
    }
    return out;
  }

  return {
    frame, fault, traceB, heave, mainFaultZ, f2Z, f2B, f2Throw, crestal: CR,
    regional, residualStats,
    blocksAt, horizonDepthAt, hangingWallDepthAt, blockAt, faultDepthsAt,
    keys: KEYS,
  };
}
