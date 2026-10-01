// Shale picks for the normal trend (AppUpgrade PP-U2-005). The trend is a
// shale property: picks in a sand read a faster sonic (or a different
// resistivity) and bend the trend. A pore pressure specialist filters the
// picks by the shale volume (Petrophysics VSH, the _CND curves) or, with
// none, by a gamma ray cutoff, and picks one shale point per interval of
// the normally pressured section. Segmented trends (a break at an
// unconformity or a lithology change) are fitted segment by segment on the
// picks inside each. Pure.

import { fitNct } from '../engine/nct';
import { fitResistivityNct } from '../engine/resistivity';

export const VSH_ALIASES = ['VSH', 'VSHALE', 'VSH_CND', 'VCL', 'VCLAY', 'VCL_CND', 'VSH_GR', 'VSHGR'];
export const GR_ALIASES = ['GR', 'GRC', 'SGR', 'CGR', 'GR_EDTC', 'HGR'];
export const DEFAULT_VSH_CUTOFF = 0.6;

/** The shale indicator among the registry logs: VSH first, then GR. */
export function pickShaleLog(logs) {
  const byBase = new Map();
  for (const l of logs || []) {
    const base = String(l.mnemonic || '').toUpperCase().split(':')[0];
    if (!byBase.has(base)) byBase.set(base, l);
  }
  for (const a of VSH_ALIASES) if (byBase.has(a)) return { kind: 'vsh', log: byBase.get(a) };
  for (const a of GR_ALIASES) if (byBase.has(a)) return { kind: 'gr', log: byBase.get(a) };
  return null;
}

/**
 * A shale indicator on the registry samples: VSH as a fraction (a percent
 * curve is read as percent and said), GR in API; nulls as NaN.
 * @returns {{values: number[], kind: 'vsh'|'gr', name: string, notes: string[]}}
 */
export function normalizeShaleIndicator(values, { kind, log }) {
  const notes = [];
  const name = log?.mnemonic || (kind === 'vsh' ? 'VSH' : 'GR');
  let v = Array.from(values || [], (x) => (x == null || !Number.isFinite(x) || x <= -999 ? NaN : x));
  if (kind === 'vsh') {
    const finite = v.filter(Number.isFinite).sort((a, b) => a - b);
    const p90 = finite.length ? finite[Math.floor(0.9 * (finite.length - 1))] : NaN;
    if (/%|PCT|PERC/i.test(String(log?.unit || '')) || p90 > 1.5) {
      v = v.map((x) => x / 100);
      notes.push(`${name} read as percent and divided by 100.`);
    }
  }
  return { values: v, kind, name, notes };
}

/** A gamma ray cutoff halfway between the sand (P10) and shale (P90) lines. */
export function grCutoff(gr) {
  const f = gr.filter(Number.isFinite).sort((a, b) => a - b);
  if (f.length < 10) return NaN;
  const p = (q) => f[Math.floor(q * (f.length - 1))];
  return 0.5 * (p(0.1) + p(0.9));
}

/**
 * One shale pick per interval: within each `everyM` window between fromM
 * and toM (depths below mudline), the most shaly sample at or above the
 * cutoff with a usable trend value.
 * @param {{zBmlM: number[], dtUsPerM: (number|null)[], resOhmM?: number[], shale: number[]}} input shale aligned to zBmlM
 * @param {{trend: 'dt'|'res', cutoff: number, fromM: number, toM: number, everyM?: number}} opts
 */
export function autoShalePicks(input, { trend = 'dt', cutoff, fromM, toM, everyM = 50 }) {
  if (!input?.shale) throw new Error('This well has no VSH or GR curve to tell shale from sand.');
  if (!(toM > fromM)) throw new Error('The pick interval needs its base below its top.');
  if (!Number.isFinite(cutoff)) throw new Error('Set a shale cutoff.');
  const best = new Map();
  for (let i = 0; i < input.zBmlM.length; i++) {
    const z = input.zBmlM[i];
    if (z < fromM || z > toM) continue;
    const sh = input.shale[i];
    if (!(sh >= cutoff)) continue;
    const val = trend === 'res' ? input.resOhmM?.[i] : input.dtUsPerM[i];
    if (!(val > 0)) continue;
    const w = Math.floor((z - fromM) / everyM);
    const prev = best.get(w);
    if (!prev || sh > prev.sh) best.set(w, { i, sh });
  }
  return [...best.values()].sort((a, b) => a.i - b.i).map(({ i, sh }) => (trend === 'res'
    ? { z: input.zBmlM[i], r: input.resOhmM[i], trend: 'res', shale: sh, auto: true }
    : { z: input.zBmlM[i], dt: input.dtUsPerM[i], shale: sh, auto: true }));
}

/** Picks that sit in sand by the cutoff (the shale value at the nearest sample). */
export function picksInSand(picks, input, cutoff) {
  if (!input?.shale || !Number.isFinite(cutoff)) return [];
  return (picks || []).filter((p) => {
    let best = 0;
    for (let i = 1; i < input.zBmlM.length; i++) if (Math.abs(input.zBmlM[i] - p.z) < Math.abs(input.zBmlM[best] - p.z)) best = i;
    return input.shale[best] < cutoff;
  });
}

/**
 * Fit each trend segment on the picks inside it (the base trend from the
 * mudline to the first segment top). A segment with fewer than two picks
 * keeps its values and is named.
 * @returns {{nct: object, segments: object[], fitted: string[], kept: string[]}}
 */
export function fitSegments(picks, nct, segments = []) {
  const segs = [...(segments || [])].sort((a, b) => a.zTopM - b.zTopM);
  const tops = [0, ...segs.map((s) => s.zTopM), Infinity];
  const fitted = []; const kept = [];
  const out = { nct: { ...nct }, segments: segs.map((s) => ({ ...s })) };
  for (let k = 0; k < tops.length - 1; k++) {
    const inside = (picks || []).filter((p) => p.dt > 0 && p.z >= tops[k] && p.z < tops[k + 1]);
    const name = k === 0 ? 'the base trend' : `the segment from ${Math.round(tops[k])} m`;
    if (inside.length < 2) { kept.push(name); continue; }
    const f = fitNct(inside.map((p) => p.z), inside.map((p) => p.dt), nct.dtMaUsPerM);
    if (k === 0) { out.nct.dtMlUsPerM = f.dtMl; out.nct.cPerM = f.c; } else { out.segments[k - 1].dtMlUsPerM = f.dtMl; out.segments[k - 1].cPerM = f.c; }
    fitted.push(name);
  }
  return { ...out, fitted, kept };
}

export { fitResistivityNct };
