// Unit presets and profile shape (Suite unit profile). Pure.
//
// A profile is { preset: 'oilfield' | 'metric' | 'custom', units: {family:
// unit}, version: 1 }. `units` holds overrides on top of the preset. For
// 'custom' there is no preset underneath: only the families listed are
// set, and every other family falls through to the next layer (for a user,
// the organisation default; for an organisation, the built-in default).

import { FAMILY_KEYS, isKnownUnit } from './registry';

export const PROFILE_VERSION = 1;
export const PRESET_KEYS = Object.freeze(['oilfield', 'metric', 'custom']);

export const PRESETS = Object.freeze({
  oilfield: Object.freeze({
    depth: 'ft', xy: 'm', area: 'acre', rockVolume: 'acre-ft', liquidVolume: 'bbl', gasVolume: 'MMscf',
    pressure: 'psi', temperature: 'degF', liquidRate: 'STB/d', gasRate: 'Mscf/d',
    fvfOil: 'RB/STB', fvfGas: 'RB/Mscf', density: 'g/cc', sonic: 'us/ft', velocity: 'ft/s',
    permeability: 'mD', viscosity: 'cP', compressibility: '1/psi', timeSeismic: 'ms', gor: 'scf/STB',
    declineRate: '%/yr', productivityIndex: 'STB/d/psi', pseudoPressure: 'psi2/cP', gasProductivityIndex: 'Mscf/d/(psi2/cP)',
    capillaryPressure: 'psi', interfacialTension: 'dyne/cm', wellboreStorage: 'bbl/psi', flowCapacity: 'mD.ft', diameter: 'in',
  }),
  metric: Object.freeze({
    depth: 'm', xy: 'm', area: 'km2', rockVolume: '10^6 m3', liquidVolume: 'm3', gasVolume: '10^3 m3',
    pressure: 'kPa', temperature: 'degC', liquidRate: 'm3/d', gasRate: '10^3 m3/d',
    fvfOil: 'm3/m3', fvfGas: 'm3/m3', density: 'kg/m3', sonic: 'us/m', velocity: 'm/s',
    permeability: 'mD', viscosity: 'mPa.s', compressibility: '1/kPa', timeSeismic: 'ms', gor: 'm3/m3',
    declineRate: '%/yr', productivityIndex: 'm3/d/kPa', pseudoPressure: 'kPa2/mPa.s', gasProductivityIndex: '10^3 m3/d/(kPa2/mPa.s)',
    capillaryPressure: 'kPa', interfacialTension: 'mN/m', wellboreStorage: 'm3/kPa', flowCapacity: 'mD.m', diameter: 'mm',
  }),
});

export const PRESET_LABELS = Object.freeze({
  oilfield: 'Oilfield (ft, psi, degF, bbl)',
  metric: 'Metric (m, kPa, degC, m3)',
  custom: 'Custom (only the units you pick)',
});

/**
 * Built-in default (programme lead decision, 2026-09-30): the oilfield
 * preset. It matches the current account depth default (ft) and the
 * Nigerian upstream convention; an organisation admin changes it.
 */
export const BUILT_IN_PRESET = 'oilfield';

/** A clean profile object: unknown families and units are dropped. */
export function normalizeProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const preset = PRESET_KEYS.includes(p.preset) ? p.preset : null;
  if (!preset) return null;
  const units = {};
  const src = p.units && typeof p.units === 'object' ? p.units : {};
  for (const fam of FAMILY_KEYS) {
    if (isKnownUnit(fam, src[fam])) units[fam] = src[fam];
  }
  return { preset, units, version: PROFILE_VERSION };
}

/** The profile's unit for a family, or undefined when it does not set one. */
export function profileUnit(profile, family) {
  const p = normalizeProfile(profile);
  if (!p) return undefined;
  if (p.units[family]) return p.units[family];
  return PRESETS[p.preset]?.[family];
}

export const makeProfile = (preset, units = {}) => normalizeProfile({ preset, units, version: PROFILE_VERSION });
