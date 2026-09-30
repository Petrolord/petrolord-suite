// Suite unit registry (Suite unit profile, owner approved 2026-09-30).
//
// One quantity-family registry for the whole Suite. Every unit converts
// to and from its family's base unit (SI coherent: m, m2, m3, Pa, K, m3/d,
// kg/m3, us/m, m/s, m2, Pa.s, 1/Pa, s, m3/m3). Factors are the exact
// definitions where one exists:
//   international foot     0.3048 m                     (1959 agreement)
//   US survey foot         1200/3937 m                  (NIST SP 811)
//   pound-force per in2    6894.757293168361 Pa         (NIST SP 811, from 0.45359237 kg, 9.80665 m/s2, 0.0254 m)
//   oil barrel             0.158987294928 m3            (42 US gal of 231 in3)
//   cubic foot             0.028316846592 m3            (0.3048^3)
//   acre                   4046.8564224 m2              (43560 ft2, international foot)
//   acre-foot              1233.48183754752 m3          (43560 ft3)
//   pound                  0.45359237 kg                (1959 agreement)
//   darcy                  9.869233e-13 m2              (API RP 40 convention)
//   degF                   (F - 32) x 5/9 + 273.15 K
// Standard conditions (60 degF / 14.696 psia vs 15 degC / 101.325 kPa)
// are NOT converted here: scf and sm3 are treated as plain volumes, which
// is the convention every Suite app already uses. Gauge versus absolute
// pressure is also handled at the doors that know the atmosphere, not here.
//
// The profile is a DISPLAY and INPUT preference only: stored values stay
// in canonical units and only numbers on screen convert. Pure, no I/O.

export const M_PER_FT = 0.3048;
export const M_PER_FTUS = 1200 / 3937;
export const PA_PER_PSI = 6894.757293168361;
export const KPA_PER_PSI = PA_PER_PSI / 1000;
export const M3_PER_BBL = 0.158987294928;
export const M3_PER_FT3 = 0.028316846592;
export const M2_PER_ACRE = 4046.8564224;
export const M3_PER_ACRE_FT = 1233.48183754752;
export const KG_PER_LB = 0.45359237;
export const M2_PER_DARCY = 9.869233e-13;
export const M2_PER_FT2 = M_PER_FT * M_PER_FT;

const lin = (key, factor, label, system, extra = {}) => ({ key, factor, label: label || key, system, ...extra });

/**
 * Families. `units[key].factor` is base units per one of this unit; a unit
 * with `toBase` / `fromBase` functions (temperature) is affine instead.
 * `system` says which preset family the unit belongs to ('metric',
 * 'oilfield' or 'both'); the vocabulary adapter uses it to find the
 * closest unit an app offers.
 */
export const FAMILIES = Object.freeze({
  depth: {
    label: 'Depth and length', base: 'm', canonical: 'm',
    units: [lin('m', 1, 'm', 'metric'), lin('ft', M_PER_FT, 'ft', 'oilfield')],
  },
  xy: {
    label: 'Map coordinates (X, Y)', base: 'm', canonical: 'm',
    note: 'Stored rows carry xy_unit; the project CRS decides the stored unit.',
    units: [lin('m', 1, 'm', 'metric'), lin('ft', M_PER_FT, 'ft', 'oilfield'), lin('ftUS', M_PER_FTUS, 'ftUS (US survey foot)', 'oilfield')],
  },
  area: {
    label: 'Area', base: 'm2', canonical: 'm2',
    units: [
      lin('m2', 1, 'm2', 'metric'), lin('km2', 1e6, 'km2', 'metric'), lin('ha', 1e4, 'ha', 'metric'),
      lin('acre', M2_PER_ACRE, 'acre', 'oilfield'), lin('ft2', M2_PER_FT2, 'ft2', 'oilfield'),
    ],
  },
  rockVolume: {
    label: 'Rock volume', base: 'm3', canonical: 'm3',
    units: [
      lin('m3', 1, 'm3', 'metric'), lin('10^6 m3', 1e6, '10^6 m3', 'metric'),
      lin('acre-ft', M3_PER_ACRE_FT, 'acre-ft', 'oilfield'), lin('bbl', M3_PER_BBL, 'bbl', 'oilfield'), lin('ft3', M3_PER_FT3, 'ft3', 'oilfield'),
    ],
  },
  liquidVolume: {
    label: 'Liquid volume', base: 'm3', canonical: 'm3',
    units: [
      lin('m3', 1, 'm3', 'metric'), lin('bbl', M3_PER_BBL, 'bbl', 'oilfield'),
      lin('STB', M3_PER_BBL, 'STB (stock-tank bbl)', 'oilfield'), lin('10^3 bbl', 1e3 * M3_PER_BBL, '10^3 bbl', 'oilfield'),
    ],
  },
  gasVolume: {
    label: 'Gas volume', base: 'm3', canonical: 'm3',
    units: [
      lin('m3', 1, 'm3', 'metric'), lin('10^3 m3', 1e3, '10^3 m3', 'metric'),
      lin('scf', M3_PER_FT3, 'scf', 'oilfield'), lin('Mscf', 1e3 * M3_PER_FT3, 'Mscf', 'oilfield'),
      lin('MMscf', 1e6 * M3_PER_FT3, 'MMscf', 'oilfield'), lin('Bscf', 1e9 * M3_PER_FT3, 'Bscf', 'oilfield'),
    ],
  },
  pressure: {
    label: 'Pressure', base: 'Pa', canonical: 'kPa',
    note: 'psi is psia or psig by context; gauge and absolute are handled where the atmosphere is known.',
    units: [
      lin('kPa', 1e3, 'kPa', 'metric'), lin('MPa', 1e6, 'MPa', 'metric'), lin('bar', 1e5, 'bar', 'metric'),
      lin('psi', PA_PER_PSI, 'psi (a or g by context)', 'oilfield'),
    ],
  },
  temperature: {
    label: 'Temperature', base: 'K', canonical: 'degC',
    units: [
      { key: 'degC', label: 'degC', system: 'metric', toBase: (v) => v + 273.15, fromBase: (k) => k - 273.15 },
      { key: 'degF', label: 'degF', system: 'oilfield', toBase: (v) => (v - 32) * (5 / 9) + 273.15, fromBase: (k) => (k - 273.15) * 1.8 + 32 },
      { key: 'K', label: 'K', system: 'both', toBase: (v) => v, fromBase: (k) => k },
    ],
  },
  liquidRate: {
    label: 'Liquid rate', base: 'm3/d', canonical: 'm3/d',
    units: [lin('m3/d', 1, 'm3/d', 'metric'), lin('bbl/d', M3_PER_BBL, 'bbl/d', 'oilfield'), lin('STB/d', M3_PER_BBL, 'STB/d', 'oilfield')],
  },
  gasRate: {
    label: 'Gas rate', base: 'm3/d', canonical: 'm3/d',
    units: [
      lin('m3/d', 1, 'm3/d', 'metric'), lin('10^3 m3/d', 1e3, '10^3 m3/d', 'metric'),
      lin('Mscf/d', 1e3 * M3_PER_FT3, 'Mscf/d', 'oilfield'), lin('MMscf/d', 1e6 * M3_PER_FT3, 'MMscf/d', 'oilfield'),
    ],
  },
  fvfOil: {
    label: 'Oil formation volume factor', base: 'm3/m3', canonical: 'm3/m3',
    units: [lin('m3/m3', 1, 'm3/m3', 'metric'), lin('RB/STB', 1, 'RB/STB', 'oilfield')],
  },
  fvfGas: {
    label: 'Gas formation volume factor', base: 'm3/m3', canonical: 'm3/m3',
    units: [
      lin('m3/m3', 1, 'm3/m3', 'metric'), lin('rcf/scf', 1, 'rcf/scf', 'oilfield'),
      lin('RB/Mscf', M3_PER_BBL / (1e3 * M3_PER_FT3), 'RB/Mscf', 'oilfield'),
    ],
  },
  density: {
    label: 'Density', base: 'kg/m3', canonical: 'kg/m3',
    units: [lin('kg/m3', 1, 'kg/m3', 'metric'), lin('g/cc', 1000, 'g/cc', 'both'), lin('lb/ft3', KG_PER_LB / M3_PER_FT3, 'lb/ft3', 'oilfield')],
  },
  sonic: {
    label: 'Sonic slowness', base: 'us/m', canonical: 'us/m',
    units: [lin('us/m', 1, 'us/m', 'metric'), lin('us/ft', 1 / M_PER_FT, 'us/ft', 'oilfield')],
  },
  velocity: {
    label: 'Velocity', base: 'm/s', canonical: 'm/s',
    units: [lin('m/s', 1, 'm/s', 'metric'), lin('ft/s', M_PER_FT, 'ft/s', 'oilfield')],
  },
  permeability: {
    label: 'Permeability', base: 'm2', canonical: 'mD',
    units: [lin('mD', M2_PER_DARCY / 1000, 'mD', 'both'), lin('D', M2_PER_DARCY, 'D', 'both'), lin('m2', 1, 'm2', 'metric')],
  },
  viscosity: {
    label: 'Viscosity', base: 'Pa.s', canonical: 'mPa.s',
    units: [lin('cP', 1e-3, 'cP', 'oilfield'), lin('mPa.s', 1e-3, 'mPa.s', 'metric'), lin('Pa.s', 1, 'Pa.s', 'metric')],
  },
  compressibility: {
    label: 'Compressibility', base: '1/Pa', canonical: '1/kPa',
    units: [lin('1/kPa', 1e-3, '1/kPa', 'metric'), lin('1/psi', 1 / PA_PER_PSI, '1/psi', 'oilfield'), lin('1/bar', 1e-5, '1/bar', 'metric')],
  },
  timeSeismic: {
    label: 'Seismic time', base: 's', canonical: 'ms',
    units: [lin('ms', 1e-3, 'ms', 'both'), lin('s', 1, 's', 'both')],
  },
  gor: {
    label: 'Gas-oil ratio', base: 'm3/m3', canonical: 'm3/m3',
    units: [lin('m3/m3', 1, 'm3/m3', 'metric'), lin('scf/STB', M3_PER_FT3 / M3_PER_BBL, 'scf/STB', 'oilfield')],
  },
});

export const FAMILY_KEYS = Object.freeze(Object.keys(FAMILIES));

/** The unit record, or null when the family or unit is unknown. */
export function unitInfo(family, unit) {
  const fam = FAMILIES[family];
  if (!fam) return null;
  return fam.units.find((u) => u.key === unit) || null;
}

/** Unit keys a family offers. */
export const unitsOf = (family) => (FAMILIES[family] ? FAMILIES[family].units.map((u) => u.key) : []);

export const isKnownUnit = (family, unit) => unitInfo(family, unit) !== null;

function need(family, unit) {
  const u = unitInfo(family, unit);
  if (!u) throw new Error(`Unknown unit "${unit}" for family "${family}".`);
  return u;
}

/** A value in `unit` to the family base unit. */
export function toBase(family, value, unit) {
  const u = need(family, unit);
  if (!Number.isFinite(value)) return NaN;
  return u.toBase ? u.toBase(value) : value * u.factor;
}

/** A base-unit value to `unit`. */
export function fromBase(family, value, unit) {
  const u = need(family, unit);
  if (!Number.isFinite(value)) return NaN;
  return u.fromBase ? u.fromBase(value) : value / u.factor;
}

/**
 * Convert between two units of one family. Same unit returns the value
 * untouched (bit for bit), so a display in the stored unit never drifts.
 */
export function convert(family, value, from, to) {
  if (from === to) { need(family, from); return Number.isFinite(value) ? value : NaN; }
  const a = need(family, from); const b = need(family, to);
  if (!Number.isFinite(value)) return NaN;
  // multiply then divide: m to ft is exactly v / 0.3048, as depthModes does
  if (!a.toBase && !b.toBase) return (value * a.factor) / b.factor;
  return fromBase(family, toBase(family, value, from), to);
}

/** Stored (canonical) value to a display unit. */
export const toDisplay = (family, canonicalValue, unit) => convert(family, canonicalValue, FAMILIES[family]?.canonical, unit);
/** A typed display value to the canonical stored unit. */
export const fromDisplay = (family, displayValue, unit) => convert(family, displayValue, unit, FAMILIES[family]?.canonical);
