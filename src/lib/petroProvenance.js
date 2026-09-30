// Petrophysics Studio provenance rules other apps read (AppUpgrade
// PETRO-U2-013, decision on PETRO-U1-026, 2026-09-29).
//
// Before pipeline version 5 (PT9a, 2026-09-07) the curve the Studio
// published as PHIE was the source porosity as read: TOTAL porosity. The
// rows were not rewritten (owner decision: never rewrite data); every app
// that reads a PHIE curve or a zone's phi_avg flags such a row by its
// pipeline version and says what it is, and the owner of the well can
// republish from the Studio. Pure, no I/O.

export const PT9A_PIPELINE_VERSION = 5;
const STUDIO = 'petrophysics-studio';

const base = (m) => String(m || '').toUpperCase().split(':')[0];

/** A PHIE curve the Studio published before PT9a (it holds total porosity). */
export function isPrePt9aPhie(log) {
  const p = log?.provenance || {};
  return base(log?.mnemonic) === 'PHIE' && p.computed === true && p.engine === STUDIO
    && Number.isFinite(Number(p.pipeline_version)) && Number(p.pipeline_version) < PT9A_PIPELINE_VERSION;
}

/** A zone summary the Studio published before PT9a (its phi_avg is total porosity). */
export function isPrePt9aZone(properties) {
  const v = Number(properties?.pipeline_version);
  return !!properties && Number.isFinite(v) && v < PT9A_PIPELINE_VERSION && Number.isFinite(Number(properties.phi_avg));
}

/** The sentence every reader shows beside such a row. */
export const PRE_PT9A_PHIE_NOTE = 'Published before 2026-09-07 (Petrophysics Studio pipeline below 5): this PHIE is total porosity. The well owner can republish it from Petrophysics Studio.';
export const PRE_PT9A_ZONE_NOTE = 'Zone summary published before 2026-09-07 (Petrophysics Studio pipeline below 5): its porosity average is total porosity. The well owner can republish it from Petrophysics Studio.';
