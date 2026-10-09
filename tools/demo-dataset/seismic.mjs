// Ekene demonstration dataset — synthetic seismic with field character.
// ============================================================================
// The cube is built from the same structural model and the same rock
// properties the logs are, so the synthetic seismogram in Episode 6 ties
// without doctoring. Character (bandwidth, attenuation with depth, a noise
// floor, bedding texture inside packages) is added deliberately: a clean
// convolution looks like a cartoon, and the Seismolord episode has to look
// like seismic.
// ============================================================================

import { FRAME, SEISMIC, LOCKED } from './spine.mjs';
import { zoeppritzRpp } from '../../packages/engines/engines/rockphysics/avo.js';
import { waldenAngle, velocityOnGrid } from '../../packages/engines/engines/qi/prestack.js';

const FT_PER_M = 3.280839895013123;
const DEG = Math.PI / 180;

function hash(n) {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
function noise1(seed, t) {
  const i = Math.floor(t); const f = t - i;
  const a = hash(seed * 374761393 + i * 668265263);
  const b = hash(seed * 374761393 + (i + 1) * 668265263);
  return a + (b - a) * smooth(f);
}
function fbm(seed, t, octaves = 4) {
  let s = 0; let amp = 1; let norm = 0; let fr = 1;
  for (let o = 0; o < octaves; o += 1) {
    s += amp * noise1(seed + o * 7919, t * fr); norm += amp; amp *= 0.5; fr *= 2.1;
  }
  return s / norm;
}

/** Survey geometry: a rotated regular bin grid over the field's local frame. */
export function makeGeometry(cfg) {
  const az = SEISMIC.inline_azimuth_deg * DEG;
  const ux = { x: Math.sin(az), y: Math.cos(az) };          // along inline
  const vx = { x: Math.cos(az), y: -Math.sin(az) };         // along crossline
  // Centre the survey on the field.
  const cx = 1600; const cy = 1750;
  const halfI = ((cfg.nInline - 1) * SEISMIC.bin_m) / 2;
  const halfX = ((cfg.nXline - 1) * SEISMIC.bin_m) / 2;
  return (il, xl) => {
    const a = (il - cfg.il0) * SEISMIC.bin_m - halfI;
    const b = (xl - cfg.xl0) * SEISMIC.bin_m - halfX;
    return { x: cx + ux.x * a + vx.x * b, y: cy + ux.y * a + vx.y * b };
  };
}

/** A Ricker wavelet sampled at dt seconds, dominant frequency f. */
function ricker(f, dtS, halfLen) {
  const w = new Float64Array(halfLen * 2 + 1);
  for (let i = -halfLen; i <= halfLen; i += 1) {
    const t = i * dtS;
    const a = (Math.PI * f * t) ** 2;
    w[i + halfLen] = (1 - 2 * a) * Math.exp(-a);
  }
  return w;
}

export const SEISMIC_NOTES = {
  polarity: 'SEG normal: an increase in acoustic impedance is a peak (positive).',
  topSandEvent: 'peak',
  reason: 'The Ekene Sand is faster and denser than the overpressured Ogbia Shale above it, '
    + `so the top of the reservoir is a strong positive reflection (about ${(0.19).toFixed(2)} reflection coefficient).`,
  datum: 'Mean sea level, replacement velocity 1500 m/s through the water column.',
  field: LOCKED.field,
};

// ============================================================================
// v3 (2026-10-09): elastic modelling for QI. The cube above used one acoustic
// impedance per layer, which has no angle dependence and no fluid in it. From
// v3 every product (full stack, angle stacks, offset gathers) is built from
// one elastic model: per layer Vp, Vs and density from Ekene-1's logs, with
// the Ekene Sand split at the oil-water contact and the Oboro Sand at the
// gas-water contact, and exact Zoeppritz reflectivity at each angle. So the
// oil leg dims the top of the Ekene Sand, the contact is a flat event, and
// the gathers carry the AVO the rock physics predicts. Timing is unchanged:
// each layer's interval velocity is still the average of its whole sonic.
// ============================================================================


/**
 * The checkshot drift (one-way ms) at a depth below KB: the kit's checkshots
 * read earlier than the integrated sonic, by up to 7.5 ms one way, as real
 * checkshots do (the sonic is dispersive and slower than seismic-band
 * velocities). Since v3.1 (2026-10-09) the seismic follows the checkshots,
 * as real seismic does, so a tie on the checkshot time-depth needs no bulk
 * shift and a tie on the sonic alone shows the drift.
 */
export function checkshotDriftOwtMs(tvdBelowKb) {
  const z = tvdBelowKb - FRAME.mudline_md;
  return z > 0 ? -7.5 * (1 - Math.exp(-z / 850)) : 0;
}
const seisTwt = (tSonicMs, depth) => tSonicMs + 2 * checkshotDriftOwtMs(depth);

const LAYER_ORDER = [
  ['SEABED', 'BENIN', 'SEABED_BENIN'],
  ['BENIN', 'AGBADA', 'BENIN'],
  ['AGBADA', 'OGBIA', 'AGBADA_U'],
  ['OGBIA', 'TOP_SAND', 'OGBIA'],
  ['TOP_SAND', 'BASE_SAND', 'EKENE'],
  ['BASE_SAND', 'OBORO_U', 'AGBADA_L'],
  ['OBORO_U', 'OBORO', 'SUB_UNC'],
  ['OBORO', 'OBORO_B', 'OBORO'],
  ['OBORO_B', 'AKATA', 'AGBADA_B'],
  ['AKATA', null, 'AKATA'],
];

/**
 * Elastic layer properties from a well's rows (after addShear): timing
 * velocity per layer (the v2 rule), Vp, Vs, rho per layer and per fluid
 * (keys 'EKENE', 'EKENE:oil', 'EKENE:brine', 'OBORO:gas', ...), and, since
 * v3.2, each layer's fine structure: the well's brine-equivalent Vp, Vs and
 * density in blocks of about BLOCK_M, as fractions about the layer's
 * brine-equivalent mean, keyed by stratigraphic position u (0 at the top of
 * the layer, 1 at its base). The cube carries this profile conformably, so a
 * synthetic from a well's own logs ties it.
 */
export const BLOCK_M = 1.5;
export function elasticPropsFrom(rows) {
  const acc = new Map();
  const add = (key, r) => {
    if (!acc.has(key)) acc.set(key, { n: 0, dt: 0, vp: 0, vs: 0, rho: 0 });
    const a = acc.get(key);
    a.n += 1; a.dt += r.dt; a.vp += r.vp_m_s; a.vs += r.vs_m_s; a.rho += r.rhob * 1000;
  };
  const byLayer = new Map();
  for (const r of rows) {
    add(r.layerKey, r);
    if (r.layerKey === 'EKENE' || r.layerKey === 'OBORO') add(`${r.layerKey}:${r.fluid}`, r);
    if (!byLayer.has(r.layerKey)) byLayer.set(r.layerKey, []);
    byLayer.get(r.layerKey).push(r);
  }
  const out = {};
  for (const [k, a] of acc) {
    out[k] = { v: 1e6 / (a.dt / a.n) / FT_PER_M, vp: a.vp / a.n, vs: a.vs / a.n, rho: a.rho / a.n };
  }
  const profiles = {};
  for (const [key, rs] of byLayer) {
    rs.sort((p, q) => p.u - q.u);
    const mean = (f) => rs.reduce((s2, r) => s2 + f(r), 0) / rs.length;
    const mvp = mean((r) => r.vpBrine_m_s); const mvs = mean((r) => r.vsBrine_m_s); const mrho = mean((r) => r.rhoBrine);
    const per = Math.max(1, Math.round(BLOCK_M / (rs.length > 1 ? Math.abs(rs[1].md - rs[0].md) || 0.1524 : 0.1524)));
    const blocks = [];
    for (let i = 0; i < rs.length; i += per) {
      const b = rs.slice(i, i + per);
      const m = (f) => b.reduce((s2, r) => s2 + f(r), 0) / b.length;
      blocks.push({
        u0: i === 0 ? 0 : b[0].u, dvp: m((r) => r.vpBrine_m_s) / mvp - 1, dvs: m((r) => r.vsBrine_m_s) / mvs - 1, drho: m((r) => r.rhoBrine) / mrho - 1,
      });
    }
    profiles[key] = blocks;
  }
  Object.defineProperty(out, 'profiles', { value: profiles, enumerable: false });
  return out;
}

/**
 * The interfaces under one map location, in two-way time. Major ones carry
 * `layerKey` (a layer top) or `contact` (a fluid contact) and the seabed; the
 * rest are `fine`: the boundaries between the blocks of the layers' fine
 * structure. Each side of every interface is a cell: the layer's mean for its
 * fluid at that depth, times (1 + the profile's fraction there).
 * contacts: { EKENE: {depth, upper:'oil'}, OBORO: {depth, upper:'gas'} }
 */
export function makeElasticModel({ geo, props, contacts }) {
  const waterTwtMs = (2 * FRAME.water_depth_m * 1000) / 1500;
  const water = { vp: 1500, vs: 0, rho: 1030 };
  const profiles = props.profiles || {};
  const meanOf = (key, fluid) => props[fluid ? `${key}:${fluid}` : key] || props[key];
  const cell = (m, b) => ({ vp: m.vp * (1 + (b?.dvp || 0)), vs: m.vs * (1 + (b?.dvs || 0)), rho: m.rho * (1 + (b?.drho || 0)) });
  return function interfacesAt(x, y) {
    const out = [{ t: waterTwtMs, upper: water, lower: null, seabed: true }];
    let t = waterTwtMs;
    let above = null;
    for (const [topKey, baseKey, layerKey] of LAYER_ORDER) {
      const zTop = geo.horizonDepthAt(topKey, x, y);
      const zBase = baseKey ? geo.horizonDepthAt(baseKey, x, y) : FRAME.td_md + 400;
      if (zTop === null || zBase === null) continue;
      const p = props[layerKey];
      if (!p) continue;
      const c = contacts[layerKey];
      const tTop = t;
      const tBase = t + (2 * (zBase - zTop) * 1000) / p.v;
      // sonic time, moved onto the checkshot time-depth at each boundary
      const sTop = seisTwt(tTop, zTop);
      const sBase = seisTwt(tBase, zBase);
      const tAt = (u) => sTop + u * (sBase - sTop);
      // where the contact falls in the layer (u), if it does
      const uc = c && zTop < c.depth && c.depth < zBase ? (c.depth - zTop) / (zBase - zTop) : null;
      const fluidAt = (u) => (c ? ((uc !== null ? u < uc : zTop < c.depth) ? c.upper : 'brine') : null);
      // the layer's cells: profile blocks, the one holding the contact split there
      const blocks = profiles[layerKey] && profiles[layerKey].length ? profiles[layerKey] : [{ u0: 0, dvp: 0, dvs: 0, drho: 0 }];
      const cuts = [];
      for (const b of blocks) cuts.push({ u: b.u0, b });
      if (uc !== null) {
        let j = 0; while (j + 1 < cuts.length && cuts[j + 1].u <= uc) j++;
        cuts.splice(j + 1, 0, { u: uc, b: cuts[j].b, contact: true });
      }
      for (let j = 0; j < cuts.length; j++) {
        const { u, b, contact } = cuts[j];
        const props1 = cell(meanOf(layerKey, fluidAt(u + 1e-9)), b);
        if (j === 0) {
          if (above) out.push({ t: tAt(0), upper: above, lower: props1, layerKey });
          else out[0].lower = props1;
        } else if (contact) {
          out.push({ t: tAt(u), upper: above, lower: props1, contact: layerKey });
        } else {
          out.push({ t: tAt(u), upper: above, lower: props1, fine: true });
        }
        above = props1;
      }
      t = tBase;
    }
    return out;
  };
}

/**
 * Shuey's three-term form of Aki-Richards for one interface:
 * R(theta) = A + B sin^2 + C (tan^2 - sin^2), from the averages and the
 * jumps across it. Used for the fine interfaces (small contrasts); the
 * major ones are exact Zoeppritz.
 */
export function shueyABC(a, b) {
  const vp = (a.vp + b.vp) / 2; const vs = (a.vs + b.vs) / 2; const rho = (a.rho + b.rho) / 2;
  const dvp = (b.vp - a.vp) / vp; const dvs = (b.vs - a.vs) / vs; const drho = (b.rho - a.rho) / rho;
  const k = (vs / vp) ** 2;
  return { A: 0.5 * (dvp + drho), B: 0.5 * dvp - 2 * k * (drho + 2 * dvs), C: 0.5 * dvp };
}
const abcOf = (i) => (i.abc || (i.abc = shueyABC(i.upper, i.lower)));

/** The reflection coefficient at one angle; null past the critical angle or the mute. */
export function rpp(i, thetaDeg, muteDeg = 40) {
  if (i.seabed) return 0.28;
  if (thetaDeg > muteDeg) return null;
  if (i.fine) {
    const { A, B, C } = abcOf(i);
    const s2 = Math.sin(thetaDeg * DEG) ** 2; const t2 = Math.tan(thetaDeg * DEG) ** 2;
    return A + B * s2 + C * (t2 - s2);
  }
  const { upper: a, lower: b } = i;
  const r = zoeppritzRpp(a.vp, a.vs, a.rho, b.vp, b.vs, b.rho, thetaDeg);
  if (Math.abs(r.im) > 1e-9) return null;
  return r.re;
}

const rangeMeans = new Map();
function meansOver(from, to) {
  const key = `${from}/${to}`;
  if (!rangeMeans.has(key)) {
    let s2 = 0; let d = 0; let n = 0;
    for (let a = from; a <= to + 1e-9; a += 1) { const x = Math.sin(a * DEG) ** 2; s2 += x; d += Math.tan(a * DEG) ** 2 - x; n += 1; }
    rangeMeans.set(key, { s2: s2 / n, d: d / n });
  }
  return rangeMeans.get(key);
}

/** Mean reflection coefficient over [from, to] degrees in 1 degree steps (an angle stack). */
export function stackRpp(i, from, to) {
  if (i.fine) {
    const { A, B, C } = abcOf(i);
    const m = meansOver(from, to);
    return A + B * m.s2 + C * m.d;
  }
  let s = 0; let n = 0;
  for (let a = from; a <= to + 1e-9; a += 1) {
    const r = rpp(i, a);
    if (r !== null) { s += r; n += 1; }
  }
  return n ? s / n : 0;
}

/**
 * Trace synthesis shared by every product. reflAt(interface) returns the
 * coefficient for this product (a stack mean or one gather angle).
 */
export function makeElasticTracer({ ns, dtMs, noiseRef = 0 }) {
  const dtS = dtMs / 1000;
  const bands = [];
  for (let t0 = 0; t0 < ns * dtMs; t0 += 200) {
    const frac = t0 / (SEISMIC.t_max_ms || 2400);
    const f = SEISMIC.wavelet.f_dom_hz + (SEISMIC.wavelet.f_dom_deep_hz - SEISMIC.wavelet.f_dom_hz) * Math.min(1, frac);
    bands.push({ t0, w: ricker(f, dtS, 40) });
  }
  const waveletAt = (tMs) => bands[Math.min(bands.length - 1, Math.floor(tMs / 200))].w;
  const freqAt = (tMs) => {
    const t0 = Math.min(bands.length - 1, Math.floor(tMs / 200)) * 200;
    return SEISMIC.wavelet.f_dom_hz + (SEISMIC.wavelet.f_dom_deep_hz - SEISMIC.wavelet.f_dom_hz) * Math.min(1, t0 / (SEISMIC.t_max_ms || 2400));
  };
  const waterTwtMs = (2 * FRAME.water_depth_m * 1000) / 1500;

  return function trace(interfaces, reflAt, { x, y, seed, noise = true }) {
    const refl = new Float64Array(ns);
    // the major boundaries are placed at their exact time (a wavelet
    // evaluated off the sample grid): snapping them to 4 ms put stair steps
    // into every amplitude and time map
    const exact = [];
    for (const i of interfaces) {
      const r = reflAt(i);
      if (!r) continue;
      if (!i.fine) { exact.push([i.t, r]); continue; }
      // the fine structure: split between the two nearest samples
      const x = i.t / dtMs; const k = Math.floor(x); const f = x - k;
      if (k >= 0 && k < ns) refl[k] += r * (1 - f);
      if (k + 1 >= 0 && k + 1 < ns) refl[k + 1] += r * f;
    }
    const out = new Float32Array(ns);
    for (let k = 0; k < ns; k += 1) {
      const r = refl[k];
      if (r === 0) continue;
      const w = waveletAt(k * dtMs);
      const half = (w.length - 1) / 2;
      const lo = Math.max(0, k - half);
      const hi = Math.min(ns - 1, k + half);
      for (let j = lo; j <= hi; j += 1) out[j] += r * w[j - k + half];
    }
    for (const [tMs, r] of exact) {
      if (!r) continue;
      const f = freqAt(tMs);
      const k0 = Math.round(tMs / dtMs);
      for (let j = Math.max(0, k0 - 40); j <= Math.min(ns - 1, k0 + 40); j += 1) {
        const a = (Math.PI * f * ((j * dtMs - tMs) / 1000)) ** 2;
        out[j] += r * (1 - 2 * a) * Math.exp(-a);
      }
    }
    // noise is set against one reference level for every product (the
    // noise-free full stack's rms at Ekene-1), so far-angle dimming stays
    // visible instead of being normalised away trace by trace
    const nAmp = noise && noiseRef ? noiseRef / 10 ** (SEISMIC.noise_db / 20) : 0;
    const tseed = Math.round(x * 7.3 + y * 13.1) + seed;
    for (let k = 0; k < ns; k += 1) {
      const n = nAmp ? (fbm(tseed, k * 0.55, 3) - 0.5) * 2 * nAmp : 0;
      const taper = k * dtMs < waterTwtMs ? 0.12 : 1;
      out[k] = (out[k] + n) * taper * 2000;
    }
    return out;
  };
}
/** rms of a noise-free trace before gain, the reference noiseRef is set from. */
export function traceRms(tr) {
  let s = 0;
  for (const v of tr) s += (v / 2000) ** 2;
  return Math.sqrt(s / tr.length);
}

/**
 * RMS velocity table in two-way time at one location: a row at the seabed
 * and at each layer base, so velocityOnGrid's Dix intervals reproduce the
 * layer velocities there exactly.
 */
export function rmsVelocityTable({ geo, props, x, y }) {
  const waterTwtMs = (2 * FRAME.water_depth_m * 1000) / 1500;
  // on the seismic (checkshot) time axis: each layer's interval velocity is
  // its thickness over its seismic two-way time, so Dix gives it back
  const tMs = [waterTwtMs]; const vrms = [1500];
  let tSonic = waterTwtMs; let t = waterTwtMs; let sum = 1500 * 1500 * waterTwtMs;
  for (const [topKey, baseKey, layerKey] of LAYER_ORDER) {
    if (!baseKey) break;
    const zTop = geo.horizonDepthAt(topKey, x, y);
    const zBase = geo.horizonDepthAt(baseKey, x, y);
    const p = props[layerKey];
    tSonic += (2 * (zBase - zTop) * 1000) / p.v;
    const tNext = seisTwt(tSonic, zBase);
    const dt = tNext - t;
    const v = (2 * (zBase - zTop) * 1000) / dt;
    sum += v * v * dt; t = tNext;
    tMs.push(t); vrms.push(Math.sqrt(sum / t));
  }
  return { t_ms: tMs.map((v) => Math.round(v * 10) / 10), vrms: vrms.map((v) => Math.round(v * 10) / 10) };
}

/**
 * The incidence angle at any time for one offset, the way QI's angle_stacks
 * computes it (Walden's straight ray, the RMS table on the trace's samples).
 */
export function angleAtTime(offsetM, table, dtMs, ns) {
  const { vrms, vint } = velocityOnGrid(table.t_ms, table.vrms, ns, dtMs);
  const ang = Float64Array.from({ length: ns }, (_, k) => waldenAngle(offsetM, (k * dtMs) / 1000, vrms[k], vint[k]));
  return (tMs) => ang[Math.min(ns - 1, Math.max(0, Math.round(tMs / dtMs)))];
}

/** Incidence angle at each interface for one offset (angleAtTime, per interface). */
export function gatherAngles(interfaces, offsetM, table, dtMs, ns) {
  const at = angleAtTime(offsetM, table, dtMs, ns);
  return interfaces.map((i) => at(i.t));
}

/**
 * Zero every sample of an NMO-corrected trace whose Walden angle is beyond the
 * mute, after the noise is in: a processed gather's mute zone holds zeros, and
 * QI Studio reads exact zeros as muted.
 */
export function muteTrace(trace, offsetM, table, dtMs, muteDeg) {
  const { vrms, vint } = velocityOnGrid(table.t_ms, table.vrms, trace.length, dtMs);
  for (let k = 0; k < trace.length; k += 1) {
    const a = waldenAngle(offsetM, (k * dtMs) / 1000, vrms[k], vint[k]);
    if (!(a <= muteDeg)) trace[k] = 0;
  }
  return trace;
}
