// Mud weights as evidence (2026-10-14). The mud weights a well was drilled
// with are the cheapest pressure data a field has: a weight that held says
// the pore pressure was below it over that interval (ignoring the ECD and
// swab margins), a weight that took an influx says the pore pressure was
// above it at the influx depth, and one that lost returns says the fracture
// pressure was below it. This checks each imported mud weight against the
// prognosis on screen, in ppg EMW on the app's EMW datum, and says whether
// the prognosis explains it. Drawn and checked, never fitted. Pure.

import { comparesTo } from './calibrationImport';
import { pressureToDisplay, emwReferenceDepthM } from './units';

const ppgAt = (pa, z, params) => pressureToDisplay(pa, 'ppg', emwReferenceDepthM(z, params));
// the file's own EMW when it gave one (an imported 9.80 ppg is quoted as 9.80)
const mwPpg = (c, params) => (Number.isFinite(c.emwPpg) ? c.emwPpg : ppgAt(c.pMpa * 1e6, c.z, params));

function nearest(zBmlM, z) {
  let best = 0;
  for (let i = 1; i < zBmlM.length; i++) if (Math.abs(zBmlM[i] - z) < Math.abs(zBmlM[best] - z)) best = i;
  const step = zBmlM.length > 1 ? Math.abs(zBmlM[1] - zBmlM[0]) : 10;
  return Math.abs(zBmlM[best] - z) <= Math.max(1.5 * step, 7.62) ? best : -1;
}

/**
 * @param {{calibration: object[], zBmlM: number[], result: {porePressurePa: number[], fracPressurePa: number[]},
 *   params: object, fmtZ?: (zBml: number) => string}} a
 * @returns {null|{held: object[], influx: object[], losses: object[], lines: string[], tone: 'info'|'warn'}}
 */
export function mudWeightEvidence({ calibration, zBmlM, result, params, fmtZ = (z) => `${Math.round(z)} m bml` }) {
  const cal = (calibration || []).filter((c) => Number.isFinite(c.z) && Number.isFinite(c.pMpa));
  const mws = cal.filter((c) => ['mw', 'mwkick', 'mwloss'].includes(comparesTo(c)));
  if (!mws.length || !result || !zBmlM?.length) return null;
  const zTop = zBmlM[0]; const zBot = zBmlM[zBmlM.length - 1];

  // held: intervals (top and base points) and single points
  const intervals = new Map();
  const singles = [];
  for (const c of mws.filter((m) => comparesTo(m) === 'mw')) {
    if (c.interval) {
      const it = intervals.get(c.interval) || {};
      it[c.end === 'base' ? 'base' : 'top'] = c;
      intervals.set(c.interval, it);
    } else singles.push(c);
  }
  const held = [];
  for (const { top, base } of intervals.values()) {
    if (!top || !base) continue;
    const mw = mwPpg(top, params);
    let worst = null;
    for (let i = 0; i < zBmlM.length; i++) {
      if (zBmlM[i] < top.z || zBmlM[i] > base.z) continue;
      const pp = ppgAt(result.porePressurePa[i], zBmlM[i], params);
      if (Number.isFinite(pp) && (!worst || pp > worst.pp)) worst = { pp, z: zBmlM[i] };
    }
    if (worst) held.push({ mw, top: top.z, base: base.z, ppMax: worst.pp, zMax: worst.z, under: worst.pp > mw + 0.005 });
  }
  for (const c of singles) {
    const i = nearest(zBmlM, c.z);
    if (i < 0) continue;
    const mw = mwPpg(c, params);
    const pp = ppgAt(result.porePressurePa[i], zBmlM[i], params);
    held.push({ mw, top: c.z, base: c.z, ppMax: pp, zMax: zBmlM[i], under: pp > mw + 0.005 });
  }
  const checkAt = (kind, field, says) => mws.filter((m) => comparesTo(m) === kind).map((c) => {
    const mw = mwPpg(c, params);
    const i = c.z >= zTop && c.z <= zBot ? nearest(zBmlM, c.z) : -1;
    const p = i >= 0 ? ppgAt(result[field][i], zBmlM[i], params) : null;
    return { mw, z: c.z, p, inRange: i >= 0, consistent: i >= 0 ? says(p, mw) : null };
  });
  const influx = checkAt('mwkick', 'porePressurePa', (pp, mw) => pp > mw);
  const losses = checkAt('mwloss', 'fracPressurePa', (fg, mw) => fg < mw);

  const lines = [];
  if (held.length) {
    const under = held.filter((h) => h.under);
    if (!under.length) {
      const closest = held.reduce((a, h) => (h.mw - h.ppMax < a.mw - a.ppMax ? h : a), held[0]);
      lines.push(`Mud weights that held: ${held.length}, each above the prognosis pore pressure (closest ${(closest.mw - closest.ppMax).toFixed(2)} ppg over it at ${fmtZ(closest.zMax)}).`);
    } else {
      const w = under.reduce((a, h) => (h.ppMax - h.mw > a.ppMax - a.mw ? h : a), under[0]);
      lines.push(`Mud weights that held: ${held.length}; ${under.length} sit below the prognosis pore pressure (${w.mw.toFixed(2)} ppg held to ${fmtZ(w.base)} where the prognosis reaches ${w.ppMax.toFixed(2)} ppg at ${fmtZ(w.zMax)}), so the prognosis may read high there.`);
    }
  }
  for (const k of influx) {
    lines.push(k.inRange
      ? `${k.mw.toFixed(2)} ppg took an influx at ${fmtZ(k.z)} where the prognosis puts the pore pressure at ${k.p.toFixed(2)} ppg: ${k.consistent ? 'consistent' : 'the prognosis does not explain it'}.`
      : `${k.mw.toFixed(2)} ppg took an influx at ${fmtZ(k.z)}, outside the prognosis.`);
  }
  for (const k of losses) {
    lines.push(k.inRange
      ? `${k.mw.toFixed(2)} ppg lost returns at ${fmtZ(k.z)} where the prognosis puts the fracture pressure at ${k.p.toFixed(2)} ppg: ${k.consistent ? 'consistent' : 'the prognosis does not explain it'}.`
      : `${k.mw.toFixed(2)} ppg lost returns at ${fmtZ(k.z)}, outside the prognosis.`);
  }
  const bad = held.some((h) => h.under) || influx.some((k) => k.consistent === false) || losses.some((k) => k.consistent === false);
  return { held, influx, losses, lines, tone: bad ? 'warn' : 'info' };
}
