// WDM-U2-007: a project package (.pld) carries a well's datum model.
//  - export then import keeps every datum field and the change record;
//  - a package from before the datum model (kb_m only) imports and reads as
//    it did;
//  - a package with the datum model imported where the registry has no datum
//    columns yet goes in with the reference elevation and says what could
//    not be kept (the sink's fallback against the real PostgREST error).
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildGeosciencePackage } from '@/lib/portability/exportPackage';
import { readPackage, planImport } from '@/lib/portability/importPackage';
import { readWellDatum, DATUM_COLUMNS } from '@/lib/wellDatum';

const mockInserts = [];
let mockColumns = true;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (table) => ({
      insert: async (rows) => {
        const named = [].concat(rows).flatMap((r) => Object.keys(r)).find((k) => ['depth_ref_kind', 'depth_ref_label', 'depth_ref_elev_m', 'well_environment', 'ground_elev_m', 'water_depth_m', 'vertical_datum', 'elev_unit', 'datum_changes'].includes(k));
        if (!mockColumns && named) return { error: { code: 'PGRST204', message: `Could not find the '${named}' column of '${table}' in the schema cache` } };
        mockInserts.push({ table, rows });
        return { error: null };
      },
    }),
    auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
  },
}));
jest.mock('@/lib/orgContext', () => ({ getUserOrgRow: async () => null }));

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const WELL = '11111111-1111-4111-8111-111111111111';
const CHANGE = { at: '2026-10-02T09:00:00.000Z', by: USER, by_name: 'Ada Obi', kind: 'correction', shift_tvdss_m: -6.5, reason: 'rig survey report' };
const DATUM = { depth_ref_kind: 'RT', depth_ref_label: null, depth_ref_elev_m: 31.5, well_environment: 'offshore', ground_elev_m: null, water_depth_m: 100, vertical_datum: 'LAT', elev_unit: 'ft', datum_changes: [CHANGE] };
const base = { id: WELL, user_id: USER, organization_id: null, name: 'OKAN-7', deviation: [], checkshots: [], crs: null };

const sourceOf = (well) => ({
  async currentUser() { return { id: USER, organization_id: null, organization_name: null }; },
  async getRow(table, id) { return table === 'geo_wells' && id === WELL ? well : null; },
  async listChildren() { return []; },
  async downloadBlob() { return new Uint8Array(); },
  async listBlobs() { return []; },
  async listStateRowsForWells() { return []; },
  async getCustomCrs() { return null; },
});
const roundTrip = async (well) => {
  const built = await buildGeosciencePackage(sourceOf(well), [{ kind: 'well', id: WELL }], { name: 'Datum handover' });
  const pkg = await readPackage(await built.writer.toUint8Array());
  return planImport(pkg, { userId: DST, organizationId: null }).planned.geo_wells[0];
};

beforeEach(() => { mockInserts.length = 0; mockColumns = true; });

test('export then import keeps every datum field and the change record', async () => {
  const row = await roundTrip({ ...base, kb_m: 31.5, ...DATUM });
  for (const c of DATUM_COLUMNS) expect(row[c]).toEqual(DATUM[c]);
  expect(row.kb_m).toBe(31.5);
  expect(row.user_id).toBe(DST);
  const d = readWellDatum(row);
  expect(d).toMatchObject({ state: 'set', refKind: 'RT', refElevM: 31.5, environment: 'offshore', waterDepthM: 100, verticalDatum: 'LAT', elevUnit: 'ft' });
  expect(d.changes).toEqual([CHANGE]);
});

test('a well with no reference elevation stays not set through a package (never 0)', async () => {
  const blank = Object.fromEntries(DATUM_COLUMNS.map((c) => [c, null]));
  const row = await roundTrip({ ...base, kb_m: 0, ...blank });
  expect(row.depth_ref_elev_m).toBeNull();
  expect(readWellDatum(row).state).toBe('unset');
});

test('a package from before the datum model imports and reads as it did', async () => {
  const row = await roundTrip({ ...base, kb_m: 30 });
  for (const c of DATUM_COLUMNS) expect(c in row).toBe(false);
  expect(readWellDatum(row)).toMatchObject({ state: 'legacy-kb', refElevM: 30 });
  // once inserted into the upgraded registry its datum columns are NULL: the same reading, said
  expect(readWellDatum({ ...row, ...Object.fromEntries(DATUM_COLUMNS.map((c) => [c, null])) })).toMatchObject({ state: 'legacy-kb', refElevM: 30 });
});

describe('the registry sink', () => {
  const { makeSupabaseSink } = jest.requireActual('@/lib/portability/supabaseSink');
  const rows = [{ id: 'w1', name: 'OKAN-7', kb_m: 31.5, ...DATUM }];
  test('with the datum columns the rows go in whole', async () => {
    const sink = makeSupabaseSink();
    await sink.insertRows('geo_wells', rows);
    expect(mockInserts).toHaveLength(1);
    expect(mockInserts[0].rows[0]).toMatchObject({ depth_ref_kind: 'RT', depth_ref_elev_m: 31.5, water_depth_m: 100 });
    expect(sink.takeNotes()).toEqual([]);
  });
  test('without them the wells go in with the elevation in kb_m and the import says what was not kept', async () => {
    mockColumns = false;
    const sink = makeSupabaseSink();
    await sink.insertRows('geo_wells', rows);
    expect(mockInserts).toHaveLength(1);
    for (const c of DATUM_COLUMNS) expect(c in mockInserts[0].rows[0]).toBe(false);
    expect(mockInserts[0].rows[0].kb_m).toBe(31.5);
    expect(sink.takeNotes()).toEqual(['1 well imported with the reference elevation only: this database does not hold the depth reference kind, environment, ground level, water depth or datum name yet.']);
    expect(sink.takeNotes()).toEqual([]);   // read once
  });
  test('another table failing on an unknown column is not swallowed', async () => {
    mockColumns = false;
    const sink = makeSupabaseSink();
    await expect(sink.insertRows('geo_wells_tops', [{ id: 't', depth_ref_kind: 'KB' }])).rejects.toThrow(/Could not write geo_wells_tops/);
  });
});
