// One name per registry (owner rule 2026-09-03): the pure rule every
// well-creating door (Well Data Manager add/LAS import, Seismolord,
// Well Planning publish) and the in-memory harness backends share.
jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

import { wellNameKey, wellNameClashMessage } from '@/lib/wellsRegistry';

const ME = 'user-me';
const wells = [
  { id: 'w1', name: 'KETA G1-1', user_id: ME },
  { id: 'w2', name: 'Shared Well', user_id: 'user-teammate' },
];

describe('wellNameKey', () => {
  test('folds case, trims and collapses inner whitespace', () => {
    expect(wellNameKey('  Keta   g1-1 ')).toBe('keta g1-1');
    expect(wellNameKey(null)).toBe('');
  });
});

describe('wellNameClashMessage', () => {
  test('a free name passes', () => {
    expect(wellNameClashMessage('KETA G1-2', wells, { userId: ME })).toBeNull();
  });
  test('an empty name is refused', () => {
    expect(wellNameClashMessage('   ', wells, { userId: ME })).toMatch(/needs a name/);
  });
  test('exact, case and whitespace variants of an own well clash', () => {
    for (const n of ['KETA G1-1', 'keta g1-1', ' KETA  G1-1 ']) {
      expect(wellNameClashMessage(n, wells, { userId: ME })).toMatch(/already exists in your registry/);
    }
  });
  test('a name shared by a teammate clashes with its own wording', () => {
    expect(wellNameClashMessage('shared well', wells, { userId: ME })).toMatch(/shared with you by a teammate/);
  });
  test('renaming a well to its own name is not a clash', () => {
    expect(wellNameClashMessage('keta g1-1', wells, { exceptId: 'w1', userId: ME })).toBeNull();
    expect(wellNameClashMessage('keta g1-1', wells, { exceptId: 'w2', userId: ME })).toMatch(/already exists/);
  });
});
