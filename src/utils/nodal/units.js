/**
 * Unit system registry for the Nodal Analysis Studio (NA1).
 *
 * Same doctrine as src/utils/welltest/units.js: the engine and the persisted
 * project payload are oilfield-units always; the unit system is a display
 * layer concern only. Each kind maps an oilfield quantity to its SI display
 * twin; round trips are identity to machine precision (jest-gated).
 */

const PSI_PER_KPA = 1 / 6.894757293168361;
const FT_PER_M = 1 / 0.3048;
const BBL_PER_M3 = 1 / 0.158987294928;
const MSCF_PER_E3M3 = 35.31466672148859; // Mscf per 10^3 m3
const IN_PER_MM = 1 / 25.4;
const LBFT3_PER_KGM3 = 1 / 16.01846337396014;

// GLR/GOR conversion: scf/STB -> m3/m3 = (scf -> m3) / (STB -> m3)
//   = 0.028316846592 / 0.158987294928 = 0.178107606679035
const M3M3_PER_SCFSTB = 0.028316846592 / 0.158987294928;

const linear = (oil, si, factorFromOil) => ({
  oil,
  si,
  fromOil: (v) => v * factorFromOil,
  toOil: (v) => v / factorFromOil,
});

const identity = (oil, si = oil) => ({
  oil,
  si,
  fromOil: (v) => v,
  toOil: (v) => v,
});

export const UNIT_KINDS = {
  length: linear('ft', 'm', 1 / FT_PER_M),
  diameter: linear('in', 'mm', 1 / IN_PER_MM),
  pressure: linear('psia', 'kPa', 1 / PSI_PER_KPA),
  oilRate: linear('STB/D', 'm3/d', 1 / BBL_PER_M3),
  liquidRate: linear('STB/D', 'm3/d', 1 / BBL_PER_M3),
  gasRate: linear('Mscf/D', '10³m³/d', 1 / MSCF_PER_E3M3),
  gasLiquidRatio: linear('scf/STB', 'm³/m³', M3M3_PER_SCFSTB),
  velocity: linear('ft/s', 'm/s', 1 / FT_PER_M),
  density: linear('lbm/ft³', 'kg/m³', 1 / LBFT3_PER_KGM3),
  gradient: linear('psi/ft', 'kPa/m', (1 / PSI_PER_KPA) * FT_PER_M),
  temperature: {
    oil: 'degF',
    si: 'degC',
    fromOil: (v) => (v - 32) / 1.8,
    toOil: (v) => v * 1.8 + 32,
  },
  productivityIndex: linear('STB/D/psi', 'm³/d/kPa', (1 / BBL_PER_M3) * PSI_PER_KPA),
  viscosity: identity('cp', 'mPa·s'),
  fraction: identity('%'),
  dimensionless: identity(''),
};

export const UNIT_SYSTEMS = ['oilfield', 'si'];

const kindOf = (kind) => UNIT_KINDS[kind] || UNIT_KINDS.dimensionless;

/** Unit label for a kind in the active system. */
export const unitLabel = (kind, system) =>
  kindOf(kind)[system === 'si' ? 'si' : 'oil'];

/** Oilfield value -> display value in the active system. */
export const fromOilfield = (kind, value, system) => {
  if (!Number.isFinite(value)) return value;
  return system === 'si' ? kindOf(kind).fromOil(value) : value;
};

/** Display value in the active system -> oilfield value. */
export const toOilfield = (kind, value, system) => {
  if (!Number.isFinite(value)) return value;
  return system === 'si' ? kindOf(kind).toOil(value) : value;
};

/**
 * Convert an oilfield-units state STRING to the display string for the
 * active system. Non-numeric text passes through so typing stays natural.
 */
export const displayInputString = (kind, oilString, system) => {
  if (system !== 'si' || oilString === '' || oilString == null) return oilString ?? '';
  const v = parseFloat(oilString);
  if (!Number.isFinite(v)) return oilString;
  return String(parseFloat(fromOilfield(kind, v, system).toPrecision(10)));
};

/**
 * Convert a display-units input STRING to the oilfield string that goes to
 * state. Non-numeric text passes through so typing stays natural.
 */
export const storeInputString = (kind, displayString, system) => {
  if (system !== 'si' || displayString === '' || displayString == null) return displayString ?? '';
  const v = parseFloat(displayString);
  if (!Number.isFinite(v)) return displayString;
  return String(parseFloat(toOilfield(kind, v, system).toPrecision(12)));
};
