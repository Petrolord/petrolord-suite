// Material Balance Studio on the Suite unit profile (MBAL-U1, PL3).
//
// State never changes unit: the rb_* columns, the engine and every stored
// result are in oilfield units (psia, degF, STB, scf, reservoir bbl, RB/STB,
// RB/Mscf, scf/STB, 1/psi, ft). What changes is the unit a value is SHOWN
// in and TYPED in. A value is converted at the door (typed or imported to
// the engine unit) and at the display (engine unit to the view unit), with
// the factors of the Suite registry (src/lib/units/registry.js) and no
// factor of its own.
//
// Bases are part of the label, because the same number of "barrels" means
// two things in this app: STB (stock tank) against RB (reservoir), sm3
// against rm3, and psia (absolute) for every pressure.
//
// Pure: no React. The studio context holds the hook (useAppUnits).
import { convert } from '@/lib/units/registry';

/** The key of this app's view override (useAppUnits, e2e/helpers/unitView.js). */
export const MBAL_UNIT_APP = 'material-balance';

/** What the unit control offers, each tied to its registry family. */
export const MBAL_UNIT_SPEC = Object.freeze({
  pressure: { family: 'pressure', allowed: ['psi', 'kPa', 'bar', 'MPa'] },
  temperature: { family: 'temperature', allowed: ['degF', 'degC'] },
  liquid: { family: 'liquidVolume', allowed: ['STB', 'm3'] },
  gas: { family: 'gasVolume', allowed: ['scf', 'm3'] },
  depth: { family: 'depth', allowed: ['ft', 'm'] },
  compressibility: { family: 'compressibility', allowed: ['1/psi', '1/kPa', '1/bar'] },
  viscosity: { family: 'viscosity', allowed: ['cP', 'mPa.s'] },
  area: { family: 'area', allowed: ['acre', 'km2', 'ha'] },
});

/** The units the engine and the database hold: the view without a profile. */
export const MBAL_OILFIELD_VIEW = Object.freeze({
  pressure: 'psi', temperature: 'degF', liquid: 'STB', gas: 'scf', depth: 'ft', compressibility: '1/psi', viscosity: 'cP', area: 'acre',
});
export const MBAL_METRIC_VIEW = Object.freeze({
  pressure: 'kPa', temperature: 'degC', liquid: 'm3', gas: 'm3', depth: 'm', compressibility: '1/kPa', viscosity: 'mPa.s', area: 'km2',
});

const metricLiquid = (c) => c.liquid === 'm3';
const metricGas = (c) => c.gas === 'm3';

// One entry per quantity the app shows: the registry family, the unit the
// engine holds it in, and the unit the view shows it in.
const QUANTITIES = Object.freeze({
  pressure: { family: 'pressure', engine: 'psi', view: (c) => c.pressure },
  // a pressure difference: the same scale, never "absolute"
  dp: { family: 'pressure', engine: 'psi', view: (c) => c.pressure },
  temperature: { family: 'temperature', engine: 'degF', view: (c) => c.temperature },
  // stock-tank liquid (oil in place, produced oil and water)
  stockVolume: { family: 'liquidVolume', engine: 'STB', view: (c) => (metricLiquid(c) ? 'm3' : 'STB') },
  // reservoir volume (withdrawal F, influx We, aquifer water in place W)
  resVolume: { family: 'liquidVolume', engine: 'RB', view: (c) => (metricLiquid(c) ? 'm3' : 'RB') },
  // in-place volumes as people state them: millions of stock-tank volume, billions of gas
  stockVolumeMM: { family: 'liquidVolume', engine: 'STB', view: (c) => (metricLiquid(c) ? '10^6 m3' : 'MMSTB') },
  gasVolumeB: { family: 'gasVolume', engine: 'scf', view: (c) => (metricGas(c) ? '10^9 m3' : 'Bscf') },
  // the same, typed in millions (the aquifer water in place)
  resVolumeMM: { family: 'liquidVolume', engine: 'RB', view: (c) => (metricLiquid(c) ? '10^6 m3' : 'MMRB') },
  gasVolume: { family: 'gasVolume', engine: 'scf', view: (c) => (metricGas(c) ? 'm3' : 'scf') },
  fvfOil: { family: 'fvfOil', engine: 'RB/STB', view: (c) => (metricLiquid(c) ? 'm3/m3' : 'RB/STB') },
  // Bg as the Data and PVT tabs hold it
  fvfGas: { family: 'fvfGas', engine: 'RB/Mscf', view: (c) => (metricGas(c) ? 'm3/m3' : 'RB/Mscf') },
  // the gas expansion terms Eg, Efw and Et of a gas case are per scf
  expansionGas: { family: 'fvfGas', engine: 'RB/scf', view: (c) => (metricGas(c) ? 'm3/m3' : 'RB/scf') },
  gor: { family: 'gor', engine: 'scf/STB', view: (c) => (metricLiquid(c) || metricGas(c) ? 'm3/m3' : 'scf/STB') },
  resRate: { family: 'liquidRate', engine: 'RB/d', view: (c) => (metricLiquid(c) ? 'm3/d' : 'RB/d') },
  oilRate: { family: 'liquidRate', engine: 'STB/d', view: (c) => (metricLiquid(c) ? 'm3/d' : 'STB/d') },
  gasRate: { family: 'gasRate', engine: 'scf/d', view: (c) => (metricGas(c) ? 'm3/d' : 'scf/d') },
  gasRateK: { family: 'gasRate', engine: 'scf/d', view: (c) => (metricGas(c) ? '10^3 m3/d' : 'Mscf/d') },
  compressibility: { family: 'compressibility', engine: '1/psi', view: (c) => c.compressibility },
  depth: { family: 'depth', engine: 'ft', view: (c) => c.depth },
  viscosity: { family: 'viscosity', engine: 'cP', view: (c) => c.viscosity },
  permeability: { family: 'permeability', engine: 'mD', view: () => 'mD' },
  area: { family: 'area', engine: 'acre', view: (c) => c.area },
  aquiferIndex: {
    family: 'productivityIndex', engine: 'RB/d/psi',
    view: (c) => (metricLiquid(c) ? (c.pressure === 'bar' ? 'm3/d/bar' : 'm3/d/kPa') : 'RB/d/psi'),
  },
});

// What is printed for a unit. The basis goes in the label: psia, STB against
// RB, sm3 against rm3.
const LABELS = Object.freeze({
  pressure: { psi: 'psia', kPa: 'kPa abs', bar: 'bara', MPa: 'MPa abs' },
  dp: { psi: 'psi', kPa: 'kPa', bar: 'bar', MPa: 'MPa' },
  temperature: { degF: 'degF', degC: 'degC' },
  stockVolume: { STB: 'STB', MSTB: 'MSTB', MMSTB: 'MMSTB', m3: 'sm3', '10^3 m3': '10^3 sm3', '10^6 m3': '10^6 sm3' },
  resVolume: { RB: 'RB', MRB: 'MRB', MMRB: 'MMRB', m3: 'rm3', '10^3 m3': '10^3 rm3', '10^6 m3': '10^6 rm3' },
  resVolumeMM: { MMRB: 'MMRB', '10^6 m3': '10^6 rm3' },
  stockVolumeMM: { MMSTB: 'MMSTB', '10^6 m3': '10^6 sm3' },
  gasVolumeB: { Bscf: 'Bscf', '10^9 m3': '10^9 sm3' },
  gasVolume: { scf: 'scf', Mscf: 'Mscf', MMscf: 'MMscf', Bscf: 'Bscf', m3: 'sm3', '10^3 m3': '10^3 sm3', '10^6 m3': '10^6 sm3', '10^9 m3': '10^9 sm3' },
  fvfOil: { 'RB/STB': 'RB/STB', 'm3/m3': 'rm3/sm3' },
  fvfGas: { 'RB/Mscf': 'RB/Mscf', 'm3/m3': 'rm3/sm3' },
  expansionGas: { 'RB/scf': 'RB/scf', 'm3/m3': 'rm3/sm3' },
  gor: { 'scf/STB': 'scf/STB', 'm3/m3': 'sm3/sm3' },
  resRate: { 'RB/d': 'RB/d', 'm3/d': 'rm3/d' },
  oilRate: { 'STB/d': 'STB/d', 'm3/d': 'sm3/d' },
  gasRate: { 'scf/d': 'scf/d', 'm3/d': 'sm3/d' },
  gasRateK: { 'Mscf/d': 'Mscf/d', '10^3 m3/d': '10^3 sm3/d' },
  aquiferIndex: { 'RB/d/psi': 'RB/d/psi', 'm3/d/kPa': 'rm3/d/kPa', 'm3/d/bar': 'rm3/d/bar' },
});

// Multiples a volume may be printed in, smallest first.
const LADDERS = Object.freeze({
  STB: ['STB', 'MSTB', 'MMSTB'],
  RB: ['RB', 'MRB', 'MMRB'],
  scf: ['scf', 'Mscf', 'MMscf', 'Bscf'],
});
const METRIC_LADDER = Object.freeze({ liquidVolume: ['m3', '10^3 m3', '10^6 m3'], gasVolume: ['m3', '10^3 m3', '10^6 m3', '10^9 m3'] });

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * The unit view of the app.
 * @param {Object<string, string>} [choice] the units of useAppUnits (MBAL_UNIT_SPEC keys);
 *   anything missing is the engine's own unit
 */
export function createMbalUnits(choice = {}) {
  const c = { ...MBAL_OILFIELD_VIEW };
  for (const key of Object.keys(MBAL_UNIT_SPEC)) {
    if (MBAL_UNIT_SPEC[key].allowed.includes(choice?.[key])) c[key] = choice[key];
  }
  const q = (name) => {
    const def = QUANTITIES[name];
    if (!def) throw new Error(`Material Balance units: unknown quantity "${name}".`);
    return def;
  };
  const unit = (name) => q(name).view(c);
  const labelOf = (name, u) => LABELS[name]?.[u] ?? u;
  const label = (name) => labelOf(name, unit(name));
  const to = (name, value) => (finite(value) ? convert(q(name).family, value, q(name).engine, unit(name)) : null);
  const from = (name, value) => (finite(value) ? convert(q(name).family, value, unit(name), q(name).engine) : null);

  /**
   * A volume column in the multiple that suits its size: the largest
   * multiple that keeps the biggest value at 1 or above.
   * @returns {{unit: string, label: string, to: function(number): ?number}}
   */
  const scaled = (name, maxAbsEngine) => {
    const def = q(name);
    const base = unit(name);
    const ladder = LADDERS[base] || (base === 'm3' ? METRIC_LADDER[def.family] : null) || [base];
    const size = finite(maxAbsEngine) ? Math.abs(convert(def.family, maxAbsEngine, def.engine, base)) : 0;
    let pick = ladder[0];
    for (const u of ladder) if (Math.abs(convert(def.family, 1, u, base)) <= size) pick = u;
    return {
      unit: pick,
      label: labelOf(name, pick),
      to: (value) => (finite(value) ? convert(def.family, value, def.engine, pick) : null),
    };
  };

  const metric = Object.keys(MBAL_UNIT_SPEC).filter((k) => c[k] !== MBAL_OILFIELD_VIEW[k]).length;
  const system = metric === 0 ? 'oilfield' : (Object.keys(MBAL_UNIT_SPEC).every((k) => c[k] !== MBAL_OILFIELD_VIEW[k]) ? 'metric' : 'mixed');
  const SYSTEM_WORDS = { oilfield: 'Oilfield', metric: 'SI / metric', mixed: 'Mixed' };

  return {
    choice: c,
    /** 'oilfield', 'metric' or 'mixed'. */
    system,
    /** The registry unit a quantity is shown in. */
    unit,
    /** The printed unit, with its basis: psia, STB, RB, sm3, rm3. */
    label,
    /** Engine value to the view unit; null for a missing value. */
    to,
    /** A typed or imported value in the view unit to the engine unit. */
    from,
    scaled,
    /** "Initial pressure (psia)": a field label or a column head. */
    head: (text, name) => `${text} (${label(name)})`,
    /** The header line of a report: the system word and the units in use. */
    displayUnits: () => `${SYSTEM_WORDS[system]} (${[...new Set([
      label('pressure'), label('temperature'), label('stockVolume'), label('resVolume'), label('gasVolume'), label('depth'),
    ])].join(', ')})`,
  };
}

/** The view with nothing chosen: what a test or a stored result is in. */
export const OILFIELD_UNITS = createMbalUnits(MBAL_OILFIELD_VIEW);
