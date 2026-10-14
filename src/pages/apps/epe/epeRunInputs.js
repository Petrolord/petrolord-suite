// A run says when the case data it priced has changed since it ran (EPE
// video programme, 2026-10-13; the NAPE data governance theme).
//
// The Run Console stores, on the epe_runs row, parameters.inputs: the case's
// input files at run time (the production files of the scenario it priced,
// every CAPEX file and every OPEX file), each as { table, id, file_name,
// created_at, scenario_label }. A replaced file is a delete plus an insert, so
// a new id means new data. The Results Viewer and Run History compare that
// list with the case's files now. A run saved before the list existed falls
// back to dates: a file in its slots created after the run means the data
// changed; otherwise nothing is claimed.
//
// Pure functions; the one query helper takes the client as an argument.

export const INPUT_SLOTS = Object.freeze([
  { key: 'production', table: 'epe_production_volumes', label: 'Production' },
  { key: 'capex', table: 'epe_capex', label: 'CAPEX' },
  { key: 'opex', table: 'epe_opex', label: 'OPEX' },
]);

const scenarioOf = (f) => (f?.scenario_label ?? null);
const norm = (s) => (s === '' || s === undefined ? null : s);

/** The production files a run of this scenario prices (null = Base, the untagged files). */
export const filesForScenario = (production, scenario) => {
  const want = norm(scenario);
  return (production || []).filter((f) => scenarioOf(f) === want);
};

/**
 * The snapshot stored with a run.
 * @param {{production?: object[], capex?: object[], opex?: object[]}} files the case's files now
 * @param {string|null} scenario the production scenario the run prices
 */
export function snapshotOf(files, scenario = null) {
  const out = [];
  for (const slot of INPUT_SLOTS) {
    const list = slot.key === 'production' ? filesForScenario(files?.production, scenario) : (files?.[slot.key] || []);
    for (const f of list) {
      out.push({
        table: slot.table,
        id: f.id,
        file_name: f.file_name ?? null,
        created_at: f.created_at ?? null,
        scenario_label: slot.key === 'production' ? scenarioOf(f) : null,
      });
    }
  }
  return out;
}

/** Reads the case's input files (id, name, date, scenario) for a snapshot or a comparison. */
export async function fetchCaseInputs(supabase, caseId) {
  const [p, c, o] = await Promise.all([
    supabase.from('epe_production_volumes').select('id, file_name, created_at, scenario_label').eq('case_id', caseId),
    supabase.from('epe_capex').select('id, file_name, created_at').eq('case_id', caseId),
    supabase.from('epe_opex').select('id, file_name, created_at').eq('case_id', caseId),
  ]);
  const err = p.error || c.error || o.error;
  if (err) throw new Error(err.message);
  return { production: p.data || [], capex: c.data || [], opex: o.data || [] };
}

const nameList = (files) => {
  const names = files.map((f) => f.file_name || 'a file');
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/**
 * Has the case data changed since this run?
 * @param {{created_at?: string, parameters?: object}} run the epe_runs row
 * @param {{production?: object[], capex?: object[], opex?: object[]}} current the case's files now
 * @param {{scenario?: string|null}} [opts] the run's production scenario, when known
 * @returns {{state: 'current'|'changed'|'unknown', changes: string[]}}
 */
export function compareRunInputs(run, current, { scenario } = {}) {
  const snap = Array.isArray(run?.parameters?.inputs) ? run.parameters.inputs : null;

  if (!snap) {
    // Saved before runs carried their inputs: only a file dated after the
    // run can be named; anything else stays unclaimed.
    const ranAt = Date.parse(run?.created_at || '');
    if (!Number.isFinite(ranAt)) return { state: 'unknown', changes: [] };
    const changes = [];
    for (const slot of INPUT_SLOTS) {
      let list = current?.[slot.key] || [];
      if (slot.key === 'production' && scenario !== undefined) list = filesForScenario(list, scenario);
      const newer = list.filter((f) => Date.parse(f.created_at || '') > ranAt);
      if (newer.length) changes.push(`${slot.label}: ${nameList(newer)} ${newer.length > 1 ? 'were' : 'was'} uploaded after this run.`);
    }
    return changes.length ? { state: 'changed', changes } : { state: 'unknown', changes: [] };
  }

  const prodScenario = snap.find((s) => s.table === 'epe_production_volumes')?.scenario_label;
  const runScenario = prodScenario !== undefined ? norm(prodScenario) : norm(scenario);
  const changes = [];
  for (const slot of INPUT_SLOTS) {
    const before = snap.filter((s) => s.table === slot.table);
    const now = slot.key === 'production' ? filesForScenario(current?.production, runScenario) : (current?.[slot.key] || []);
    const nowIds = new Set(now.map((f) => f.id));
    const beforeIds = new Set(before.map((f) => f.id));
    const removed = before.filter((f) => !nowIds.has(f.id));
    const added = now.filter((f) => !beforeIds.has(f.id));
    if (removed.length && added.length) {
      changes.push(`${slot.label}: ${nameList(removed)} ${removed.length > 1 ? 'were' : 'was'} replaced by ${nameList(added)}.`);
    } else if (added.length) {
      changes.push(`${slot.label}: ${nameList(added)} ${added.length > 1 ? 'were' : 'was'} added.`);
    } else if (removed.length) {
      changes.push(`${slot.label}: ${nameList(removed)} ${removed.length > 1 ? 'were' : 'was'} removed.`);
    }
  }
  return changes.length ? { state: 'changed', changes } : { state: 'current', changes: [] };
}
