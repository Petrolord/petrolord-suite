// Complete hydrocarbon accounting (ReservoirCalc Pro upgrade U2-007,
// 2026-10-01; closes RCP-U1-034). Pure.
//
// - Solution gas: gas dissolved in the oil leg, STOIIP x Rs (scf per STB
//   field, sm3 per sm3 metric). The free-gas GIIP never included it.
// - Vaporised oil (Rv): oil carried in the free gas of a gas cap, GIIP x
//   Rv. Rv is quoted like a condensate-gas ratio (STB per MMscf, sm3 per
//   million sm3), so it is the CGR field read for an oil with a gas cap.
// - Saturation height: Sw from SCAL Studio's capillary-pressure chain
//   (Petrophysics `swAtHeight`, Leverett J inverted by bisection) at each
//   height above the free-water level, averaged over each fluid leg with
//   the rock at each depth (dV/dz of the same hypsometry the volumes use)
//   as the weight. Nothing here restates J, Pc or the height formula.

import { swAtHeight } from '@/pages/apps/PetrophysicsStudio/services/saturationHeight';

const FT_PER_M = 3.280839895;

/**
 * Solution gas in place and recoverable from the oil leg.
 * @param {number} stooip STB (field) or sm3 (metric)
 * @param {number} rs scf/STB (field) or sm3/sm3 (metric)
 * @param {number} recoverableOil same unit as stooip
 * @returns {{inPlace: ?number, recoverable: ?number, rs: ?number}} scf (field) or sm3 (metric)
 */
export function solutionGasFrom(stooip, rs, recoverableOil) {
  const r = Number(rs);
  if (!(r > 0) || !Number.isFinite(stooip)) return { inPlace: null, recoverable: null, rs: null };
  return { inPlace: stooip * r, recoverable: Number.isFinite(recoverableOil) ? recoverableOil * r : null, rs: r };
}

/**
 * A lookup of Sw against height above the FWL from SCAL's chain.
 * @param {{jSpec, reservoir, fluids}} shm shmFromScalProject result
 * @param {number} hMaxFt the tallest height needed
 */
export function swHeightTable(shm, hMaxFt, n = 400) {
  const H = Math.max(1, hMaxFt);
  const hs = new Float64Array(n);
  const sw = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    // denser near the FWL, where Sw changes fastest
    const t = k / (n - 1);
    hs[k] = H * t * t;
    sw[k] = swAtHeight(shm.jSpec, shm.reservoir, shm.fluids, hs[k]);
  }
  const at = (hFt) => {
    if (!(hFt > 0)) return 1;
    if (hFt >= H) return sw[n - 1];
    let lo = 0; let hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (hs[m] <= hFt) lo = m; else hi = m; }
    const f = (hFt - hs[lo]) / (hs[hi] - hs[lo]);
    return sw[lo] + (sw[hi] - sw[lo]) * f;
  };
  return { at, hs, sw };
}

/**
 * Rock-weighted Sw over a depth window of a hypsometry.
 * @param {Object} hyps hypsometry (table form or built), target units
 * @param {(hFt:number) => number} swAt Sw at a height above the FWL (ft)
 * @param {{fwlElev:number, topElev?:number, baseElev:number, isField:boolean}} w
 *   elevations in workspace units (negative below datum); top defaults to the crest
 * @returns {?number} Sw, or null when the window holds no rock
 */
export function weightedSw(hyps, swAt, { fwlElev, topElev = null, baseElev, isField }) {
  const vol = hyps.volume;
  const N = vol.length;
  const span = hyps.zHi - hyps.zLo;
  const zTop = topElev === null || topElev === undefined ? -Infinity : -topElev;
  const zBot = -baseElev;
  const toFt = isField ? 1 : FT_PER_M;
  let sV = 0; let sW = 0;
  for (let k = 0; k < N - 1; k++) {
    const z0 = hyps.zLo + (span * k) / (N - 1);
    const z1 = hyps.zLo + (span * (k + 1)) / (N - 1);
    const a = Math.max(z0, zTop); const b = Math.min(z1, zBot);
    if (!(b > a)) continue;
    const dV = (vol[k + 1] - vol[k]) * ((b - a) / (z1 - z0));
    if (!(dV > 0)) continue;
    const zm = 0.5 * (a + b);
    const hFt = (-fwlElev - zm) * toFt; // FWL depth minus this depth
    sV += dV;
    sW += dV * swAt(hFt);
  }
  return sV > 0 ? sW / sV : null;
}

/**
 * Re-derive the in-place volumes with Sw per leg from saturation height.
 * @param {Object} res a deterministic structural or area/depth result (grvOil, grvGas, inputs)
 * @param {Object} hyps the same case's hypsometry
 * @param {{shm: Object, fwlElev: number, unitSystem: string, owc, goc, fluidType}} o
 */
export function applySaturationHeight(res, hyps, { shm, fwlElev, unitSystem, owc, goc, fluidType }) {
  const isField = unitSystem === 'field';
  const lenU = isField ? 'ft' : 'm';
  const toFt = isField ? 1 : FT_PER_M;
  const crestElev = -hyps.zLo;
  const hMaxFt = (crestElev - fwlElev) * toFt;
  const warnings = [];
  if (!(hMaxFt > 0)) return { ...res, warnings: [...(res.warnings || []), `Saturation height: the free-water level (${fwlElev} ${lenU}) is above the crest, so the whole structure is below it (Sw = 1).`] };
  const table = swHeightTable(shm, hMaxFt);
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const gasBase = fluidType === 'gas' ? (Number.isFinite(num(goc)) ? num(goc) : num(owc)) : (fluidType === 'oil_gas' && Number.isFinite(num(goc)) ? Math.max(num(goc), num(owc)) : null);
  const swGas = gasBase !== null && Number.isFinite(gasBase) ? weightedSw(hyps, table.at, { fwlElev, topElev: null, baseElev: gasBase, isField }) : null;
  const swOil = fluidType === 'gas' ? null : weightedSw(hyps, table.at, { fwlElev, topElev: gasBase, baseElev: num(owc), isField });
  if (Number.isFinite(num(owc)) && num(owc) < fwlElev && fluidType !== 'gas') warnings.push(`Saturation height: the OWC (${num(owc)} ${lenU}) is below the free-water level (${fwlElev} ${lenU}); below the FWL Sw is 1.`);
  const inp = res.inputs || {};
  const ntg = inp.ntg; const phi = inp.porosity;
  const Bo = inp.fvf > 0 ? inp.fvf : 1.2; const Bg = inp.bg > 0 ? inp.bg : 0.005;
  const hcpvOil = (res.grvOil || 0) * ntg * phi * (1 - (swOil ?? 1));
  const hcpvGas = (res.grvGas || 0) * ntg * phi * (1 - (swGas ?? 1));
  const stooip = isField ? hcpvOil * 7758 / Bo : hcpvOil / Bo;
  const giip = isField ? hcpvGas * 43560 / Bg : hcpvGas / Bg;
  const rfO = inp.recovery || 0; const rfG = inp.recoveryGas || 0;
  const recoverableOil = fluidType === 'gas' ? 0 : stooip * rfO / 100;
  const recoverableGas = giip * rfG / 100;
  return {
    ...res,
    stooip: fluidType === 'gas' && res.method !== 'contact-grid' && res.method !== 'area-depth' ? giip : stooip,
    giip,
    hcPoreVolume: hcpvOil + hcpvGas, hcPoreVolumeOil: hcpvOil, hcPoreVolumeGas: hcpvGas,
    recoverableOil, recoverableGas,
    recoverable: fluidType === 'gas' ? recoverableGas : recoverableOil,
    saturationHeight: { project: shm.name || null, fwlElevation: fwlElev, swOil, swGas, unit: lenU },
    // the Sw shown with the result (slide, report) is the one used
    inputs: { ...inp, sw: Number.isFinite(swOil) ? swOil : (Number.isFinite(swGas) ? swGas : inp.sw), swSource: 'saturation height' },
    warnings: [...(res.warnings || []), ...warnings],
  };
}
