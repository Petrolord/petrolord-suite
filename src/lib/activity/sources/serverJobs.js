// Activity source: the person's jobs on the Petrolord servers (qi_jobs, own
// rows under RLS). Read on sign-in, then every 20 s only while some are
// queued or running, and at once when an app says it started one
// (window event 'petrolord:server-job'). A job that leaves the running list
// stays for the session as done or failed, so "it finished" is not missed.

import { publishActivity } from '../activity';

export const POLL_MS = 20000;
export const SERVER_JOB_EVENT = 'petrolord:server-job';

const SEISMOLORD_KINDS = new Set(['stack_to_v4', 'attribute_volume', 'scan_dataset', 'ingest_url', 'export_segy', 'seismic_qc']);
const KIND_WORDS = {
  stack_to_v4: 'Converting a volume',
  attribute_volume: 'Computing an attribute',
  scan_dataset: 'Scanning a file',
  ingest_url: 'Fetching a file from a link',
  export_segy: 'Exporting SEG-Y',
  seismic_qc: 'Checking a volume',
  remove_dataset: 'Removing a file',
};

/** One qi_jobs row as an Activity item (pure; exported for tests). */
export function jobItem(row) {
  const seis = SEISMOLORD_KINDS.has(row.kind);
  const name = row.params?.name || row.params?.file_name || null;
  const what = KIND_WORDS[row.kind] || `${row.kind.replace(/_/g, ' ')} job`;
  const state = row.status === 'queued' || row.status === 'running' ? 'running'
    : row.status === 'succeeded' ? 'done' : row.status === 'cancelled' ? 'done' : 'failed';
  const msg = row.status === 'queued' ? 'waiting for the server' : row.progress_message || null;
  return {
    id: `job:${row.id}`,
    appId: seis ? 'seismolord' : 'qi-studio',
    appName: seis ? 'Seismolord' : 'QI Studio',
    kind: 'server-job',
    title: `${what}${name ? `: ${name}` : ''}${msg ? ` (${msg})` : ''}${state === 'failed' ? ' failed' : ''}`,
    progress: state === 'running' && row.status === 'running' ? Number(row.progress) || 0 : null,
    state,
    href: seis ? '/dashboard/apps/geoscience/seismolord?panel=jobs' : '/dashboard/apps/geoscience/qi-studio',
    onLeave: 'continues',
  };
}

/**
 * Start reading. Returns a stop function.
 * @param {Object} supabase client
 * @param {string} userId only this person's jobs (colleagues' shared jobs are theirs)
 * @param {{setTimeout?: Function, clearTimeout?: Function}} [timers] injected for tests
 */
export function startServerJobs(supabase, userId, timers = {}) {
  const st = timers.setTimeout || setTimeout;
  const ct = timers.clearTimeout || clearTimeout;
  const seen = new Map();   // id -> last row
  let timer = null;
  let stopped = false;

  // never let the reader break the shell: any failure stops polling until the next kick
  async function poll() {
    try { await pollOnce(); } catch { timer = null; }
  }

  async function pollOnce() {
    timer = null;
    if (stopped) return;
    const { data, error } = await supabase.from('qi_jobs')
      .select('id, kind, status, progress, progress_message, params, queued_at')
      .eq('user_id', userId)
      .in('status', ['queued', 'running'])
      .order('queued_at', { ascending: false })
      .limit(20);
    if (stopped) return;
    if (!error) {
      const live = new Set((data || []).map((r) => r.id));
      for (const r of data || []) seen.set(r.id, r);
      // jobs that left the running list: read their final state once
      const gone = [...seen.values()].filter((r) => !live.has(r.id) && (r.status === 'queued' || r.status === 'running'));
      if (gone.length) {
        const { data: fin } = await supabase.from('qi_jobs')
          .select('id, kind, status, progress, progress_message, params, queued_at')
          .in('id', gone.map((r) => r.id));
        for (const r of fin || []) seen.set(r.id, r);
      }
      publishActivity('server-jobs', [...seen.values()].map(jobItem));
      if (live.size) timer = st(poll, POLL_MS);
    } else {
      timer = st(poll, POLL_MS * 3);
    }
  }

  const kick = () => { if (timer) ct(timer); timer = null; poll(); };
  if (typeof window !== 'undefined') window.addEventListener(SERVER_JOB_EVENT, kick);
  poll();
  return () => {
    stopped = true;
    if (timer) ct(timer);
    if (typeof window !== 'undefined') window.removeEventListener(SERVER_JOB_EVENT, kick);
    publishActivity('server-jobs', []);
  };
}

/** Apps call this after queuing a server job so Activity shows it at once. */
export const announceServerJob = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SERVER_JOB_EVENT));
};
