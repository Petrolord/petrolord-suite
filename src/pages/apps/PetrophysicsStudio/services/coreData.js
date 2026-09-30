// Core calibration (AppUpgrade PETRO-U2-007, PETRO-U1-032, 2026-09-29).
//
// Routine core analysis reaches the registry through Well Data Manager as
// point curves (CPOR, CKH ...) placed on the nearest log sample with their
// measured values (PETRO-U1-011). This module finds them, reads them in the
// pipeline's units, and fits the classic semi-log porosity-permeability
// transform per zone:
//
//     log10 k = a + b phi          (k in mD, phi in v/v)
//
// by ordinary least squares of log10 k on phi (Nelson, P.H., 1994,
// "Permeability-porosity relationships in sedimentary rocks", The Log
// Analyst 35(3), 38-62; Tiab and Donaldson, Petrophysics, ch. 3). The fit is
// the core transform a petrophysicist applies to log porosity to get a
// core-calibrated permeability curve; R squared and the RMS error in log
// cycles say how far to trust it.

import { familyMember } from '@/components/wells/unitFamilies';

export const CORE_PHI_NAMES = Object.freeze(['CPOR', 'CORE_POR', 'COREPOR', 'PORC', 'CPHI', 'PHI_CORE', 'POR_CORE', 'CPOR_HE', 'CPORH', 'CPORE']);
export const CORE_K_NAMES = Object.freeze(['CKH', 'CPERM', 'KCORE', 'CORE_PERM', 'PERM_CORE', 'KH_CORE', 'CKHA', 'CKHL', 'KAIR', 'CKAIR']);

/** The minimum plugs for a zone fit. */
export const MIN_FIT_POINTS = 3;

const base = (m) => String(m || '').toUpperCase().split(':')[0];

/** The core porosity and permeability curves of a well (first match by name). */
export function findCoreLogs(allLogs = []) {
  const pick = (names) => names.map((n) => allLogs.find((l) => base(l.mnemonic) === n)).find(Boolean) || null;
  return { phi: pick(CORE_PHI_NAMES), k: pick(CORE_K_NAMES) };
}

/**
 * Core plugs on the well's depth grid, in v/v and mD.
 * @param {{depth: ArrayLike<number>, allLogs: Array, logs: Object<string, ArrayLike<number>>}} p
 * @returns {{points: Array<{i: number, depth: number, phi: number, k: number}>, notes: string[], phiLog: ?Object, kLog: ?Object}}
 */
export function corePoints({ depth, allLogs = [], logs = {} }) {
  const { phi: phiLog, k: kLog } = findCoreLogs(allLogs);
  const notes = [];
  if (!phiLog && !kLog) return { points: [], notes: ['No core porosity or permeability curve on this well (import routine core analysis in Well Data Manager).'], phiLog, kLog };
  const n = depth.length;
  const read = (log) => {
    const d = log ? logs[log.mnemonic] : null;
    if (!d) return null;
    if (d.length !== n) { notes.push(`${log.mnemonic} is not on this well's depth grid (${d.length} samples, ${n} expected); merge it into the well in Well Data Manager.`); return null; }
    return d;
  };
  const phiRaw = read(phiLog);
  const kRaw = read(kLog);
  // porosity: percent by the unit table, else by range (a core porosity above 1.5 v/v does not exist)
  let phiScale = 1;
  if (phiRaw) {
    let max = -Infinity;
    for (let i = 0; i < n; i++) if (Number.isFinite(phiRaw[i]) && phiRaw[i] > -999) max = Math.max(max, phiRaw[i]);
    const member = familyMember('NPHI', phiLog.unit);
    if (member?.unit === 'PU') { phiScale = 0.01; notes.push(`${phiLog.mnemonic} is in ${phiLog.unit}: divided by 100 to v/v.`); } else if (max > 1.5) { phiScale = 0.01; notes.push(`${phiLog.mnemonic} values run to ${max.toFixed(1)}, which only percent can mean: divided by 100 to v/v.`); }
  }
  const points = [];
  for (let i = 0; i < n; i++) {
    const p = phiRaw && Number.isFinite(phiRaw[i]) && phiRaw[i] > -999 ? phiRaw[i] * phiScale : NaN;
    const k = kRaw && Number.isFinite(kRaw[i]) && kRaw[i] > -999 ? kRaw[i] : NaN;
    if (Number.isFinite(p) || Number.isFinite(k)) points.push({ i, depth: depth[i], phi: p, k });
  }
  return { points, notes, phiLog, kLog };
}

/**
 * Least squares of log10 k on phi.
 * @param {Array<{phi: number, k: number}>} points plugs with both values (k > 0 used)
 * @returns {{ok: boolean, reason?: string, a?: number, b?: number, r2?: number, rmsLog?: number, n: number, phiMin?: number, phiMax?: number}}
 */
export function fitPoroPerm(points) {
  const use = (points || []).filter((p) => Number.isFinite(p.phi) && Number.isFinite(p.k) && p.k > 0);
  const n = use.length;
  if (n < MIN_FIT_POINTS) return { ok: false, n, reason: `${n} plug${n === 1 ? '' : 's'} with both porosity and a positive permeability; ${MIN_FIT_POINTS} needed` };
  let sx = 0; let sy = 0;
  for (const p of use) { sx += p.phi; sy += Math.log10(p.k); }
  const mx = sx / n; const my = sy / n;
  let sxx = 0; let sxy = 0; let syy = 0;
  for (const p of use) {
    const dx = p.phi - mx; const dy = Math.log10(p.k) - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (!(Math.max(...use.map((p) => p.phi)) - Math.min(...use.map((p) => p.phi)) > 1e-9)) return { ok: false, n, reason: 'every plug has the same porosity; no slope can be fitted' };
  const b = sxy / sxx;
  const a = my - b * mx;
  let sse = 0;
  for (const p of use) { const r = Math.log10(p.k) - (a + b * p.phi); sse += r * r; }
  return {
    ok: true, n, a, b,
    r2: syy > 0 ? 1 - sse / syy : 1,
    rmsLog: Math.sqrt(sse / n),
    phiMin: Math.min(...use.map((p) => p.phi)),
    phiMax: Math.max(...use.map((p) => p.phi)),
  };
}

/** k (mD) from the transform at a porosity. */
export const kFromFit = (fit, phi) => (fit?.ok && Number.isFinite(phi) ? 10 ** (fit.a + fit.b * phi) : NaN);

/**
 * One fit per zone (its own plugs) and one for the whole well.
 * @returns {{well: Object, zones: Object<string, Object>}}
 */
export function zoneFits(points, zones = []) {
  const out = { well: fitPoroPerm(points), zones: {} };
  for (const z of zones) {
    out.zones[z.id] = fitPoroPerm(points.filter((p) => p.depth >= z.top_md_m && p.depth <= z.base_md_m));
  }
  return out;
}

/**
 * The curves for the tracks: core porosity and permeability as points, and
 * K_CORE, the transform applied to PHIE (each zone's own fit inside the zone,
 * the whole-well fit elsewhere; NaN where no fit exists).
 */
export function coreTwins({ depth, points, fits, zones = [], phie }) {
  const n = depth.length;
  const cp = new Float64Array(n).fill(NaN);
  const ck = new Float64Array(n).fill(NaN);
  for (const p of points) { cp[p.i] = p.phi; ck[p.i] = p.k; }
  const out = { CORE_PHI: cp, CORE_K: ck };
  if (phie && fits) {
    const kc = new Float64Array(n).fill(NaN);
    const sorted = [...zones].sort((a, b) => a.top_md_m - b.top_md_m);
    for (let i = 0; i < n; i++) {
      const z = sorted.find((x) => depth[i] >= x.top_md_m && depth[i] <= x.base_md_m);
      const fit = z && fits.zones[z.id]?.ok ? fits.zones[z.id] : fits.well;
      kc[i] = kFromFit(fit, phie[i]);
    }
    out.K_CORE = kc;
  }
  return out;
}

export const CORE_TEMPLATE_ID = 'core-calibration';

/** A user layout with the core plugs on the porosity and permeability tracks and K_CORE beside KPERM; created once, then the user's. */
export function ensureCoreTemplate(layouts, newId) {
  const existing = layouts.templates.find((t) => t.id === CORE_TEMPLATE_ID);
  if (existing) return layouts.activeTemplateId === CORE_TEMPLATE_ID ? layouts : { ...layouts, activeTemplateId: CORE_TEMPLATE_ID };
  const template = {
    id: CORE_TEMPLATE_ID, name: 'Core calibration', builtin: false,
    tracks: [
      { id: newId('trk'), title: 'GR (API)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 150, curves: [{ source: 'input:GR', label: 'GR', color: '#059669' }], fills: [] },
      {
        id: newId('trk'), title: 'Porosity (v/v)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 0.4,
        curves: [
          { source: 'output:PHIE', label: 'φe', color: '#0891b2' },
          { source: 'output:CORE_PHI', label: 'core φ', color: '#b91c1c', style: 'points' },
        ],
        fills: [],
      },
      {
        id: newId('trk'), title: 'k (mD)', type: 'curves', width: 1, scale: 'log', min: 0.01, max: 10000,
        curves: [
          { source: 'output:KPERM', label: 'k log model', color: '#db2777', lineWidth: 0.9 },
          { source: 'output:K_CORE', label: 'k core transform', color: '#7c3aed', style: 'dash' },
          { source: 'output:CORE_K', label: 'core k', color: '#b91c1c', style: 'points' },
        ],
        fills: [],
      },
    ],
  };
  return { ...layouts, templates: [...layouts.templates, template], activeTemplateId: CORE_TEMPLATE_ID };
}
