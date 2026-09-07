// Zone parameter table (Petrophysics Studio PT9c, 2026-09-07): the pure
// side of the zones-by-parameters view. The PS3 override model stays as
// it is — a zone carries a PATCH of the fields that differ from the
// global set — and this module turns that model into table rows and
// table edits back into patches, with the same "equal to global means
// no override" rule the Parameter panel applies.

import { PARAM_FIELDS, visibleField, fieldLabel } from './paramFields';

const num = (v) => (v === '' || v === '-' || v === null || v === undefined ? NaN : Number(v));

/** Effective (merged) parameter set for one zone. */
export const effectiveFor = (params, zoneParams, zoneId) => ({ ...params, ...(zoneParams?.[zoneId] || {}) });

/**
 * Rows for the table: one per parameter field, with the global value and
 * one cell per zone (effective value, whether it is an override, whether
 * the field applies under that zone's models).
 * @returns {Array<{key, label, section, options?, global, cells: Array<{zoneId, value, overridden, applies}>}>}
 */
export function buildZoneTable({ params, zones, zoneParams, fields = PARAM_FIELDS, sections = null }) {
  const rows = [];
  let section = null;
  for (const f of sections || fields) {
    if (f.section) { section = f.section; continue; }
    if (!f.key) continue;
    rows.push({
      key: f.key,
      section,
      label: fieldLabel(f, params),
      options: f.options || null,
      global: params[f.key],
      cells: zones.map((z) => {
        const eff = effectiveFor(params, zoneParams, z.id);
        const patch = zoneParams?.[z.id] || {};
        return {
          zoneId: z.id,
          value: eff[f.key],
          overridden: Object.prototype.hasOwnProperty.call(patch, f.key) && patch[f.key] !== params[f.key],
          applies: visibleField(f, eff),
        };
      }),
    });
  }
  return rows;
}

/**
 * Turn one zone's edited draft (strings from inputs, or committed values)
 * into its override patch: only fields that differ from global, numbers
 * parsed, fields hidden under the draft's models left out (their stale
 * text must never poison the patch — the Parameter panel rule).
 * @returns {{patch: Object, invalid: string[]}} invalid = keys whose text is not a number
 */
export function patchFromDraft(params, draft, fields = PARAM_FIELDS) {
  const patch = {};
  const invalid = [];
  for (const f of fields) {
    if (!f.key || !visibleField(f, draft)) continue;
    let v = draft[f.key];
    if (!f.options) {
      v = typeof v === 'number' ? v : num(String(v));
      if (!Number.isFinite(v)) { invalid.push(f.key); continue; }
    }
    if (v !== params[f.key]) patch[f.key] = v;
  }
  return { patch, invalid };
}

/** Every zone's draft to every zone's patch. */
export function patchesFromDrafts(params, draftByZone, fields = PARAM_FIELDS) {
  const patches = {};
  const invalid = {};
  for (const [zoneId, draft] of Object.entries(draftByZone)) {
    const r = patchFromDraft(params, draft, fields);
    patches[zoneId] = r.patch;
    if (r.invalid.length) invalid[zoneId] = r.invalid;
  }
  return { patches, invalid };
}

/** Copy one zone's override patch onto another (global = clear). */
export function copyOverrides(zoneParams, fromZoneId, toZoneId) {
  const next = { ...zoneParams };
  const src = fromZoneId === 'global' ? {} : { ...(zoneParams[fromZoneId] || {}) };
  if (Object.keys(src).length) next[toZoneId] = src;
  else delete next[toZoneId];
  return next;
}

/** How many zones override each field, for the row summary. */
export function overrideCounts(rows) {
  const out = {};
  for (const r of rows) out[r.key] = r.cells.filter((c) => c.overridden).length;
  return out;
}
