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
 * velocity per layer (the v2 rule), and Vp, Vs, rho per layer and per fluid.
 * Keys: 'EKENE', 'EKENE:oil', 'EKENE:brine', 'OBORO:gas', ...
 */
export function elasticPropsFrom(rows) {
  const acc = new Map();
  const add = (key, r) => {
    if (!acc.has(key)) acc.set(key, { n: 0, dt: 0, vp: 0, vs: 0, rho: 0 });
    const a = acc.get(key);
    a.n += 1; a.dt += r.dt; a.vp += r.vp_m_s; a.vs += r.vs_m_s; a.rho += r.rhob * 1000;
  };
  for (const r of rows) {
    add(r.layerKey, r);
    if (r.layerKey === 'EKENE' || r.layerKey === 'OBORO') add(`${r.layerKey}:${r.fluid}`, r);
  }
  const out = {};
  for (const [k, a] of acc) {
    out[k] = { v: 1e6 / (a.dt / a.n) / FT_PER_M, vp: a.vp / a.n, vs: a.vs / a.n, rho: a.rho / a.n };
  }
  return out;
}

/**
 * The interfaces under one map location, in two-way time: the seabed, every
 * layer top, and the fluid contacts inside the two reservoirs.
 * contacts: { EKENE: {depth, upper:'oil'}, OBORO: {depth, upper:'gas'} }
 */
export function makeElasticModel({ geo, props, contacts }) {
  const waterTwtMs = (2 * FRAME.water_depth_m * 1000) / 1500;
  const water = { vp: 1500, vs: 0, rho: 1030 };
  const elastic = (key, fluid) => {
    const p = props[fluid ? `${key}:${fluid}` : key] || props[key];
    return { vp: p.vp, vs: p.vs, rho: p.rho };
  };
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
      let top = elastic(layerKey, null);
      if (c) top = elastic(layerKey, zTop < c.depth ? c.upper : 'brine');
      if (above) out.push({ t: tTop, upper: above, lower: top, layerKey, span: tBase - tTop });
      else out[0].lower = top;
      let bottom = top;
      if (c && zTop < c.depth && c.depth < zBase) {
        bottom = elastic(layerKey, 'brine');
        out.push({ t: tTop + (2 * (c.depth - zTop) * 1000) / p.v, upper: top, lower: bottom, contact: layerKey });
      }
      above = bottom;
      t = tBase;
    }
    return out;
  };
}

/** Real part of the exact PP reflection coefficient; null past the critical angle or the mute. */
export function rpp(i, thetaDeg, muteDeg = 40) {
  if (i.seabed) return 0.28;
  if (thetaDeg > muteDeg) return null;
  const { upper: a, lower: b } = i;
  const r = zoeppritzRpp(a.vp, a.vs, a.rho, b.vp, b.vs, b.rho, thetaDeg);
  if (Math.abs(r.im) > 1e-9) return null;
  return r.re;
}

/** Mean reflection coefficient over [from, to] degrees in 1 degree steps (an angle stack). */
export function stackRpp(i, from, to) {
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
    const put = (tMs, r) => {
      const k = Math.round(tMs / dtMs);
      if (k >= 0 && k < ns) refl[k] += r;
    };
    // the boundaries themselves are placed at their exact time (a wavelet
    // evaluated off the sample grid): snapping them to 4 ms put stair steps
    // into every amplitude and time map
    const exact = [];
    for (const i of interfaces) {
      exact.push([i.t, reflAt(i)]);
      // bedding texture inside the package, angle independent, tied to
      // stratigraphic position as in v2
      if (i.span && i.layerKey) {
        const nInt = Math.max(2, Math.round(i.span / (dtMs * 3)));
        const texture = i.layerKey === 'EKENE' || i.layerKey === 'OBORO' ? 0.012 : 0.035;
        for (let k = 1; k < nInt; k += 1) {
          const u = k / nInt;
          put(i.t + u * i.span, (fbm(i.layerKey.length * 131 + 17, u * nInt * 0.8, 3) - 0.5) * texture);
        }
      }
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
  const tMs = [waterTwtMs]; const vrms = [1500];
  let t = waterTwtMs; let sum = 1500 * 1500 * waterTwtMs;
  for (const [topKey, baseKey, layerKey] of LAYER_ORDER) {
    if (!baseKey) break;
    const zTop = geo.horizonDepthAt(topKey, x, y);
    const zBase = geo.horizonDepthAt(baseKey, x, y);
    const p = props[layerKey];
    const dt = (2 * (zBase - zTop) * 1000) / p.v;
    sum += p.v * p.v * dt; t += dt;
    tMs.push(t); vrms.push(Math.sqrt(sum / t));
  }
  return { t_ms: tMs.map((v) => Math.round(v * 10) / 10), vrms: vrms.map((v) => Math.round(v * 10) / 10) };
}

/** Incidence angle at each interface for one offset, the way QI's angle_stacks computes it. */
export function gatherAngles(interfaces, offsetM, table, dtMs, ns) {
  const { vrms, vint } = velocityOnGrid(table.t_ms, table.vrms, ns, dtMs);
  return interfaces.map((i) => {
    const k = Math.min(ns - 1, Math.max(0, Math.round(i.t / dtMs)));
    return waldenAngle(offsetM, i.t / 1000, vrms[k], vint[k]);
  });
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
