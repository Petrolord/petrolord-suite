// Seismic worker configuration. Every value can be overridden by env; the
// defaults suit the KVM 8 host (docs/scope/QI-PLAN.md, phase Q0).
const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const num = (k, d) => {
  const v = Number(env(k, d));
  if (!Number.isFinite(v)) throw new Error(`${k} must be a number`);
  return v;
};

export function loadConfig() {
  return Object.freeze({
    supabaseUrl: env('SUPABASE_URL', ''),
    serviceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY', ''),
    workerId: env('WORKER_ID', 'seismic-worker-1'),
    // How many jobs this process runs at once. CPU-heavy handlers fan out
    // further across worker_threads, so keep this small.
    maxConcurrent: num('MAX_CONCURRENT_JOBS', 2),
    pollIntervalMs: num('POLL_INTERVAL_MS', 5000),
    heartbeatIntervalMs: num('HEARTBEAT_INTERVAL_MS', 15000),
    // A running job whose heartbeat is older than this is presumed lost.
    staleAfterS: num('STALE_AFTER_S', 120),
    maxAttempts: num('MAX_ATTEMPTS', 2),
    // Progress writes are throttled so a fast loop cannot flood the database.
    progressMinIntervalMs: num('PROGRESS_MIN_INTERVAL_MS', 5000),
    scratchDir: env('SCRATCH_DIR', '/scratch'),
    s3: Object.freeze({
      endpoint: env('S3_ENDPOINT', 'http://seaweedfs:8333'),
      publicEndpoint: env('S3_PUBLIC_ENDPOINT', 'https://storage.petrolord.com'),
      region: env('S3_REGION', 'us-east-1'),
      accessKeyId: env('S3_ACCESS_KEY_ID', ''),
      secretAccessKey: env('S3_SECRET_ACCESS_KEY', ''),
      rawBucket: env('S3_RAW_BUCKET', 'seismic-raw'),
      workBucket: env('S3_WORK_BUCKET', 'seismic-work'),
    }),
    // Conversion memory budget: the browser uses 320 MiB; the server can read
    // a survey in fewer passes. Output bricks do not depend on it.
    convertBudgetBytes: num('CONVERT_BUDGET_BYTES', 2 * 1024 ** 3),
    janitorIntervalMs: num('JANITOR_INTERVAL_MS', 3600e3),
    engineCommit: env('ENGINE_COMMIT', 'unknown'),
    healthPort: num('HEALTH_PORT', 8080),
  });
}

export function assertRunnable(cfg) {
  const missing = [];
  if (!cfg.supabaseUrl) missing.push('SUPABASE_URL');
  if (!cfg.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!cfg.s3.accessKeyId) missing.push('S3_ACCESS_KEY_ID');
  if (!cfg.s3.secretAccessKey) missing.push('S3_SECRET_ACCESS_KEY');
  if (missing.length) throw new Error(`Missing required settings: ${missing.join(', ')}`);
}
