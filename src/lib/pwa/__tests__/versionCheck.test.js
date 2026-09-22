// 2026-09-22 (Seismolord tester note): the "new version" prompt must be
// decided by the server's build stamp, and must not come back after one
// refresh.
import {
  buildKey, fetchServerBuild, decideUpdate, rememberAutoActivation, rememberLater, clearStaleCaches, VERSION_URL,
} from '../versionCheck';

const OLD = { version: '4.0.0', sha: 'aaaaaaaaa', builtAt: '2026-09-21T10:00:00Z' };
const NEW = { version: '4.0.0', sha: 'bbbbbbbbb', builtAt: '2026-09-22T10:00:00Z' };

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test('build identity is the sha, falling back to the build time', () => {
  expect(buildKey(OLD)).toBe('sha:aaaaaaaaa');
  expect(buildKey({ sha: 'unknown', builtAt: 'x' })).toBe('at:x');
  expect(buildKey({ sha: 'unknown' })).toBeNull();
  expect(buildKey(null)).toBeNull();
});

test('the version file is fetched past every cache', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => NEW }; };
  const got = await fetchServerBuild({ fetchImpl, now: () => 123 });
  expect(got).toEqual(NEW);
  expect(calls[0].url).toBe(`${VERSION_URL}?t=123`);
  expect(calls[0].init.cache).toBe('no-store');
  expect(calls[0].init.headers['cache-control']).toBe('no-cache');
});

test('an unreachable or unreadable version file is unknown, never a throw', async () => {
  expect(await fetchServerBuild({ fetchImpl: async () => { throw new Error('offline'); } })).toBeNull();
  expect(await fetchServerBuild({ fetchImpl: async () => ({ ok: false }) })).toBeNull();
  expect(await fetchServerBuild({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) })).toBeNull();
});

test('a waiting worker for the build already running is activated quietly, with no prompt', () => {
  expect(decideUpdate({ running: NEW, server: NEW, atLoad: true, storage: memoryStorage() })).toBe('activate-quietly');
  expect(decideUpdate({ running: NEW, server: NEW, atLoad: false, storage: memoryStorage() })).toBe('activate-quietly');
});

test('the version check stops after a refresh', () => {
  const storage = memoryStorage();
  // Load 1: the tab opens on the old shell with the new worker waiting.
  // The person has just loaded the page, so it is activated and reloaded.
  const first = decideUpdate({ running: OLD, server: NEW, atLoad: true, storage });
  expect(first).toBe('activate-and-reload');
  rememberAutoActivation(NEW, storage);
  // Load 2: the reload landed on the new build. Nothing to say, ever again.
  expect(decideUpdate({ running: NEW, server: NEW, atLoad: true, storage })).toBe('activate-quietly');
  expect(decideUpdate({ running: NEW, server: NEW, atLoad: false, storage })).toBe('activate-quietly');
});

test('a reload that could not land (another tab holds the old worker) prompts once instead of looping', () => {
  const storage = memoryStorage();
  rememberAutoActivation(NEW, storage);
  expect(decideUpdate({ running: OLD, server: NEW, atLoad: true, storage })).toBe('prompt');
});

test('a new build found mid-session prompts, and Later holds for that build only', () => {
  const storage = memoryStorage();
  expect(decideUpdate({ running: OLD, server: NEW, atLoad: false, storage })).toBe('prompt');
  rememberLater(NEW, storage);
  expect(decideUpdate({ running: OLD, server: NEW, atLoad: false, storage })).toBe('none');
  const NEWER = { sha: 'ccccccccc' };
  expect(decideUpdate({ running: OLD, server: NEWER, atLoad: false, storage })).toBe('prompt');
});

test('with no server answer the old behaviour stands: prompt mid-session, silent at load', () => {
  expect(decideUpdate({ running: OLD, server: null, atLoad: false, storage: memoryStorage() })).toBe('prompt');
  expect(decideUpdate({ running: OLD, server: null, atLoad: true, storage: memoryStorage() })).toBe('none');
});

test('stale caches from older set-ups are deleted, the owned ones kept', async () => {
  const deleted = [];
  const cachesLike = {
    keys: async () => ['workbox-precache-v2-https://x/', 'suite-assets', 'suite-fonts', 'workbox-runtime-old', 'legacy-shell'],
    delete: async (n) => { deleted.push(n); return true; },
  };
  expect(await clearStaleCaches({ cachesLike })).toEqual(['workbox-runtime-old', 'legacy-shell']);
  expect(deleted).toEqual(['workbox-runtime-old', 'legacy-shell']);
});
