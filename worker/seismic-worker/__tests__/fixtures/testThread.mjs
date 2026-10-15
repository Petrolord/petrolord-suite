// Thread entry for threadJobs.test.js: the real runInThread with test handlers.
import http from 'node:http';
import { runInThread } from '../../src/threadEntry.js';
import { JobFailure } from '../../src/runJob.js';

const busy = (ms) => { const t = Date.now() + ms; let x = 0; while (Date.now() < t) x += Math.sqrt(x + 1); return x; };
const get = (port) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: '/' }, (r) => { r.resume(); r.on('end', resolve); }).on('error', reject);
});

runInThread({
  progressEveryMs: 0,
  buildDeps: (cfg) => ({ marker: cfg.marker }),
  createHandlers: (deps) => ({
    busy: async (ctx) => { busy(ctx.params.ms); return { spun_ms: ctx.params.ms, marker: deps.marker }; },
    io: async (ctx) => {
      const lat = [];
      for (let i = 0; i < ctx.params.n; i++) { const t = Date.now(); await get(ctx.params.port); await new Promise((r) => setTimeout(r, ctx.params.gapMs)); lat.push(Date.now() - t - ctx.params.gapMs); }
      return { lat };
    },
    fails: async () => { throw new JobFailure('validate_failed', 'Bad input, said the thread.'); },
    crashes: async () => { throw new TypeError('boom in the thread'); },
    progress: async (ctx) => { ctx.log.info('hello from the thread'); for (let i = 1; i <= 4; i++) { ctx.progress(i / 4, `Step ${i}`); await new Promise((r) => setTimeout(r, 20)); } return { done: true }; },
    waits: async (ctx) => { while (!ctx.cancelled) await new Promise((r) => setTimeout(r, 20)); return null; },
    stuck: async () => { busy(60000); return null; },
    dies: async () => { process.exit(3); },
  }),
});
