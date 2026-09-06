// Sync error classification (WS6): transient errors retry with backoff,
// an expired token waits for the refresh, a server refusal (RLS, a
// check, a foreign key) stays local and visible. Nothing is dropped.

export const ERROR_KINDS = Object.freeze(['transient', 'auth', 'rejected']);

const PG_REJECTIONS = new Set(['42501', '23514', '23503', '22P02', '23502', 'PGRST301']);

export function classifyError(err) {
  const status = err && (err.status || err.statusCode || (err.context && err.context.status));
  const code = err && (err.code || (err.error && err.error.code));
  const msg = String((err && (err.message || err.details)) || err || '');
  if (status === 401 || code === '401' || /jwt expired|invalid jwt|not authenticated/i.test(msg)) return 'auth';
  if (status === 403 || PG_REJECTIONS.has(String(code)) || /row-level security|violates check constraint|violates foreign key|permission denied|invalid input syntax/i.test(msg)) return 'rejected';
  return 'transient';
}

/** Backoff in milliseconds for the n-th attempt: 2 s doubling to 5 min, with jitter. */
export function backoffMs(attempts, rand = Math.random) {
  const base = Math.min(300000, 2000 * 2 ** Math.max(0, attempts - 1));
  return Math.round(base + rand() * Math.min(base, 5000));
}

export function describeError(err) {
  if (!err) return 'unknown error';
  return String(err.message || err.details || err.error_description || err).slice(0, 300);
}
