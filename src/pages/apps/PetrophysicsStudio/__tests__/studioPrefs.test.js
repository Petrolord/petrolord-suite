/** PT11b: per-user Studio preferences (the Split view divider first). */
import { readPrefs, writePrefs, prefsKey, DEFAULT_PREFS, SPLIT_MIN_PERCENT } from '../services/studioPrefs';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
};

test('round trip: a written split survives a reload for the same user only', () => {
  const st = fakeStorage();
  expect(readPrefs('u1', st)).toEqual(DEFAULT_PREFS);
  writePrefs('u1', { splitPercent: 42.5 }, st);
  expect(readPrefs('u1', st).splitPercent).toBe(42.5);
  expect(readPrefs('u2', st).splitPercent).toBe(DEFAULT_PREFS.splitPercent);
  expect(st.map.has(prefsKey('u1'))).toBe(true);
  expect(prefsKey('u1')).toBe('petrophysicsstudio.prefs.u1.v1');
});

test('a corrupt or out-of-range blob falls back to the default; private mode never throws', () => {
  const st = fakeStorage();
  st.setItem(prefsKey('u1'), '{not json');
  expect(readPrefs('u1', st)).toEqual(DEFAULT_PREFS);
  st.setItem(prefsKey('u1'), JSON.stringify({ splitPercent: SPLIT_MIN_PERCENT - 1 }));
  expect(readPrefs('u1', st).splitPercent).toBe(DEFAULT_PREFS.splitPercent);
  st.setItem(prefsKey('u1'), JSON.stringify([1, 2]));
  expect(readPrefs('u1', st)).toEqual(DEFAULT_PREFS);
  const throwing = { getItem: () => { throw new Error('private'); }, setItem: () => { throw new Error('private'); } };
  expect(readPrefs('u1', throwing)).toEqual(DEFAULT_PREFS);
  expect(writePrefs('u1', { splitPercent: 50 }, throwing).splitPercent).toBe(50);
});
