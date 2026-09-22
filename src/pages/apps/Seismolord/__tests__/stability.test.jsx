/**
 * Stability (tester feedback 2026-09-22: "intermittent hanging that
 * needs a page refresh"). Every brick request settles (timeout + one
 * retry) so a stalled GET can no longer pin a BrickCache slot; the
 * access token is cached (no auth-lock read per brick); the tracker job
 * always settles (token failure, cancel, watchdog); the IndexedDB brick
 * store accounts bytes from small meta records; a failed slice offers
 * Retry.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  fetchWithTimeout, withBrickTimeout, FetchTimeoutError, ABORTED,
} from '@/pages/apps/Seismolord/lib/fetchWithTimeout';
import { BrickCache, ABORTED as ENGINE_ABORTED } from '@/pages/apps/Seismolord/engine/brickCache';
import { startTrackerJob, TRACK_CANCELLED } from '@/pages/apps/Seismolord/services/trackerRunner';
import {
  persistentBrickFetcher, purgePersistedBricks, __trackedBytes, __resetBrickStore,
} from '@/pages/apps/Seismolord/services/brickStore';
import SliceLoadError from '@/pages/apps/Seismolord/components/workspace/SliceLoadError';

const mockAuth = {
  getSession: jest.fn(),
  refreshSession: jest.fn(),
  onAuthStateChange: jest.fn(),
};
jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: mockAuth } }));

const never = () => new Promise(() => {});
const tick = () => new Promise((r) => { setTimeout(r, 0); });

describe('fetchWithTimeout', () => {
  afterEach(() => jest.useRealTimers());

  test('the abort marker matches the engine cache marker', () => {
    expect(ABORTED).toBe(ENGINE_ABORTED);
  });

  test('a normal answer passes straight through', async () => {
    await expect(fetchWithTimeout(async () => 42, { timeoutMs: 1000 })).resolves.toBe(42);
  });

  test('a stalled request is aborted, retried once, then fails with a timeout', async () => {
    jest.useFakeTimers();
    const signals = [];
    const p = fetchWithTimeout((s) => { signals.push(s); return never(); }, { timeoutMs: 1000, retries: 1 });
    const out = p.catch((e) => e);
    jest.advanceTimersByTime(1000);
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);        // the stalled attempt stops too
    jest.advanceTimersByTime(1000);
    const err = await out;
    expect(err).toBeInstanceOf(FetchTimeoutError);
    expect(err.message).toMatch(/timed out after 1 s \(2 attempts\)/);
    expect(signals[1].aborted).toBe(true);
  });

  test('the retry can succeed', async () => {
    jest.useFakeTimers();
    let n = 0;
    const p = fetchWithTimeout(() => (n++ === 0 ? never() : Promise.resolve('ok')), { timeoutMs: 500 });
    jest.advanceTimersByTime(500);
    await expect(p).resolves.toBe('ok');
  });

  test("the caller's abort wins at once and aborts the request", async () => {
    const outer = new AbortController();
    let inner = null;
    const p = fetchWithTimeout((s) => { inner = s; return never(); }, { signal: outer.signal, timeoutMs: 60000 });
    outer.abort();
    await expect(p).rejects.toThrow(ABORTED);
    expect(inner.aborted).toBe(true);
  });

  test('HTTP errors fail at once; network errors get one retry', async () => {
    const http = jest.fn(async () => { throw new Error('Brick fetch failed (500)'); });
    await expect(withBrickTimeout(http)('p', null)).rejects.toThrow('500');
    expect(http).toHaveBeenCalledTimes(1);
    let n = 0;
    const flaky = jest.fn(async () => { if (n++ === 0) throw new TypeError('Failed to fetch'); return new ArrayBuffer(4); });
    await expect(withBrickTimeout(flaky)('p', null)).resolves.toBeInstanceOf(ArrayBuffer);
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  test('a stalled brick no longer pins a cache slot (the hang)', async () => {
    jest.useFakeTimers();
    const calls = [];
    const fetcher = (path) => {
      calls.push(path);
      return path === 'stuck' ? never() : Promise.resolve(new Float32Array(8).buffer);
    };
    // one slot: before the fix the second brick queued behind the stalled one forever
    const cache = new BrickCache(withBrickTimeout(fetcher, { timeoutMs: 1000, retries: 0 }), { maxConcurrent: 1 });
    const stuck = cache.get('stuck').catch((e) => e);
    const next = cache.get('next');
    await Promise.resolve();
    expect(calls).toEqual(['stuck']);
    jest.advanceTimersByTime(1000);
    expect(await stuck).toBeInstanceOf(FetchTimeoutError);
    await expect(next).resolves.toHaveLength(8);
    expect(calls).toEqual(['stuck', 'next']);
    expect(cache.activeFetches).toBe(0);
  });

  test('negative control: without the wrapper the slot stays pinned', async () => {
    const fetcher = (path) => (path === 'stuck' ? never() : Promise.resolve(new Float32Array(8).buffer));
    const cache = new BrickCache(fetcher, { maxConcurrent: 1 });
    cache.get('stuck').catch(() => {});
    let done = false;
    cache.get('next').then(() => { done = true; });
    await tick();
    await tick();
    expect(done).toBe(false);
    expect(cache.activeFetches).toBe(1);
  });
});

describe('cached access token', () => {
  // eslint-disable-next-line global-require
  const mod = () => require('@/pages/apps/Seismolord/services/accessToken');
  const session = (token, inS = 3600) => ({
    access_token: token, expires_at: Math.floor(Date.now() / 1000) + inS,
  });

  beforeEach(() => {
    mod().resetAccessTokenCache();
    mockAuth.getSession.mockReset().mockResolvedValue({ data: { session: session('t1') } });
    mockAuth.refreshSession.mockReset().mockResolvedValue({ data: { session: session('t2') }, error: null });
    mockAuth.onAuthStateChange.mockReset();
  });

  test('a burst of brick reads takes the auth lock once', async () => {
    const tokens = await Promise.all(Array.from({ length: 50 }, () => mod().getAccessToken()));
    expect(new Set(tokens)).toEqual(new Set(['t1']));
    expect(mockAuth.getSession).toHaveBeenCalledTimes(1);
    await mod().getAccessToken();
    expect(mockAuth.getSession).toHaveBeenCalledTimes(1);
  });

  test('a 401 burst refreshes once', async () => {
    await mod().getAccessToken();
    const forced = await Promise.all(Array.from({ length: 10 }, () => mod().getAccessToken(true)));
    expect(new Set(forced)).toEqual(new Set(['t2']));
    await mod().getAccessToken(true);
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
  });

  test('auth events keep the cache current; signed out rejects', async () => {
    await mod().getAccessToken();
    const listener = mockAuth.onAuthStateChange.mock.calls[0][0];
    listener('TOKEN_REFRESHED', session('t3'));
    await expect(mod().getAccessToken()).resolves.toBe('t3');
    listener('SIGNED_OUT', null);
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    mockAuth.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('no') });
    await expect(mod().getAccessToken()).rejects.toThrow('Not signed in');
  });
});

describe('tracker job', () => {
  const fakeWorker = () => {
    const w = {
      posted: [],
      terminated: false,
      postMessage(m) { this.posted.push(m); },
      terminate() { this.terminated = true; },
      emit(data) { this.onmessage({ data }); },
    };
    return w;
  };
  afterEach(() => jest.useRealTimers());

  test('done resolves and terminates the worker', async () => {
    const w = fakeWorker();
    const job = startTrackerJob({ createWorker: () => w, id: 7, config: {}, getToken: async () => 't' });
    expect(w.posted[0]).toMatchObject({ type: 'track3d', id: 7 });
    w.emit({ id: 7, type: 'done', picks: new Float32Array([1, 2]).buffer, confidence: null });
    const out = await job.promise;
    expect(Array.from(out.picks)).toEqual([1, 2]);
    expect(w.terminated).toBe(true);
  });

  test('a token refresh failure rejects instead of hanging', async () => {
    const w = fakeWorker();
    const job = startTrackerJob({
      createWorker: () => w, id: 1, config: {}, getToken: async () => { throw new Error('Not signed in'); },
    });
    w.emit({ id: 1, type: 'need-token', nonce: 3 });
    await expect(job.promise).rejects.toThrow(/sign-in could not be refreshed/);
    expect(w.terminated).toBe(true);
  });

  test('a token refresh answers the worker', async () => {
    const w = fakeWorker();
    startTrackerJob({ createWorker: () => w, id: 1, config: {}, getToken: async () => 'fresh' });
    w.emit({ id: 1, type: 'need-token', nonce: 9 });
    await tick();
    expect(w.posted[1]).toEqual({ type: 'token', nonce: 9, token: 'fresh' });
  });

  test('cancel terminates at once and rejects', async () => {
    const w = fakeWorker();
    const job = startTrackerJob({ createWorker: () => w, id: 1, config: {}, getToken: async () => 't' });
    job.cancel();
    await expect(job.promise).rejects.toThrow(TRACK_CANCELLED);
    expect(w.terminated).toBe(true);
  });

  test('a silent worker trips the watchdog; progress keeps it alive', async () => {
    jest.useFakeTimers();
    const w = fakeWorker();
    const onProgress = jest.fn();
    const job = startTrackerJob({
      createWorker: () => w, id: 1, config: {}, getToken: async () => 't', onProgress, watchdogMs: 1000,
    });
    const out = job.promise.catch((e) => e);
    jest.advanceTimersByTime(900);
    w.emit({ id: 1, type: 'progress', tracked: 256, total: 1024 });
    jest.advanceTimersByTime(900);
    expect(w.terminated).toBe(false);
    expect(onProgress).toHaveBeenCalledWith(256, 1024);
    jest.advanceTimersByTime(200);
    expect((await out).message).toMatch(/stopped responding/);
    expect(w.terminated).toBe(true);
  });
});

describe('IndexedDB brick store (v2)', () => {
  beforeEach(async () => {
    __resetBrickStore();
    await new Promise((r) => { const q = indexedDB.deleteDatabase('seismolord-bricks'); q.onsuccess = r; q.onerror = r; q.onblocked = r; });
  });
  const settle = async () => { for (let i = 0; i < 20; i++) await tick(); };

  test('second read comes from disk; bytes are tracked from meta records', async () => {
    const net = jest.fn(async () => new ArrayBuffer(1024));
    const f = persistentBrickFetcher(net);
    await f('u/v1/bricks/0-0-0.f32', null);
    await settle();
    await f('u/v1/bricks/0-0-0.f32', null);
    expect(net).toHaveBeenCalledTimes(1);
    expect(__trackedBytes()).toBe(1024);
    // reopen: the total is recomputed from the meta store alone
    __resetBrickStore();
    await persistentBrickFetcher(net)('u/v1/bricks/0-0-0.f32', null);
    expect(__trackedBytes()).toBe(1024);
    expect(net).toHaveBeenCalledTimes(1);
  });

  test('eviction trims the oldest entries to the budget', async () => {
    const net = jest.fn(async () => new ArrayBuffer(1000));
    const f = persistentBrickFetcher(net, { budgetBytes: 2500 });
    for (const k of ['a', 'b', 'c']) {
      // eslint-disable-next-line no-await-in-loop
      await f(`u/v1/bricks/${k}.f32`, null);
      // eslint-disable-next-line no-await-in-loop
      await settle();
    }
    expect(__trackedBytes()).toBe(2000);
    await f('u/v1/bricks/a.f32', null);           // evicted: back to the network
    expect(net).toHaveBeenCalledTimes(4);
  });

  test('purge drops one volume only', async () => {
    const net = jest.fn(async () => new ArrayBuffer(100));
    const f = persistentBrickFetcher(net);
    await f('u/v1/bricks/a.f32', null);
    await f('u/v2/bricks/a.f32', null);
    await settle();
    await purgePersistedBricks('v1');
    expect(__trackedBytes()).toBe(100);
    await f('u/v2/bricks/a.f32', null);
    await f('u/v1/bricks/a.f32', null);
    expect(net).toHaveBeenCalledTimes(3);
  });

  test('a v1 database upgrades in place (old cache dropped)', async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('seismolord-bricks', 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore('bricks', { keyPath: 'path' });
        s.createIndex('ts', 'ts');
        s.put({ path: 'u/v1/bricks/old.f32', buf: new ArrayBuffer(8), bytes: 8, ts: 1 });
      };
      req.onsuccess = () => { req.result.close(); resolve(); };
      req.onerror = () => reject(req.error);
    });
    const net = jest.fn(async () => new ArrayBuffer(16));
    const buf = await persistentBrickFetcher(net)('u/v1/bricks/old.f32', null);
    expect(buf.byteLength).toBe(16);               // refetched, v1 payloads gone
    expect(net).toHaveBeenCalledTimes(1);
  });
});

describe('slice load error', () => {
  test('shows the reason and a Retry', () => {
    const onRetry = jest.fn();
    render(<SliceLoadError error="The data request timed out after 30 s (2 attempts)." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The slice did not load');
    fireEvent.click(screen.getByTestId('sl-slice-retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  test('renders nothing without an error', () => {
    const { container } = render(<SliceLoadError error={null} onRetry={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
