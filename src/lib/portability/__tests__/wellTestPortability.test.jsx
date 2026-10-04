/**
 * WTA-U1-013 (PL5, RL12): a Well Test project travels in .pld with
 * everything this round added to its payload: the z method, the gauge
 * import record, the gauge depth and datum, the RTA read-back, the company,
 * and the wta-1 results block, beside the earlier identification, sources
 * and pvt-1 intake. The real provider builds the payload.
 */
import '@testing-library/jest-dom';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import { buildPackage } from '@/lib/portability/exportPackage';
import { importPackage } from '@/lib/portability/importPackage';
import { validateManifest } from '@/lib/portability/manifest';
import { mountStudio } from '@/components/welltest/__tests__/reportTestKit';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const SRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WT = '00000091-0000-4000-8000-000000000000';
const FLUID = '00000099-0000-4000-8000-000000000000';

function world(payload) {
  const rows = { saved_well_test_projects: [{ id: WT, user_id: SRC, project_name: payload.name, inputs_data: { ...payload, id: WT }, schema_version: 1 }] };
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

it('a fitted gas project with a pvt-1 intake and every U1 field round-trips; the Fluid id is cleared', async () => {
  const studio = mountStudio();
  await studio.act((c) => c.loadSampleTest());
  await studio.act((c) => {
    c.setReservoirField('fluid', 'gas');
    c.setReservoirField('ct', '');
    c.setReservoirField('q', '5000');
    c.setIdentificationField('company', 'Ekene Energy Ltd');
    c.setCompletionField('gaugeDepthMd', '9800');
    c.setCompletionField('datumDepthTvdss', '9500');
    c.setGaugeImport({ fileName: 'g.csv', pressureUnit: 'psig', timeUnit: 'datetime', dateOrder: 'dmy', count: 45, skipped: 0 });
    c.setRtaImport({ fileName: 'prod.csv', text: '40 rows read.' });
    c.setPvtIntake({ fields: ['gasGravity'], text: 'Fluid Systems Studio', from: { recordId: FLUID }, contract: { project_id: FLUID } });
  });
  await studio.act((c) => c.runAutoFit());
  const payload = { ...studio.ctx.serializeInputs(), id: WT, name: 'B-12 gas buildup' };
  studio.unmount();
  expect(payload.wta.project.id).toBeNull(); // an unsaved workspace names no project
  const built = await buildPackage(world(payload), [{ kind: 'saved_project', id: WT, table: 'saved_well_test_projects' }]);
  expect(validateManifest(built.manifest).ok).toBe(true);
  expect(built.refs.dangling).toEqual([]);
  const s = sink();
  await importPackage(await built.writer.toUint8Array(), s);
  const got = s.store.rows.saved_well_test_projects[0].inputs_data;
  for (const k of ['reservoirInputs', 'gaugeImport', 'rtaImport', 'completion', 'identification', 'matchInputs', 'testConfig', 'gaugeRows', 'unitSystem']) expect(got[k]).toEqual(payload[k]);
  expect(got.reservoirInputs.gasZMethod).toBe('dranchuk_abou_kassem');
  expect(got.wta).toEqual(payload.wta);
  expect(got.pvtIntake.from.recordId).toBeNull();
  expect(got.pvtIntake.contract.project_id).toBeNull();
}, 600000);

it('a saved project names itself in its wta-1 block; the reference travels with the row', async () => {
  const studio = mountStudio();
  await studio.act((c) => c.loadSampleTest());
  await studio.act((c) => c.runAutoFit());
  const base = studio.ctx.serializeInputs();
  studio.unmount();
  const payload = { ...base, id: WT, name: 'B-12', wta: { ...base.wta, project: { ...base.wta.project, id: WT } } };
  const built = await buildPackage(world(payload), [{ kind: 'saved_project', id: WT, table: 'saved_well_test_projects' }]);
  expect(built.refs.dangling).toEqual([]);
  const s = sink();
  await importPackage(await built.writer.toUint8Array(), s);
  const row = s.store.rows.saved_well_test_projects[0];
  // the self reference follows the row's id in the receiving account
  expect(row.inputs_data.wta.project.id).toBe(row.id);
}, 600000);


it('WTA-U2: the Fluid gas table, the changing-storage model, the rate skins and the datum gradient round-trip', async () => {
  const { sampleFluidStudioData } = require('@/utils/fluidStudioCalculations');
  const { runFluidWorkspace } = require('@/utils/fluidstudio/workspace');
  const handoff = runFluidWorkspace({ ...sampleFluidStudioData(), tableRange: { pMax: 7000, from: 'entered' } }, { projectId: FLUID, projectName: 'Gas sample', generatedAt: new Date('2026-10-04T09:00:00Z'), build: 'test' }).handoff;
  const studio = mountStudio();
  await studio.act((c) => c.loadSampleTest());
  await studio.act((c) => {
    c.setReservoirField('fluid', 'gas');
    c.setReservoirField('ct', '');
    c.setReservoirField('q', '5000');
    c.takeFluidPvt(handoff);
    c.setMatchField('modelId', 'homogeneous+hegeman');
    c.setRateSkinRows([{ q: '2000', skin: '3' }, { q: '8000', skin: '6' }]);
    c.setCompletionField('gaugeDepthTvd', '9800');
    c.setCompletionField('depthRefElev', '100');
    c.setCompletionField('datumDepthTvdss', '9900');
    c.setCompletionField('datumGradient', '0.08');
    c.setCompletionField('datumGradientSource', 'gas column');
  });
  const payload = { ...studio.ctx.serializeInputs(), id: WT, name: 'U2 gas buildup' };
  studio.unmount();
  expect(payload.pvtIntake.gasTable.rows.length).toBeGreaterThan(10);
  const built = await buildPackage(world(payload), [{ kind: 'saved_project', id: WT, table: 'saved_well_test_projects' }]);
  expect(validateManifest(built.manifest).ok).toBe(true);
  const s = sink();
  await importPackage(await built.writer.toUint8Array(), s);
  const got = s.store.rows.saved_well_test_projects[0].inputs_data;
  for (const k of ['reservoirInputs', 'completion', 'matchInputs', 'rateSkinRows']) expect(got[k]).toEqual(payload[k]);
  expect(got.pvtIntake.gasTable).toEqual(payload.pvtIntake.gasTable);
  expect(got.pvtIntake.from.recordId).toBeNull();
  expect(got.wta.pressure.datum_correction).toEqual(payload.wta.pressure.datum_correction);
  expect(got.wta.skin.rate_dependent).toEqual(payload.wta.skin.rate_dependent);
}, 600000);
