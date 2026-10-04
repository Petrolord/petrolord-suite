// VRR-U1 (RL12, PL5): a Voidage Replacement project travels in .pld with
// everything VRR-U1 added to its payload: unit system, identification,
// sources, the import read-back, the datum, and the pvt-1 intake, whose
// record names the Fluid Systems Studio project it came from. Exported alone
// that reference is cleared (never dangling), as for Waterflood and SCAL
// (WF-U1), and the card then says the source cannot be read again.
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildPackage } from '@/lib/portability/exportPackage';
import { importPackage } from '@/lib/portability/importPackage';
import { validateManifest } from '@/lib/portability/manifest';
import { projectPayload } from '@/contexts/VrrMonitorContext';
import { fluidTablePatterns } from '@/utils/vrr/__tests__/vrrTestKit';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const SRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VRR = '00000097-0000-4000-8000-000000000000';
const FLUID = '00000099-0000-4000-8000-000000000000';

function world(payload) {
  const rows = { saved_vrr_projects: [{ id: VRR, user_id: SRC, project_name: payload.name, inputs_data: { ...payload, id: VRR }, schema_version: 1 }] };
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

it('a VRR project with a pvt-1 intake round-trips through .pld; the Fluid project id is cleared, never dangling', async () => {
  const inputs = fluidTablePatterns();
  inputs.pvtIntake.from.recordId = FLUID;
  inputs.pvtIntake.contract.project_id = FLUID;
  const p = projectPayload({ id: VRR, name: 'Ekene waterflood', inputs });
  const built = await buildPackage(world(p), [{ kind: 'saved_project', id: VRR, table: 'saved_vrr_projects' }]);
  expect(validateManifest(built.manifest).ok).toBe(true);
  expect(built.refs.dangling).toEqual([]);
  const s = sink();
  await importPackage(await built.writer.toUint8Array(), s);
  const got = s.store.rows.saved_vrr_projects[0].inputs_data;
  for (const k of ['unitSystem', 'identification', 'inputMeta', 'pressureSurveys', 'datum', 'importInfo', 'patterns', 'allocation', 'pvtMode', 'wellRows']) expect(got.inputs[k]).toEqual(inputs[k]);
  expect(got.inputs.pvtIntake.table).toEqual(inputs.pvtIntake.table);
  expect(got.inputs.pvtIntake.values).toEqual(inputs.pvtIntake.values);
  expect(got.inputs.pvtIntake.from.recordId).toBeNull();
  expect(got.inputs.pvtIntake.contract.project_id).toBeNull();
});
