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
//   inch                   0.0254 m                     (1959 agreement)
//   dyne                   1e-5 N, so dyne/cm = mN/m    (CGS definition)
//   year                   365.25 d (Julian year)       (IAU; SPE Metric Standard: 3.155 76 E+07 s)
//   month                  1/12 of that year = 30.4375 d
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
export const M_PER_IN = 0.0254;
export const DAYS_PER_YEAR = 365.25;
export const DAYS_PER_MONTH = DAYS_PER_YEAR / 12;

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
      // Reservoir round: the multiples the Reservoir apps print, and the reservoir barrel
      lin('MSTB', 1e3 * M3_PER_BBL, 'MSTB (10^3 STB)', 'oilfield'), lin('MMSTB', 1e6 * M3_PER_BBL, 'MMSTB (10^6 STB)', 'oilfield'),
      lin('MMbbl', 1e6 * M3_PER_BBL, 'MMbbl (10^6 bbl)', 'oilfield'), lin('RB', M3_PER_BBL, 'RB (reservoir bbl)', 'oilfield'),
      lin('10^6 m3', 1e6, '10^6 m3', 'metric'),
      // Material Balance round: reservoir volumes (F, We, aquifer water in place) print in thousands and millions
      lin('MRB', 1e3 * M3_PER_BBL, 'MRB (10^3 reservoir bbl)', 'oilfield'), lin('MMRB', 1e6 * M3_PER_BBL, 'MMRB (10^6 reservoir bbl)', 'oilfield'),
      lin('10^3 m3', 1e3, '10^3 m3', 'metric'),
    ],
  },
  gasVolume: {
    label: 'Gas volume', base: 'm3', canonical: 'm3',
    units: [
      lin('m3', 1, 'm3', 'metric'), lin('10^3 m3', 1e3, '10^3 m3', 'metric'),
      lin('scf', M3_PER_FT3, 'scf', 'oilfield'), lin('Mscf', 1e3 * M3_PER_FT3, 'Mscf', 'oilfield'),
      lin('MMscf', 1e6 * M3_PER_FT3, 'MMscf', 'oilfield'), lin('Bscf', 1e9 * M3_PER_FT3, 'Bscf', 'oilfield'),
      lin('10^6 m3', 1e6, '10^6 m3', 'metric'), lin('10^9 m3', 1e9, '10^9 m3', 'metric'),
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
    units: [
      lin('m3/d', 1, 'm3/d', 'metric'), lin('bbl/d', M3_PER_BBL, 'bbl/d', 'oilfield'), lin('STB/d', M3_PER_BBL, 'STB/d', 'oilfield'),
      lin('RB/d', M3_PER_BBL, 'RB/d (reservoir bbl)', 'oilfield'),
    ],
  },
  gasRate: {
    label: 'Gas rate', base: 'm3/d', canonical: 'm3/d',
    units: [
      lin('m3/d', 1, 'm3/d', 'metric'), lin('10^3 m3/d', 1e3, '10^3 m3/d', 'metric'),
      lin('Mscf/d', 1e3 * M3_PER_FT3, 'Mscf/d', 'oilfield'), lin('MMscf/d', 1e6 * M3_PER_FT3, 'MMscf/d', 'oilfield'),
      lin('scf/d', M3_PER_FT3, 'scf/d', 'oilfield'),
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
      // 1000 times RB/Mscf: Fluid Systems prints rb/scf on screen and RB/Mscf in one CSV
      lin('RB/scf', M3_PER_BBL / M3_PER_FT3, 'RB/scf', 'oilfield'),
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
    units: [
      lin('m3/m3', 1, 'm3/m3', 'metric'), lin('scf/STB', M3_PER_FT3 / M3_PER_BBL, 'scf/STB', 'oilfield'),
      lin('Mscf/STB', (1e3 * M3_PER_FT3) / M3_PER_BBL, 'Mscf/STB', 'oilfield'),
    ],
  },
  // ---- Reservoir round (Step 0a, 2026-10-02) --------------------------------
  declineRate: {
    label: 'Decline rate', base: '1/d', canonical: '1/yr',
    note: 'The time basis only. Nominal or effective is a label the app supplies; converting between the two uses De = 1 - exp(-Dn) (see decline.js). A year is 365.25 days here.',
    units: [
      lin('1/d', 1, '1/day', 'both'), lin('1/month', 1 / DAYS_PER_MONTH, '1/month', 'both'),
      lin('1/yr', 1 / DAYS_PER_YEAR, '1/year', 'both'), lin('%/yr', 0.01 / DAYS_PER_YEAR, '% per year', 'both'),
    ],
  },
  productivityIndex: {
    label: 'Productivity and injectivity index (liquid)', base: 'm3/d/Pa', canonical: 'm3/d/kPa',
    note: 'One family for a producer and an injector. RB/d/psi is the reservoir-volume form an aquifer index uses.',
    units: [
      lin('m3/d/kPa', 1e-3, 'sm3/d/kPa', 'metric'), lin('m3/d/bar', 1e-5, 'sm3/d/bar', 'metric'),
      lin('STB/d/psi', M3_PER_BBL / PA_PER_PSI, 'STB/d/psi', 'oilfield'), lin('RB/d/psi', M3_PER_BBL / PA_PER_PSI, 'RB/d/psi', 'oilfield'),
    ],
  },
  pseudoPressure: {
    label: 'Gas pseudo-pressure', base: 'Pa/s', canonical: 'kPa2/mPa.s',
    units: [lin('kPa2/mPa.s', 1e6 / 1e-3, 'kPa2/mPa.s', 'metric'), lin('psi2/cP', (PA_PER_PSI * PA_PER_PSI) / 1e-3, 'psi2/cP', 'oilfield')],
  },
  gasProductivityIndex: {
    label: 'Gas productivity index (pseudo-pressure basis)', base: 'm3/d per Pa/s', canonical: '10^3 m3/d/(kPa2/mPa.s)',
    note: 'Rate per unit of pseudo-pressure drawdown, as Well Test rate-transient analysis prints it.',
    units: [
      lin('10^3 m3/d/(kPa2/mPa.s)', 1e3 / (1e6 / 1e-3), '10^3 m3/d per kPa2/mPa.s', 'metric'),
      lin('Mscf/d/(psi2/cP)', (1e3 * M3_PER_FT3) / ((PA_PER_PSI * PA_PER_PSI) / 1e-3), 'Mscf/d per psi2/cP', 'oilfield'),
    ],
  },
  capillaryPressure: {
    label: 'Capillary pressure', base: 'Pa', canonical: 'kPa',
    note: 'A pressure difference: never gauge or absolute.',
    units: [lin('kPa', 1e3, 'kPa', 'metric'), lin('bar', 1e5, 'bar', 'metric'), lin('psi', PA_PER_PSI, 'psi', 'oilfield')],
  },
  interfacialTension: {
    label: 'Interfacial tension', base: 'N/m', canonical: 'mN/m',
    units: [lin('mN/m', 1e-3, 'mN/m', 'metric'), lin('dyne/cm', 1e-5 / 1e-2, 'dyne/cm', 'oilfield')],
  },
  wellboreStorage: {
    label: 'Wellbore storage coefficient', base: 'm3/Pa', canonical: 'm3/kPa',
    units: [lin('m3/kPa', 1e-3, 'm3/kPa', 'metric'), lin('bbl/psi', M3_PER_BBL / PA_PER_PSI, 'bbl/psi', 'oilfield')],
  },
  flowCapacity: {
    label: 'Flow capacity (kh)', base: 'm3', canonical: 'mD.m',
    units: [lin('mD.m', M2_PER_DARCY / 1000, 'mD.m', 'metric'), lin('mD.ft', (M2_PER_DARCY / 1000) * M_PER_FT, 'mD.ft', 'oilfield')],
  },
  diameter: {
    label: 'Diameter (choke, tubing, wellbore)', base: 'm', canonical: 'mm',
    units: [lin('mm', 1e-3, 'mm', 'metric'), lin('in', M_PER_IN, 'in', 'oilfield'), lin('1/64 in', M_PER_IN / 64, '1/64 in', 'oilfield')],
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
