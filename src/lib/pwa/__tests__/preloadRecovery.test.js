// 2026-09-07: a stale shell after a deploy repairs itself once (activate
// the waiting worker, reload) instead of breaking on the first lazy route.

import {
  shouldAttemptReload, isStaleChunkError, activateWaitingWorker, recoverFromStaleBuild, installPreloadRecovery, RELOAD_GUARD_KEY,
} from '../preloadRecovery';

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

describe('shouldAttemptReload', () => {
  test('first failure reloads, a second inside the guard window does not, a later one does', () => {
    const s = memStorage();
    expect(shouldAttemptReload(s, 1000)).toBe(true);
    expect(s.getItem(RELOAD_GUARD_KEY)).toBe('1000');
    expect(shouldAttemptReload(s, 30000)).toBe(false);
    expect(shouldAttemptReload(s, 1000 + 60000)).toBe(true);
  });
  test('no storage still allows the reload', () => {
    expect(shouldAttemptReload(null, 5)).toBe(true);
  });
});

describe('isStaleChunkError', () => {
  test('recognises the messages browsers produce for a vanished chunk', () => {
    expect(isStaleChunkError(new Error('Failed to fetch dynamically imported module: https://petrolord.com/assets/EmployeeManagement-77aac070.js'))).toBe(true);
    expect(isStaleChunkError({ message: 'Importing a module script failed.' })).toBe(true);
    expect(isStaleChunkError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

function fakeSw({ waiting = null, registration = true } = {}) {
  const listeners = {};
  const sw = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: (t) => { delete listeners[t]; },
    getRegistration: async () => (registration ? { waiting, update: async () => {} } : null),
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

describe('recoverFromStaleBuild and installPreloadRecovery', () => {
  test('reloads once, then the guard stops a second attempt', async () => {
    let reloads = 0;
    const windowLike = { location: { reload: () => { reloads += 1; } } };
    const storage = memStorage();
    expect(await recoverFromStaleBuild({ windowLike, navigatorLike: {}, storage, nowMs: 100 })).toEqual({ reloaded: true, activated: false });
    expect(await recoverFromStaleBuild({ windowLike, navigatorLike: {}, storage, nowMs: 200 })).toEqual({ reloaded: false, reason: 'guard' });
    expect(reloads).toBe(1);
  });

  test('the vite:preloadError listener prevents the rethrow and triggers the repair', async () => {
    const handlers = {};
    let reloads = 0;
    const windowLike = {
      addEventListener: (t, fn) => { handlers[t] = fn; },
      removeEventListener: (t) => { delete handlers[t]; },
      location: { reload: () => { reloads += 1; } },
      sessionStorage: memStorage(),
    };
    const off = installPreloadRecovery({ windowLike, navigatorLike: {} });
    let prevented = false;
    handlers['vite:preloadError']({ payload: new Error('Failed to fetch dynamically imported module: /assets/EmployeeManagement-77aac070.js'), preventDefault: () => { prevented = true; } });
    await new Promise((r) => setTimeout(r, 0));
    expect(prevented).toBe(true);
    expect(reloads).toBe(1);
    // an unrelated preload problem is left to Vite
    let prevented2 = false;
    handlers['vite:preloadError']({ payload: new Error('Unable to preload CSS'), preventDefault: () => { prevented2 = true; } });
    expect(prevented2).toBe(false);
    off();
    expect(handlers['vite:preloadError']).toBeUndefined();
  });
});
