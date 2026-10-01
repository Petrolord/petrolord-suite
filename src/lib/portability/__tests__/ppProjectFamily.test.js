// PP-U1-015 (Pore Pressure Studio upgrade U1, 2026-10-01): a pore pressure
// project travels with its well. The app never wrote pp_projects.well_ids,
// so a well's package (which finds app state by well_ids overlap) left the
// project behind, and a project exported on its own arrived without its
// well. Saves now record the source well; the well the NCT was fitted on is
// remapped too.
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildGeosciencePackage } from '@/lib/portability/exportPackage';
import { readPackage, planImport } from '@/lib/portability/importPackage';
import { registerStateKind } from '@/lib/stateVersion';
import { projectWellIds } from '@/pages/apps/PorePressureStudio/services/projectRow';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const WELL = '11111111-1111-4111-8111-111111111111';
const PROJ = '22222222-2222-4222-8222-222222222222';

const well = { id: WELL, user_id: USER, organization_id: null, name: 'KETA-1', kb_m: 30, deviation: [], crs: null };
const patch = { params: { waterDepthM: 100, mudlineMdM: 130 }, picks: [], calibration: [], source: { kind: 'well', wellId: WELL, nctFittedFor: WELL } };
const project = { id: PROJ, user_id: USER, name: 'Default project', schema_version: 1, ...patch, well_ids: projectWellIds(patch) };

const source = {
  async currentUser() { return { id: USER, organization_id: null, organization_name: null }; },
  async getRow(table, id) { return table === 'geo_wells' && id === WELL ? well : (table === 'pp_projects' && id === PROJ ? project : null); },
  async listChildren() { return []; },
  async downloadBlob() { return new Uint8Array(); },
  async listBlobs() { return []; },
  async listStateRowsForWells(table, ids) { return table === 'pp_projects' && ids.includes(WELL) ? [project] : []; },
  async getCustomCrs() { return null; },
};

beforeAll(() => { registerStateKind('pp-project', { current: 1, label: 'pore pressure project' }); });

test('a save records the source well (it wrote no well ids before)', () => {
  expect(projectWellIds(patch)).toEqual([WELL]);
  expect(projectWellIds({ source: { kind: 'seismic', volumeId: 'v' } }, { well_ids: [WELL] })).toEqual([WELL]);
  expect(projectWellIds({ source: { kind: 'well' } })).toEqual([]);
});

test('a well package carries its pore pressure project, remapped to the new well', async () => {
  const built = await buildGeosciencePackage(source, [{ kind: 'well', id: WELL }], { name: 'Well handover' });
  expect([...built.collection.tables.pp_projects.keys()]).toEqual([PROJ]);
  const pkg = await readPackage(await built.writer.toUint8Array());
  const plan = planImport(pkg, { userId: DST, organizationId: null });
  const newWell = plan.planned.geo_wells[0].id;
  const row = plan.planned.pp_projects[0];
  expect(newWell).not.toBe(WELL);
  expect(row.user_id).toBe(DST);
  expect(row.well_ids).toEqual([newWell]);
  expect(row.source.wellId).toBe(newWell);
  expect(row.source.nctFittedFor).toBe(newWell);
  expect(row.params.mudlineMdM).toBe(130);
});

test('negative control: a project saved with no well ids is not found from its well', async () => {
  const old = { ...project, well_ids: [] };
  const src = { ...source, async listStateRowsForWells(table, ids) { return table === 'pp_projects' && old.well_ids.some((w) => ids.includes(w)) ? [old] : []; } };
  const built = await buildGeosciencePackage(src, [{ kind: 'well', id: WELL }], { name: 'Well handover' });
  expect(built.collection.tables.pp_projects?.size || 0).toBe(0);
});
