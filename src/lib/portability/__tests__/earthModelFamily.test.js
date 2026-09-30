// EM-U1-013 (Earth Modeling upgrade U1, 2026-09-30): em_models travel in a
// .pld. A model root brings the surfaces and polygons its definition names;
// on import every packaged id under `definition` is rewritten, including a
// split fault polygon's '<uuid>#2'. Before: em_models was in no family, so a
// package or backup silently lost every earth model.
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildGeosciencePackage } from '@/lib/portability/exportPackage';
import { readPackage, planImport } from '@/lib/portability/importPackage';
import { tableSpec, getFamily } from '@/lib/portability/familySpec';
import { emModelRefs } from '@/lib/portability/geoscienceHooks';
import { BACKUP_KINDS } from '@/lib/portability/backup';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const [TOP, BASE, ISO, FAULTS, LEASE, MODEL] = [uid(1), uid(2), uid(3), uid(4), uid(5), uid(6)];

function makeSource() {
  const surf = (id, name, kind = 'structure') => ({ id, user_id: USER, organization_id: null, name, kind, origin_x: 0, origin_y: 0, nx: 2, ny: 2, dx: 10, dy: 10, rotation_deg: 0, z_domain: 'depth', z_unit: 'm', crs: 'EPSG:32631', provenance: {}, storage_path: `${USER}/${id}/grid.f32` });
  const cult = (id, name, kind) => ({ id, user_id: USER, organization_id: null, name, kind, crs: 'EPSG:32631', storage_path: `${USER}/${id}/features.json` });
  const model = {
    id: MODEL, user_id: USER, name: 'Keta framework', crs: 'EPSG:32631', schema_version: 1,
    definition: {
      name: 'Keta framework', surfaceIds: [TOP, 'derived-x', BASE], topNames: ['', '', ''],
      zones: [{ name: 'A', registryZone: 'A' }, { name: 'B', registryZone: 'B' }],
      derived: [{ id: 'derived-x', kind: 'parallel', sourceId: TOP, isochoreId: ISO, name: 'Top + iso' }],
      faultPolygons: [{ name: 'Faults (2)', cultureId: `${FAULTS}#2`, vertices: [[0, 0], [1, 0], [1, 1]] }, { name: 'Drawn', vertices: [[0, 0], [2, 0], [2, 2]] }],
      frame: { cellM: '', boundaryId: LEASE },
    },
  };
  const TABLES = { geo_surfaces: [surf(TOP, 'Top'), surf(BASE, 'Base'), surf(ISO, 'Iso', 'isochore'), surf(uid(9), 'Unrelated')], geo_culture: [cult(FAULTS, 'Faults', 'fault_polygon'), cult(LEASE, 'Lease', 'boundary')], em_models: [model] };
  const grid = new Uint8Array(new Float32Array([-1, -1, -1, -1]).buffer);
  return {
    async currentUser() { return { id: USER, organization_id: null, organization_name: null }; },
    async getRow(table, id) { return (TABLES[table] || []).find((r) => r.id === id) || null; },
    async listChildren() { return []; },
    async downloadBlob(bucket) { return bucket === 'culture' ? new TextEncoder().encode('[]') : grid; },
    async listBlobs() { return []; },
    async listStateRowsForWells() { return []; },
    async getCustomCrs() { return null; },
  };
}

test('the family carries em_models with its root kind, and a backup lists it', () => {
  const fam = getFamily('geoscience');
  expect(fam.roots.em_model).toBe('em_models');
  expect(fam.order.indexOf('geo_surfaces')).toBeLessThan(fam.order.indexOf('em_models'));
  expect(tableSpec('em_models').kind).toBe('em-model');
  expect(BACKUP_KINDS).toContain('em_model');
});

test('the refs a definition names', () => {
  const r = emModelRefs({ surfaceIds: [TOP, 'derived-x'], derived: [{ sourceId: TOP, isochoreId: ISO }], faultPolygons: [{ cultureId: `${FAULTS}#2` }, {}], frame: { boundaryId: LEASE } });
  expect(r.surfaces.sort()).toEqual([TOP, ISO].sort());
  expect(r.culture.sort()).toEqual([FAULTS, LEASE].sort());
});

test('a model package carries its surfaces and polygons, not unrelated rows, and remaps every id on import', async () => {
  const built = await buildGeosciencePackage(makeSource(), [{ kind: 'em_model', id: MODEL }], { name: 'Model handover' });
  const col = built.collection;
  expect([...col.tables.geo_surfaces.keys()].sort()).toEqual([TOP, BASE, ISO].sort());
  expect([...col.tables.geo_culture.keys()].sort()).toEqual([FAULTS, LEASE].sort());
  expect(built.refs.dangling).toEqual([]);

  const pkg = await readPackage(await built.writer.toUint8Array());
  const plan = planImport(pkg, { userId: DST, organizationId: null });
  const newId = (old) => plan.items.find((i) => i.oldId === old).newId;
  const row = plan.planned.em_models[0];
  expect(row.user_id).toBe(DST);
  const d = row.definition;
  expect(d.surfaceIds).toEqual([newId(TOP), 'derived-x', newId(BASE)]);
  expect(d.derived[0].sourceId).toBe(newId(TOP));
  expect(d.derived[0].isochoreId).toBe(newId(ISO));
  expect(d.faultPolygons[0].cultureId).toBe(`${newId(FAULTS)}#2`);
  expect(d.frame.boundaryId).toBe(newId(LEASE));
});
