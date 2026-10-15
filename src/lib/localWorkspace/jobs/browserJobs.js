// Page side of jobs that run in this browser (Local Workspace L1). Each job:
//   1. is recorded in qi_jobs through qi_start_local_job (executor 'browser',
//      this computer's device id), so the jobs list, the audit trail and the
//      panels' existing watchers work exactly as for server jobs;
//   2. runs in its own Web Worker (localJob.worker.js) with the server's
//      handler code; several jobs run side by side, up to the cores the
//      computer can spare;
//   3. reports progress through qi_update_local_job every few seconds, which
//      also returns a cancel requested from the jobs list;
//   4. on success seals its local outputs: the brick root, the content id,
//      the registry record 'ready' and a ready replica row; on failure removes
//      them. The terminal row carries the result exactly as the server writes it.
// A tab that closes mid-job leaves its row running; the next visit on this
// computer marks it "the browser closed" and removes the partial outputs
// (reconcile), and the server's sweep does the same after 6 hours.

import { defaultRegistry } from '../registry';
import { openLocalVolume, removeLocalVolume } from '../workspace';
import { contentIdOf, browserEngineCommit } from '../identity';
import { upsertReplica, setVolumeLocation } from '../cloud';
import { uuidsIn } from '../router';
import { newLocalJobWorker } from '../workers/localJobWorkerFactory';

export const HEARTBEAT_MS = 5000;

/** A job's recipe for its content id: input ids replaced by their content ids, outputs and names left out. */
export function recipeOf(params, contentOf = new Map(), outputs = new Set()) {
  const walk = (v, depth) => {
    if (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)) {
      const id = v.toLowerCase();
      if (outputs.has(id)) return '<output>';
      return contentOf.get(id) || v;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v && typeof v === 'object') {
      const o = {};
      // the job's display name (top level) is not part of what makes the bricks
      for (const [k, x] of Object.entries(v)) if (!(depth === 0 && k === 'name')) o[k] = walk(x, depth + 1);
      return o;
    }
    return v;
  };
  return walk(params || {}, 0);
}

export function defaultConcurrency(cores = (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 2)) {
  return Math.max(1, Math.min(3, (Number(cores) || 2) - 1));
}

/**
 * @param {Object} d
 * @param {Object} d.supabase the page's client (RPCs, rows)
 * @param {() => Promise<{deviceId: ?string, label: string, userId: string}>} d.device this computer
 * @param {Object} [d.registry]
 * @param {() => Worker} [d.makeWorker]
 * @param {number} [d.concurrency]
 * @param {string} [d.engineCommit]
 * @param {(fn: Function, ms: number) => any} [d.setInterval]
 * @param {(t: any) => void} [d.clearInterval]
 * @param {(volumeId: string, info: Object) => Promise<void>} [d.afterSeal] previews and other follow-ups
 */
export function createBrowserJobRunner({
  supabase, device, registry = defaultRegistry(), makeWorker = newLocalJobWorker, concurrency = defaultConcurrency(),
  engineCommit = browserEngineCommit('unknown', 'unknown'), setInterval: si = setInterval, clearInterval: ci = clearInterval,
  afterSeal = async () => {}, onBeforeUnload = null, wakeLock = null,
}) {
  const jobs = new Map();
  const waiting = [];
  let running = 0;
  const listeners = new Set();
  let snapshot = [];
  let removeGuard = null;
  let lock = null;

  const emit = () => {
    snapshot = [...jobs.values()].map((j) => ({ ...j.view }));
    const active = [...jobs.values()].some((j) => j.view.phase === 'running' || j.view.phase === 'waiting');
    if (active && !removeGuard && onBeforeUnload) removeGuard = onBeforeUnload(() => [...jobs.values()].some((j) => j.view.phase === 'running'));
    if (!active && removeGuard) { removeGuard(); removeGuard = null; }
    if (wakeLock) {
      if (active && !lock) lock = Promise.resolve(wakeLock.request()).catch(() => null);
      else if (!active && lock) { const l = lock; lock = null; l.then((x) => x?.release?.()).catch(() => {}); }
    }
    for (const l of listeners) l();
  };
  const setView = (job, patch) => { job.view = { ...job.view, ...patch }; emit(); };

  async function rpcUpdate(id, patch) {
    const { data, error } = await supabase.rpc('qi_update_local_job', { p_job_id: id, ...patch });
    if (error) throw new Error(error.message);
    return data || {};
  }

  async function seal(job) {
    const out = [];
    for (const volumeId of job.targets) {
      // eslint-disable-next-line no-await-in-loop
      const rec = await registry.getVolume(volumeId);
      if (!rec) continue;
      // eslint-disable-next-line no-await-in-loop
      const store = await openLocalVolume(volumeId, { registry });
      // eslint-disable-next-line no-await-in-loop
      const brickRoot = await store.brickRoot();
      // eslint-disable-next-line no-await-in-loop
      const bytes = await store.bytes();
      // eslint-disable-next-line no-await-in-loop
      const contentId = await contentIdOf({ parent: job.parentContent || null, job: { kind: job.kind, params: recipeOf(job.params, job.contentOf, new Set(job.targets)), output: job.targets.indexOf(volumeId) }, engine: engineCommit });
      // eslint-disable-next-line no-await-in-loop
      await registry.patchVolume(volumeId, { state: 'ready', bytes, brickRoot, contentId });
      const dev = job.device;
      try {
        // eslint-disable-next-line no-await-in-loop
        await setVolumeLocation(supabase, volumeId, { contentId, brickRoot });
        // eslint-disable-next-line no-await-in-loop
        if (dev?.deviceId) await upsertReplica(supabase, { volumeId, deviceId: dev.deviceId, deviceLabel: dev.label, state: 'ready', bytes, verified: true });
      } catch (e) {
        job.warnings.push(e.message);
      }
      // eslint-disable-next-line no-await-in-loop
      try { await afterSeal(volumeId, { brickRoot, bytes, contentId }); } catch (e) { job.warnings.push(`Preview: ${e.message}`); }
      out.push({ volume_id: volumeId, brick_root: brickRoot, content_id: contentId, bytes });
    }
    return out;
  }

  async function discard(job) {
    for (const volumeId of job.targets) {
      // eslint-disable-next-line no-await-in-loop
      await removeLocalVolume(volumeId, { registry }).catch(() => {});
    }
  }

  function launch(job) {
    running += 1;
    setView(job, { phase: 'running', message: 'Starting on this computer' });
    const worker = makeWorker();
    job.worker = worker;
    const started = Date.now();
    const beat = async () => {
      try {
        const r = await rpcUpdate(job.id, { p_progress: job.view.fraction || 0, p_message: job.view.message || null });
        if (r.cancel_requested && !job.cancelSent) { job.cancelSent = true; worker.postMessage({ type: 'cancel', id: job.id }); setView(job, { message: 'Cancelling' }); }
      } catch { /* the next beat retries; the sweep catches a dead page */ }
    };
    job.timer = si(beat, HEARTBEAT_MS);
    worker.onmessage = async (e) => {
      const msg = e.data;
      if (msg.id !== job.id) return;
      if (msg.type === 'need-token') {
        const { data: { session } } = await supabase.auth.getSession();
        worker.postMessage({ type: 'token', nonce: msg.nonce, token: session?.access_token || null });
      } else if (msg.type === 'progress') {
        setView(job, { fraction: msg.fraction, message: msg.message || job.view.message });
      } else if (msg.type === 'done') {
        await finish(job, msg.outcome, started);
      }
    };
    worker.onerror = (e) => finish(job, { ok: false, stage: 'browser_error', message: e?.message || 'The job worker stopped.' }, started);
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      worker.postMessage({
        type: 'run',
        id: job.id,
        job: { id: job.id, kind: job.kind, params: job.params, input_refs: job.inputRefs, user_id: job.device.userId },
        cfg: { supabaseUrl: supabase.supabaseUrl, anonKey: supabase.supabaseKey, engineCommit },
        token: session?.access_token || null,
      });
    })();
  }

  async function finish(job, outcome, started) {
    if (job.finished) return;
    job.finished = true;
    ci(job.timer);
    try { job.worker?.terminate(); } catch { /* ignore */ }
    running -= 1;
    const cost = Math.round((Date.now() - started) / 100) / 10;
    try {
      if (outcome.ok) {
        const sealed = await seal(job);
        const result = { ...(outcome.result || {}), executor: 'browser', device_label: job.device.label, local_outputs: sealed, ...(job.warnings.length ? { warnings: [...(outcome.result?.warnings || []), ...job.warnings] } : {}) };
        await rpcUpdate(job.id, { p_status: 'succeeded', p_result_refs: result, p_engine_commit: engineCommit, p_cost_seconds: cost });
        setView(job, { phase: 'done', fraction: 1, message: null, result });
      } else {
        await discard(job);
        const status = outcome.cancelled ? 'cancelled' : 'failed';
        await rpcUpdate(job.id, { p_status: status, p_failure_stage: outcome.stage, p_error_message: outcome.message, p_engine_commit: engineCommit, p_cost_seconds: cost });
        setView(job, { phase: status, error: outcome.cancelled ? null : outcome.message });
      }
    } catch (e) {
      setView(job, { phase: 'failed', error: e.message });
    } finally {
      job.resolve(job.view);
      const next = waiting.shift();
      if (next) launch(next);
    }
  }

  return {
    /**
     * Record and start a job. Resolves the qi_jobs id once recorded; `done`
     * on the returned job settles when it finishes.
     * @param {{kind: string, params: Object, inputRefs?: Object, organizationId?: ?string,
     *   contentOf?: Map<string,string>, parentContent?: ?string}} p
     */
    async start({ kind, params, inputRefs = {}, organizationId = null, contentOf = new Map(), parentContent = null }) {
      const dev = await device();
      const ids = [...uuidsIn(params)];
      const targets = [];
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        const rec = await registry.getVolume(id).catch(() => null);
        if (rec && rec.state === 'writing') targets.push(id);
      }
      const { data: id, error } = await supabase.rpc('qi_start_local_job', {
        p_kind: kind, p_params: params, p_input_refs: inputRefs, p_executor: 'browser', p_device_id: dev.deviceId || null, p_organization_id: organizationId,
      });
      if (error) throw new Error(error.message);
      let resolve;
      const done = new Promise((r) => { resolve = r; });
      const job = {
        id, kind, params, inputRefs, targets, device: dev, contentOf, parentContent, warnings: [], resolve, done,
        view: { id, kind, name: params?.name || kind, phase: 'waiting', fraction: 0, message: 'Waiting for a free core on this computer', startedAt: Date.now() },
      };
      jobs.set(id, job);
      emit();
      if (running < concurrency) launch(job);
      else {
        waiting.push(job);
        rpcUpdate(id, { p_progress: 0, p_message: 'Waiting for a free core on this computer' }).catch(() => {});
      }
      return { id, done };
    },
    /** Cancel from this page (the jobs list's cancel reaches it through the heartbeat). */
    cancel(id) {
      const job = jobs.get(id);
      if (!job) return;
      const i = waiting.indexOf(job);
      if (i >= 0) {
        waiting.splice(i, 1);
        running += 1; // finish() releases the slot it assumes this job held
        finish(job, { ok: false, cancelled: true, stage: 'cancelled', message: 'Cancelled.' }, Date.now());
        return;
      }
      job.worker?.postMessage({ type: 'cancel', id });
    },
    isLive: (id) => jobs.has(id) && !jobs.get(id).finished,
    /**
     * Rows this computer started that no live page is running (the tab closed):
     * mark them closed and remove their partial outputs.
     */
    async reconcile() {
      const dev = await device();
      if (!dev?.deviceId) return 0;
      const { data, error } = await supabase.from('qi_jobs').select('id, kind, params, status, executor, device_id')
        .eq('executor', 'browser').eq('status', 'running').eq('device_id', dev.deviceId).limit(50);
      if (error) return 0;
      let n = 0;
      for (const row of data || []) {
        if (jobs.has(row.id)) continue;
        for (const vid of uuidsIn(row.params)) {
          // eslint-disable-next-line no-await-in-loop
          const rec = await registry.getVolume(vid).catch(() => null);
          if (rec && rec.state === 'writing') {
            // eslint-disable-next-line no-await-in-loop
            await removeLocalVolume(vid, { registry }).catch(() => {});
            // eslint-disable-next-line no-await-in-loop
            await supabase.from('seismic_volumes').delete().eq('id', vid).eq('status', 'ingesting');
          }
        }
        // eslint-disable-next-line no-await-in-loop
        await rpcUpdate(row.id, { p_status: 'failed', p_failure_stage: 'browser_closed', p_error_message: 'The browser closed before this job finished. Run it again; nothing partial was kept.' }).catch(() => {});
        n += 1;
      }
      return n;
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => snapshot,
  };
}
