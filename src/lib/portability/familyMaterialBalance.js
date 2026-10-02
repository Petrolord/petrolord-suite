// Material Balance Studio in .pld packages (MBAL-U1, Reservoir round app 2):
// a case with its production data, its run settings, and its runs with
// their results, rooted at rb_cases.
//
//   rb_cases            the case; the importer owns the copy, private
//   rb_production_data  pressures and cumulative volumes, by case_id
//   rb_run_configs      the default settings and one row per executed run
//                       (the snapshot a run was made on), by case_id. The
//                       study record (identification, datum, input sources,
//                       contacts) travels inside pvt_correlations.
//   rb_runs             by case_id; run_config_id and parent_run_id follow
//   rb_results          by run_id; case_id follows
//
// Runs and results are carried as data, as the Economics family carries its
// own: the edge function is not involved in an import, and the copy opens
// with the result it had. The stale-run rule of the app compares the run's
// snapshot with the case, never a time stamp, so an imported run is current
// exactly when it was current at the source.
//
// None of the five tables carries the PP0 stamp columns (schema_version,
// app_build), so none is `stamped`. rb_cases.org_id is an older label with a
// foreign key to organizations and is never read by the app: it does not
// travel, because the importer may belong to another organisation.
//
// A PVT table taken from a Fluid Systems Studio project names that project
// (pvt_correlations.lab_table_origin.project_id). When the fluid project is
// in the same package the id follows it; when it is not, the id is cleared
// and the project name, the methods and the rest of the provenance stay.

import { registerFamily } from './familySpec';

const ofCase = (extra = {}) => ({ pk: 'id', parent: { table: 'rb_cases', column: 'case_id' }, softRefs: [], ...extra });

export const MATERIAL_BALANCE_TABLES = {
  rb_cases: {
    pk: 'id',
    scope: ['user_id'],
    nameColumn: 'name',
    stripOnInsert: ['org_id'],
    children: [
      { table: 'rb_production_data', column: 'case_id' },
      { table: 'rb_run_configs', column: 'case_id' },
      { table: 'rb_runs', column: 'case_id' },
    ],
    softRefs: [],
  },
  rb_production_data: ofCase(),
  rb_run_configs: ofCase({
    softRefs: [{ path: 'pvt_correlations.lab_table_origin.project_id', table: 'saved_fluid_studio_projects', optional: true }],
  }),
  rb_runs: ofCase({
    children: [{ table: 'rb_results', column: 'run_id' }],
    softRefs: [
      { path: 'run_config_id', table: 'rb_run_configs', optional: false },
      { path: 'parent_run_id', table: 'rb_runs', optional: true },
    ],
  }),
  rb_results: {
    pk: 'id',
    parent: { table: 'rb_runs', column: 'run_id' },
    softRefs: [{ path: 'case_id', table: 'rb_cases', optional: false }],
  },
};

registerFamily('material_balance', {
  tables: MATERIAL_BALANCE_TABLES,
  roots: { rb_case: 'rb_cases' },
  order: ['rb_cases', 'rb_production_data', 'rb_run_configs', 'rb_runs', 'rb_results'],
});
