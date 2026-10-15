/**
 * @jest-environment node
 */
// Jobs in worker threads (2026-10-15, QI round 3). Two jobs used to share one
// event loop, so a CPU-heavy job stalled the other's I/O (the crop build's
// live test: uploads dropped while an inversion computed). The proxy runs each
// handler in its own thread through the real runInThread entry (a fixture with
// test handlers) and the real runJob; the same handlers run in-process are the
// negative control.
import http from 'node:http';
import path from 'node:path';
import { runJob, JobFailure } from '../src/runJob.js';
import { threadHandlers } from '../src/threadJobs.js';

const entry = path.join(__dirname, 'fixtures', 'testThread.mjs');
const KINDS = ['busy', 'io', 'fails', 'crashes', 'progress', 'waits', 'stuck', 'dies'];
const cfg = { heartbeatIntervalMs: 60000, progressMinIntervalMs: 0, marker: 'cfg reached the thread' };
const silent = { info() {}, warn() {}, error() {} };
const busy = (ms) => { const t = Date.now() + ms; let x = 0; while (Date.now() < t) x += Math.sqrt(x + 1); return x; };

function fakeQueue() {
  const calls = [];
  const q = {
    calls, beat: { cancelRequested: false, stillMine: true },
    async heartbeat(job, p, m) { calls.push(['heartbeat', p, m]); return q.beat; },
    async succeed(job, r) { calls.push(['succeed', r]); },
    async fail(job, stage, msg) { calls.push(['fail', stage, msg]); },
    async cancelled() { calls.push(['cancelled']); },
  };
  return q;
}
const job = (kind, params = {}) => ({ id: `j-${kind}`, kind, attempt: 1, user_id: 'u1', params, suite_project_id: 'p1' });

let server; let port;
beforeAll(async () => {
  server = http.createServer((req, res) => res.end('ok'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
afterAll(() => new Promise((r) => server.close(r)));

// the main loop's worst lag while fn runs: a 10 ms timer's lateness
async function lagDuring(fn) {
  let worst = 0; let last = Date.now();
  const t = setInterval(() => { const n = Date.now(); worst = Math.max(worst, n - last - 10); last = n; }, 10);
  try { await fn(); } finally { clearInterval(t); }
  return worst;
}

describe('job threads', () => {
  test('a CPU-busy job in a thread leaves the main loop and another job\'s I/O running; in-process stalls both (negative control)', async () => {
    const handlers = threadHandlers({ kinds: KINDS, entry, cfg });
    const q = fakeQueue();
    let ioRes;
    const lag = await lagDuring(() => Promise.all([
      runJob(job('busy', { ms: 1500 }), { queue: q, handlers, cfg, log: silent }),
      // the I/O job starts once the busy thread is spinning
      new Promise((r) => setTimeout(r, 300)).then(() => runJob(job('io', { port, n: 10, gapMs: 50 }), { queue: q, handlers, cfg, log: silent })),
    ]));
    const results = q.calls.filter((c) => c[0] === 'succeed').map((c) => c[1]);
    const spun = results.find((r) => r.spun_ms);
    ioRes = results.find((r) => r.lat);
    expect(spun).toEqual({ spun_ms: 1500, marker: 'cfg reached the thread' });
    expect(Math.max(...ioRes.lat)).toBeLessThan(200);
    expect(lag).toBeLessThan(200);

    // the same work in the main thread: the loop stalls for the whole spin
    const inProc = {
      busy: async (ctx) => { busy(ctx.params.ms); return { spun_ms: ctx.params.ms }; },
      io: async (ctx) => {
        const lat = [];
        for (let i = 0; i < ctx.params.n; i++) {
          const t = Date.now();
          await new Promise((res, rej) => { http.get({ host: '127.0.0.1', port, path: '/' }, (r) => { r.resume(); r.on('end', res); }).on('error', rej); });
          await new Promise((r) => setTimeout(r, ctx.params.gapMs));
          lat.push(Date.now() - t - ctx.params.gapMs);
        }
        return { lat };
      },
    };
    const q2 = fakeQueue();
    const lag2 = await lagDuring(() => Promise.all([
      new Promise((r) => setTimeout(r, 100)).then(() => runJob(job('busy', { ms: 1500 }), { queue: q2, handlers: inProc, cfg, log: silent })),
      runJob(job('io', { port, n: 10, gapMs: 50 }), { queue: q2, handlers: inProc, cfg, log: silent }),
    ]));
    const io2 = q2.calls.filter((c) => c[0] === 'succeed').map((c) => c[1]).find((r) => r.lat);
    expect(lag2).toBeGreaterThan(1200);
    expect(Math.max(...io2.lat)).toBeGreaterThan(1200);
    // the numbers the status doc quotes
    console.log(`threads: main-loop lag ${lag} ms, I/O step worst ${Math.max(...ioRes.lat)} ms; in-process: lag ${lag2} ms, I/O step worst ${Math.max(...io2.lat)} ms`);
  }, 30000);

  test('a JobFailure keeps its stage and message across the boundary; another error is a worker_error', async () => {
    const handlers = threadHandlers({ kinds: KINDS, entry, cfg });
    const q = fakeQueue();
    expect(await runJob(job('fails'), { queue: q, handlers, cfg, log: silent })).toBe('failed');
    expect(await runJob(job('crashes'), { queue: q, handlers, cfg, log: silent })).toBe('failed');
    const fails = q.calls.filter((c) => c[0] === 'fail');
    expect(fails[0].slice(1)).toEqual(['validate_failed', 'Bad input, said the thread.']);
    expect(fails[1][1]).toBe('worker_error');
    expect(fails[1][2]).toMatch(/boom in the thread/);
    // the proxy hands back a real JobFailure
    await expect(handlers.fails({ job: job('fails'), progress() {}, log: silent, cancelled: false })).rejects.toBeInstanceOf(JobFailure);
  });

  test('progress and log messages reach the main thread\'s context', async () => {
    const handlers = threadHandlers({ kinds: KINDS, entry, cfg });
    const seen = []; const logs = [];
    const out = await handlers.progress({ job: job('progress'), progress: (f, m) => seen.push([f, m]), log: { info: (m) => logs.push(m), warn() {}, error() {} }, cancelled: false });
    expect(out).toEqual({ done: true });
    expect(seen).toEqual([[0.25, 'Step 1'], [0.5, 'Step 2'], [0.75, 'Step 3'], [1, 'Step 4']]);
    expect(logs).toEqual(['job j-progress: hello from the thread']);
  });

  test('a cancel request reaches the thread through the shared flag and the job is recorded cancelled', async () => {
    const handlers = threadHandlers({ kinds: KINDS, entry, cfg, cancelPollMs: 20 });
    const q = fakeQueue();
    q.beat = { cancelRequested: true, stillMine: true };
    const t0 = Date.now();
    const out = await runJob(job('waits'), { queue: q, handlers, cfg: { ...cfg, heartbeatIntervalMs: 50 }, log: silent });
    expect(out).toBe('cancelled');
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test('a thread that ignores the cancel is terminated after the grace; one that dies fails the job, not the process', async () => {
    const handlers = threadHandlers({ kinds: KINDS, entry, cfg, cancelPollMs: 20, cancelGraceMs: 300 });
    const ctx = { job: job('stuck'), progress() {}, log: silent, cancelled: true };
    const t0 = Date.now();
    await expect(handlers.stuck(ctx)).resolves.toBeNull();
    expect(Date.now() - t0).toBeLessThan(5000);
    const q = fakeQueue();
    expect(await runJob(job('dies'), { queue: q, handlers, cfg, log: silent })).toBe('failed');
    expect(q.calls.find((c) => c[0] === 'fail')[2]).toMatch(/exit code 3/);
  });
});
