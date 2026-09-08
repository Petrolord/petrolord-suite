// 2026-09-07: a stale shell after a deploy repairs itself (activate the
// waiting worker, reload) instead of breaking on the first lazy route.
// 2026-09-08: the repair escalates to a hard refresh when the soft reload
// served the same cached shell, then gives up; every entry point shares one
// in-flight repair; a bare "Failed to fetch" no longer counts.

import {
  shouldAttemptReload, isStaleChunkError, activateWaitingWorker, dropWorkerAndCaches, recoverFromStaleBuild, hardReload,
  ensureRecovery, recoveryInFlight, resetRecoveryState, installPreloadRecovery, RELOAD_GUARD_KEY, HARD_RELOAD_GUARD_KEY,
} from '../preloadRecovery';

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

beforeEach(() => resetRecoveryState());

describe('shouldAttemptReload', () => {
  test('first failure reloads, a second inside the guard window does not, a later one does', () => {
    const s = memStorage();
    expect(shouldAttemptReload(s, 1000)).toBe(true);
    expect(s.getItem(RELOAD_GUARD_KEY)).toBe('1000');
    expect(shouldAttemptReload(s, 30000)).toBe(false);
    expect(shouldAttemptReload(s, 1000 + 60000)).toBe(true);
  });
  test('guards are independent per key', () => {
    const s = memStorage();
    expect(shouldAttemptReload(s, 1000)).toBe(true);
    expect(shouldAttemptReload(s, 1000, 60000, HARD_RELOAD_GUARD_KEY)).toBe(true);
    expect(shouldAttemptReload(s, 1001, 60000, HARD_RELOAD_GUARD_KEY)).toBe(false);
  });
  test('no storage still allows the reload', () => {
    expect(shouldAttemptReload(null, 5)).toBe(true);
  });
});

describe('isStaleChunkError', () => {
  test('recognises the messages browsers produce for a vanished chunk', () => {
    expect(isStaleChunkError(new Error('Failed to fetch dynamically imported module: https://petrolord.com/assets/ReservoirManagement-e1dd0f37.js'))).toBe(true);
    expect(isStaleChunkError(new Error('error loading dynamically imported module: https://petrolord.com/assets/x.js'))).toBe(true);
    expect(isStaleChunkError({ message: 'Importing a module script failed.' })).toBe(true);
    expect(isStaleChunkError(new Error('Loading chunk 12 failed.'))).toBe(true);
  });
  test('leaves other failures alone, including an ordinary network fetch', () => {
    expect(isStaleChunkError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(false);
    expect(isStaleChunkError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isStaleChunkError(new Error("Cannot read properties of undefined (reading 'default')"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

function fakeSw({ waiting = null, registration = true, registrations } = {}) {
  const listeners = {};
  const sw = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: (t) => { delete listeners[t]; },
    getRegistration: async () => (registration ? { waiting, update: async () => {} } : null),
    getRegistrations: async () => registrations || [],
    fire: (t) => listeners[t] && listeners[t](),
  };
  return sw;
}

describe('activateWaitingWorker', () => {
  test('no service worker support: false', async () => {
    expect(await activateWaitingWorker({})).toBe(false);
    expect(await activateWaitingWorker({ serviceWorker: fakeSw({ registration: false }) })).toBe(false);
  });
  test('nothing waiting: false', async () => {
    expect(await activateWaitingWorker({ serviceWorker: fakeSw() })).toBe(false);
  });
  test('a waiting worker is told to skip waiting and the change is awaited', async () => {
    const posted = [];
    const sw = fakeSw({ waiting: { postMessage: (m) => { posted.push(m); setTimeout(() => sw.fire('controllerchange'), 0); } } });
    expect(await activateWaitingWorker({ serviceWorker: sw })).toBe(true);
    expect(posted).toEqual([{ type: 'SKIP_WAITING' }]);
  });
  test('a waiting worker that never answers times out to false', async () => {
    const sw = fakeSw({ waiting: { postMessage: () => {} } });
    expect(await activateWaitingWorker({ serviceWorker: sw }, { timeoutMs: 10 })).toBe(false);
  });
});

describe('dropWorkerAndCaches', () => {
  test('unregisters every worker and deletes every cache, surviving failures', async () => {
    const sw = fakeSw({ registrations: [{ unregister: async () => true }, { unregister: async () => { throw new Error('no'); } }, { unregister: async () => true }] });
    const deleted = [];
    const caches = { keys: async () => ['suite-assets', 'workbox-precache', 'suite-fonts'], delete: async (k) => { deleted.push(k); return k !== 'suite-fonts'; } };
    expect(await dropWorkerAndCaches({ serviceWorker: sw }, { caches })).toEqual({ unregistered: 2, cachesDeleted: 2 });
    expect(deleted).toEqual(['suite-assets', 'workbox-precache', 'suite-fonts']);
  });
  test('nothing to drop is fine', async () => {
    expect(await dropWorkerAndCaches({}, {})).toEqual({ unregistered: 0, cachesDeleted: 0 });
    expect(await dropWorkerAndCaches(null, null)).toEqual({ unregistered: 0, cachesDeleted: 0 });
  });
});

describe('recoverFromStaleBuild', () => {
  test('soft reload first, hard reload when that did not help, then the guard stops it', async () => {
    let reloads = 0;
    const unregistered = [];
    const windowLike = { location: { reload: () => { reloads += 1; } }, caches: { keys: async () => ['a'], delete: async () => true } };
    const navigatorLike = { serviceWorker: fakeSw({ registrations: [{ unregister: async () => { unregistered.push(1); return true; } }] }) };
    const storage = memStorage();
    expect(await recoverFromStaleBuild({ windowLike, navigatorLike, storage, nowMs: 100 })).toEqual({ reloaded: true, mode: 'soft', activated: false });
    expect(unregistered).toHaveLength(0);
    expect(await recoverFromStaleBuild({ windowLike, navigatorLike, storage, nowMs: 200 })).toEqual({ reloaded: true, mode: 'hard', unregistered: 1, cachesDeleted: 1 });
    expect(await recoverFromStaleBuild({ windowLike, navigatorLike, storage, nowMs: 300 })).toEqual({ reloaded: false, reason: 'guard' });
    expect(reloads).toBe(2);
    // a minute later the sequence starts over
    expect((await recoverFromStaleBuild({ windowLike, navigatorLike, storage, nowMs: 100 + 60000 })).mode).toBe('soft');
  });
  test('hardReload ignores the guards and drops the worker', async () => {
    let reloads = 0;
    const storage = memStorage();
    storage.setItem(RELOAD_GUARD_KEY, '1'); storage.setItem(HARD_RELOAD_GUARD_KEY, '1');
    const windowLike = { location: { reload: () => { reloads += 1; } } };
    const navigatorLike = { serviceWorker: fakeSw({ registrations: [{ unregister: async () => true }] }) };
    expect(await hardReload({ windowLike, navigatorLike, storage })).toEqual({ reloaded: true, mode: 'hard', unregistered: 1, cachesDeleted: 0 });
    expect(reloads).toBe(1);
    expect(storage.getItem(RELOAD_GUARD_KEY)).toBeNull();
  });
});

describe('ensureRecovery', () => {
  test('several entry points share one repair while it runs', async () => {
    let reloads = 0;
    const env = { windowLike: { location: { reload: () => { reloads += 1; } } }, navigatorLike: {}, storage: memStorage() };
    expect(recoveryInFlight()).toBe(false);
    const a = ensureRecovery(env);
    const b = ensureRecovery(env);
    expect(a).toBe(b);
    expect(recoveryInFlight()).toBe(true);
    expect(await a).toEqual({ reloaded: true, mode: 'soft', activated: false });
    expect(reloads).toBe(1);
    expect(recoveryInFlight()).toBe(true); // the page is reloading; stay calm until it does
  });
  test('a repair that gave up clears the flag so the boundary can offer the manual reload', async () => {
    const storage = memStorage();
    storage.setItem(RELOAD_GUARD_KEY, '100'); storage.setItem(HARD_RELOAD_GUARD_KEY, '100');
    const env = { windowLike: { location: { reload: () => {} } }, navigatorLike: {}, storage, nowMs: 200 };
    expect(await ensureRecovery(env)).toEqual({ reloaded: false, reason: 'guard' });
    expect(recoveryInFlight()).toBe(false);
  });
});

describe('installPreloadRecovery', () => {
  function fakeWindow() {
    const handlers = {};
    let reloads = 0;
    const windowLike = {
      addEventListener: (t, fn) => { handlers[t] = fn; },
      removeEventListener: (t) => { delete handlers[t]; },
      location: { reload: () => { reloads += 1; } },
      sessionStorage: memStorage(),
      reloads: () => reloads,
    };
    return { windowLike, handlers };
  }

  test('the vite:preloadError listener starts the repair and lets Vite rethrow (the boundary shows the calm panel)', async () => {
    const { windowLike, handlers } = fakeWindow();
    const off = installPreloadRecovery({ windowLike, navigatorLike: {} });
    let prevented = false;
    handlers['vite:preloadError']({ payload: new Error('Failed to fetch dynamically imported module: /assets/EmployeeManagement-77aac070.js'), preventDefault: () => { prevented = true; } });
    expect(recoveryInFlight()).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(prevented).toBe(false);
    expect(windowLike.reloads()).toBe(1);
    // an unrelated preload problem is left to Vite
    resetRecoveryState();
    handlers['vite:preloadError']({ payload: new Error('Unable to preload CSS'), preventDefault: () => {} });
    expect(recoveryInFlight()).toBe(false);
    off();
    expect(handlers['vite:preloadError']).toBeUndefined();
    expect(handlers.unhandledrejection).toBeUndefined();
  });

  test('an unhandled rejection with the same message is swallowed and repaired; a network fetch failure is not', async () => {
    const { windowLike, handlers } = fakeWindow();
    installPreloadRecovery({ windowLike, navigatorLike: {} });
    let prevented = false;
    handlers.unhandledrejection({ reason: new TypeError('Failed to fetch'), preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(false);
    expect(recoveryInFlight()).toBe(false);
    handlers.unhandledrejection({ reason: new TypeError('Failed to fetch dynamically imported module: /assets/xlsx-1234abcd.js'), preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(windowLike.reloads()).toBe(1);
  });
});
