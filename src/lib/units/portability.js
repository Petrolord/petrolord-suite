// Suite unit profile in a .pld project package.
//
// Export writes meta/unit-profile.json: the exporting organisation's
// default (or the built-in preset when it has none) as information for the
// receiver. It is listed and hashed in manifest.files like any other file,
// so older builds verify it and ignore it; the manifest schema is unchanged.
// Stored data in a package is always in canonical units, so this file
// never changes how any row is read.
//
// Import shows it and offers to apply it as the importing USER's own
// setting. It never writes an organisation default.

import { normalizeProfile, PRESET_LABELS, BUILT_IN_PRESET, makeProfile } from './presets';
import { resolveProfile } from './profile';

export const UNIT_PROFILE_FILE = 'meta/unit-profile.json';
export const UNIT_META_KIND = 'petrolord.unit-profile';

/**
 * The metadata object for a package.
 * @param {?object} orgProfile the organisation default row's profile, or null
 * @param {{organizationName?: ?string}} [opts]
 */
export function unitProfileMeta(orgProfile, { organizationName = null } = {}) {
  const org = normalizeProfile(orgProfile);
  const profile = org || makeProfile(BUILT_IN_PRESET);
  return {
    kind: UNIT_META_KIND,
    version: 1,
    source: org ? 'organisation default' : 'built-in default',
    organization_name: organizationName,
    profile,
    units: resolveProfile({ organization: profile }).units,
    note: 'Display and input preference only. Every value in this package is stored in canonical units.',
  };
}

/** Parse the file's bytes or text; null when absent or not a unit profile. */
export function parseUnitProfileMeta(input) {
  if (input === null || input === undefined) return null;
  try {
    const text = typeof input === 'string' ? input : new TextDecoder().decode(input);
    const m = JSON.parse(text);
    if (!m || m.kind !== UNIT_META_KIND) return null;
    const profile = normalizeProfile(m.profile);
    if (!profile) return null;
    return { ...m, profile, units: resolveProfile({ organization: profile }).units };
  } catch { return null; }
}

/** One line for an import review. */
export function describeUnitMeta(meta) {
  if (!meta) return null;
  const preset = PRESET_LABELS[meta.profile.preset] || meta.profile.preset;
  const changed = Object.keys(meta.profile.units || {});
  const who = meta.organization_name ? `${meta.organization_name}'s ${meta.source}` : `the ${meta.source}`;
  return `Made with ${who}: ${preset}${changed.length ? `, with ${changed.length} unit${changed.length === 1 ? '' : 's'} changed` : ''}.`;
}
