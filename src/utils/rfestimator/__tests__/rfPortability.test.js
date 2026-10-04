// RF-U1 (RL12, PL5): a version 2 Recovery Factor project travels in .pld with
// identification, sources, unit system and both intake records. The intakes
// name other records by id; exported alone those ids are cleared (never
// dangling), and the cards then say the source cannot be read again.
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildPackage } from '@/lib/portability/exportPackage';
import { importPackage } from '@/lib/portability/importPackage';
import { validateManifest } from '@/lib/portability/manifest';
import { reviewerPayload } from './rfTestKit';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const SRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RF = '00000090-0000-4000-8000-000000000000';
const CASE = '00000091-0000-4000-8000-000000000000';
const RUN = '00000092-0000-4000-8000-000000000000';

function world(payload) {
  const rows = { saved_rf_projects: [{ id: RF, user_id: SRC, project_name: payload.name, inputs_data: { ...payload, id: RF }, schema_version: 1 }] };
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

it('a version 2 Recovery Factor project round-trips through .pld with both intakes', async () => {
  const p = reviewerPayload();
  p.inPlaceIntake = { contract: 'mbal-1', app: 'Material Balance Studio', recordId: CASE, runId: RUN, recordName: 'Ahmed', quantity: 'OOIP', unit: 'STB', value: 1e8, text: 'x' };
  const built = await buildPackage(world(p), [{ kind: 'saved_project', id: RF, table: 'saved_rf_projects' }]);
  expect(validateManifest(built.manifest).ok).toBe(true);
  expect(built.refs.dangling).toEqual([]);
  const s = sink();
  await importPackage(await built.writer.toUint8Array(), s);
  const got = s.store.rows.saved_rf_projects[0].inputs_data;
  for (const k of ['payloadVersion', 'identification', 'inputMeta', 'unitSystem', 'inputs']) expect(got[k]).toEqual(p[k]);
  expect(got.pvtIntake.values).toEqual(p.pvtIntake.values);
  expect(got.inPlaceIntake.value).toBe(1e8);
  expect(got.id).not.toBe(RF);
  expect(got.pvtIntake.from.recordId).toBeNull();
  expect(got.inPlaceIntake.recordId).toBeNull();
  expect(got.inPlaceIntake.runId).toBeNull();
});
