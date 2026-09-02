// Family registry for .pld packages (Project Portability PP3).
//
// A family is one coherent data domain (Geoscience, generic saved projects,
// well planning, seismic, ...) described declaratively: its tables, how they
// hang together, where their binary data lives, which ids hide inside jsonb,
// and a few hooks for behaviour that is genuinely family-specific (the
// Geoscience "interpretations that refer only to packaged wells" rule and
// its LAS/ZMAP sidecars). The collector, the exporter and the importer are
// generic over this registry; adding a family means adding a spec, never a
// code path.
//
// Table spec fields:
//   pk            primary key column (default 'id')
//   kind          registered state kind (src/lib/stateVersion.js) that reads
//                 rows of this table; absent means "version 1 in this build"
//   stamped       true when the table carries the PP0 columns in the live
//                 schema (schema_version, app_build); registry tables are not
//                 stamped until migration 20260902120500 is applied
//   scope         columns rescoped to the importer: ['user_id', 'organization_id']
//   parent        { table, column }  FK to the parent row
//   children      [{ table, column }] child tables keyed by this row's pk
//   blob          { bucket, pathColumn, contentType, newPath(userId, row) }
//                 one storage object per row, or
//                 { bucket, prefixOf(row), newPrefix(userId, row), contentType }
//                 many objects under a prefix (seismic bricks)
//   softRefs      [{ path, table, optional, form? }] ids embedded in jsonb; see
//                 geoscienceSpec.js for the path grammar
//   wellIdsColumn uuid[] of geo_wells (Geoscience interpretations)
//   synthetic     rows come from a hook, not a table (custom CRS definitions)
//
// Family fields:
//   roots         { rootKind: table }
//   order         insertion order (parents before children)
//   hooks         { afterRoots(source, col, opts), sidecars(ctx) }  optional

import { GEOSCIENCE_SPEC } from './geoscienceSpec';

const families = new Map();

export function registerFamily(name, spec) {
  if (!spec?.tables || !spec?.roots || !Array.isArray(spec?.order)) throw new TypeError(`registerFamily(${name}): tables, roots and order are required`);
  for (const t of spec.order) if (!spec.tables[t]) throw new TypeError(`registerFamily(${name}): order names unknown table ${t}`);
  for (const t of Object.keys(spec.tables)) if (!spec.order.includes(t)) throw new TypeError(`registerFamily(${name}): table ${t} missing from order`);
  families.set(name, { name, ...spec });
  return families.get(name);
}

export const listFamilies = () => Array.from(families.values());
export const getFamily = (name) => families.get(name) || null;

/** table -> spec, across families. */
export function tableSpec(table) {
  for (const f of families.values()) if (f.tables[table]) return { ...f.tables[table], family: f.name };
  return null;
}

/** rootKind -> { family, table }. */
export function rootTable(kind) {
  for (const f of families.values()) if (f.roots[kind]) return { family: f.name, table: f.roots[kind] };
  return null;
}

export const allRootKinds = () => listFamilies().flatMap((f) => Object.keys(f.roots));

/** Global insertion order: families in registration order, each in its own order. */
export const importOrder = () => listFamilies().flatMap((f) => f.order);

export const familyOfTable = (table) => tableSpec(table)?.family || null;

// ---- Geoscience (PP1/PP2) registered first, so it stays first in order ------

registerFamily('geoscience', {
  ...GEOSCIENCE_SPEC,
  roots: {
    well: 'geo_wells',
    surface: 'geo_surfaces',
    culture: 'geo_culture',
    petro_project: 'petro_projects',
    pp_project: 'pp_projects',
    rp_project: 'rp_projects',
    correlation_section: 'geo_correlation_sections',
  },
  order: [
    'geo_wells', 'geo_wells_logs', 'geo_wells_tops', 'geo_wells_zones',
    'geo_surfaces', 'geo_culture', 'geoscience_custom_crs',
    'petro_projects', 'pp_projects', 'rp_projects', 'geo_correlation_sections',
  ],
});
