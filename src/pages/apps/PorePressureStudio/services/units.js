// Display units for Pore Pressure Studio (PP0, 2026-09-06). The engine,
// the saved project and the published curves stay SI (Pa, metres below
// mudline, us/m, 1/m, kg/m3); these helpers convert at the UI edge.
// Pressure shows as MPa, psi, or as an equivalent mud weight in ppg or
// sg, which needs a depth below a datum (see emwReferenceDepthM). The
// sonic slowness and the compaction constant follow the depth unit;
// density fields follow the pressure unit. Pure, no I/O.

import { PA_PER_PSI, M_PER_FT } from '../engine/constants';

export const UNITS_KEY = 'pp.units';
export const PPG_PER_PSI_FT = 1 / 0.052; // drilling convention: EMW ppg = psi / (0.052 x TVD ft)
export const PPG_PER_SG = 8.345404; // lb/gal of fresh water

export const PRESSURE_UNITS = Object.freeze([
  { key: 'MPa', label: 'MPa', kind: 'pressure' },
  { key: 'psi', label: 'psi', kind: 'pressure' },
  { key: 'ppg', label: 'ppg (EMW)', kind: 'emw' },
  { key: 'sg', label: 'sg (EMW)', kind: 'emw' },
]);
export const DEPTH_UNITS = Object.freeze(['m', 'ft']);
export const DEFAULT_UNITS = Object.freeze({ pressure: 'MPa', depth: 'ft' });

export const isEmw = (unit) => unit === 'ppg' || unit === 'sg';

/** Read the remembered choices; unknown values fall back. */
export function readUnits(storage) {
  try {
    const raw = storage?.getItem(UNITS_KEY);
    const u = raw ? JSON.parse(raw) : {};
    return {
      pressure: PRESSURE_UNITS.some((p) => p.key === u.pressure) ? u.pressure : DEFAULT_UNITS.pressure,
      depth: DEPTH_UNITS.includes(u.depth) ? u.depth : DEFAULT_UNITS.depth,
    };
  } catch { return { ...DEFAULT_UNITS }; }
}

// ---- depth ------------------------------------------------------------------
export const depthToDisplay = (m, unit) => (Number.isFinite(m) ? (unit === 'ft' ? m / M_PER_FT : m) : NaN);
export const depthFromDisplay = (v, unit) => (Number.isFinite(v) ? (unit === 'ft' ? v * M_PER_FT : v) : NaN);
export const depthDigits = (unit) => (unit === 'ft' ? 0 : 1);
export const fmtDepth = (m, unit, digits = depthDigits(unit)) => { const v = depthToDisplay(m, unit); return Number.isFinite(v) ? v.toFixed(digits) : '—'; };
/** At most one decimal, no trailing zero (3500 m, 11482.9 ft). */
export const tidyDepth = (m, unit) => { const v = depthToDisplay(m, unit); return Number.isFinite(v) ? String(Number(v.toFixed(1))) : ''; };

/**
 * Depth below the EMW datum for a depth below mudline: the rotary table
 * when the dock's mudline MD is set, else sea level (the water column).
 */
export function emwReferenceDepthM(zBmlM, params) {
  const offset = params?.mudlineMdM > 0 ? params.mudlineMdM : (params?.waterDepthM || 0);
  return zBmlM + offset;
}
export const emwDatumLabel = (params) => (params?.mudlineMdM > 0 ? 'RKB' : 'sea level');

// ---- pressure ---------------------------------------------------------------
/** EMW in ppg of a pressure at a depth below the datum. */
export function emwPpg(pa, refDepthM) {
  if (!Number.isFinite(pa) || !(refDepthM > 0)) return NaN;
  return (pa / PA_PER_PSI) / (0.052 * (refDepthM / M_PER_FT));
}

/** Pressure Pa -> display value; EMW units need the reference depth. */
export function pressureToDisplay(pa, unit, refDepthM = NaN) {
  if (!Number.isFinite(pa)) return NaN;
  switch (unit) {
    case 'psi': return pa / PA_PER_PSI;
    case 'ppg': return emwPpg(pa, refDepthM);
    case 'sg': return emwPpg(pa, refDepthM) / PPG_PER_SG;
    default: return pa / 1e6;
  }
}
/** Display pressure value -> Pa (EMW units need the reference depth). */
export function pressureFromDisplay(v, unit, refDepthM = NaN) {
  if (!Number.isFinite(v)) return NaN;
  switch (unit) {
    case 'psi': return v * PA_PER_PSI;
    case 'ppg': return refDepthM > 0 ? v * 0.052 * (refDepthM / M_PER_FT) * PA_PER_PSI : NaN;
    case 'sg': return refDepthM > 0 ? v * PPG_PER_SG * 0.052 * (refDepthM / M_PER_FT) * PA_PER_PSI : NaN;
    default: return v * 1e6;
  }
}
export const pressureDigits = (unit) => ({ MPa: 2, psi: 0, ppg: 2, sg: 3 }[unit] ?? 2);
export const fmtPressure = (pa, unit, refDepthM = NaN) => { const v = pressureToDisplay(pa, unit, refDepthM); return Number.isFinite(v) ? v.toFixed(pressureDigits(unit)) : '—'; };
export const pressureLabel = (unit) => (isEmw(unit) ? `EMW (${unit})` : `Pressure (${unit})`);
/** A stress in the dock (Bowers sigma max) shows in MPa or psi only. */
export const stressUnit = (unit) => (unit === 'psi' || unit === 'ppg' ? 'psi' : 'MPa');

// ---- sonic and compaction (follow the depth unit) ---------------------------
export const slownessUnit = (depthUnit) => (depthUnit === 'ft' ? 'us/ft' : 'us/m');
export const slownessToDisplay = (usPerM, depthUnit) => (Number.isFinite(usPerM) ? (depthUnit === 'ft' ? usPerM * M_PER_FT : usPerM) : NaN);
export const slownessFromDisplay = (v, depthUnit) => (Number.isFinite(v) ? (depthUnit === 'ft' ? v / M_PER_FT : v) : NaN);
export const compactionUnit = (depthUnit) => (depthUnit === 'ft' ? '1/ft' : '1/m');
export const compactionToDisplay = (perM, depthUnit) => (Number.isFinite(perM) ? (depthUnit === 'ft' ? perM * M_PER_FT : perM) : NaN);
export const compactionFromDisplay = (v, depthUnit) => (Number.isFinite(v) ? (depthUnit === 'ft' ? v / M_PER_FT : v) : NaN);

// ---- density (follows the pressure unit) -------------------------------------
export const densityUnit = (pressureUnit) => ({ MPa: 'kg/m3', psi: 'ppg', ppg: 'ppg', sg: 'sg' }[pressureUnit] || 'kg/m3');
export const densityToDisplay = (kgM3, pressureUnit) => {
  if (!Number.isFinite(kgM3)) return NaN;
  const u = densityUnit(pressureUnit);
  return u === 'ppg' ? (kgM3 / 1000) * PPG_PER_SG : u === 'sg' ? kgM3 / 1000 : kgM3;
};
export const densityFromDisplay = (v, pressureUnit) => {
  if (!Number.isFinite(v)) return NaN;
  const u = densityUnit(pressureUnit);
  return u === 'ppg' ? (v / PPG_PER_SG) * 1000 : u === 'sg' ? v * 1000 : v;
};
export const densityDigits = (pressureUnit) => (densityUnit(pressureUnit) === 'kg/m3' ? 0 : 3);

/** Number for an editable field: enough decimals, no trailing zeros. */
export const tidy = (v, digits) => (Number.isFinite(v) ? String(Number(v.toFixed(digits))) : '');

// ---- prognosis CSV ----------------------------------------------------------
const csvCell = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

/**
 * The prognosis table in the display units, EMW columns always present,
 * with the method and parameters in a comment header.
 * @param {{zBmlM: number[]}} input
 * @param {{overburdenPa, hydrostaticPa, porePressurePa, fracPressurePa}} result
 * @param {object} params the dock parameters (SI)
 * @param {{pressure: string, depth: string}} units
 * @param {{source?: string}} meta
 */
export function prognosisCsv(input, result, params, units, meta = {}) {
  const pU = units.pressure; const zU = units.depth;
  const datum = emwDatumLabel(params);
  const lines = [
    `# Pore Pressure Studio prognosis, ${new Date().toISOString().slice(0, 10)}`,
    `# source: ${meta.source || 'well'}; method: ${params.method}${params.method === 'eaton' ? ` n=${params.eatonN}` : ` Bowers A=${params.bowers?.A} B=${params.bowers?.B}`}; nu=${params.nu}`,
    `# NCT: dt_ml ${params.nct.dtMlUsPerM} us/m, dt_ma ${params.nct.dtMaUsPerM} us/m, c ${params.nct.cPerM} 1/m; water depth ${params.waterDepthM} m; mudline MD ${params.mudlineMdM || 0} m`,
    `# EMW datum: ${datum} (depth below ${datum} = depth below mudline + ${params.mudlineMdM > 0 ? params.mudlineMdM : params.waterDepthM} m); ppg = psi / (0.052 x TVD ft); sg = ppg / ${PPG_PER_SG}`,
    [
      `Depth bml (${zU})`, `Depth below ${datum} (${zU})`,
      `OBG (${pU})`, `Ph (${pU})`, `PP (${pU})`, `FP (${pU})`,
      'OBG EMW (ppg)', 'PP EMW (ppg)', 'FP EMW (ppg)', 'PP EMW (sg)', 'FP EMW (sg)',
    ].map(csvCell).join(','),
  ];
  const pd = pressureDigits(pU);
  for (let i = 0; i < input.zBmlM.length; i++) {
    const z = input.zBmlM[i];
    const ref = emwReferenceDepthM(z, params);
    const cols = [
      tidy(depthToDisplay(z, zU), 2), tidy(depthToDisplay(ref, zU), 2),
      ...[result.overburdenPa[i], result.hydrostaticPa[i], result.porePressurePa[i], result.fracPressurePa[i]]
        .map((pa) => { const v = pressureToDisplay(pa, pU, ref); return Number.isFinite(v) ? v.toFixed(pd) : ''; }),
      ...[result.overburdenPa[i], result.porePressurePa[i], result.fracPressurePa[i]]
        .map((pa) => { const v = emwPpg(pa, ref); return Number.isFinite(v) ? v.toFixed(2) : ''; }),
      ...[result.porePressurePa[i], result.fracPressurePa[i]]
        .map((pa) => { const v = emwPpg(pa, ref) / PPG_PER_SG; return Number.isFinite(v) ? v.toFixed(3) : ''; }),
    ];
    lines.push(cols.join(','));
  }
  return `${lines.join('\n')}\n`;
}
