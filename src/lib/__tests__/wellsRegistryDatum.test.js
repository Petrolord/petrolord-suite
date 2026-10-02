/**
 * WDM-U2-007: the registry's datum door on both sides of migration
 * 20261002090000. The fake PostgREST below refuses any write that names a
 * datum column while `mockColumns` is false, with the error the real one
 * gives (PGRST204), so the fallback is exercised and not assumed.
 */
import { DATUM_COLUMNS } from '../wellDatum';

const mockWrites = [];
let mockColumns = true;
let mockRows = [];
jest.mock('@/lib/customSupabaseClient', () => {
  const builder = (table) => {
    const st = { op: 'select', payload: null, single: false };
    const result = () => {
      if (st.op === 'select') return { data: st.single ? (mockRows[0] || null) : mockRows, error: null };
      const rows = [].concat(st.payload);
      const named = rows.flatMap((r) => Object.keys(r)).find((k) => ['depth_ref_kind', 'depth_ref_label', 'depth_ref_elev_m', 'well_environment', 'ground_elev_m', 'water_depth_m', 'vertical_datum', 'elev_unit', 'datum_changes'].includes(k));
      if (!mockColumns && named) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${named}' column of '${table}' in the schema cache` } };
      mockWrites.push({ table, op: st.op, payload: st.payload });
      const out = rows.map((r, i) => ({ id: r.id || `${table}-${mockWrites.length}-${i}`, ...r }));
      return { data: st.single ? out[0] : out, error: null };
    };
    const b = {
      select() { return b; },
      insert(p) { st.op = 'insert'; st.payload = p; return b; },
      update(p) { st.op = 'update'; st.payload = p; return b; },
      eq() { return b; },
      order() { return b; },
      single() { st.single = true; return Promise.resolve(result()); },
      then(f, r) { return Promise.resolve(result()).then(f, r); },
    };
    return b;
  };
  return { supabase: { from: (t) => builder(t), auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } } };
});

const reg = jest.requireActual('@/lib/wellsRegistry');
const nullDatum = Object.fromEntries(DATUM_COLUMNS.map((c) => [c, null]));
const last = () => mockWrites[mockWrites.length - 1].payload;

beforeEach(() => { mockWrites.length = 0; mockColumns = true; mockRows = []; reg._resetDatumColumns(); reg._resetBuildStamp(); });

describe('saveWell', () => {
  test('a blank KB is saved as not set: NULL in the datum columns, never a 0 that reads as a value', async () => {
    await reg.saveWell({ name: 'W', surfaceX: 1, surfaceY: 2 });
    expect(last()).toMatchObject({ kb_m: 0, depth_ref_kind: null, depth_ref_elev_m: null });
    await reg.saveWell({ name: 'W2', surfaceX: 1, surfaceY: 2, kbM: null });
    expect(last().depth_ref_elev_m).toBeNull();
  });
  test('a KB is stated as a kelly bushing elevation and mirrored in kb_m', async () => {
    await reg.saveWell({ name: 'W', surfaceX: 1, surfaceY: 2, kbM: 25.3 });
    expect(last()).toMatchObject({ kb_m: 25.3, depth_ref_kind: 'KB', depth_ref_elev_m: 25.3 });
  });
  test('a full datum (a confirmed LAS proposal) is saved field by field', async () => {
    await reg.saveWell({ name: 'W', surfaceX: 1, surfaceY: 2, datum: { refKind: 'DF', refElevM: 31.2, environment: 'offshore', waterDepthM: 120, verticalDatum: 'LAT', elevUnit: 'ft' } });
    expect(last()).toMatchObject({ kb_m: 31.2, depth_ref_kind: 'DF', depth_ref_elev_m: 31.2, well_environment: 'offshore', water_depth_m: 120, ground_elev_m: null, vertical_datum: 'LAT', elev_unit: 'ft' });
  });
  test('a datum that fails the shared checks is refused before any request', async () => {
    await expect(reg.saveWell({ name: 'W', surfaceX: 1, surfaceY: 2, datum: { refKind: 'KB', refElevM: 25, environment: 'onshore', waterDepthM: 100 } })).rejects.toThrow(/Water depth belongs to an offshore well/);
    await expect(reg.saveWell({ name: 'W', surfaceX: 1, surfaceY: 2, kbM: 'abc' })).rejects.toThrow(/KB must be a number/);
    expect(mockWrites).toHaveLength(0);
  });
  test('before the migration: the well is saved as before (kb_m only), once, and the session stops sending the columns', async () => {
    mockColumns = false;
    await reg.saveWell({ name: 'W', surfaceX: 1, surfaceY: 2, kbM: 25.3 });
    expect(mockWrites).toHaveLength(1);
    expect(last().kb_m).toBe(25.3);
    for (const c of DATUM_COLUMNS) expect(c in last()).toBe(false);
    expect(reg.datumColumnsKnownMissing()).toBe(true);
    await reg.saveWell({ name: 'W2', surfaceX: 1, surfaceY: 2 });
    expect(mockWrites).toHaveLength(2);
    expect(last().kb_m).toBe(0);
  });
  test('a read tells which side of the migration the registry is on', async () => {
    mockRows = [{ id: 'a', kb_m: 30 }];
    await reg.listWells();
    expect(reg.datumColumnsKnownMissing()).toBe(true);
    mockRows = [{ id: 'a', kb_m: 30, ...nullDatum }];
    await reg.listWells();
    expect(reg.datumColumnsKnownMissing()).toBe(false);
  });
});

describe('updateWellDatum', () => {
  const next = { refKind: 'RT', refElevM: 31.5, environment: 'offshore', waterDepthM: 100, verticalDatum: 'MSL', elevUnit: 'm' };
  const record = { at: '2026-10-02T09:00:00.000Z', by: 'u1', kind: 'correction' };
  test('with the columns: every field, kb_m mirrored, the record appended, checkshots in the same write', async () => {
    const well = { id: 'w1', name: 'W', kb_m: 25, ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 25, datum_changes: [{ at: 'earlier' }] };
    const cs = [{ tvdss_m: 100, twt_ms: 130 }, { tvdss_m: 900, twt_ms: 800 }];
    const res = await reg.updateWellDatum(well, next, { record, checkshots: cs, checkshotsProvenance: { kb_m_used: 31.5 } });
    expect(mockWrites).toHaveLength(1);
    expect(last()).toMatchObject({ depth_ref_kind: 'RT', depth_ref_elev_m: 31.5, kb_m: 31.5, well_environment: 'offshore', water_depth_m: 100, vertical_datum: 'MSL', checkshots: cs, checkshots_provenance: { kb_m_used: 31.5 } });
    expect(last().datum_changes).toEqual([{ at: 'earlier' }, record]);
    expect(res).toMatchObject({ columns: true, dropped: [] });
  });
  test('before the migration: the elevation in kb_m, the record merged into crs_provenance, and what was dropped is returned', async () => {
    const well = { id: 'w1', name: 'W', kb_m: 25, crs_provenance: { deviation: { source: 'wellsite-studio' } } };
    const res = await reg.updateWellDatum(well, next, { record });
    expect(mockWrites).toHaveLength(1);
    expect(last().kb_m).toBe(31.5);
    for (const c of DATUM_COLUMNS) expect(c in last()).toBe(false);
    expect(last().crs_provenance).toEqual({ deviation: { source: 'wellsite-studio' }, datum_changes: [record] });
    expect(res.columns).toBe(false);
    expect(res.dropped).toEqual(['reference kind', 'environment', 'water depth', 'vertical datum name']);
  });
  test('a row that looked upgraded but whose write is refused falls back the same way', async () => {
    mockColumns = false;
    const well = { id: 'w1', name: 'W', kb_m: 25, ...nullDatum };
    const res = await reg.updateWellDatum(well, next, { record });
    expect(mockWrites).toHaveLength(1);
    expect(last().kb_m).toBe(31.5);
    expect('depth_ref_kind' in last()).toBe(false);
    expect(res.columns).toBe(false);
    expect(reg.datumColumnsKnownMissing()).toBe(true);
  });
  test('hostile datums never reach the registry', async () => {
    const well = { id: 'w1', name: 'W', kb_m: 25, ...nullDatum };
    await expect(reg.updateWellDatum(well, { refKind: 'KB', refElevM: -25, environment: 'offshore' })).rejects.toThrow(/offshore KB cannot be below/);
    await expect(reg.updateWellDatum(well, { refKind: 'KB', refElevM: 25, waterDepthM: -1, environment: 'offshore' })).rejects.toThrow(/cannot be negative/);
    await expect(reg.updateWellDatum(well, { refElevM: 25 })).rejects.toThrow(/Say what the reference elevation belongs to/);
    expect(mockWrites).toHaveLength(0);
  });
  test('clearing is saved as NULL, with kb_m 0 for older builds', async () => {
    const well = { id: 'w1', name: 'W', kb_m: 25, ...nullDatum, depth_ref_kind: 'KB', depth_ref_elev_m: 25 };
    await reg.updateWellDatum(well, {});
    expect(last()).toMatchObject({ depth_ref_kind: null, depth_ref_elev_m: null, kb_m: 0 });
  });
});
