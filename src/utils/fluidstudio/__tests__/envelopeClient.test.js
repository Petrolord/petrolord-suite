/**
 * FS5 — envelope client falls back to the synchronous trace in jsdom
 * (the worker factory is jest-mapped to a null factory) and produces the
 * same physics as the FS4 envelope module.
 */
import { createEnvelopeClient } from '../envelopeClient';
import { runEnvelopeTrace } from '../eos/envelope.worker';

const binaryRequest = {
  keys: ['C1', 'nC4'],
  z: [0.35, 0.65],
  plus: null,
  tMinF: 60,
  tMaxF: 200,
  nT: 3,
  resTempF: 100,
};

describe('envelope client (sync fallback)', () => {
  test('trace resolves with bubble/dew branches and the reservoir-T saturation point', async () => {
    const client = createEnvelopeClient();
    const res = await client.trace(binaryRequest);
    expect(res.points).toHaveLength(3);
    expect(res.bubble.length + res.dew.length).toBeGreaterThan(0);
    expect(res.satAtRes.pPsia).toBeGreaterThan(500);
    expect(['bubble', 'dew']).toContain(res.satAtRes.kind);
    client.dispose();
  });

  test('client trace equals a direct runEnvelopeTrace call', async () => {
    const client = createEnvelopeClient();
    const viaClient = await client.trace(binaryRequest);
    const direct = runEnvelopeTrace(binaryRequest);
    expect(viaClient.satAtRes.pPsia).toBeCloseTo(direct.satAtRes.pPsia, 10);
    expect(viaClient.bubble).toEqual(direct.bubble);
    client.dispose();
  });

  test('characterized C7+ request rebuilds the pseudo inside the trace', async () => {
    const client = createEnvelopeClient();
    const res = await client.trace({
      keys: ['C1', 'C7+'],
      z: [0.7, 0.3],
      plus: { mw: 190, sg: 0.84 },
      tMinF: 100,
      tMaxF: 220,
      nT: 2,
      resTempF: 150,
    });
    expect(res.satAtRes.pPsia).toBeGreaterThan(1000);
    client.dispose();
  });
});

describe('ET3: lab-tune through the client (sync fallback)', () => {
  test('tune resolves with a fit result and tuned envelope moves with it', async () => {
    const client = createEnvelopeClient();
    const fluid = { keys: ['C1', 'C7+'], plus: { mw: 190, sg: 0.84 }, z: [0.7, 0.3] };
    const base = await client.trace({
      keys: fluid.keys, z: fluid.z, plus: fluid.plus, tMinF: 100, tMaxF: 220, nT: 2, resTempF: 150,
    });
    const target = base.satAtRes.pPsia * 1.05; // pretend the lab measured 5% higher
    const fit = await client.tune({ fluid, targets: { psat: { tF: 150, pPsia: target } } });
    expect(fit.ok).toBe(true);
    expect(Math.abs(fit.report[0].tunedErr)).toBeLessThan(0.5);
    // the tuned knobs flow into the envelope payload and move the boundary
    const tuned = await client.trace({
      keys: fluid.keys, z: fluid.z, plus: fluid.plus, tuning: fit.tuning,
      tMinF: 100, tMaxF: 220, nT: 2, resTempF: 150,
    });
    expect(Math.abs(tuned.satAtRes.pPsia - target) / target).toBeLessThan(0.005);
    client.dispose();
  });
});

describe('FS8: worker cancellation (fake worker path)', () => {
  const makeFakeWorker = () => {
    const w = {
      posted: [],
      terminated: false,
      onmessage: null,
      onerror: null,
      postMessage(msg) { this.posted.push(msg); },
      terminate() { this.terminated = true; },
      respond(id, payload) { this.onmessage({ data: { id, ok: true, payload } }); },
      fail(id, error) { this.onmessage({ data: { id, ok: false, error } }); },
    };
    return w;
  };

  const makeClient = () => {
    const workers = [];
    const client = createEnvelopeClient({
      workerFactory: () => {
        const w = makeFakeWorker();
        workers.push(w);
        return w;
      },
    });
    return { client, workers };
  };

  test('a superseding trace terminates the stale worker and resolves fresh', async () => {
    const { client, workers } = makeClient();
    const first = client.trace({ n: 1 });
    expect(workers).toHaveLength(1);
    const second = client.trace({ n: 2 });
    await expect(first).rejects.toThrow('superseded');
    // the stale worker was killed mid-trace and a new one spawned
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    const { id } = workers[1].posted[0];
    workers[1].respond(id, { ok: 2 });
    await expect(second).resolves.toEqual({ ok: 2 });
    client.dispose();
  });

  test('cancel rejects the in-flight trace and terminates its worker', async () => {
    const { client, workers } = makeClient();
    const p = client.trace({ n: 1 });
    client.cancel();
    await expect(p).rejects.toThrow('cancelled');
    expect(workers[0].terminated).toBe(true);
    // cancel with nothing in flight is a no-op
    client.cancel();
    client.dispose();
  });

  test('dispose rejects the in-flight trace and terminates the worker', async () => {
    const { client, workers } = makeClient();
    const p = client.trace({ n: 1 });
    client.dispose();
    await expect(p).rejects.toThrow('disposed');
    expect(workers[0].terminated).toBe(true);
  });

  test('a stale response id is ignored; the live one resolves', async () => {
    const { client, workers } = makeClient();
    const first = client.trace({ n: 1 });
    const staleId = workers[0].posted[0].id;
    const second = client.trace({ n: 2 });
    await expect(first).rejects.toThrow('superseded');
    const live = workers[1];
    // a late message carrying the stale id must not settle the live trace
    live.onmessage({ data: { id: staleId, ok: true, payload: { ok: 1 } } });
    live.respond(live.posted[0].id, { ok: 2 });
    await expect(second).resolves.toEqual({ ok: 2 });
    client.dispose();
  });

  test('a worker error rejects and the next trace respawns', async () => {
    const { client, workers } = makeClient();
    const p = client.trace({ n: 1 });
    workers[0].onerror();
    await expect(p).rejects.toThrow('crashed');
    const q = client.trace({ n: 2 });
    expect(workers).toHaveLength(2);
    workers[1].respond(workers[1].posted[0].id, { ok: 2 });
    await expect(q).resolves.toEqual({ ok: 2 });
    client.dispose();
  });
});
