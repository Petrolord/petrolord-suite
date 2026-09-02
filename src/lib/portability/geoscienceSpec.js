// Geoscience package spec (Project Portability PP1, PLAN §4.2): which
// tables a Geoscience .pld carries, how they hang together, where their
// binary data lives, and every place an id hides inside jsonb (the
// soft-reference registry). The collector (collect.js) uses it to close a
// root set over references; the importer (PP2) uses the same spec to remap
// ids on the way in. Keep it declarative and keep it honest: a reference
// missing from here is exactly the kind of bug the dangling-reference gate
// exists to catch.
//
// Column facts were read from the migrations (see the PP1 survey in
// docs/scope/ProjectPortability-STATUS.md):
//   geo_wells.crs may be 'CUSTOM:<uuid>' into geoscience_settings.custom_defs
//   geo_wells_logs.provenance.{input_log_ids uuid[], project_id uuid}
//   geo_surfaces.provenance.isochore [surfaceId, surfaceId]
//   petro_projects.well_ids uuid[]; facies keyed by well id; zone_params keyed by zone id
//   pp_projects.well_ids uuid[]; source.{wellId | volumeId}
//   rp_projects.well_ids uuid[]; avo may hold zone/top ids
//   geo_correlation_sections.well_ids uuid[]; datum by top NAME

/**
 * softRefs entries:
 *   path      dotted path inside the row; `[]` marks an array of ids; `{keys}`
 *             marks an object whose KEYS are ids; `custom-crs` is the
 *             'CUSTOM:<uuid>' string form
 *   table     the table the id points at
 *   optional  the importer may null/drop the reference when the target is
 *             not in the package (reported as "external", never dangling)
 */
export const GEOSCIENCE_SPEC = {
  package_kind: 'geoscience',
  tables: {
    geo_wells: {
      pk: 'id',
      scope: ['user_id', 'organization_id'],
      children: [
        { table: 'geo_wells_logs', column: 'well_id' },
        { table: 'geo_wells_tops', column: 'well_id' },
        { table: 'geo_wells_zones', column: 'well_id' },
      ],
      softRefs: [{ path: 'crs', form: 'custom-crs', table: 'geoscience_custom_crs', optional: false }],
    },
    geo_wells_logs: {
      pk: 'id',
      parent: { table: 'geo_wells', column: 'well_id' },
      blob: { bucket: 'wells', pathColumn: 'storage_path', contentType: 'application/octet-stream' },
      softRefs: [
        { path: 'provenance.input_log_ids[]', table: 'geo_wells_logs', optional: false },
        { path: 'provenance.project_id', table: 'petro_projects', optional: true },
      ],
    },
    geo_wells_tops: { pk: 'id', parent: { table: 'geo_wells', column: 'well_id' }, softRefs: [] },
    geo_wells_zones: { pk: 'id', parent: { table: 'geo_wells', column: 'well_id' }, softRefs: [] },
    geo_surfaces: {
      pk: 'id',
      scope: ['user_id', 'organization_id'],
      blob: { bucket: 'surfaces', pathColumn: 'storage_path', contentType: 'application/octet-stream' },
      softRefs: [
        { path: 'provenance.isochore[]', table: 'geo_surfaces', optional: true },
        { path: 'crs', form: 'custom-crs', table: 'geoscience_custom_crs', optional: false },
      ],
    },
    geo_culture: {
      pk: 'id',
      scope: ['user_id', 'organization_id'],
      blob: { bucket: 'culture', pathColumn: 'storage_path', contentType: 'application/json' },
      softRefs: [{ path: 'crs', form: 'custom-crs', table: 'geoscience_custom_crs', optional: false }],
    },
    // synthetic: the custom CRS definitions referenced by packaged rows,
    // lifted out of the exporting user's geoscience_settings.custom_defs
    geoscience_custom_crs: { pk: 'id', synthetic: true, softRefs: [] },
    petro_projects: {
      pk: 'id',
      scope: ['user_id'],
      wellIdsColumn: 'well_ids',
      softRefs: [
        { path: 'well_ids[]', table: 'geo_wells', optional: false },
        { path: 'facies{keys}', table: 'geo_wells', optional: true },
        { path: 'zone_params{keys}', table: 'geo_wells_zones', optional: true },
      ],
    },
    pp_projects: {
      pk: 'id',
      scope: ['user_id'],
      wellIdsColumn: 'well_ids',
      softRefs: [
        { path: 'well_ids[]', table: 'geo_wells', optional: false },
        { path: 'source.wellId', table: 'geo_wells', optional: true },
        { path: 'source.volumeId', table: 'seismic_volumes', optional: true },
      ],
    },
    rp_projects: {
      pk: 'id',
      scope: ['user_id'],
      wellIdsColumn: 'well_ids',
      softRefs: [
        { path: 'well_ids[]', table: 'geo_wells', optional: false },
        { path: 'avo.*', table: 'geo_wells_zones', optional: true },
      ],
    },
    geo_correlation_sections: {
      pk: 'id',
      scope: ['user_id'],
      wellIdsColumn: 'well_ids',
      softRefs: [{ path: 'well_ids[]', table: 'geo_wells', optional: false }],
    },
  },
};

/** Tables whose rows reference wells through a uuid[] column (app state). */
export const WELL_STATE_TABLES = Object.entries(GEOSCIENCE_SPEC.tables)
  .filter(([, t]) => t.wellIdsColumn)
  .map(([name]) => name);

const CUSTOM_CRS_RE = /^CUSTOM:([0-9a-f-]{36})$/i;
export const customCrsId = (crs) => {
  const m = typeof crs === 'string' ? crs.match(CUSTOM_CRS_RE) : null;
  return m ? m[1].toLowerCase() : null;
};

/** True when `path` (from the dangling-ref walker) sits under an optional soft ref of `table`. */
export function isOptionalRefPath(table, path) {
  const t = GEOSCIENCE_SPEC.tables[table];
  if (!t) return false;
  return t.softRefs.some((r) => {
    if (!r.optional) return false;
    const base = r.path.replace(/\[\]$|\{keys\}$|\.\*$/, '');
    return path === base || path.startsWith(`${base}.`) || path.startsWith(`${base}[`);
  });
}
