/**
 * Phase 6 regression tests for the hostile-review fixes that carry the
 * most correctness risk: the ingest backpressure ack protocol (H2) and
 * the brick-cache 401 token-refresh retry (M3). The RCP-side unit
 * normalization (H1) and large-surface handling (M2) are exercised in
 * the RCP dialog code; here we lock the engine-level invariants.
 */
import { BrickCache, storageBrickFetcher } from '@/pages/apps/Seismolord/engine/brickCache';

describe('storageBrickFetcher token-refresh on 401 (M3)', () => {
  const makeFetch = (responses) => {
    let call = 0;
    // eslint-disable-next-line no-undef
    global.fetch = jest.fn(async () => responses[call++]);
    return () => call;
  };
  const okResp = () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) });
  const unauth = () => ({ ok: false, status: 401 });

  afterEach(() => { delete global.fetch; });

  test('retries once with a forced token after a 401, then succeeds', async () => {
    makeFetch([unauth(), okResp()]);
    const forces = [];
    const fetcher = storageBrickFetcher({
      supabaseUrl: 'https://x', bucket: 'seismic',
      getToken: async (force) => { forces.push(Boolean(force)); return force ? 'fresh' : 'stale'; },
    });
    const buf = await fetcher('u/v/bricks/0-0-0.f32');
    expect(buf.byteLength).toBe(8);
    expect(forces).toEqual([false, true]);           // first normal, retry forced
  });

  test('a persistent 401 surfaces as a clear error after the single retry', async () => {
    makeFetch([unauth(), unauth()]);
    const fetcher = storageBrickFetcher({
      supabaseUrl: 'https://x', getToken: async () => 't',
    });
    await expect(fetcher('u/v/bricks/0-0-0.f32')).rejects.toThrow(/401/);
  });
});

describe('BrickCache concurrency is bounded by acked backpressure model (H2 shape)', () => {
  // Mirrors the ingest invariant: with one ack per completion, at most
  // MAX in-flight requests exist at once. Here we prove the cache itself
  // never issues a duplicate fetch for an in-flight path, the property
  // the fixed ack protocol relies on.
  test('never double-fetches an in-flight path even under a burst', async () => {
    let active = 0;
    let peak = 0;
    const cache = new BrickCache(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return new Float32Array(4).buffer;
    });
    // 20 concurrent gets across 4 distinct paths -> at most 4 real fetches
    const paths = ['a', 'b', 'c', 'd'];
    await Promise.all(Array.from({ length: 20 }, (_, i) => cache.get(paths[i % 4])));
    expect(cache.stats.misses).toBe(4);              // one fetch per distinct path
    expect(peak).toBeLessThanOrEqual(4);
  });
});
