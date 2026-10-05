// The qi_jobs queue protocol, as the worker sees it. Claim, heartbeat and the
// stale sweep are SECURITY DEFINER functions (migration *_qi_jobs.sql) so they
// are atomic: claim uses FOR UPDATE SKIP LOCKED, which lets several worker
// hosts share one queue. Every terminal write is guarded on
// (status = running AND claimed_by = me AND attempt = mine), so a worker that
// lost its claim to the stale sweep can never overwrite the new attempt.
export function createQueue(supa, cfg) {
  const guard = (job) => `id=eq.${job.id}&status=eq.running&claimed_by=eq.${encodeURIComponent(cfg.workerId)}&attempt=eq.${job.attempt}`;

  return {
    async claim(kinds) {
      const rows = await supa.rpc('qi_claim_job', { p_worker_id: cfg.workerId, p_kinds: kinds });
      return Array.isArray(rows) ? rows[0] || null : rows || null;
    },

    // Returns { cancelRequested, stillMine }. stillMine false means the sweep
    // requeued the job under us: stop work and write nothing more.
    async heartbeat(job, progress, message) {
      const rows = await supa.rpc('qi_heartbeat_job', {
        p_job_id: job.id,
        p_worker_id: cfg.workerId,
        p_attempt: job.attempt,
        p_progress: progress ?? null,
        p_message: message ?? null,
      });
      const r = Array.isArray(rows) ? rows[0] : rows;
      return { cancelRequested: Boolean(r?.cancel_requested), stillMine: Boolean(r?.still_mine) };
    },

    sweepStale() {
      return supa.rpc('qi_sweep_stale_jobs', {
        p_stale_after_s: cfg.staleAfterS,
        p_max_attempts: cfg.maxAttempts,
      });
    },

    async succeed(job, resultRefs, extra = {}) {
      return supa.patch('qi_jobs', guard(job), {
        status: 'succeeded',
        progress: 1,
        result_refs: resultRefs ?? {},
        finished_at: new Date().toISOString(),
        engine_commit: cfg.engineCommit,
        ...extra,
      });
    },

    async fail(job, stage, message, extra = {}) {
      return supa.patch('qi_jobs', guard(job), {
        status: 'failed',
        failure_stage: stage,
        error_message: String(message).slice(0, 4000),
        finished_at: new Date().toISOString(),
        engine_commit: cfg.engineCommit,
        ...extra,
      });
    },

    async cancelled(job, extra = {}) {
      return supa.patch('qi_jobs', guard(job), {
        status: 'cancelled',
        finished_at: new Date().toISOString(),
        ...extra,
      });
    },
  };
}
