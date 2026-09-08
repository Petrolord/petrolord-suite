// 2026-09-08: the service worker looks for a new build when the tab comes
// back into view, when the connection returns and on a slow interval.
import { installUpdateChecks, UPDATE_CHECK_INTERVAL_MS } from '../updateChecks';

function harness({ visibilityState = 'visible', onLine = true } = {}) {
  const docHandlers = {}; const winHandlers = {};
  let updates = 0;
  const registration = { update: async () => { updates += 1; } };
  const documentLike = { visibilityState, addEventListener: (t, fn) => { docHandlers[t] = fn; }, removeEventListener: (t) => { delete docHandlers[t]; } };
  const windowLike = { addEventListener: (t, fn) => { winHandlers[t] = fn; }, removeEventListener: (t) => { delete winHandlers[t]; } };
  const intervals = [];
  const timers = { setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval: (id) => { intervals[id - 1] = null; } };
  const navigatorLike = { onLine };
  const off = installUpdateChecks(registration, { windowLike, documentLike, navigatorLike, timers });
  return { docHandlers, winHandlers, intervals, off, updates: () => updates, documentLike, navigatorLike };
}

test('checks when the tab becomes visible again, not when it is hidden', () => {
  const h = harness();
  h.documentLike.visibilityState = 'hidden';
  h.docHandlers.visibilitychange();
  expect(h.updates()).toBe(0);
  h.documentLike.visibilityState = 'visible';
  h.docHandlers.visibilitychange();
  expect(h.updates()).toBe(1);
});

test('checks when the connection returns and on the interval, but never while offline', () => {
  const h = harness();
  h.winHandlers.online();
  expect(h.updates()).toBe(1);
  expect(h.intervals[0].ms).toBe(UPDATE_CHECK_INTERVAL_MS);
  h.intervals[0].fn();
  expect(h.updates()).toBe(2);
  h.navigatorLike.onLine = false;
  h.intervals[0].fn();
  h.docHandlers.visibilitychange();
  expect(h.updates()).toBe(2);
});

test('unsubscribe removes everything; a missing registration is a no-op', () => {
  const h = harness();
  h.off();
  expect(h.intervals[0]).toBeNull();
  expect(h.docHandlers.visibilitychange).toBeUndefined();
  expect(h.winHandlers.online).toBeUndefined();
  expect(typeof installUpdateChecks(null)).toBe('function');
  expect(typeof installUpdateChecks({})).toBe('function');
});

test('a failing update check is swallowed', () => {
  const registration = { update: () => Promise.reject(new Error('offline')) };
  const off = installUpdateChecks(registration, { windowLike: {}, documentLike: { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} }, navigatorLike: {}, timers: { setInterval: (fn) => { fn(); return 1; }, clearInterval: () => {} } });
  off();
});
