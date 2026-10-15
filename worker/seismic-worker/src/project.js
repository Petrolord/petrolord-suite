// Suite Projects on the seismic worker (QI upgrade, 2026-10-15; migration
// 20261015160000). A file the worker makes from another file (gathers from an
// upload, trimmed gathers, angle stacks) belongs to that file's project, and
// a file fetched from a link to the job's project. The insert stamp would
// otherwise take the user's current project at the moment the job finishes,
// which may have changed since. Rows read before the migration have no
// suite_project_id key, so nothing is added and the insert stays as it was.

/** { suite_project_id } from the first row that has one, or {}. */
export function projectFrom(...rows) {
  for (const r of rows) {
    if (r && typeof r === 'object' && typeof r.suite_project_id === 'string' && r.suite_project_id) return { suite_project_id: r.suite_project_id };
  }
  return {};
}
