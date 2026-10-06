// What the Jobs dock shows for one seismic worker job (QI programme Q0).
// Pure, so the wording and the rules are tested apart from the component.

const KIND_LABEL = {
  stack_to_v4: 'Server import',
  attribute_volume: 'Attribute volume',
  noop: 'Test job',
};

const STATUS_LABEL = {
  queued: 'Waiting for the server',
  running: 'Running',
  succeeded: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** Jobs whose result is a volume the viewer can open. */
const VOLUME_KINDS = new Set(['stack_to_v4', 'attribute_volume']);

/** The display copy is up once the upload moves on to the float32 copy. */
export const DISPLAY_READY_MESSAGE = 'Uploading full-resolution copy';

/** Bytes as KB, MB or GB (1024-based), one decimal. */
export function fmtSize(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(1)} KB`;
}

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
  if (status === 'succeeded' && job.kind === 'attribute_volume') {
    detail = `${Number(result.bricks || 0).toLocaleString('en-US')} bricks computed`;
  }
  if (status === 'succeeded' && job.kind === 'stack_to_v4') {
    detail = `${Number(result.trace_count || 0).toLocaleString('en-US')} traces; display copy ${fmtSize(result.display_bytes)}, full copy ${fmtSize(result.f32_bytes)}`;
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
    volumeId: VOLUME_KINDS.has(job.kind) ? (result.volume_id || params.volume_id || null) : null,
    canOpen: (job.kind === 'stack_to_v4' && (status === 'succeeded'
      || (status === 'running' && job.progress_message === DISPLAY_READY_MESSAGE)))
      || (job.kind === 'attribute_volume' && status === 'succeeded'),
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
