// Seismic worker jobs and datasets (QI programme Q0). Jobs are read-only
// here: the only write paths are the qi_enqueue_job / qi_cancel_job RPCs
// (supabase/migrations/20261005120000_qi_jobs.sql); the worker on
// seismic-worker.petrolord.com does everything else (worker/seismic-worker/).
import { supabase } from '@/lib/customSupabaseClient';
import { scopeToProject, isProjectColumnError, whenProjectScopeReady } from '@/lib/projects/projectScope';

export const ACTIVE_STATUSES = ['queued', 'running'];
export const isActive = (job) => ACTIVE_STATUSES.includes(job?.status);

// A missing table or function means the Q0 migrations are not applied yet.
export const friendlyError = (error) => {
  const msg = error?.message || String(error || 'Unexpected error');
  if (error?.code === '42P01' || error?.code === 'PGRST202' || (/qi_(jobs|datasets|enqueue_job)/i.test(msg) && /does not exist|could not find/i.test(msg))) {
    return 'The seismic worker is not set up on this server yet.';
  }
  return msg;
};

async function serverEnqueue(kind, params, inputRefs, organizationId) {
  const { data, error } = await supabase.rpc('qi_enqueue_job', {
    p_kind: kind, p_params: params, p_input_refs: inputRefs, p_organization_id: organizationId,
  });
  if (error) throw error;
  return data;
}

/**
 * Local Workspace L1: a job whose volumes are on this computer runs here in
 * the browser (the worker's own handlers), recorded in qi_jobs like any other;
 * everything else goes to the seismic worker as before. The id returned is a
 * qi_jobs id either way, so getJob/watchJob/cancelJob work unchanged.
 */
export async function enqueueJob(kind, params = {}, inputRefs = {}, organizationId = null) {
  const { routeJob } = await import('@/lib/localWorkspace/runtime');
  const { jobId } = await routeJob(kind, params, inputRefs, organizationId, () => serverEnqueue(kind, params, inputRefs, organizationId));
  return jobId;
}

export async function cancelJob(jobId) {
  const { data, error } = await supabase.rpc('qi_cancel_job', { p_job_id: jobId });
  if (error) throw error;
  return data;
}

/**
 * Suite Projects (QI upgrade, migration 20261015160000): job and file lists
 * follow the current project. Before that migration is applied the column is
 * missing; the list is then read unscoped, as before.
 */
async function scopedList(build) {
  await whenProjectScopeReady();
  const first = await scopeToProject(build());
  if (!first?.error || !isProjectColumnError(first.error)) return first;
  return build();
}

export async function listJobs({ limit = 50, allProjects = false } = {}) {
  const build = () => supabase.from('qi_jobs').select('*').order('queued_at', { ascending: false }).limit(limit);
  const { data, error } = allProjects ? await build() : await scopedList(build);
  if (error) throw error;
  return data || [];
}

export async function getJob(jobId) {
  const { data, error } = await supabase.from('qi_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listDatasets({ limit = 100, allProjects = false } = {}) {
  const build = () => supabase.from('qi_datasets').select('*').neq('status', 'deleted').order('created_at', { ascending: false }).limit(limit);
  const { data, error } = allProjects ? await build() : await scopedList(build);
  if (error) throw error;
  return data || [];
}

// Polls a job every intervalMs until it leaves queued/running, calling
// onUpdate with each row. Returns a stop function (SimStudioContext pattern:
// plain polling, no realtime).
export function watchJob(jobId, onUpdate, { intervalMs = 5000, get = getJob } = {}) {
  let stopped = false;
  let timer = null;
  const tick = async () => {
    if (stopped) return;
    try {
      const job = await get(jobId);
      if (stopped) return;
      onUpdate(job, null);
      if (job && !isActive(job)) return;
    } catch (e) {
      if (!stopped) onUpdate(null, e);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
