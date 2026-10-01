// Seismolord in the Suite unit profile (2026-10-01): the one unit choice
// the app shows is the depth display unit (sections, map, cursor). It
// starts from the profile; the Home tab toggle is a session view override.
export const SEISMOLORD_UNIT_APP = 'seismolord';
export const SEISMOLORD_UNITS = Object.freeze({ depth: { family: 'depth', allowed: ['m', 'ft'] } });
/** The older per-browser choice that no longer beats the profile. */
export const SEISMOLORD_LEGACY_UNIT_KEYS = Object.freeze(['seismolord.depthUnit.v1']);
