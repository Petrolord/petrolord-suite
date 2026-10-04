// WF-U1 (RL12, PL5): a Waterflood Design project of payload version 2 travels
// in .pld with everything it carries: identification, sources, unit system,
// the kr-1 and pvt-1 intake records, the surveillance rows and import record,
// the Monte Carlo summary. The intake records name other saved projects by
// id; exported alone those references are cleared (never dangling), and the
// cards then say the source cannot be read again.
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildPackage } from '@/lib/portability/exportPackage';
import { importPackage } from '@/lib/portability/importPackage';
import { validateManifest } from '@/lib/portability/manifest';
import { reviewerPayload } from '@/components/waterflooddesign/__tests__/wfTestKit';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const SRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WF = '00000077-0000-4000-8000-000000000000';
const SCAL = '00000078-0000-4000-8000-000000000000';
const FLUID = '00000079-0000-4000-8000-000000000000';

function world(payload) {
  const rows = { saved_waterflood_design_projects: [{ id: WF, user_id: SRC, project_name: payload.name, inputs_data: { ...payload, id: WF }, schema_version: 1 }] };
  return {
    rows,
    async currentUser() { return { id: SRC, organization_id: null }; },
    async getRow(table, id) { return (rows[table] || []).find((r) => r.id === id) || null; },
    async listChildren() { return []; },
    async downloadBlob() { throw new Error('no blobs'); },
    async listBlobs() { return []; },
    async listStateRowsForWells() { return []; },
    async getCustomCrs() { return null; },
  };
}
function sink() {
  const store = { rows: {}, jobs: new Map(), items: [] };
  return {
    store,
    async currentUser() { return { id: DST, organization_id: null }; },
    async listMyWells() { return []; },
    async createJob(job) { const id = `9000000${store.jobs.size}-0000-4000-8000-000000000000`; store.jobs.set(id, { id, ...job }); return id; },
    async updateJob(id, patch) { Object.assign(store.jobs.get(id), patch); },
    async listItems(id) { return store.items.filter((i) => i.job_id === id); },
    async recordItems(id, items) { store.items.push(...items); },
    async mergeCustomCrs() {},
    async uploadBlob() {}, async removeBlob() {},
    async insertRows(table, rows) { store.rows[table] = [...(store.rows[table] || []), ...rows.map((r) => JSON.parse(JSON.stringify(r)))]; },
  };
}

it('a version 2 Waterflood project round-trips through .pld', async () => {
  const p = reviewerPayload();
  p.scenarios = [{ id: 's1', name: 'Base', displacementInputs: { krIntake: { from: { recordId: SCAL } } } }];
  p.displacementInputs.krIntake.from.recordId = SCAL;
  p.pvtIntake.from.recordId = FLUID;
  const built = await buildPackage(world(p), [{ kind: 'saved_project', id: WF, table: 'saved_waterflood_design_projects' }]);
  expect(validateManifest(built.manifest).ok).toBe(true);
  expect(built.refs.dangling).toEqual([]);
  const s = sink();
  await importPackage(await built.writer.toUint8Array(), s);
  const got = s.store.rows.saved_waterflood_design_projects[0].inputs_data;
  for (const k of ['payloadVersion', 'identification', 'inputMeta', 'unitSystem', 'patternInputs', 'layers', 'layeredConfig']) expect(got[k]).toEqual(p[k]);
  expect(got.surveillance.rows).toEqual(p.surveillance.rows);
  expect(got.surveillance.import).toEqual(p.surveillance.import);
  expect(got.pvtIntake.values).toEqual(p.pvtIntake.values);
  expect(got.displacementInputs.krIntake.values).toEqual(p.displacementInputs.krIntake.values);
  expect(got.id).not.toBe(WF);
  // the sources were not in the package: their ids are cleared, never carried
  expect(got.displacementInputs.krIntake.from.recordId).toBeNull();
  expect(got.pvtIntake.from.recordId).toBeNull();
});

it('the same holds for a SCAL project that took gravities from a Fluid project', async () => {
  const SC = '00000080-0000-4000-8000-000000000000';
  const w = world(reviewerPayload());
  w.rows.saved_scal_projects = [{ id: SC, user_id: SRC, project_name: 'SCAL', schema_version: 1, inputs_data: { id: SC, name: 'SCAL', pvtIntake: { from: { recordId: FLUID }, contract: { project_id: FLUID } } } }];
  const built = await buildPackage(w, [{ kind: 'saved_project', id: SC, table: 'saved_scal_projects' }]);
  expect(built.refs.dangling).toEqual([]);
});
