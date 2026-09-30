// Unit profile resolution (Suite unit profile). Pure.
//
// Layers, first match wins, per family:
//   1. user          the user's own setting ("your setting")
//   2. project       RESERVED for the Suite Project (after NAPE); sits
//                    between the organisation and the user; always empty today
//   3. organization  the organisation default ("organisation default")
//   4. legacy        geoscience_settings.depth_unit, depth family only
//                    ("your earlier depth setting")
//   5. builtin       the built-in oilfield preset ("built-in default")
// A 'custom' profile only sets the families it lists, so a user can take
// the organisation default and change just pressure.

import { FAMILY_KEYS } from './registry';
import { PRESETS, BUILT_IN_PRESET, normalizeProfile, profileUnit } from './presets';

export const LAYERS = Object.freeze(['user', 'project', 'organization', 'legacy', 'builtin']);

export const SOURCE_LABELS = Object.freeze({
  user: 'your setting',
  project: 'project setting',
  organization: 'organisation default',
  legacy: 'your earlier depth setting',
  builtin: 'built-in default',
});

/**
 * @param {{user?: object|null, project?: object|null, organization?: object|null,
 *   legacyDepthUnit?: 'm'|'ft'|null, builtInPreset?: string}} layers
 * @returns {{units: Object<string,string>, sources: Object<string,string>, layers: object}}
 */
export function resolveProfile({ user = null, project = null, organization = null, legacyDepthUnit = null, builtInPreset = BUILT_IN_PRESET } = {}) {
  const u = normalizeProfile(user);
  const p = normalizeProfile(project);
  const o = normalizeProfile(organization);
  const built = PRESETS[builtInPreset] || PRESETS[BUILT_IN_PRESET];
  const units = {};
  const sources = {};
  for (const fam of FAMILY_KEYS) {
    const pick = [
      ['user', profileUnit(u, fam)],
      ['project', profileUnit(p, fam)],
      ['organization', profileUnit(o, fam)],
      ['legacy', fam === 'depth' && (legacyDepthUnit === 'm' || legacyDepthUnit === 'ft') ? legacyDepthUnit : undefined],
      ['builtin', built[fam]],
    ].find(([, unit]) => unit);
    units[fam] = pick[1];
    sources[fam] = pick[0];
  }
  return { units, sources, layers: { user: u, project: p, organization: o, legacyDepthUnit: legacyDepthUnit || null } };
}

/** Plain words for where a family's unit comes from. */
export const sourceLabel = (source) => SOURCE_LABELS[source] || SOURCE_LABELS.builtin;

/** The resolution with nothing stored: the built-in preset for every family. */
export const BUILT_IN_RESOLUTION = Object.freeze(resolveProfile({}));
