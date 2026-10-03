// Vocabulary adapter (Suite unit profile). Apps name units and systems in
// their own words: Well Test and Nodal say 'oilfield' / 'si', ReservoirCalc
// Pro 'field' / 'metric', Petrophysics 'si' / 'field', Basin 'C' / 'F'.
// These helpers map a resolved profile onto what an app offers. Pure.

import { FAMILIES, unitInfo } from './registry';

/** Per-app names for the two unit systems. */
export const SYSTEM_VOCAB = Object.freeze({
  welltest: { oilfield: 'oilfield', metric: 'si' },
  fluid: { oilfield: 'oilfield', metric: 'si' },
  nodal: { oilfield: 'oilfield', metric: 'si' },
  rcp: { oilfield: 'field', metric: 'metric' },
  petro: { oilfield: 'field', metric: 'si' },
  em: { oilfield: 'field', metric: 'metric' },
  scal: { oilfield: 'oilfield', metric: 'si' },
});

/** App spellings of registry units, per family (app key -> registry key). */
export const UNIT_ALIASES = Object.freeze({
  temperature: { C: 'degC', F: 'degF', degC: 'degC', degF: 'degF', K: 'K' },
  pressure: { psia: 'psi', psig: 'psi' },
  liquidRate: { 'STB/D': 'STB/d', 'bbl/D': 'bbl/d', 'STB/day': 'STB/d', 'stb/d': 'STB/d', 'rb/d': 'RB/d', 'RB/D': 'RB/d' },
  gasRate: { 'Mscf/D': 'Mscf/d', 'MMscf/D': 'MMscf/d', 'Mcf/d': 'Mscf/d', 'scf/D': 'scf/d' },
  // Reservoir round: the spellings the Reservoir apps print today
  liquidVolume: { 'MM STB': 'MMSTB', Mstb: 'MSTB', Mbbl: '10^3 bbl', rb: 'RB', 'res bbl': 'RB' },
  gasVolume: { Bcf: 'Bscf', Mcf: 'Mscf', MMcf: 'MMscf' },
  area: { acres: 'acre' },
  fvfGas: { 'rb/scf': 'RB/scf', 'rb/Mscf': 'RB/Mscf', 'ft3/scf': 'rcf/scf', 'rm3/sm3': 'm3/m3' },
  declineRate: { '1/day': '1/d', '1/year': '1/yr', '/yr': '1/yr', '%/year': '%/yr' },
  productivityIndex: {
    'STB/D/psi': 'STB/d/psi', 'bbl/d/psi': 'STB/d/psi', 'rb/d/psi': 'RB/d/psi', 'rb/D/psi': 'RB/d/psi',
    'sm3/d/bar': 'm3/d/bar', 'sm3/d/kPa': 'm3/d/kPa',
  },
  interfacialTension: { 'dyn/cm': 'dyne/cm', 'dynes/cm': 'dyne/cm' },
  pseudoPressure: { 'psi2/cp': 'psi2/cP', 'psi²/cp': 'psi2/cP', 'kPa²/mPa·s': 'kPa2/mPa.s' },
  flowCapacity: { 'md-ft': 'mD.ft', 'md·ft': 'mD.ft', 'md.ft': 'mD.ft' },
  wellboreStorage: { 'm³/kPa': 'm3/kPa' },
  density: { 'g/cm3': 'g/cc' },
  viscosity: { cp: 'cP', 'mPa·s': 'mPa.s' },
  permeability: { md: 'mD' },
  // Earth Modeling's volume sets: metric (10^6 m3) and field (acre-ft, MMbbl)
  rockVolume: { metric: '10^6 m3', field: 'acre-ft' },
});

const toRegistry = (family, appUnit) => UNIT_ALIASES[family]?.[appUnit] || appUnit;

/**
 * The app unit to show for a family, given the profile's unit and the
 * app's allowed list. Exact match first (through aliases); otherwise the
 * first allowed unit of the same system (a kPa profile in an app that only
 * offers MPa or psi gets MPa); otherwise the first allowed unit.
 * @returns {{unit: string, exact: boolean}}
 */
export function appUnitFor(family, profileUnit, allowed) {
  const list = Array.isArray(allowed) ? allowed : [];
  if (!list.length) return { unit: profileUnit, exact: true };
  const exact = list.find((a) => toRegistry(family, a) === profileUnit);
  if (exact !== undefined) return { unit: exact, exact: true };
  const sys = unitInfo(family, profileUnit)?.system;
  const same = list.find((a) => {
    const s = unitInfo(family, toRegistry(family, a))?.system;
    return s && sys && (s === sys || s === 'both' || sys === 'both');
  });
  return { unit: same !== undefined ? same : list[0], exact: false };
}

/**
 * The unit system ('oilfield' or 'metric') a resolved profile leans to
 * over the families an app cares about: a majority vote, ties broken by
 * the first family listed.
 */
export function systemFor(units, families) {
  let oil = 0; let met = 0;
  for (const fam of families) {
    const s = unitInfo(fam, units?.[fam])?.system;
    if (s === 'oilfield') oil += 1; else if (s === 'metric') met += 1;
  }
  if (oil !== met) return oil > met ? 'oilfield' : 'metric';
  const first = unitInfo(families[0], units?.[families[0]])?.system;
  return first === 'metric' ? 'metric' : 'oilfield';
}

/** The app's own word for the profile's system. */
export function appSystemFor(app, units, families) {
  const vocab = SYSTEM_VOCAB[app];
  if (!vocab) throw new Error(`No unit vocabulary for app "${app}".`);
  return vocab[systemFor(units, families)];
}

/** Families known to the registry, for validation in adopters. */
export const hasFamily = (family) => Boolean(FAMILIES[family]);
