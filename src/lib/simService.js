// Reservoir Simulation Studio persistence (S2). Direct RLS calls, house
// pattern (wellsRegistry). Tables + policies + RPCs:
// supabase/migrations/20260826200000_create_sim_tables.sql.
//
// Cases are client-writable (owner RLS). Runs are read-only here: the ONLY
// write paths are the sim_enqueue_run / sim_cancel_run RPCs — the OPM Flow
// worker on the studio VPS does everything else (worker/sim-worker/).
import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';

const BUCKET = 'sim';

const userId = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error('Sign in to use Reservoir Simulation Studio.');
  return data.user.id;
};

// A missing table means the S0 migration has not been deployed yet.
export const friendlyError = (error) => {
  const msg = error?.message || String(error || 'Unexpected error');
  if (error?.code === '42P01' || /relation .*sim_(cases|runs).* does not exist/i.test(msg)) {
    return "Simulation isn't set up yet. Run the create_sim_tables migration.";
  }
  return msg;
};

// ------------------------------------------------------------------ cases ---

// PP0 state kind (docs/scope/ProjectPortability-PLAN.md §4.3)
const SIM_CASE_KIND = 'sim-case';
registerStateKind(SIM_CASE_KIND, { current: 1, label: 'simulation case' });

export async function listCases() {
  const { data, error } = await supabase
    .from('sim_cases')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => openStateRow(SIM_CASE_KIND, row));
}

export async function createCase(name, description = '') {
  const uid = await userId();
  const { data, error } = await writeStamped(SIM_CASE_KIND,
    { user_id: uid, name, description },
    (row) => supabase.from('sim_cases').insert(row).select().single());
  if (error) throw error;
  return data;
}

export async function updateCase(id, fields) {
  const { data, error } = await writeStamped(SIM_CASE_KIND,
    { ...fields, updated_at: new Date().toISOString() },
    (row) => supabase.from('sim_cases').update(row).eq('id', id).select().single());
  if (error) throw error;
  return data;
}

export async function deleteCase(id) {
  const { error } = await supabase.from('sim_cases').delete().eq('id', id);
  if (error) throw error;
}

// ------------------------------------------------------------------- deck ---

export const deckDir = (uid, caseId) => `${uid}/${caseId}/deck`;

export async function uploadDeckFile(caseRow, file, relPath) {
  const uid = await userId();
  const path = `${deckDir(uid, caseRow.id)}/${relPath}`;
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, file, { upsert: true, contentType: 'text/plain' });
  if (error) throw error;
  return path;
}

export async function downloadText(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data.text();
}

export async function downloadBlob(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data;
}

/** Install a bundled template (public/sim-templates) into the case's deck
 *  path. Files are fetched from our own origin and re-uploaded under the
 *  user's prefix, so the worker sees a normal upload. */
export const TEMPLATES = [
  {
    slug: 'SPE1CASE1',
    label: 'SPE1: Odeh three-phase black oil (10x10x3)',
    dir: '/sim-templates/spe1',
    files: ['SPE1CASE1.DATA'],
    main: 'SPE1CASE1.DATA',
    blurb: 'The classic first SPE comparative solution problem: gas injection into a small three-layer reservoir, 10 years. Runs in seconds.',
  },
  {
    slug: 'SPE9',
    label: 'SPE9: Killough heterogeneous waterflood (24x25x15)',
    dir: '/sim-templates/spe9',
    files: ['SPE9.DATA', 'PERMVALUES.DATA', 'TOPSVALUES.DATA'],
    main: 'SPE9.DATA',
    blurb: 'The ninth SPE comparative solution problem: 25 producers and 1 injector on a heterogeneous grid, 900 days. Runs in about 20 seconds on the worker (16 s measured).',
  },
];

export async function installTemplate(caseRow, template) {
  const uid = await userId();
  let total = 0;
  for (const name of template.files) {
    const resp = await fetch(`${template.dir}/${name}`);
    if (!resp.ok) throw new Error(`Template file ${name} not found (${resp.status})`);
    const blob = await resp.blob();
    total += blob.size;
    const { error } = await supabase.storage.from(BUCKET)
      .upload(`${deckDir(uid, caseRow.id)}/${name}`, blob,
        { upsert: true, contentType: 'text/plain' });
    if (error) throw error;
  }
  return updateCase(caseRow.id, {
    deck_source: 'template',
    template_slug: template.slug,
    deck_path: `${deckDir(uid, caseRow.id)}/${template.main}`,
    deck_bytes: total,
  });
}

// ------------------------------------------------------------------- runs ---

export async function listRuns(caseId) {
  const { data, error } = await supabase
    .from('sim_runs')
    .select('*')
    .eq('case_id', caseId)
    .order('queued_at', { ascending: false })
    .limit(25);
  if (error) throw error;
  return data || [];
}

export async function enqueueRun(caseId) {
  const { data, error } = await supabase.rpc('sim_enqueue_run', { p_case_id: caseId });
  if (error) throw error;
  return data; // run id
}

export async function cancelRun(runId) {
  const { data, error } = await supabase.rpc('sim_cancel_run', { p_run_id: runId });
  if (error) throw error;
  return data; // 'cancelled' | 'cancel_requested' | terminal status
}

export async function fetchSummary(run) {
  if (!run?.result_path) return null;
  const blob = await downloadBlob(run.result_path);
  return JSON.parse(await blob.text());
}

export async function fetchPrtExcerpt(run) {
  if (!run?.log_path) return null;
  return downloadText(run.log_path);
}

// ---------------------------------------------------- cross-app imports ---
// S4 Model Builder imports. Reads only, through each source's own RLS:
// Material Balance cases/production (rb_*) for the history phase. The
// structure import goes through src/lib/surfacesRegistry directly.

export async function listMbalCases() {
  const { data, error } = await supabase
    .from('rb_cases')
    .select('id, name, updated_at')
    .is('archived_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not load Material Balance cases: ${error.message}`);
  return data || [];
}

export async function listMbalProductionRows(rbCaseId) {
  const { data, error } = await supabase
    .from('rb_production_data')
    .select('timestep_index, observation_date, cum_oil_stb, cum_gas_scf, cum_water_stb, cum_water_inj_stb, cum_gas_inj_scf')
    .eq('case_id', rbCaseId)
    .order('timestep_index', { ascending: true });
  if (error) throw new Error(`Could not load production data: ${error.message}`);
  return data || [];
}

// ------------------------------------------------------------ builder form ---
// SIM-U1-005: the Model Builder form is saved with the case. Column
// sim_cases.builder_form (migration 20261004180000) when it exists; before
// that, a JSON file beside the deck in the owner's folder of the sim bucket.

export const builderFormPath = (ownerId, caseId) => `${ownerId}/${caseId}/builder/form.json`;

const missingColumn = (error) => {
  const msg = String(error?.message || '');
  return error?.code === '42703' || error?.code === 'PGRST204' || /builder_form/.test(msg);
};

/**
 * @returns {Promise<{form: ?object, where: 'column'|'file'|null}>}
 */
export async function loadBuilderForm(caseRow) {
  if (!caseRow) return { form: null, where: null };
  if (caseRow.builder_form && typeof caseRow.builder_form === 'object') return { form: caseRow.builder_form, where: 'column' };
  try {
    const text = await downloadText(builderFormPath(caseRow.user_id, caseRow.id));
    return { form: JSON.parse(text), where: 'file' };
  } catch {
    return { form: null, where: null };
  }
}

/**
 * Save the form with the case: the column, or the file when the column does
 * not exist yet (owner only). `update` is the sharing store's versioned
 * update when sharing is on (a colleague's edit goes through the check-out).
 * @returns {Promise<{ok: boolean, where?: string, row?: object, error?: string}>}
 */
export async function saveBuilderForm(caseRow, form, { update = null } = {}) {
  if (!caseRow) return { ok: false, error: 'No case is open.' };
  const patch = { builder_form: form };
  const res = update
    ? await update('sim_cases', caseRow.id, patch)
    : await writeStamped(SIM_CASE_KIND, { ...patch, updated_at: new Date().toISOString() },
      (row) => supabase.from('sim_cases').update(row).eq('id', caseRow.id).select().single());
  if (!res.error) return { ok: true, where: 'column', row: res.data };
  if (!missingColumn(res.error)) return { ok: false, error: res.error.message || String(res.error) };
  // the column is not there yet: the owner's file
  const uid = await userId();
  if (uid !== caseRow.user_id) {
    return { ok: false, error: 'The builder form of a colleague\'s case can be saved once the builder_form column is added (migration 20261004180000, owner-run). Your changes stay on this screen only.' };
  }
  const { error } = await supabase.storage.from(BUCKET).upload(builderFormPath(caseRow.user_id, caseRow.id),
    new Blob([JSON.stringify(form)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, where: 'file' };
}

/** SHA-256 hex of a deck text, as the worker hashes the file it runs. */
export async function sha256Hex(text) {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || typeof TextEncoder === 'undefined') return null;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;   // no Web Crypto here: the form then cannot prove which deck it made, and the report says so
  }
}

/** The caller's saved SCAL Studio projects, most recent first. */
export async function listScalProjects() {
  try {
    const { data, error } = await supabase.from('saved_scal_projects').select('id, project_name, updated_at').order('updated_at', { ascending: false });
    if (error) return { data: [], error };
    return { data: (data ?? []).map((r) => ({ id: r.id, name: r.project_name, updatedAt: r.updated_at })), error: null };
  } catch (e) {
    return { data: [], error: { message: e?.message ?? String(e) } };
  }
}
