// WS-U1 (RL12, PL5): a Well Spacing project travels in .pld with its
// inputs, unit system, identification, sources and the five intakes, whose
// records name the Fluid Systems Studio project, the Well Test project, the
// Material Balance case and the Decline Curve Analysis project they came
// from (the registry wells travel as a snapshot of names and coordinates).
// Exported alone those references are cleared (never dangling).
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildPackage } from '@/lib/portability/exportPackage';
import { importPackage } from '@/lib/portability/importPackage';
import { validateManifest } from '@/lib/portability/manifest';
import { projectPayload } from '@/utils/wellspacing/model';
import { intakeCase } from '@/utils/wellspacing/__tests__/wsTestKit';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const SRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EOR = '00000097-0000-4000-8000-000000000000';
const FLUID = '00000099-0000-4000-8000-000000000000';

function world(payload) {
  const rows = { saved_well_spacing_projects: [{ id: EOR, user_id: SRC, project_name: payload.name, inputs_data: { ...payload, id: EOR }, schema_version: 1 }] };
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

const WT = '00000098-0000-4000-8000-000000000000';
const RB = '00000096-0000-4000-8000-000000000000';
const DC = '00000095-0000-4000-8000-000000000000';

it('a Well Spacing project with five intakes round-trips through .pld; the source ids are cleared, never dangling', async () => {
  const inputs = intakeCase({ system: 'si' });
  inputs.intakes.pvt.from.recordId = FLUID;
  inputs.intakes.pvt.contract.project_id = FLUID;
  inputs.intakes.wta.from.recordId = WT;
  inputs.intakes.mbal.from.recordId = RB;
  inputs.intakes.dca.from.recordId = DC;
  const p = projectPayload({ id: EOR, name: 'Ekene spacing', inputs });
  const built = await buildPackage(world(p), [{ kind: 'saved_project', id: EOR, table: 'saved_well_spacing_projects' }]);
  expect(validateManifest(built.manifest).ok).toBe(true);
  expect(built.refs.dangling).toEqual([]);
  const s = sink();
  await importPackage(await built.writer.toUint8Array(), s);
  const got = s.store.rows.saved_well_spacing_projects[0].inputs_data;
  for (const k of ['form', 'context', 'unitSystem', 'identification', 'inputMeta']) expect(got.inputs[k]).toEqual(inputs[k]);
  expect(got.inputs.intakes.pvt.values).toEqual(inputs.intakes.pvt.values);
  expect(got.inputs.intakes.wells).toEqual(inputs.intakes.wells);
  for (const k of ['pvt', 'wta', 'mbal', 'dca']) expect(got.inputs.intakes[k].from.recordId).toBeNull();
  expect(got.inputs.intakes.pvt.contract.project_id).toBeNull();
});
