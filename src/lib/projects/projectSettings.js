// Suite Projects P2: project settings (suite_projects.settings jsonb).
// Pure: shape, validation and merge. Design: docs/scope/SuiteProject-DESIGN.md
// sections 3, 7 and 14.
//
//   units      a unit profile {preset, units} (the same shape as the
//              organisation and personal profiles); the "project" layer of
//              the unit resolution: user override, project, organisation, built-in
//   crs        {tag, name, xyUnit, setAt} the project CRS every geoscience
//              import converts into (non-default projects; the Default project
//              keeps each user's own Project CRS as before)
//   datum      {refKind, verticalDatum, srdM} defaults for new wells and the
//              seismic reference datum for new pore pressure models
//   timescale  the ICS chart edition the project's stratigraphy reads
//
// Changing a setting changes what people see, type and import from then on.
// It never rewrites stored data: rows keep their own CRS tag, datum and the
// chart edition each age was entered under.

import { normalizeProfile } from '@/lib/units/presets';
import { normalizeTag, UNKNOWN } from '@/lib/crs/tags';
import { XY_UNITS } from '../../../packages/engines/lib/crs/catalog';
import { DEPTH_REF_KINDS, COMMON_VERTICAL_DATUMS } from '@/lib/wellDatum';
import { TIMESCALE_VERSIONS } from '../../../packages/engines/engines/stratigraphy/timescale';

export const SETTING_KEYS = Object.freeze(['units', 'crs', 'datum', 'timescale', 'seismic']);

// Local Workspace (owner decision 7, 2026-10-15): where new seismic volumes
// of this project live, asked at project creation, Local by default for new
// projects; and whether previews of local volumes go to the cloud (decision
// 4: on unless the project is members-only, per volume override).
export const SEISMIC_STORAGE = Object.freeze(['local', 'cloud']);
function cleanSeismic(v) {
  if (!v || typeof v !== 'object') return null;
  const storage = SEISMIC_STORAGE.includes(v.storage) ? v.storage : null;
  const previews = v.previews === 'on' || v.previews === 'off' ? v.previews : null;
  if (!storage && !previews) return null;
  return { storage, previews };
}

function cleanUnits(v) {
  if (!v || typeof v !== 'object') return null;
  try { return normalizeProfile(v); } catch { return null; }
}

function cleanCrs(v) {
  if (!v || typeof v !== 'object' || !v.tag) return null;
  const tag = normalizeTag(v.tag);
  if (tag === UNKNOWN) return null;
  return {
    tag,
    name: v.name ? String(v.name).slice(0, 200) : null,
    xyUnit: XY_UNITS.includes(v.xyUnit) ? v.xyUnit : 'm',
    setAt: v.setAt || null,
  };
}

function cleanDatum(v) {
  if (!v || typeof v !== 'object') return null;
  const refKind = DEPTH_REF_KINDS.includes(v.refKind) ? v.refKind : null;
  const verticalDatum = COMMON_VERTICAL_DATUMS.includes(v.verticalDatum) ? v.verticalDatum : null;
  const srd = v.srdM === '' || v.srdM === null || v.srdM === undefined ? null : Number(v.srdM);
  const srdM = Number.isFinite(srd) ? srd : null;
  if (!refKind && !verticalDatum && srdM === null) return null;
  return { refKind, verticalDatum, srdM };
}

const cleanTimescale = (v) => (TIMESCALE_VERSIONS.includes(v) ? v : null);

/** Any stored value in, the four known keys out (null = not set). */
export function normalizeProjectSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    units: cleanUnits(s.units),
    crs: cleanCrs(s.crs),
    datum: cleanDatum(s.datum),
    timescale: cleanTimescale(s.timescale),
    seismic: cleanSeismic(s.seismic),
  };
}

/**
 * Merge a patch into stored settings. A key set to null clears it; keys the
 * patch does not name are kept as stored, including keys this build does not
 * know (a newer build's settings survive an older build's save).
 */
export function mergeProjectSettings(stored, patch) {
  const base = stored && typeof stored === 'object' ? { ...stored } : {};
  for (const k of Object.keys(patch || {})) {
    if (!SETTING_KEYS.includes(k)) continue;
    const clean = normalizeProjectSettings({ [k]: patch[k] })[k];
    if (clean === null) delete base[k];
    else base[k] = clean;
  }
  return base;
}

/** Problems that stop a settings patch being saved (an empty list is fine). */
export function settingsProblems(patch) {
  const out = [];
  if (patch?.crs && patch.crs.tag && normalizeTag(patch.crs.tag) === UNKNOWN) {
    out.push('The project CRS must be a specific system: an EPSG code, a custom definition or LOCAL.');
  }
  if (patch?.datum && patch.datum.srdM !== undefined && patch.datum.srdM !== null && patch.datum.srdM !== ''
      && !Number.isFinite(Number(patch.datum.srdM))) {
    out.push('The seismic reference datum must be a number of metres.');
  }
  if (patch?.timescale && !TIMESCALE_VERSIONS.includes(patch.timescale)) {
    out.push(`The chart edition must be one of ${TIMESCALE_VERSIONS.join(', ')}.`);
  }
  return out;
}
