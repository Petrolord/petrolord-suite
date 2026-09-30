/**
 * AppUpgrade WC-U2-001 (2026-09-29): named sections in the registry service.
 * geo_correlation_sections keeps many owner-only rows per user (no schema or
 * RLS change). Negative control: on origin/main saveSection always updated
 * the newest row, so saving section B after opening it overwrote whichever
 * section was saved last, and there was no create, rename or delete.
 */
const calls = [];
let rows = [];
const builder = (table) => {
  const q = { table, filters: {}, op: 'select', payload: null };
  const api = {
    select() { return api; },
    order() { return api; },
    limit() { return api; },
    eq(k, v) { q.filters[k] = v; return api; },
    insert(p) { q.op = 'insert'; q.payload = p; return api; },
    update(p) { q.op = 'update'; q.payload = p; return api; },
    delete() { q.op = 'delete'; return api; },
    single() { q.single = true; return api; },
    then(res, rej) {
      calls.push(q);
      let data;
      if (q.op === 'select') data = q.filters.id ? rows.filter((r) => r.id === q.filters.id) : [...rows];
      else if (q.op === 'insert') { data = { id: `new-${rows.length + 1}`, ...q.payload }; rows.push(data); }
      else if (q.op === 'update') { const r = rows.find((x) => x.id === q.filters.id); if (r) Object.assign(r, q.payload); data = r ? [{ ...r }] : []; }
      if (q.single) data = Array.isArray(data) ? data[0] || null : data;
      else if (q.op === 'delete') { const n = rows.length; rows = rows.filter((x) => x.id !== q.filters.id); data = n === rows.length ? [] : [{ id: q.filters.id }]; }
      return Promise.resolve({ data, error: null }).then(res, rej);
    },
  };
  return api;
};
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: { from: (t) => builder(t), auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }) } },
}));

import { listSections, loadSection, saveSection, createSection, renameSection, deleteSection } from '@/lib/sectionsRegistry';

beforeEach(() => {
  calls.length = 0;
  rows = [
    { id: 'a', name: 'North line', well_ids: ['w1', 'w2'], datum: { mode: 'structural' }, track_layout: {}, updated_at: '2026-09-29T10:00:00Z' },
    { id: 'b', name: 'South line', well_ids: ['w3'], datum: { mode: 'structural' }, track_layout: {}, updated_at: '2026-09-28T10:00:00Z' },
  ];
});

test('lists every own section with its well count', async () => {
  expect(await listSections()).toEqual([
    { id: 'a', name: 'North line', wellCount: 2, updated_at: '2026-09-29T10:00:00Z' },
    { id: 'b', name: 'South line', wellCount: 1, updated_at: '2026-09-28T10:00:00Z' },
  ]);
});

test('opens a section by id, and says so when it is gone', async () => {
  expect((await loadSection('b')).name).toBe('South line');
  await expect(loadSection('zzz')).rejects.toThrow(/no longer exists/);
});

test('saving with an id updates that row only', async () => {
  await saveSection({ well_ids: ['w3', 'w4'] }, { id: 'b' });
  const upd = calls.filter((c) => c.op === 'update');
  expect(upd).toHaveLength(1);
  expect(upd[0].filters.id).toBe('b');
  expect(rows.find((r) => r.id === 'a').well_ids).toEqual(['w1', 'w2']);
});

test('create refuses a name the user already has (any case), then creates', async () => {
  await expect(createSection('  north LINE ')).rejects.toThrow(/already have a section named North line/);
  await expect(createSection('   ')).rejects.toThrow(/Type a name/);
  const row = await createSection('East line', { well_ids: ['w9'] });
  expect(row).toMatchObject({ name: 'East line', user_id: 'me', well_ids: ['w9'] });
  expect(rows).toHaveLength(3);
});

test('rename checks the other names, keeps its own', async () => {
  await expect(renameSection('b', 'north line')).rejects.toThrow(/already have/);
  await renameSection('a', 'North Line');
  expect(rows.find((r) => r.id === 'a').name).toBe('North Line');
});

test('delete removes one row and reports an unowned row', async () => {
  await deleteSection('a');
  expect(rows.map((r) => r.id)).toEqual(['b']);
  await expect(deleteSection('a')).rejects.toThrow(/Only the owner/);
});
