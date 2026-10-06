// QI Studio project model (QI programme Q1 / A4, 2026-10-06). One project is
// one QI study's Package 1 audit: the wells and seismic it covers, the target
// intervals, the key dates, the data inventory, the issue register and the
// feasibility notes per target. The usability matrix is a pure function of
// the registry and these inputs, recomputed on load (never saved). Pure.

export const SCHEMA = 1;

export const ISSUE_STATES = Object.freeze(['open', 'resolved', 'dismissed']);
export const SEVERITIES = Object.freeze(['high', 'medium', 'low']);

export const FEASIBILITY_VERDICTS = Object.freeze([
  { key: '', label: 'Not assessed' },
  { key: 'feasible', label: 'Feasible' },
  { key: 'conditional', label: 'Feasible with conditions' },
  { key: 'not-feasible', label: 'Not feasible' },
]);

export const blankProject = () => ({
  schema: SCHEMA,
  wellIds: [],
  targets: [],
  volumeIds: [],
  dates: { seismicAcquired: '', firstProduction: {} },
  inventory: {},
  issues: [],
  feasibility: {},
  qc: {},
});

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const strArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);

/** A saved payload back to the model, tolerating missing or older fields. */
export function projectFromPayload(payload) {
  const p = isObj(payload) ? payload : {};
  const b = blankProject();
  return {
    schema: SCHEMA,
    wellIds: strArr(p.wellIds),
    targets: strArr(p.targets),
    volumeIds: strArr(p.volumeIds),
    dates: {
      seismicAcquired: typeof p.dates?.seismicAcquired === 'string' ? p.dates.seismicAcquired : '',
      firstProduction: isObj(p.dates?.firstProduction) ? { ...p.dates.firstProduction } : {},
    },
    inventory: isObj(p.inventory) ? { ...p.inventory } : b.inventory,
    issues: Array.isArray(p.issues) ? p.issues.filter(isObj).map((i) => ({ ...i })) : [],
    feasibility: isObj(p.feasibility) ? { ...p.feasibility } : {},
    // seismic QC results per volume id: { jobId, at, volumeName, result: { qc, issues } }
    qc: isObj(p.qc) ? { ...p.qc } : {},
  };
}

/** The saved payload (no computed results), with the id and name the saved-projects table keys on. */
export const projectPayload = (project, { id = null, name = '' } = {}) => ({ id, name, ...projectFromPayload(project), modified: new Date().toISOString() });

/**
 * The issue register: the user's issues, then the matrix's suggestions that
 * are not yet in it (a dismissed or resolved suggestion stays as the user
 * left it, so it does not come back).
 */
export function issueRegister(saved, suggestions) {
  const byKey = new Map((saved || []).filter((i) => i.key).map((i) => [i.key, i]));
  const rows = (saved || []).map((i) => ({ ...i, suggested: false }));
  for (const s of suggestions || []) {
    if (byKey.has(s.key)) continue;
    rows.push({ ...s, status: 'open', owner: '', suggested: true });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  const st = { open: 0, resolved: 1, dismissed: 2 };
  return rows.sort((a, b) => (st[a.status] - st[b.status]) || (rank[a.severity] - rank[b.severity]));
}

/** Keep a suggestion (or edit an issue): it joins the saved list under its key. */
export function upsertIssue(saved, issue) {
  const list = (saved || []).slice();
  const { suggested, ...clean } = issue;
  const key = clean.key || `manual:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
  const at = list.findIndex((i) => i.key === key);
  const row = { ...clean, key };
  if (at >= 0) list[at] = row; else list.push(row);
  return list;
}
