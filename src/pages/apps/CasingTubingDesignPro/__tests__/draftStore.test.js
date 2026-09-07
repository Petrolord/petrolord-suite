// Tester fix 2026-09-07: unsaved casing work is mirrored to storage and
// restored only when it is newer than the saved row and differs from it;
// storage that throws never breaks the app.

import { writeDraft, readDraft, clearDraft, draftSupersedes, draftKeysFor } from '../services/draftStore';

const memStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
};

test('write, read, clear round-trip with the timestamp', () => {
  const s = memStorage();
  const doc = { strings: { casingStrings: [] }, environment: { mudDensityKgM3: 1500 } };
  expect(writeDraft(s, 'wb-1', 'case-1', doc, 1000)).toBe(1000);
  expect(readDraft(s, 'wb-1', 'case-1')).toEqual({ savedAt: 1000, doc });
  expect(readDraft(s, 'wb-1', 'case-2')).toBeNull();
  clearDraft(s, 'wb-1', 'case-1');
  expect(readDraft(s, 'wb-1', 'case-1')).toBeNull();
});

test('a draft supersedes the row only when newer AND different', () => {
  const saved = { a: 1 };
  const row = { updated_at: new Date(5000).toISOString() };
  expect(draftSupersedes({ savedAt: 6000, doc: { a: 2 } }, row, saved)).toBe(true);
  expect(draftSupersedes({ savedAt: 4000, doc: { a: 2 } }, row, saved)).toBe(false); // older than the save
  expect(draftSupersedes({ savedAt: 6000, doc: { a: 1 } }, row, saved)).toBe(false); // identical
  expect(draftSupersedes({ savedAt: 6000, doc: { a: 2 } }, { updated_at: null }, saved)).toBe(true); // never saved
  expect(draftSupersedes(null, row, saved)).toBe(false);
});

test('storage that throws is tolerated; garbage is ignored; keys listed per wellbore', () => {
  const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  expect(writeDraft(bad, 'wb', 'c', { a: 1 })).toBeNull();
  expect(readDraft(bad, 'wb', 'c')).toBeNull();
  expect(() => clearDraft(bad, 'wb', 'c')).not.toThrow();
  const s = memStorage();
  s.setItem('ct-draft:wb:c', '{not json');
  expect(readDraft(s, 'wb', 'c')).toBeNull();
  s.setItem('ct-draft:wb:c', JSON.stringify({ savedAt: 'x', doc: {} }));
  expect(readDraft(s, 'wb', 'c')).toBeNull();
  writeDraft(s, 'wb', 'c1', { a: 1 }, 1);
  writeDraft(s, 'wb', 'c2', { a: 1 }, 1);
  writeDraft(s, 'other', 'c3', { a: 1 }, 1);
  expect(draftKeysFor(s, 'wb').sort()).toEqual(['ct-draft:wb:c', 'ct-draft:wb:c1', 'ct-draft:wb:c2']);
});
