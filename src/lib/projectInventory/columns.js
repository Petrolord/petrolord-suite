// Project Data Inventory: the well matrix columns and the curve families
// behind them (owner request 2026-10-11, QI Studio and Petrophysics Studio).
//
// The mnemonic tables are the Suite's own, reused rather than restated:
//   - the shared alias table of Petrophysics Studio, Well Correlation and
//     Well Data Manager (components/wells/curveMap: GR, RHOB, NPHI, DT, RT,
//     CAL, DRHO, PEF) with its LAS-description hints;
//   - QI Studio's usability families (shear, porosity, shale volume, water
//     saturation), the lists Rock Physics Studio reads;
//   - Petrophysics Studio's core plug names (services/coreData).
// The Suite has no table yet for SP, shallow or flushed-zone resistivity,
// bit size or log permeability, so those four short lists live here, and
// a curve takes the first family that claims it (the deep list first, so
// RXO_D stays deep). Pure.

import { CURVE_ALIASES, DESCRIPTION_HINTS } from '@/components/wells/curveMap';
import { FAMILIES as QI_FAMILIES } from '@/pages/apps/QIStudio/services/usability';
import { CORE_PHI_NAMES, CORE_K_NAMES } from '@/pages/apps/PetrophysicsStudio/services/coreData';

const SP = ['SP', 'SPC', 'SSP', 'SP_C', 'SPBL', 'SPR', 'SPCG'];
const SHALLOW = [
  'RXO', 'RXOZ', 'RXO8', 'RXO_HR', 'MSFL', 'MCFL', 'MLL', 'RMLL', 'SFL', 'SFLU', 'SFLA', 'LLS', 'RLLS', 'HLLS',
  'ILM', 'RILM', 'RLA1', 'RLA2', 'AT10', 'AT20', 'AF10', 'AF20', 'AHT10', 'AHT20', 'RS', 'RSHAL', 'RES_SHAL',
  'RESS', 'RES_SHALLOW', 'RM', 'RMED', 'RES_MED',
];
const BIT = ['BS', 'BIT', 'BITSIZE', 'BIT_SIZE', 'BSZ', 'BITS'];
const PERM = ['KPERM', 'PERM', 'KLOG', 'PERM_LOG', 'KTIM', 'KINT', 'K_TIMUR', 'KCOATES', 'PERMEABILITY'];

/**
 * Curve families, in claiming order. `hint` is the LAS-description pattern
 * for a curve no alias names (a weaker identification, said so in the cell).
 */
export const CURVE_FAMILIES = Object.freeze([
  { key: 'dept', label: 'Depth index', aliases: CURVE_ALIASES.DEPT },
  { key: 'gr', label: 'Gamma ray', aliases: CURVE_ALIASES.GR, hint: DESCRIPTION_HINTS.GR },
  { key: 'sp', label: 'Spontaneous potential', aliases: SP, hint: /SPONTANEOUS/i },
  { key: 'pef', label: 'Photoelectric factor', aliases: CURVE_ALIASES.PEF, hint: DESCRIPTION_HINTS.PEF },
  { key: 'rdeep', label: 'Deep resistivity', aliases: CURVE_ALIASES.RT, hint: /DEEP\s*(RES|INDUCTION|LATEROLOG)/i },
  { key: 'rshallow', label: 'Shallow resistivity', aliases: SHALLOW, hint: /SHALLOW|FLUSHED|MICRO\s*(SPHERICAL|LATEROLOG)|RXO/i },
  { key: 'nphi', label: 'Neutron porosity', aliases: CURVE_ALIASES.NPHI, hint: DESCRIPTION_HINTS.NPHI },
  { key: 'rhob', label: 'Bulk density', aliases: CURVE_ALIASES.RHOB, hint: DESCRIPTION_HINTS.RHOB },
  { key: 'dts', label: 'Shear slowness', aliases: QI_FAMILIES.shear.aliases, hint: /SHEAR/i },
  { key: 'dtc', label: 'Compressional slowness', aliases: CURVE_ALIASES.DT, hint: DESCRIPTION_HINTS.DT },
  { key: 'cal', label: 'Caliper', aliases: CURVE_ALIASES.CAL, hint: DESCRIPTION_HINTS.CAL },
  { key: 'drho', label: 'Density correction', aliases: CURVE_ALIASES.DRHO, hint: DESCRIPTION_HINTS.DRHO },
  { key: 'bs', label: 'Bit size', aliases: BIT, hint: /BIT\s*SIZE/i },
  { key: 'vsh', label: 'Shale volume', aliases: QI_FAMILIES.vsh.aliases },
  { key: 'phi', label: 'Porosity (interpreted)', aliases: QI_FAMILIES.porosity.aliases },
  { key: 'sw', label: 'Water saturation', aliases: QI_FAMILIES.sw.aliases },
  { key: 'perm', label: 'Permeability (log)', aliases: PERM },
  { key: 'corePhi', label: 'Core porosity', aliases: CORE_PHI_NAMES },
  { key: 'coreK', label: 'Core permeability', aliases: CORE_K_NAMES },
]);
export const FAMILY_BY_KEY = Object.freeze(Object.fromEntries(CURVE_FAMILIES.map((f) => [f.key, f])));

// The suffixes the Suite's own tools write: Well Data Manager edits (splice,
// edit, drift correction, depth shift), the Digitizer, Petrophysics
// conditioning, and Rock Physics Studio's estimated curves.
const SUFFIX = /_(SPL|ED|DC|DS|DIG|CND|EST)$/;
const SUFFIX_KIND = {
  SPL: 'spliced', ED: 'edited', DC: 'drift-corrected', DS: 'depth-shifted', DIG: 'digitized', CND: 'conditioned', EST: 'estimated',
};

/** A mnemonic without its ':n' duplicate tag and the Suite's edit suffix. */
export function baseMnemonic(mnemonic) {
  return String(mnemonic || '').trim().toUpperCase().split(':')[0].replace(SUFFIX, '');
}

/** The edit the Suite applied to a curve, from its suffix, or null. */
export function editOf(mnemonic) {
  const m = String(mnemonic || '').trim().toUpperCase().split(':')[0].match(SUFFIX);
  return m ? SUFFIX_KIND[m[1]] : null;
}

/**
 * The family of one log row: { key, by: 'alias' | 'description' } or null.
 * The alias tables win; a description match only applies to a curve no
 * alias names at all.
 */
export function familyOfLog(log) {
  const b = baseMnemonic(log?.mnemonic);
  for (const f of CURVE_FAMILIES) if (f.aliases.includes(b)) return { key: f.key, by: 'alias' };
  const d = String(log?.description || '');
  if (d) for (const f of CURVE_FAMILIES) if (f.hint && f.hint.test(d)) return { key: f.key, by: 'description' };
  return null;
}

/**
 * Whether a curve is an estimate or a computed product rather than a
 * measurement, and how, in words (null when it is measured). Read from the
 * provenance the Suite's tools write: Petrophysics Studio and Rock Physics
 * Studio publish with computed: true, Rock Physics Studio records an
 * estimated sonic or shear, the Digitizer marks its curves.
 */
export function derivationOf(log) {
  const p = log?.provenance || {};
  const edit = editOf(log?.mnemonic);
  if (edit === 'estimated') return p.vs_method ? `estimated (${p.vs_method.replace(/-/g, ' ')})` : 'estimated';
  if (edit === 'digitized' || p.digitized) return 'digitized from a raster log';
  const fam = familyOfLog(log)?.key;
  if (fam === 'dts' && p.vs_source === 'estimated') return `estimated (${String(p.vs_method || 'greenberg-castagna').replace(/-/g, ' ')})`;
  if (fam === 'dtc' && p.vp_source === 'estimated') return `estimated (${String(p.vp_method || 'pseudo-sonic').replace(/-/g, ' ')})`;
  if (p.computed) return `computed by ${String(p.engine || 'a Suite app').replace(/-/g, ' ')}`;
  if (/GREENBERG|CASTAGNA|XU.?WHITE|PSEUDO|ESTIMATED|SYNTHETIC/i.test(String(log?.description || ''))) return 'estimated (from its description)';
  return null;
}

// --- the matrix columns -----------------------------------------------------
// source: 'curve' reads a curve family; 'well' reads the well row; 'manual'
// is set by the user (Petrolord holds no record of it). kind: 'measured'
// columns treat a computed curve as derived; 'interpreted' columns expect one.

export const COLUMN_GROUPS = Object.freeze([
  {
    key: 'position', label: 'Position', columns: [
      { key: 'datum', label: 'Datum', title: 'Depth reference (KB or DF elevation): TVDSS is known', source: 'well' },
      { key: 'survey', label: 'Survey', title: 'Deviation survey to TD', source: 'well' },
    ],
  },
  {
    key: 'time', label: 'Tops and time', columns: [
      { key: 'tops', label: 'Tops', title: 'Formation tops and the interval of interest', source: 'well' },
      { key: 'checkshots', label: 'Check-shot', title: 'Checkshot or VSP time-depth pairs over the interval', source: 'well' },
      { key: 'tie', label: 'Tie', title: 'Well-to-seismic tie committed in Seismolord, with its wavelet', source: 'well' },
    ],
  },
  {
    key: 'hole', label: 'Borehole', columns: [
      { key: 'cal', label: 'Caliper', title: 'Caliper log', source: 'curve', family: 'cal', kind: 'measured' },
      { key: 'hole', label: 'Hole', title: 'Hole condition over the interval: washouts from the caliper against the bit size, and density correction above 0.15 g/cc', source: 'quality' },
    ],
  },
  {
    key: 'lith', label: 'Lithology', columns: [
      { key: 'gr', label: 'GR', title: 'Gamma ray', source: 'curve', family: 'gr', kind: 'measured' },
      { key: 'sp', label: 'SP', title: 'Spontaneous potential', source: 'curve', family: 'sp', kind: 'measured', optional: true },
      { key: 'pef', label: 'PEF', title: 'Photoelectric factor', source: 'curve', family: 'pef', kind: 'measured', optional: true },
    ],
  },
  {
    key: 'res', label: 'Resistivity', columns: [
      { key: 'rdeep', label: 'Rt', title: 'Deep resistivity (Rt)', source: 'curve', family: 'rdeep', kind: 'measured' },
      { key: 'rshallow', label: 'Rxo', title: 'Shallow or flushed-zone resistivity (Rxo)', source: 'curve', family: 'rshallow', kind: 'measured', optional: true },
    ],
  },
  {
    key: 'poro', label: 'Porosity and acoustics', columns: [
      { key: 'nphi', label: 'NPHI', title: 'Neutron porosity', source: 'curve', family: 'nphi', kind: 'measured' },
      { key: 'rhob', label: 'RHOB', title: 'Bulk density', source: 'curve', family: 'rhob', kind: 'measured' },
      { key: 'dtc', label: 'DTC', title: 'Compressional sonic', source: 'curve', family: 'dtc', kind: 'measured' },
      { key: 'dts', label: 'DTS', title: 'Shear sonic (dipole)', source: 'curve', family: 'dts', kind: 'measured' },
    ],
  },
  {
    key: 'interp', label: 'Interpretation', columns: [
      { key: 'vsh', label: 'Vsh', title: 'Shale volume (interpreted)', source: 'curve', family: 'vsh', kind: 'interpreted' },
      { key: 'phi', label: 'PHIE', title: 'Porosity (interpreted)', source: 'curve', family: 'phi', kind: 'interpreted' },
      { key: 'sw', label: 'Sw', title: 'Water saturation (interpreted)', source: 'curve', family: 'sw', kind: 'interpreted' },
      { key: 'perm', label: 'Perm', title: 'Permeability (log-derived)', source: 'curve', family: 'perm', kind: 'interpreted', optional: true },
    ],
  },
  {
    key: 'core', label: 'Core', columns: [
      { key: 'plugs', label: 'Plugs', title: 'Routine core analysis plugs (core porosity or permeability curves)', source: 'curve', family: 'corePhi', alt: 'coreK', kind: 'measured', sparse: true, optional: true },
      { key: 'swc', label: 'SWC', title: 'Sidewall cores', source: 'manual', optional: true },
      { key: 'wholecore', label: 'Core', title: 'Conventional (whole) core', source: 'manual', optional: true },
    ],
  },
  {
    key: 'press', label: 'Pressure and fluids', columns: [
      { key: 'pressure', label: 'Press.', title: 'Formation pressure tests (RFT, MDT, XPT)', source: 'manual', optional: true },
      { key: 'samples', label: 'Fluids', title: 'Downhole fluid samples and PVT', source: 'manual', optional: true },
    ],
  },
  {
    key: 'prod', label: 'Production', columns: [
      { key: 'plt', label: 'PLT', title: 'Production logs (PLT, PNL, carbon-oxygen)', source: 'manual', optional: true },
    ],
  },
]);

export const COLUMNS = Object.freeze(COLUMN_GROUPS.flatMap((g) => g.columns.map((c) => ({ ...c, group: g.key, groupLabel: g.label }))));
export const COLUMN_BY_KEY = Object.freeze(Object.fromEntries(COLUMNS.map((c) => [c.key, c])));

/** Group the log rows of one well by family (DEPT and unknown curves dropped). */
export function logsByFamily(logs = []) {
  const out = {};
  for (const l of logs) {
    const f = familyOfLog(l);
    if (!f || f.key === 'dept') continue;
    (out[f.key] ||= []).push({ ...l, _by: f.by });
  }
  return out;
}
