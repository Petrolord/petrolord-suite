// Automatic feasibility sweeps on the Feasibility tab (QI upgrade P2.9,
// 2026-10-15). The engine (engines/qi/feasibilitySweep.js) models the target
// sand from porosity, shale volume and effective stress, thin-bedded by
// Backus at a net-to-gross, and scores how far apart the brine case and the
// hydrocarbon case sit against the seismic noise at normal incidence and a
// far angle, with sweeps of porosity, shale volume, effective stress and
// thickness. This module turns the tab's inputs into the engine's (fluids
// from Batzle and Wang at the reservoir temperature and pressure, the noise
// from a signal-to-noise ratio, for example the seismic QC median) and
// suggests a verdict. The verdict is the user's: it is never set here.
// Pure.

import {
  feasibilitySweep, separableRanges, sandElastic, backusAverage, bedResponse,
} from '../engine/feasibilitySweep';
import { brine, gas, liveOil, apiToRho0 } from '../../RockPhysicsStudio/engine/fluids';

export const SWEEP_DEFAULTS = Object.freeze({
  phi: '0.25', vsh: '0.1', overburdenMPa: '45', porePressureMPa: '22', thicknessM: '20', ntg: '1',
  tC: '80', salinity: '0.035', hc: 'gas', gasGravity: '0.7', api: '32', gor: '100',
  shaleVp: '2900', shaleVs: '1350', shaleRho: '2450', freqHz: '30', snr: '4', model: 'soft',
  phiRange: '0.15, 0.2, 0.25, 0.3', vshRange: '0, 0.15, 0.3', peffRange: '10, 20, 30', thicknessRange: '2, 5, 10, 20, 40',
});

const num = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v));
const list = (v) => String(v || '').split(/[,\s]+/).filter(Boolean).map(Number);

/** Why the inputs cannot run (a cleared box would be 0), or null. */
export function sweepProblem(f) {
  const need = [['phi', 'porosity', 0.01, 0.39], ['vsh', 'shale volume', 0, 0.9], ['overburdenMPa', 'overburden stress', 1, 300], ['porePressureMPa', 'pore pressure', 0, 299], ['thicknessM', 'thickness', 0, 1000], ['ntg', 'net-to-gross', 0.01, 1], ['tC', 'temperature', 1, 250], ['salinity', 'salinity', 0, 0.3], ['shaleVp', 'shale Vp', 1000, 7000], ['shaleVs', 'shale Vs', 300, 4000], ['shaleRho', 'shale density', 1500, 3200], ['freqHz', 'wavelet peak frequency', 3, 150], ['snr', 'signal-to-noise ratio', 0.1, 1000]];
  for (const [k, label, lo, hi] of need) { const v = num(f[k]); if (!(v >= lo && v <= hi)) return `Give the ${label}, ${lo} to ${hi}.`; }
  if (!(num(f.overburdenMPa) > num(f.porePressureMPa))) return 'The overburden stress must exceed the pore pressure.';
  if (f.hc === 'gas' && !(num(f.gasGravity) > 0.5 && num(f.gasGravity) < 2.5)) return 'Give the gas gravity, 0.55 to 2.4.';
  if (f.hc === 'oil' && (!(num(f.api) > 5 && num(f.api) < 70) || !(num(f.gor) >= 0))) return 'Give the oil API gravity (5 to 70) and GOR (L/L, 0 or more).';
  for (const [k, label] of [['phiRange', 'porosity'], ['vshRange', 'shale volume'], ['peffRange', 'effective stress'], ['thicknessRange', 'thickness']]) {
    const v = list(f[k]);
    if (v.some((x) => !Number.isFinite(x))) return `The ${label} sweep must be numbers separated by commas.`;
  }
  return null;
}

/** The engine's inputs from the tab's. */
export function sweepInputs(f) {
  const p = num(f.porePressureMPa); const t = num(f.tC);
  const b = brine(t, p, num(f.salinity));
  const hcFluid = f.hc === 'oil' ? liveOil(t, p, apiToRho0(num(f.api)), num(f.gor), num(f.gasGravity) || 0.7) : gas(t, p, num(f.gasGravity));
  const peff = num(f.overburdenMPa) - p;
  return {
    base: { phi: num(f.phi), vsh: num(f.vsh), peffMPa: peff, thicknessM: num(f.thicknessM), ntg: num(f.ntg) },
    sweeps: { phi: list(f.phiRange), vsh: list(f.vshRange), peffMPa: list(f.peffRange), thicknessM: list(f.thicknessRange) },
    fluidA: { k: b.k, rho: b.rho }, fluidB: { k: hcFluid.k, rho: hcFluid.rho },
    shale: { vp: num(f.shaleVp), vs: num(f.shaleVs), rho: num(f.shaleRho) },
    freqHz: num(f.freqHz), snr: num(f.snr), anglesDeg: [0, 30], rock: { model: f.model === 'stiff' ? 'stiff' : 'soft' },
    fluids: { brine: b, hc: hcFluid, peffMPa: peff },
  };
}

/** The sweep, its separable ranges and the suggested verdict. */
export function runSweep(f) {
  const why = sweepProblem(f);
  if (why) throw new Error(why);
  const inp = sweepInputs(f);
  // the noise is the brine amplitude of a thick bed (no tuning) over the signal-to-noise
  // ratio, so a thin base case is judged against the same noise as a thick one
  const sand = sandElastic({ ...inp.base, fluid: inp.fluidA, ...inp.rock });
  const bed = inp.base.ntg < 1 ? backusAverage([{ h: inp.base.ntg, ...sand }, { h: 1 - inp.base.ntg, ...inp.shale }]) : sand;
  const ref = bedResponse({ bed, shale: inp.shale, thicknessM: 300, freqHz: inp.freqHz, anglesDeg: [0] }).amp[0];
  const { snr, ...rest } = inp;
  const sweep = feasibilitySweep({ ...rest, noiseSd: ref / snr });
  const ranges = separableRanges(sweep);
  return { inputs: f, fluids: inp.fluids, sweep, ranges, suggestion: suggestVerdict(sweep, ranges) };
}

const NAMES = { phi: 'porosity', vsh: 'shale volume', peffMPa: 'effective stress (MPa)', thicknessM: 'thickness (m)' };

/**
 * The verdict the sweep suggests: feasible when the base case separates;
 * feasible with conditions when it does not but some swept values do; not
 * feasible when none does. With the text that says why.
 */
export function suggestVerdict(sweep, ranges) {
  const parts = Object.entries(ranges).map(([k, r]) => (r.separable ? `${NAMES[k]} ${r.min === r.max ? r.min : `${r.min} to ${r.max}`} separates (${r.separable} of ${r.tested})` : `no ${NAMES[k]} tested separates`));
  const dp = sweep.base.dprime;
  const baseText = `At the base case the brine and hydrocarbon amplitudes differ by d' = ${dp[0].toFixed(1)} at normal incidence and ${dp[1].toFixed(1)} at ${sweep.anglesDeg[1]} degrees against the noise (separable at ${sweep.threshold}).`;
  const anySep = sweep.rows.some((r) => r.separable);
  const verdict = sweep.base.separable ? 'feasible' : anySep ? 'conditional' : 'not-feasible';
  return { verdict, text: `${baseText} ${parts.join('; ')}.` };
}
