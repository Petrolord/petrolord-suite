// What the Jobs dock shows for one seismic worker job (QI programme Q0).
// Pure, so the wording and the rules are tested apart from the component.

const KIND_LABEL = {
  stack_to_v4: 'Server import',
  noop: 'Test job',
};

const STATUS_LABEL = {
  queued: 'Waiting for the server',
  running: 'Running',
  succeeded: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** The display copy is up once the upload moves on to the float32 copy. */
export const DISPLAY_READY_MESSAGE = 'Uploading full-resolution copy';

export function jobView(job) {
  const status = job?.status || 'queued';
  const active = status === 'queued' || status === 'running';
  const pct = status === 'succeeded' ? 100 : Math.round(100 * Math.max(0, Math.min(1, Number(job?.progress) || 0)));
  const params = job?.params || {};
  const result = job?.result_refs || {};
  let detail = null;
  if (status === 'running' && job.progress_message) detail = job.progress_message;
  if (status === 'failed') detail = job.error_message || 'The job failed.';
  if (status === 'cancelled') detail = 'Stopped at your request.';
  if (status === 'succeeded' && job.kind === 'stack_to_v4') {
    const mb = (b) => (Number(b) / 1048576).toFixed(1);
    detail = `${Number(result.trace_count || 0).toLocaleString('en-US')} traces; display copy ${mb(result.display_bytes || 0)} MB, full copy ${mb(result.f32_bytes || 0)} MB`;
  }
  return {
    id: job.id,
    title: params.name || params.file_name || KIND_LABEL[job.kind] || job.kind,
    kind: KIND_LABEL[job.kind] || job.kind,
    status,
    statusLabel: STATUS_LABEL[status] || status,
    active,
    pct,
    detail,
    canCancel: active && !job.cancel_requested,
    cancelling: active && Boolean(job.cancel_requested),
    // a server import's volume opens once its display copy is up
    volumeId: job.kind === 'stack_to_v4' ? (result.volume_id || params.volume_id || null) : null,
    canOpen: job.kind === 'stack_to_v4' && (status === 'succeeded'
      || (status === 'running' && job.progress_message === DISPLAY_READY_MESSAGE)),
    queuedAt: job.queued_at,
  };
}

/**
 * Jobs whose volume became openable between two polls: a server import that
 * reached its display copy or finished. The dock then asks the viewer to
 * re-list volumes.
 */
export function volumesChanged(prev, next) {
  const before = new Map((prev || []).map((j) => [j.id, jobView(j).canOpen]));
  return (next || []).some((j) => jobView(j).canOpen && before.get(j.id) !== true);
}
