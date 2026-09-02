// PP3b family: well planning (wp_*, 34 tables). Importing this module
// registers it. Column facts are from supabase/migrations/20260825220000_
// create_wp_wellplanning_tables.sql and the PP3 survey (STATUS).
//
// Hierarchy: wp_sites -> wp_wellbores -> wp_designs -> wp_survey_programs /
// wp_ac_runs; wp_sites -> wp_targets; wp_wellbores -> wp_surveys /
// wp_wellbore_geometry / eleven wp_<studio>_cases, each with its wp_<studio>_runs.
// Only wp_sites carries organization_id; everything below is user-scoped.
// There are no storage blobs anywhere in the family.
//
// References worth knowing:
//   wp_designs.target_ids uuid[]            -> wp_targets   (required: targets are site children)
//   wp_designs.published_geo_well_id        -> geo_wells    (optional)
//   wp_wellbores.geo_well_id                -> geo_wells    (optional)
//   wp_wellbores.parent_wellbore_id         -> self         (optional)
//   wp_targets.parent_target_id             -> self         (optional)
//   wp_<x>_cases.design_id / runs.design_id -> wp_designs   (optional: set null on delete)
//   cross-case: cd.ct_case_id, ps.ct_case_id + cd_case_id, st.ps_case_id,
//               wi.ct_case_id + cd_case_id, wct.ct_case_id     (optional)
//   wp_gm_cases.source.geoWellId, wp_ct_cases.environment.ppfg.geoWellId -> geo_wells (optional)
//   wp_ac_runs.offsets / results / summary carry PREFIXED ids: 'wp:<wp_wellbores.id>'
//     and 'geo:<geo_wells.id>'; the `any` form rewrites known uuid substrings
//     and leaves unknown ones in place (an offset outside the package stays
//     named; the app treats it as unavailable).
//   wp_surveys.imported_from jsonb: content unread by any service; `any`, optional.
//
// Stamped (PP0 columns exist): sites, wellbores, designs, targets,
// survey_programs and the eleven case tables. Runs carry engine_version only.

import { registerFamily } from './familySpec';

const STUDIOS = ['ct', 'cd', 'ps', 'st', 'wi', 'wct', 'td', 'hyd', 'wc', 'cmt', 'gm'];
const CROSS_CASE = {
  cd: ['ct'], ps: ['ct', 'cd'], st: ['ps'], wi: ['ct', 'cd'], wct: ['ct'],
};
const CASE_EXTRA_REFS = {
  gm: [{ path: 'source.geoWellId', table: 'geo_wells', optional: true }],
  ct: [{ path: 'environment.ppfg.geoWellId', table: 'geo_wells', optional: true }],
};

const caseTable = (x) => `wp_${x}_cases`;
const runTable = (x) => `wp_${x}_runs`;

const tables = {
  wp_sites: {
    pk: 'id', stamped: true, scope: ['user_id', 'organization_id'],
    children: [{ table: 'wp_targets', column: 'site_id' }, { table: 'wp_wellbores', column: 'site_id' }],
    softRefs: [],
  },
  wp_targets: {
    pk: 'id', stamped: true, scope: ['user_id'], parent: { table: 'wp_sites', column: 'site_id' },
    softRefs: [{ path: 'parent_target_id', table: 'wp_targets', optional: true }],
  },
  wp_wellbores: {
    pk: 'id', stamped: true, scope: ['user_id'], parent: { table: 'wp_sites', column: 'site_id' },
    children: [
      { table: 'wp_wellbore_geometry', column: 'wellbore_id' },
      { table: 'wp_surveys', column: 'wellbore_id' },
      { table: 'wp_designs', column: 'wellbore_id' },
      ...STUDIOS.map((x) => ({ table: caseTable(x), column: 'wellbore_id' })),
    ],
    softRefs: [
      { path: 'parent_wellbore_id', table: 'wp_wellbores', optional: true },
      { path: 'geo_well_id', table: 'geo_wells', optional: true },
    ],
  },
  wp_wellbore_geometry: { pk: 'id', scope: ['user_id'], parent: { table: 'wp_wellbores', column: 'wellbore_id' }, softRefs: [] },
  wp_surveys: {
    pk: 'id', scope: ['user_id'], parent: { table: 'wp_wellbores', column: 'wellbore_id' },
    softRefs: [{ path: 'imported_from.*', table: 'geo_wells', optional: true }],
  },
  wp_designs: {
    pk: 'id', kind: 'wp-design', stamped: true, scope: ['user_id'], parent: { table: 'wp_wellbores', column: 'wellbore_id' },
    children: [{ table: 'wp_survey_programs', column: 'design_id' }, { table: 'wp_ac_runs', column: 'design_id' }],
    softRefs: [
      { path: 'target_ids[]', table: 'wp_targets', optional: false },
      { path: 'published_geo_well_id', table: 'geo_wells', optional: true },
    ],
  },
  wp_survey_programs: { pk: 'id', stamped: true, scope: ['user_id'], parent: { table: 'wp_designs', column: 'design_id' }, softRefs: [] },
  wp_ac_runs: {
    pk: 'id', scope: ['user_id'], parent: { table: 'wp_designs', column: 'design_id' },
    softRefs: [
      { path: 'offsets.*', table: 'wp_wellbores', optional: true },
      { path: 'results.*', table: 'wp_wellbores', optional: true },
      { path: 'summary.*', table: 'wp_wellbores', optional: true },
    ],
  },
};

for (const x of STUDIOS) {
  tables[caseTable(x)] = {
    pk: 'id', stamped: true, scope: ['user_id'], parent: { table: 'wp_wellbores', column: 'wellbore_id' },
    children: [{ table: runTable(x), column: 'case_id' }],
    softRefs: [
      { path: 'design_id', table: 'wp_designs', optional: true },
      ...(CROSS_CASE[x] || []).map((y) => ({ path: `${y}_case_id`, table: caseTable(y), optional: true })),
      ...(CASE_EXTRA_REFS[x] || []),
    ],
  };
  tables[runTable(x)] = {
    pk: 'id', scope: ['user_id'], parent: { table: caseTable(x), column: 'case_id' },
    softRefs: [{ path: 'design_id', table: 'wp_designs', optional: true }],
  };
}

// insertion order: cross-case FKs need ct before cd before ps before st; wi and wct after ct/cd
const CASE_ORDER = ['ct', 'cd', 'ps', 'st', 'wi', 'wct', 'td', 'hyd', 'wc', 'cmt', 'gm'];

registerFamily('wellplanning', {
  tables,
  roots: { wp_site: 'wp_sites' },
  order: [
    'wp_sites', 'wp_targets', 'wp_wellbores', 'wp_wellbore_geometry', 'wp_surveys', 'wp_designs', 'wp_survey_programs',
    ...CASE_ORDER.map(caseTable), ...CASE_ORDER.map(runTable), 'wp_ac_runs',
  ],
});

export const WP_STUDIOS = STUDIOS;
export const WP_TABLES = Object.keys(tables);
