/**
 * @jest-environment node
 */
// Seismic worker queue protocol (QI programme Q0). Drives runJob, pollOnce,
// the queue client and the supa client against in-memory doubles: claim,
// progress throttling, cancel, lost claims, failures and retries.
import { runJob, JobFailure } from '../src/runJob.js';
import { pollOnce } from '../src/loop.js';
import { createQueue } from '../src/queue.js';
import { createSupa } from '../src/supa.js';
import { noop } from '../src/handlers/noop.js';
import { KINDS } from '../src/handlers/index.js';
import { loadConfig, assertRunnable } from '../src/config.js';

const cfg = {
  workerId: 'w-test', maxConcurrent: 2, heartbeatIntervalMs: 60000,
  progressMinIntervalMs: 0, staleAfterS: 120, maxAttempts: 2, engineCommit: 'abc1234',
};
const log = { info() {}, warn() {}, error() {} };

function fakeQueue(overrides = {}) {
  const calls = [];
  const q = {
    calls,
    beat: { cancelRequested: false, stillMine: true },
    async heartbeat(job, p, m) { calls.push(['heartbeat', p, m]); return q.beat; },
    async succeed(job, r, extra) { calls.push(['succeed', r, extra]); },
    async fail(job, stage, msg) { calls.push(['fail', stage, msg]); },
    async cancelled() { calls.push(['cancelled']); },
    ...overrides,
  };
  return q;
}
const job = (extra = {}) => ({ id: 'j1', kind: 'noop', attempt: 1, params: {}, ...extra });

describe('runJob', () => {
  test('a successful handler records its result and cost', async () => {
    const queue = fakeQueue();
    const out = await runJob(job(), { queue, cfg, log, handlers: { noop: async () => ({ ok: 1 }) } });
    expect(out).toBe('succeeded');
    const s = queue.calls.find((c) => c[0] === 'succeed');
    expect(s[1]).toEqual({ ok: 1 });
    expect(typeof s[2].cost_seconds).toBe('number');
  });

  test('an unknown kind fails with a clear stage and never runs anything', async () => {
    const queue = fakeQueue();
    const out = await runJob(job({ kind: 'mystery' }), { queue, cfg, log, handlers: {} });
    expect(out).toBe('failed');
    expect(queue.calls[0][1]).toBe('unknown_kind');
  });

  test('JobFailure keeps its stage and user message; other errors become worker_error', async () => {
    const q1 = fakeQueue();
    await runJob(job(), { queue: q1, cfg, log, handlers: { noop: async () => { throw new JobFailure('validate_failed', 'Bad input.'); } } });
    expect(q1.calls.find((c) => c[0] === 'fail').slice(1)).toEqual(['validate_failed', 'Bad input.']);
    const q2 = fakeQueue();
    await runJob(job(), { queue: q2, cfg, log, handlers: { noop: async () => { throw new Error('boom'); } } });
    const f = q2.calls.find((c) => c[0] === 'fail');
    expect(f[1]).toBe('worker_error');
    expect(f[2]).toMatch(/boom/);
  });

  test('progress is clamped and carried by the heartbeat', async () => {
    const queue = fakeQueue();
    await runJob(job(), { queue, cfg, log, handlers: { noop: async (ctx) => { ctx.progress(1.7, 'almost'); return {}; } } });
    const hb = queue.calls.find((c) => c[0] === 'heartbeat');
    expect(hb[1]).toBe(1);
    expect(hb[2]).toBe('almost');
  });

  test('progress writes are throttled: a tight loop sends one heartbeat, not thousands', async () => {
    const queue = fakeQueue();
    let t = 0;
    const throttled = { ...cfg, progressMinIntervalMs: 5000 };
    await runJob(job(), {
      queue, cfg: throttled, log, now: () => t,
      handlers: { noop: async (ctx) => { for (let i = 0; i < 10000; i += 1) { t += 1; ctx.progress(i / 10000); } return {}; } },
    });
    const beats = queue.calls.filter((c) => c[0] === 'heartbeat').length;
    expect(beats).toBe(2); // t = 5000 and t = 10000; never once per iteration
  });

  test('a cancel seen on the heartbeat stops the handler and records cancelled', async () => {
    const queue = fakeQueue();
    queue.beat = { cancelRequested: true, stillMine: true };
    const out = await runJob(job({ params: { seconds: 5 } }), {
      queue, cfg, log, handlers: { noop: (ctx) => noop(ctx, { sleep: async () => {} }) },
    });
    expect(out).toBe('cancelled');
    expect(queue.calls.some((c) => c[0] === 'succeed')).toBe(false);
  });

  test('a lost claim writes nothing terminal (the newer attempt owns the row)', async () => {
    const queue = fakeQueue();
    queue.beat = { cancelRequested: false, stillMine: false };
    const out = await runJob(job({ params: { seconds: 5 } }), {
      queue, cfg, log, handlers: { noop: (ctx) => noop(ctx, { sleep: async () => {} }) },
    });
    expect(out).toBe('lost');
    expect(queue.calls.filter((c) => ['succeed', 'fail', 'cancelled'].includes(c[0]))).toEqual([]);
  });

  test('negative control: without a cancel the same job runs to success', async () => {
    const queue = fakeQueue();
    const out = await runJob(job({ params: { seconds: 5 } }), {
      queue, cfg, log, handlers: { noop: (ctx) => noop(ctx, { sleep: async () => {} }) },
    });
    expect(out).toBe('succeeded');
    expect(queue.calls.find((c) => c[0] === 'succeed')[1]).toEqual({ slept_seconds: 5 });
  });
});

describe('noop handler', () => {
  const ctx = (params) => ({ params, cancelled: false, progress: jest.fn() });
  test('rejects out-of-range durations', async () => {
    await expect(noop(ctx({ seconds: 601 }), { sleep: async () => {} })).rejects.toMatchObject({ stage: 'validate_failed' });
    await expect(noop(ctx({ seconds: -1 }), { sleep: async () => {} })).rejects.toMatchObject({ stage: 'validate_failed' });
  });
  test('can be asked to fail, for end-to-end failure tests', async () => {
    await expect(noop(ctx({ fail: true }), { sleep: async () => {} })).rejects.toMatchObject({ stage: 'requested_failure' });
  });
  test('reports progress up to 1', async () => {
    const c = ctx({ seconds: 2 });
    await noop(c, { sleep: async () => {} });
    expect(c.progress).toHaveBeenLastCalledWith(1, 'Step 4 of 4');
  });
});

describe('pollOnce', () => {
  test('sweeps first, then claims only up to the concurrency limit', async () => {
    const order = [];
    let n = 0;
    const queue = {
      sweepStale: async () => order.push('sweep'),
      claim: async (kinds) => { order.push(`claim:${kinds.join(',')}`); n += 1; return { id: `j${n}` }; },
    };
    const running = new Map([['busy', Promise.resolve()]]);
    const launched = [];
    const claimed = await pollOnce({ queue, cfg, running, kinds: ['noop'], launch: (j) => { launched.push(j.id); running.set(j.id, 1); } });
    expect(order[0]).toBe('sweep');
    expect(claimed).toBe(1);
    expect(launched).toEqual(['j1']);
  });
  test('stops claiming when the queue is empty', async () => {
    const queue = { sweepStale: async () => {}, claim: async () => null };
    expect(await pollOnce({ queue, cfg, running: new Map(), kinds: KINDS, launch: () => {} })).toBe(0);
  });
});

describe('queue client', () => {
  function recordingSupa(responses = {}) {
    const calls = [];
    return {
      calls,
      rpc: async (fn, args) => { calls.push(['rpc', fn, args]); return responses[fn]; },
      patch: async (table, query, fields) => { calls.push(['patch', table, query, fields]); return []; },
    };
  }
  test('claim passes this worker and its kinds; returns null on an empty queue', async () => {
    const supa = recordingSupa({ qi_claim_job: [] });
    const q = createQueue(supa, cfg);
    expect(await q.claim(['noop'])).toBeNull();
    expect(supa.calls[0]).toEqual(['rpc', 'qi_claim_job', { p_worker_id: 'w-test', p_kinds: ['noop'] }]);
  });
  test('terminal writes are guarded on running + claimed_by + attempt', async () => {
    const supa = recordingSupa();
    const q = createQueue(supa, cfg);
    await q.succeed({ id: 'j9', attempt: 3 }, { a: 1 });
    const [, table, query, fields] = supa.calls[0];
    expect(table).toBe('qi_jobs');
    expect(query).toBe('id=eq.j9&status=eq.running&claimed_by=eq.w-test&attempt=eq.3');
    expect(fields).toMatchObject({ status: 'succeeded', progress: 1, progress_message: null, result_refs: { a: 1 }, engine_commit: 'abc1234' });
  });
  test('heartbeat maps the RPC row to cancel and ownership flags', async () => {
    const supa = recordingSupa({ qi_heartbeat_job: [{ cancel_requested: true, still_mine: true }] });
    const q = createQueue(supa, cfg);
    expect(await q.heartbeat({ id: 'j1', attempt: 1 }, 0.5, 'half')).toEqual({ cancelRequested: true, stillMine: true });
  });
  test('failure messages are capped at 4000 characters', async () => {
    const supa = recordingSupa();
    await createQueue(supa, cfg).fail({ id: 'j', attempt: 1 }, 's', 'x'.repeat(5000));
    expect(supa.calls[0][3].error_message).toHaveLength(4000);
  });
});

describe('supa client', () => {
  const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
  test('retries transient failures with backoff, then succeeds', async () => {
    const responses = [{ ok: false, status: 503, text: async () => '' }, ok([{ id: 1 }])];
    const sleeps = [];
    const supa = createSupa({ url: 'https://x', key: 'k', fetchImpl: async () => responses.shift(), sleep: async (ms) => sleeps.push(ms) });
    expect(await supa.select('qi_jobs', 'limit=1')).toEqual([{ id: 1 }]);
    expect(sleeps).toEqual([1000]);
  });
  test('does not retry a client error, and surfaces it', async () => {
    let n = 0;
    const supa = createSupa({ url: 'https://x', key: 'k', fetchImpl: async () => { n += 1; return { ok: false, status: 400, text: async () => 'bad' }; }, sleep: async () => {} });
    await expect(supa.rpc('f', {})).rejects.toThrow(/400: bad/);
    expect(n).toBe(1);
  });
  test('sends the service key in both headers and never in the URL', async () => {
    let seen;
    const supa = createSupa({ url: 'https://x', key: 'secret-k', fetchImpl: async (u, init) => { seen = { u, init }; return ok(null); }, sleep: async () => {} });
    await supa.rpc('qi_claim_job', { p: 1 });
    expect(seen.u).toBe('https://x/rest/v1/rpc/qi_claim_job');
    expect(seen.u).not.toMatch(/secret-k/);
    expect(seen.init.headers.apikey).toBe('secret-k');
    expect(seen.init.headers.Authorization).toBe('Bearer secret-k');
  });
});

describe('config', () => {
  test('refuses to run without credentials, naming what is missing', () => {
    const c = loadConfig();
    expect(() => assertRunnable({ ...c, supabaseUrl: '', serviceRoleKey: '', s3: { ...c.s3, accessKeyId: '', secretAccessKey: '' } }))
      .toThrow(/SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY/);
  });
});
