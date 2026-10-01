// RMS (stacking) velocities to interval velocities (upgrade U2-006). Pure.
//
// Dix (1955): for RMS velocities V1 at two-way time t1 and V2 at t2 > t1,
// the interval velocity between them is
//     Vint = sqrt((V2^2 t2 - V1^2 t1) / (t2 - t1)),
// exact for flat layers and small offsets (the stacking velocity is close
// to the RMS velocity there). The first interval runs from time zero, the
// datum, with V1 t1 = 0. A pair whose numerator is not positive has no
// real interval velocity (the RMS picks are inconsistent) and is refused
// by name; the result is never clamped into something plausible.
//
// From the interval velocities, depth at each pick time is the sum of
// Vint x one-way interval time, and two models can be built from it: a
// single V0 + kZ fitted by least squares to the depth-time pairs through
// Seismolord's own twtMsToDepthM, or, for a layer cake, each layer's
// velocity as the time-weighted mean of the interval velocities across
// its time span.

import { twtMsToDepthM } from '../engine/velocityModel';

export const M_PER_FT = 0.3048;

/**
 * Parse a pasted RMS velocity table: two numbers per line (time,
 * velocity), any of comma, semicolon, tab or spaces; a header line is
 * skipped; units are declared, never guessed.
 * @param {string} text
 * @param {{timeUnit?: 'ms'|'s', velocityUnit?: 'm/s'|'ft/s'}} [u]
 * @returns {{picks: {twtMs: number, vrms: number}[], skipped: {line: number, text: string}[]}}
 */
export function parseRmsTable(text, { timeUnit = 'ms', velocityUnit = 'm/s' } = {}) {
  const picks = [];
  const skipped = [];
  const tf = timeUnit === 's' ? 1000 : 1;
  const vf = velocityUnit === 'ft/s' ? M_PER_FT : 1;
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    // tab, semicolon or space separated: a comma is a decimal comma;
    // otherwise commas separate the two numbers
    const spaced = /[\t; ]/.test(line);
    const parts = (spaced ? line.split(/[\t; ]+/) : line.split(',')).filter(Boolean)
      .map((x) => (spaced ? x.replace(/,$/, '').replace(',', '.') : x));
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (parts.length < 2 || !Number.isFinite(a) || !Number.isFinite(b)) {
      if (picks.length || skipped.length || !/[a-z]/i.test(line)) skipped.push({ line: i + 1, text: line });
      return;
    }
    picks.push({ twtMs: a * tf, vrms: b * vf });
  });
  return { picks, skipped };
}

/**
 * Dix conversion.
 * @param {{twtMs: number, vrms: number}[]} picks RMS velocity (m/s) at TWT (ms)
 * @returns {{intervals: {t0: number, t1: number, vint: number, z0: number, z1: number}[]}}
 * @throws {Error} times not strictly increasing, non-positive values, or an imaginary interval
 */
export function dixIntervals(picks) {
  if (!Array.isArray(picks) || picks.length < 1) throw new Error('Dix conversion needs at least one RMS velocity pick.');
  const intervals = [];
  let tPrev = 0;
  let vPrev = 0;
  let zPrev = 0;
  picks.forEach((p, i) => {
    const t = Number(p.twtMs);
    const v = Number(p.vrms);
    if (!(t > 0) || !(v > 0)) throw new Error(`Pick ${i + 1}: time and velocity must be positive (got ${p.twtMs} ms, ${p.vrms} m/s).`);
    if (!(t > tPrev)) throw new Error(`Pick ${i + 1}: times must increase (${t} ms after ${tPrev} ms).`);
    const num = v * v * t - vPrev * vPrev * tPrev;
    if (!(num > 0)) {
      throw new Error(`Between ${tPrev} and ${t} ms the RMS velocities give no real interval velocity (${Math.round(vPrev)} to ${Math.round(v)} m/s falls too fast). Check those picks.`);
    }
    const vint = Math.sqrt(num / (t - tPrev));
    const z1 = zPrev + vint * ((t - tPrev) / 2000);
    intervals.push({
      t0: tPrev, t1: t, vint, z0: zPrev, z1,
    });
    tPrev = t;
    vPrev = v;
    zPrev = z1;
  });
  return { intervals };
}

/** RMS velocity at each interval base from interval velocities (the forward definition). */
export function rmsFromIntervals(intervals) {
  let acc = 0;
  return intervals.map((iv) => {
    acc += iv.vint * iv.vint * (iv.t1 - iv.t0);
    return { twtMs: iv.t1, vrms: Math.sqrt(acc / iv.t1) };
  });
}

/** Depth (m) at a TWT through the Dix interval velocities (the last interval extends). */
export function dixDepthM(intervals, twtMs) {
  for (const iv of intervals) {
    if (twtMs <= iv.t1) return iv.z0 + iv.vint * ((twtMs - iv.t0) / 2000);
  }
  const last = intervals[intervals.length - 1];
  return last.z1 + last.vint * ((twtMs - last.t1) / 2000);
}

/**
 * Least-squares V0 + kZ through the Dix depth-time pairs (interval bases),
 * using Seismolord's twtMsToDepthM: for a fixed k depth is linear in V0
 * (closed form); k by golden-section search.
 * @returns {{v0: number, k: number, rmsM: number}}
 */
export function fitLinearToDix(intervals, { kMin = -0.5, kMax = 2.5 } = {}) {
  const pts = intervals.map((iv) => ({ t: iv.t1, z: iv.z1 }));
  if (pts.length < 2) {
    const iv = intervals[0];
    return { v0: iv.vint, k: 0, rmsM: 0 };
  }
  const bestV0 = (k) => {
    let num = 0; let den = 0;
    for (const q of pts) { const g = twtMsToDepthM(q.t, { v0: 1, k }); num += g * q.z; den += g * g; }
    return num / den;
  };
  const misfit = (k) => { const v0 = bestV0(k); return pts.reduce((s, q) => s + (twtMsToDepthM(q.t, { v0, k }) - q.z) ** 2, 0); };
  const g = (Math.sqrt(5) - 1) / 2;
  let a = kMin; let b = kMax;
  let c = b - g * (b - a); let d = a + g * (b - a);
  let fc = misfit(c); let fd = misfit(d);
  for (let i = 0; i < 80; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = misfit(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = misfit(d); }
  }
  const k = (a + b) / 2;
  const v0 = bestV0(k);
  const rmsM = Math.sqrt(misfit(k) / pts.length);
  return { v0, k, rmsM };
}

/**
 * Layer velocities for a layer cake: the time-weighted mean Dix interval
 * velocity over each layer's time span (boundary times at the velocity
 * location; the last layer runs to the last pick).
 * @param {{t0, t1, vint}[]} intervals
 * @param {number[]} boundaryTwtMs base TWT of layers 0..n-2
 * @returns {(number|null)[]} one velocity per layer, null where no pick covers it
 */
export function layerVelocitiesFromDix(intervals, boundaryTwtMs) {
  const tops = [0, ...boundaryTwtMs];
  const lastT = intervals[intervals.length - 1].t1;
  const bases = [...boundaryTwtMs, lastT];
  return tops.map((t0, i) => {
    const t1 = bases[i];
    let w = 0; let s = 0;
    for (const iv of intervals) {
      const lo = Math.max(t0, iv.t0);
      const hi = Math.min(t1, iv.t1);
      if (hi > lo) { s += iv.vint * (hi - lo); w += hi - lo; }
    }
    return w > 0 ? s / w : null;
  });
}
