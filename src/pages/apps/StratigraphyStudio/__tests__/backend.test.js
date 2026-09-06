// Stratigraphy Studio ST0: the in-memory backend (the harness contract)
// and the shape every consumer relies on: typed-top fields on the shared
// tops rows, owner-only writes, a column whose deletes clear references
// instead of cascading (the FK on delete set null behaviour).

import { makeInMemoryBackend, seededUnits } from '../services/inMemoryBackend';
import { orderedUnits, validateColumn } from '@/lib/stratigraphy/column';
import { topRow } from '@/lib/wellsRegistry';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

describe('in-memory backend', () => {
  test('wells and tops come from the sample section with typed surfaces on two tops', async () => {
    const b = makeInMemoryBackend();
    const wells = await b.listWells();
    expect(wells.map((w) => w.name)).toEqual(['KETA-1', 'KETA-2', 'KETA-3']);
    const tops = await b.listTops('corr-w1');
    expect(tops.map((t) => `${t.name}:${t.surface_type}`)).toEqual(['Top Dome:formation_top', 'Mid Shale:MFS', 'Base Sand:SU']);
  });

  test('typing a top writes the typed fields and keeps the rest', async () => {
    const b = makeInMemoryBackend();
    const [dome] = await b.listTops('corr-w1');
    const row = await b.updateTop(dome.id, { surface_type: 'MRS', unit_id: 'unit-agbada-upper', confidence: 'high', age_ma: '5.333' });
    expect(row).toMatchObject({ name: 'Top Dome', md_m: 1500, surface_type: 'MRS', unit_id: 'unit-agbada-upper', confidence: 'high', age_ma: 5.333 });
    const again = await b.updateTop(dome.id, { unit_id: '', age_ma: '' });
    expect(again.unit_id).toBeNull();
    expect(again.age_ma).toBeNull();
    expect(again.surface_type).toBe('MRS');
  });

  test('a shared well refuses typed edits like RLS would', async () => {
    const b = makeInMemoryBackend();
    const [t] = await b.listTops('corr-w3');
    await expect(b.updateTop(t.id, { surface_type: 'SU' })).rejects.toThrow(/Only the owner/);
  });

  test('the seeded column is sound and orders group > formation', async () => {
    const b = makeInMemoryBackend();
    const units = await b.listUnits();
    expect(validateColumn(units)).toEqual([]);
    expect(orderedUnits(units).map((u) => `${u.depth}:${u.name}`)).toEqual(['0:Agbada', '1:Upper Agbada', '1:Lower Agbada', '0:Akata']);
    expect(seededUnits()).toHaveLength(4);
  });

  test('units: add, update, delete clears references without cascading', async () => {
    const b = makeInMemoryBackend();
    const member = await b.saveUnit({ name: 'D1 Sand', rank: 'member', parent_id: 'unit-agbada-upper', age_top_ma: '5.333' });
    expect(member).toMatchObject({ rank: 'member', parent_id: 'unit-agbada-upper', age_top_ma: 5.333 });
    await b.updateUnit(member.id, { colour: '#123456', order_index: '0' });
    expect((await b.listUnits()).find((u) => u.id === member.id)).toMatchObject({ colour: '#123456', order_index: 0 });
    const [dome] = await b.listTops('corr-w1');
    await b.updateTop(dome.id, { unit_id: 'unit-agbada-upper' });
    await b.deleteUnit({ id: 'unit-agbada-upper' });
    const units = await b.listUnits();
    expect(units.find((u) => u.id === 'unit-agbada-upper')).toBeUndefined();
    expect(units.find((u) => u.id === member.id).parent_id).toBeNull();
    expect((await b.listTops('corr-w1'))[0].unit_id).toBeNull();
    await expect(b.saveUnit({ name: '  ' })).rejects.toThrow(/needs a name/);
    await expect(b.deleteUnit({ id: 'nope' })).rejects.toThrow(/Only the owner/);
  });
});

describe('wellsRegistry.topRow (the insert row of a top)', () => {
  test('plain tops keep the historic shape; typed fields ride along only when given', () => {
    expect(topRow('w', { name: 'A', mdM: 10 })).toEqual({ well_id: 'w', name: 'A', md_m: 10, interpreter: null });
    expect(topRow('w', { name: 'A', mdM: 10, surface_type: 'MFS', unit_id: '', age_ma: '5.3', confidence: 'low' }))
      .toEqual({ well_id: 'w', name: 'A', md_m: 10, interpreter: null, surface_type: 'MFS', unit_id: null, age_ma: 5.3, confidence: 'low' });
    expect(topRow('w', { name: 'A', mdM: 10, age_ma: null }).age_ma).toBeNull();
  });
});
