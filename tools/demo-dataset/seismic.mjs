// Ekene demonstration dataset — synthetic seismic with field character.
// ============================================================================
// The cube is built from the same structural model and the same rock
// properties the logs are, so the synthetic seismogram in Episode 6 ties
// without doctoring. Character (bandwidth, attenuation with depth, a noise
// floor, bedding texture inside packages) is added deliberately: a clean
// convolution looks like a cartoon, and the Seismolord episode has to look
// like seismic.
// ============================================================================

import { HORIZONS, FRAME, SEISMIC, LOCKED } from './spine.mjs';

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

/** Layer acoustic properties, averaged from a reference well's synthesis. */
export function layerPropsFrom(rows) {
  const acc = new Map();
  for (const r of rows) {
    if (!acc.has(r.layerKey)) acc.set(r.layerKey, { n: 0, dt: 0, rhob: 0, vshAmp: 0, seed: 0 });
    const a = acc.get(r.layerKey);
    a.n += 1; a.dt += r.dt; a.rhob += r.rhob;
  }
  const out = {};
  for (const [k, a] of acc) {
    const dt = a.dt / a.n;
    const v = 1e6 / dt / FT_PER_M;
    out[k] = { dt, v, rhob: a.rhob / a.n, ai: (a.rhob / a.n) * v };
  }
  return out;
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

/**
 * Build one trace. Reflectivity is assembled in time from the structural model
 * at this map location, then convolved with a wavelet whose dominant frequency
 * falls with time (a stand-in for Q), then noise is added.
 */
export function makeTraceBuilder({ geo, props, ns, dtMs, seed = 17 }) {
  const dtS = dtMs / 1000;
  const layerOrder = [
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
  const ampByLayer = Object.fromEntries(
    HORIZONS.map((h) => [h.key, 1]),
  );
  void ampByLayer;

  // Wavelets, precomputed per 200 ms band.
  const bands = [];
  for (let t0 = 0; t0 < ns * dtMs; t0 += 200) {
    const frac = t0 / (SEISMIC.t_max_ms || 2400);
    const f = SEISMIC.wavelet.f_dom_hz
      + (SEISMIC.wavelet.f_dom_deep_hz - SEISMIC.wavelet.f_dom_hz) * Math.min(1, frac);
    bands.push({ t0, w: ricker(f, dtS, 40) });
  }
  const waveletAt = (tMs) => bands[Math.min(bands.length - 1, Math.floor(tMs / 200))].w;

  const waterTwtMs = (2 * FRAME.water_depth_m * 1000) / 1500;

  return function trace(x, y) {
    // 1. horizon depths and interval velocities at this location
    const marks = [];
    let prevDepth = FRAME.mudline_md;
    let t = waterTwtMs;
    for (const [topKey, baseKey, layerKey] of layerOrder) {
      const zTop = geo.horizonDepthAt(topKey, x, y);
      const zBase = baseKey ? geo.horizonDepthAt(baseKey, x, y) : FRAME.td_md + 400;
      if (zTop === null || zBase === null) continue;
      const p = props[layerKey];
      if (!p) continue;
      marks.push({ layerKey, topKey, zTop, zBase, tTop: t, v: p.v, ai: p.ai });
      t += (2 * (zBase - zTop) * 1000) / p.v;
      marks[marks.length - 1].tBase = t;
      prevDepth = zBase;
    }
    void prevDepth;

    // 2. reflectivity in time
    const refl = new Float64Array(ns);
    const put = (tMs, r) => {
      const i = Math.round(tMs / dtMs);
      if (i >= 0 && i < ns) refl[i] += r;
    };
    // seabed
    put(waterTwtMs, 0.28);
    for (let k = 0; k < marks.length; k += 1) {
      const above = k === 0 ? { ai: 1.03 * 1500 } : marks[k - 1];
      const r = (marks[k].ai - above.ai) / (marks[k].ai + above.ai);
      put(marks[k].tTop, r);
      // bedding texture inside the package, tied to stratigraphic position so
      // it conforms to structure and correlates between traces
      const m = marks[k];
      const span = m.tBase - m.tTop;
      const nInt = Math.max(2, Math.round(span / (dtMs * 3)));
      const texture = m.layerKey === 'EKENE' || m.layerKey === 'OBORO' ? 0.012 : 0.035;
      for (let i = 1; i < nInt; i += 1) {
        const u = i / nInt;
        const val = fbm(m.layerKey.length * 131 + 17, u * nInt * 0.8, 3) - 0.5;
        put(m.tTop + u * span, val * texture);
      }
    }

    // 3. convolve with the time-varying wavelet
    const out = new Float32Array(ns);
    for (let i = 0; i < ns; i += 1) {
      const r = refl[i];
      if (r === 0) continue;
      const w = waveletAt(i * dtMs);
      const half = (w.length - 1) / 2;
      const lo = Math.max(0, i - half);
      const hi = Math.min(ns - 1, i + half);
      for (let j = lo; j <= hi; j += 1) out[j] += r * w[j - i + half];
    }

    // 4. noise floor and a mild gain taper, so it reads as field data
    const sn = 10 ** (SEISMIC.noise_db / 20);
    let rms = 0;
    for (let i = 0; i < ns; i += 1) rms += out[i] * out[i];
    rms = Math.sqrt(rms / ns) || 1e-6;
    const nAmp = rms / sn;
    const tseed = Math.round(x * 7.3 + y * 13.1) + seed;
    for (let i = 0; i < ns; i += 1) {
      const n = (fbm(tseed, i * 0.55, 3) - 0.5) * 2 * nAmp;
      const taper = i * dtMs < waterTwtMs ? 0.12 : 1;
      out[i] = (out[i] + n) * taper * 2000;
    }
    return out;
  };
}

export const SEISMIC_NOTES = {
  polarity: 'SEG normal: an increase in acoustic impedance is a peak (positive).',
  topSandEvent: 'peak',
  reason: 'The Ekene Sand is faster and denser than the overpressured Ogbia Shale above it, '
    + `so the top of the reservoir is a strong positive reflection (about ${(0.19).toFixed(2)} reflection coefficient).`,
  datum: 'Mean sea level, replacement velocity 1500 m/s through the water column.',
  field: LOCKED.field,
};
