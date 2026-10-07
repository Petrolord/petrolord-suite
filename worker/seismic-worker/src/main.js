// Seismic worker main loop (docs/scope/QI-PLAN.md, phase Q0). Pull model:
// sweep stale claims, claim up to MAX_CONCURRENT_JOBS queued jobs of the
// kinds this build knows, run each with a heartbeat, repeat. A localhost
// /healthz reports liveness for the host's monitoring.
import http from 'node:http';
import fs from 'node:fs';
import { loadConfig, assertRunnable } from './config.js';
import { createSupa } from './supa.js';
import { createQueue } from './queue.js';
import { runJob } from './runJob.js';
import { createClient } from '@supabase/supabase-js';
import { createHandlers, KINDS } from './handlers/index.js';
import { makeSigner } from './s3.js';
import { supabaseStorageClient } from '../../../src/pages/apps/Seismolord/services/seismicStorageClient.js';
import { resolveCodec, DEFLATE_RAW } from '../../../packages/engines/engines/seismolord/brickCodecV4.js';
import { pollOnce } from './loop.js';
import { runJanitor } from './janitor.js';

const log = {
  info: (m) => console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', m })),
  warn: (m) => console.log(JSON.stringify({ t: new Date().toISOString(), level: 'warn', m })),
  error: (m) => console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', m })),
};

async function main() {
  const cfg = loadConfig();
  assertRunnable(cfg);
  fs.mkdirSync(cfg.scratchDir, { recursive: true });
  const supa = createSupa({ url: cfg.supabaseUrl, key: cfg.serviceRoleKey });
  const queue = createQueue(supa, cfg);
  const admin = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const handlers = createHandlers({
    admin,
    storage: supabaseStorageClient(admin, 'seismic'),
    sign: makeSigner(cfg.s3),
    scratchDir: cfg.scratchDir,
    // CompressionStream deflate-raw, the same codec the browser import uses
    codec: resolveCodec({ compression: DEFLATE_RAW }),
    memoryBudgetBytes: cfg.convertBudgetBytes,
    // attribute_volume reads parent bricks the way the browser worker does,
    // with the service key as its bearer token
    supabaseUrl: cfg.supabaseUrl,
    serviceRoleKey: cfg.serviceRoleKey,
    rawBucket: cfg.s3.rawBucket,
    workBucket: cfg.s3.workBucket,
    engineCommit: cfg.engineCommit,
  });
  const running = new Map();
  let lastJanitor = 0;
  const health = { startedAt: new Date().toISOString(), lastPollOk: null, lastPollError: null };
  let stopping = false;

  const launch = (job) => {
    log.info(`claimed ${job.kind} job ${job.id} (attempt ${job.attempt})`);
    const p = runJob(job, { queue, handlers, cfg, log })
      .then((outcome) => log.info(`job ${job.id} ${outcome}`))
      .finally(() => running.delete(job.id));
    running.set(job.id, p);
  };

  http.createServer((req, res) => {
    if (req.url !== '/healthz') { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      worker: cfg.workerId, engineCommit: cfg.engineCommit, kinds: KINDS,
      running: [...running.keys()], ...health,
    }));
  }).listen(cfg.healthPort, '127.0.0.1');

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    log.info(`stopping; ${running.size} job(s) in flight will be requeued by the stale sweep if they do not finish`);
    await Promise.race([Promise.allSettled(running.values()), new Promise((r) => setTimeout(r, 8000))]);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log.info(`seismic worker ${cfg.workerId} starting; engine ${cfg.engineCommit}; kinds ${KINDS.join(', ')}`);
  while (!stopping) {
    try {
      const claimed = await pollOnce({ queue, cfg, running, launch, kinds: KINDS });
      health.lastPollOk = new Date().toISOString();
      if (claimed && running.size < cfg.maxConcurrent) continue;
      // housekeeping between jobs, at most once an hour (janitor.js)
      if (running.size === 0 && Date.now() - lastJanitor > cfg.janitorIntervalMs) {
        lastJanitor = Date.now();
        const j = await runJanitor({ admin, sign: makeSigner(cfg.s3), log });
        if (j.abandoned || j.expired || j.errors) log.info(`janitor: ${JSON.stringify(j)}`);
        health.lastJanitor = { at: new Date().toISOString(), ...j };
      }
    } catch (e) {
      health.lastPollError = `${new Date().toISOString()} ${e.message}`;
      log.error(`poll cycle failed: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, cfg.pollIntervalMs));
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { log.error(e.stack || e.message); process.exit(1); });
}
