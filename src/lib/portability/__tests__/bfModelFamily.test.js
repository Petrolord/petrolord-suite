// BF-U1-021 (Basin & Charge Modeling upgrade U1, 2026-10-01): bf_wells
// travel in a .pld (plan cross-cutting item). Before: the table was in no
// family, so a package or backup lost every basin model. A model tied to a
// registry well brings that well; on import every id of the well inside the
// model (the tie and each layer's provenance) is remapped.
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildGeosciencePackage } from '@/lib/portability/exportPackage';
import { readPackage, planImport } from '@/lib/portability/importPackage';
import { tableSpec, getFamily, rootTable } from '@/lib/portability/familySpec';
import { BACKUP_KINDS } from '@/lib/portability/backup';
import schema from '../../../../test-data/portability/manifest.schema.json';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const M = '00000002-0000-4000-8000-000000000000';
const W = '00000003-0000-4000-8000-000000000000';

const model = {
  id: M, user_id: USER, name: 'KETA-2 stratigraphy', status: 'in-progress', location_coords: '(1,2)',
  stratigraphy: [{ id: `strat-${W}-0`, name: 'Top A', ageStart: 33.9, ageEnd: 23.03, thickness: 800, lithology: 'shale', sourceRock: { isSource: true, toc: 3, hi: 450, kerogen: 'type2' }, provenance: { registry_well_id: W, top_md_m: 800 } }],
  heat_flow: { type: 'constant', value: 62 }, erosion_events: [{ age: 23.03, amount: 300, surface: 'Top A' }],
  settings: { surfaceTemp: 15, registryWellId: W, registryWellName: 'KETA-2' }, calibration_data: { ro: [{ depth: 1000, value: 0.6 }], temp: [] }, scenarios: [],
};
const well = { id: W, user_id: USER, organization_id: null, name: 'KETA-2', crs: 'EPSG:32631' };
const source = {
  async currentUser() { return { id: USER, organization_id: null, organization_name: null }; },
  async getRow(table, id) { if (table === 'bf_wells' && id === M) return model; if (table === 'geo_wells' && id === W) return well; return null; },
  async listChildren() { return []; },
  async downloadBlob() { return new Uint8Array(); },
  async listBlobs() { return []; },
  async listStateRowsForWells() { return []; },
  async getCustomCrs() { return null; },
};

test('the geoscience family carries bf_wells with a root kind, a backup lists it, the manifest allows it', () => {
  expect(getFamily('geoscience').roots.bf_model).toBe('bf_wells');
  expect(rootTable('bf_model')).toEqual({ family: 'geoscience', table: 'bf_wells' });
  expect(tableSpec('bf_wells').kind).toBe('bf-model');
  expect(BACKUP_KINDS).toContain('bf_model');
  expect(JSON.stringify(schema)).toContain('"bf_model"');
});

test('a basin model package brings its tied well and imports under the new owner with the well remapped', async () => {
  const built = await buildGeosciencePackage(source, [{ kind: 'bf_model', id: M }], { name: 'Basin handover' });
  expect([...built.collection.tables.bf_wells.keys()]).toEqual([M]);
  expect([...built.collection.tables.geo_wells.keys()]).toEqual([W]);
  expect(built.refs.dangling).toEqual([]);
  const pkg = await readPackage(await built.writer.toUint8Array());
  const plan = planImport(pkg, { userId: DST, organizationId: null });
  const row = plan.planned.bf_wells[0];
  const newWell = plan.planned.geo_wells[0].id;
  expect(row.user_id).toBe(DST);
  expect(row.id).not.toBe(M);
  expect(newWell).not.toBe(W);
  expect(row.settings.registryWellId).toBe(newWell);
  expect(row.stratigraphy[0].provenance.registry_well_id).toBe(newWell);
  expect(row.stratigraphy[0].sourceRock).toMatchObject({ isSource: true, toc: 3 });
  expect(row.erosion_events[0].amount).toBe(300);
});
