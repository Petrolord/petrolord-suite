// Pressures from shale samples (2026-10-13). Eaton and Bowers read the
// compaction state of a shale: the sonic or resistivity of a sand, a
// carbonate stringer or a washout says nothing about the pore pressure, yet
// the prognosis evaluated every sample, so a sand put a spike (often below
// hydrostatic) into the pore pressure and the fracture pressure, and into the
// mud window and casing seats that read them. The trade evaluates the method
// in the shales and carries the pressure across the rest.
//
// This is a Suite-side step around the vendored engine (computeProfile is
// unchanged, so no engines change is needed):
//   1. optional running median on the sonic (or resistivity) the method
//      reads, in a depth window, for shale samples that are themselves noisy;
//   2. the engine runs on every sample as before (overburden, hydrostatic,
//      normal trend, density provenance all keep every sample);
//   3. the method's pore pressure is kept only at shale samples (shale
//      indicator at or above the cutoff the NCT picks use) and interpolated
//      linearly in depth between them; above the first shale sample the
//      section has no shale to read and is taken as normally pressured
//      (hydrostatic, as an Eaton or Bowers trend assumes there), and below
//      the last one the overpressure (PP minus hydrostatic) of that sample
//      is carried down;
//   4. the fracture pressure follows from that pore pressure with the
//      project's fracture method, exactly as the engine computes it.
// The all-samples path (option off) returns the engine result untouched.

import { computeProfile } from '../engine/profile';
import { fracPressure, fracCoefficient } from '../engine/fracgrad';
import { grCutoff, DEFAULT_VSH_CUTOFF } from './shalePicks';

/** The cutoff in use: the project's, else the NCT panel's default for the indicator. */
export function shaleCutoffFor(params, input, shaleKind) {
  const c = Number(params?.shaleCutoff);
  // a cutoff typed for another indicator (a GR value on a VSH well) is not used
  const sameKind = !params?.shaleCutoffKind || !shaleKind || params.shaleCutoffKind === shaleKind;
  if (sameKind && params?.shaleCutoff != null && params.shaleCutoff !== '' && Number.isFinite(c)) return c;
  if (!Array.isArray(input?.shale)) return NaN;
  return shaleKind === 'gr' ? grCutoff(input.shale) : DEFAULT_VSH_CUTOFF;
}

/**
 * Running median of `values` over a depth window centred on each sample.
 * Non-finite values are left out of each window and kept where they are.
 * @param {number[]} zM increasing depths
 * @param {(number|null)[]} values
 * @param {number} windowM full window length
 */
export function runningMedian(zM, values, windowM) {
  const n = values.length;
  if (!(windowM > 0) || n < 3) return values.slice();
  const half = windowM / 2;
  const out = new Array(n);
  let lo = 0; let hi = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) { out[i] = v; continue; }
    while (zM[lo] < zM[i] - half) lo++;
    if (hi < i) hi = i;
    while (hi + 1 < n && zM[hi + 1] <= zM[i] + half) hi++;
    const w = [];
    for (let k = lo; k <= hi; k++) { const x = values[k]; if (x != null && Number.isFinite(x)) w.push(x); }
    w.sort((a, b) => a - b);
    const m = w.length;
    out[i] = m % 2 ? w[(m - 1) / 2] : 0.5 * (w[m / 2 - 1] + w[m / 2]);
  }
  return out;
}

/**
 * Carry the pore pressure from the shale samples across the rest.
 * @param {number[]} zM depths below mudline
 * @param {number[]} ppPa method pore pressure on every sample
 * @param {number[]} phPa hydrostatic on every sample
 * @param {boolean[]} isShale
 * @returns {number[]|null} null when there is no shale sample
 */
export function interpolateFromShale(zM, ppPa, phPa, isShale) {
  const idx = [];
  for (let i = 0; i < zM.length; i++) if (isShale[i] && Number.isFinite(ppPa[i])) idx.push(i);
  if (!idx.length) return null;
  const out = new Array(zM.length);
  const first = idx[0]; const last = idx[idx.length - 1];
  let k = 0;
  for (let i = 0; i < zM.length; i++) {
    if (i < first) { out[i] = phPa[i]; continue; }
    if (i >= last) { out[i] = phPa[i] + (ppPa[last] - phPa[last]); continue; }
    while (idx[k + 1] < i) k++;
    const a = idx[k]; const b = idx[k + 1];
    if (i === a) { out[i] = ppPa[a]; continue; }
    const f = (zM[i] - zM[a]) / ((zM[b] - zM[a]) || 1);
    out[i] = ppPa[a] + f * (ppPa[b] - ppPa[a]);
  }
  return out;
}

/** Is the shale-pressure mode applicable and on for this input? */
export function shaleModeOn(params, input) {
  return !!params?.ppFromShale && Array.isArray(input?.shale) && input.shale.length === input.zBmlM?.length;
}

/**
 * The prognosis the app shows, saves and publishes: the engine profile, with
 * the shale-pressure step and the sonic median applied when switched on.
 * @param {object} input buildProfileInput / trend output (shale aligned when present)
 * @param {object} params workstation params (ppFromShale, shaleCutoff, sonicMedianM)
 * @param {{shaleKind?: 'gr'|'vsh'}} [opts]
 * @returns {object} computeProfile output, plus `shaleMode` when the step ran
 */
export function computePrognosis(input, params, { shaleKind = input?.shaleKind ?? null } = {}) {
  const base = computeProfile({ ...input, params });
  const on = shaleModeOn(params, input);
  const win = Number(params?.sonicMedianM) || 0;
  if (!on && !(win > 0)) return base;
  const byRes = params.method === 'eaton-resistivity';
  // the method's own pore pressure, from the filtered trace when asked
  let methodPp = base.porePressurePa;
  if (win > 0) {
    const smoothed = byRes
      ? computeProfile({ ...input, resOhmM: runningMedian(input.zBmlM, input.resOhmM, win), params })
      : computeProfile({ ...input, dtUsPerM: runningMedian(input.zBmlM, input.dtUsPerM, win), params });
    methodPp = smoothed.porePressurePa;
  }
  let pp = methodPp;
  let shaleMode = null;
  if (on) {
    const cutoff = shaleCutoffFor(params, input, shaleKind);
    const isShale = input.shale.map((s) => Number.isFinite(cutoff) && s >= cutoff);
    const carried = interpolateFromShale(input.zBmlM, methodPp, base.hydrostaticPa, isShale);
    const nShale = isShale.filter(Boolean).length;
    if (carried) pp = carried;
    shaleMode = { cutoff, kind: shaleKind, nShale, n: input.zBmlM.length, applied: !!carried };
  }
  const K = fracCoefficient(params);
  return {
    ...base,
    porePressurePa: pp,
    fracPressurePa: pp.map((v, i) => fracPressure(base.overburdenPa[i], v, K)),
    ...(shaleMode ? { shaleMode } : {}),
    ...(win > 0 ? { sonicMedianM: win } : {}),
  };
}

/** One sentence for the notes line, report and publish description. */
export function prognosisModeText(result, params, { fmtZ = (m) => `${Math.round(m)} m` } = {}) {
  const parts = [];
  if (result?.shaleMode?.applied) {
    const s = result.shaleMode;
    const cut = s.kind === 'gr' ? `GR at or above ${Math.round(s.cutoff)} API` : `VSH at or above ${Number(s.cutoff).toFixed(2)}`;
    parts.push(`Pore pressure from ${s.nShale} shale samples (${cut}), carried across the other ${s.n - s.nShale} samples by depth`);
  } else if (result?.shaleMode && !result.shaleMode.applied) {
    parts.push('Pressures from shale samples is on, but no sample reaches the shale cutoff: pore pressure from every sample');
  } else if (params?.ppFromShale) {
    parts.push('Pressures from shale samples needs a VSH or GR curve: pore pressure from every sample');
  } else {
    parts.push('Pore pressure from every sample');
  }
  if (result?.sonicMedianM > 0) parts.push(`running median of ${fmtZ(result.sonicMedianM)} on the ${params?.method === 'eaton-resistivity' ? 'resistivity' : 'sonic'}`);
  return `${parts.join('; ')}.`;
}
