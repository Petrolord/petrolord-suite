// MBAL-U1: a Material Balance Studio case travels in a .pld package with its
// production data, run settings, runs and results. Every row gets a new id
// on import and every id a row carries follows; the importer owns the copy,
// private; the study record and the run snapshot arrive whole, so the run is
// current on arrival exactly as it was at the source.

import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildPackage } from '@/lib/portability/exportPackage';
import { importPackage } from '@/lib/portability/importPackage';
import { getFamily, importOrder, tableSpec, rootTable } from '@/lib/portability/familySpec';
import { BACKUP_KINDS } from '@/lib/portability/backup';
import { walkUuids } from '@/lib/portability/danglingRefs';
import { seedSampleStore, SAMPLE_CASE_IDS, sampleFluidBlock } from '@/pages/apps/reservoir-balance/harness/sampleCases';
import { runEngineOnStore } from '@/pages/apps/reservoir-balance/harness/engineStandIn';
import { buildRunConfigInput, assessRunStaleness } from '@/pages/apps/reservoir-balance/lib/runStaleness';
import { withStudy, readStudy } from '@/pages/apps/reservoir-balance/lib/studyMeta';
import { tableFromPvtBlock } from '@/pages/apps/reservoir-balance/lib/pvtIntake';
import { PVT_TABLE_ORIGIN_KEY } from '@/pages/apps/reservoir-balance/lib/pvtSource';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const SRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SRC_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DST_ORG = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FLUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STUDY = { v: 1, identification: { analyst: 'A. Okafor', licence: 'OML 143' }, datum: { datum_depth_ft: 9200, reference: 'TVDSS', basis: 'datum' }, inputMeta: { initial_pressure_psia: { source: 'lab', note: 'RFT' } }, contacts: { initial_owc_ft: 9350, porosity: 0.22 } };

// the Dake sample case as the database holds it: uuid keys, the sharing columns, one run with its result
function makeWorld({ withFluidProject = false } = {}) {
  const db = seedSampleStore('2026-10-01T08:00:00.000Z');
  const caseId = SAMPLE_CASE_IDS.dake;
  const taken = tableFromPvtBlock({ ...sampleFluidBlock(), project_id: FLUID }, { fluidSystem: 'oil', temperatureF: 200 });
  db.rb_run_configs = db.rb_run_configs.map((c) => (c.case_id === caseId
    ? { ...c, pvt_correlations: withStudy({ ...c.pvt_correlations, [PVT_TABLE_ORIGIN_KEY]: taken.origin }, STUDY) } : c));
  const rbCase = db.rb_cases.find((c) => c.id === caseId);
  const production = db.rb_production_data.filter((r) => r.case_id === caseId).sort((a, b) => a.timestep_index - b.timestep_index);
  const defaultCfg = db.rb_run_configs.find((c) => c.case_id === caseId);
  db.rb_run_configs.push({ id: 'cfg-run', case_id: caseId, is_scenario: true, name: 'Run', ...buildRunConfigInput({ ...rbCase, production_data: production }, defaultCfg) });
  runEngineOnStore(db, { run_config_id: 'cfg-run' });

  let n = 0;
  const ids = new Map();
  const uuid = (old) => { if (!ids.has(old)) ids.set(old, `${String(++n).padStart(8, '0')}-0000-4000-8000-000000000000`); return ids.get(old); };
  const of = (table) => db[table].filter((r) => (r.case_id ?? r.id) === caseId);
  const rows = {
    rb_cases: of('rb_cases').map((r) => ({
      ...r, id: uuid(r.id), user_id: SRC, org_id: SRC_ORG,
      visibility: 'organization', organization_id: SRC_ORG, org_access: 'view', version: 7, updated_by: SRC, editing_by: null, editing_since: null, editing_expires: null,
    })),
    rb_production_data: of('rb_production_data').map((r) => ({ ...r, id: uuid(r.id), case_id: uuid(r.case_id) })),
    rb_run_configs: of('rb_run_configs').map((r) => ({ ...r, id: uuid(r.id), case_id: uuid(r.case_id), user_id: undefined })),
    rb_runs: of('rb_runs').map((r) => ({ ...r, id: uuid(r.id), case_id: uuid(r.case_id), run_config_id: uuid(r.run_config_id), parent_run_id: null })),
    rb_results: of('rb_results').map((r) => ({ ...r, id: uuid(r.id), case_id: uuid(r.case_id), run_id: uuid(r.run_id) })),
    saved_fluid_studio_projects: withFluidProject
      ? [{ id: FLUID, user_id: SRC, project_name: 'Wedge reservoir oil PVT', inputs_data: { id: FLUID, name: 'Wedge reservoir oil PVT', schema: 1, inputs: {} }, schema_version: 1 }]
      : [],
  };
  for (const list of Object.values(rows)) for (const r of list) for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  return {
    rows, caseId: uuid(caseId),
    async currentUser() { return { id: SRC, organization_id: SRC_ORG, organization_name: 'Source Co' }; },
    async getRow(table, id) { return (rows[table] || []).find((r) => r.id === id) || null; },
    async listChildren(table, column, parentId) { return (rows[table] || []).filter((r) => r[column] === parentId); },
    async downloadBlob() { throw new Error('no blobs in this family'); },
    async listBlobs() { return []; },
    async listStateRowsForWells() { return []; },
    async getCustomCrs() { return null; },
  };
}

function makeSink() {
  const store = { rows: {}, blobs: new Map(), jobs: new Map(), items: [] };
  return {
    store,
    async currentUser() { return { id: DST, organization_id: DST_ORG }; },
    async listMyWells() { return []; },
    async createJob(job) { const id = `job-${store.jobs.size}`; store.jobs.set(id, { id, ...job }); return id; },
    async updateJob(id, patch) { Object.assign(store.jobs.get(id), patch); },
    async listItems(id) { return store.items.filter((i) => i.job_id === id); },
    async recordItems(id, items) { store.items.push(...items); },
    async mergeCustomCrs() {},
    async uploadBlob() {},
    async removeBlob() {},
    async insertRows(table, rows) { store.rows[table] = [...(store.rows[table] || []), ...rows.map((r) => JSON.parse(JSON.stringify(r)))]; },
  };
}

const idsOf = (rows) => { const s = new Set(); for (const r of rows) walkUuids(r, (id) => s.add(id)); return s; };

test('the family: root, order, parents, what follows a new id', () => {
  const fam = getFamily('material_balance');
  expect(fam.roots).toEqual({ rb_case: 'rb_cases' });
  expect(rootTable('rb_case')).toEqual({ family: 'material_balance', table: 'rb_cases' });
  expect(fam.order).toEqual(['rb_cases', 'rb_production_data', 'rb_run_configs', 'rb_runs', 'rb_results']);
  const order = importOrder();
  expect(order.indexOf('saved_fluid_studio_projects')).toBeLessThan(order.indexOf('rb_run_configs'));
  expect(order.indexOf('rb_run_configs')).toBeLessThan(order.indexOf('rb_runs'));
  expect(order.indexOf('rb_runs')).toBeLessThan(order.indexOf('rb_results'));
  expect(tableSpec('rb_results').parent).toEqual({ table: 'rb_runs', column: 'run_id' });
  expect(tableSpec('rb_cases').stamped).toBeUndefined(); // the rb_* tables carry no PP0 stamp columns
  expect(BACKUP_KINDS).toContain('rb_case');
});

describe('a case with its data, settings, run and result', () => {
  test('round trip: every row gets a new id, every reference follows, and nothing of the source remains', async () => {
    const world = makeWorld();
    const built = await buildPackage(world, [{ kind: 'rb_case', id: world.caseId }], { name: 'Dake 9.2' });
    expect(built.manifest.scope.roots[0].name).toBe('Dake Exercise 9.2 (water drive)');
    expect(Object.fromEntries(Object.entries(built.manifest.tables).map(([t, v]) => [t, v.rows]))).toEqual({
      rb_cases: 1, rb_production_data: 11, rb_run_configs: 2, rb_runs: 1, rb_results: 1,
    });
    const sink = makeSink();
    await importPackage(await built.writer.toUint8Array(), sink, { shareWithOrg: false });
    const out = sink.store.rows;
    const c = out.rb_cases[0];

    // the importer's own, private; the source's sharing state, row version and organisation label stay behind
    expect(c.user_id).toBe(DST);
    for (const col of ['org_id', 'visibility', 'organization_id', 'org_access', 'version', 'updated_by', 'editing_by', 'created_at', 'updated_at']) expect(c).not.toHaveProperty(col);
    expect(c).toMatchObject({ name: 'Dake Exercise 9.2 (water drive)', initial_pressure_psia: 2740, has_aquifer: true, fluid_system: 'oil' });

    // new ids everywhere, and no id of the source left in any row
    const oldIds = idsOf(Object.values(world.rows).flat());
    const newIds = idsOf(Object.values(out).flat());
    oldIds.delete(SRC); oldIds.delete(SRC_ORG);
    for (const id of newIds) expect(oldIds.has(id)).toBe(false);
    expect(c.id).not.toBe(world.caseId);

    // the references follow
    expect(out.rb_production_data).toHaveLength(11);
    expect(out.rb_production_data.every((r) => r.case_id === c.id)).toBe(true);
    expect(new Set(out.rb_production_data.map((r) => r.id)).size).toBe(11);
    const runCfg = out.rb_run_configs.find((r) => r.is_scenario);
    const defCfg = out.rb_run_configs.find((r) => !r.is_scenario);
    expect(runCfg.case_id).toBe(c.id);
    expect(defCfg.case_id).toBe(c.id);
    const run = out.rb_runs[0];
    expect(run.case_id).toBe(c.id);
    expect(run.run_config_id).toBe(runCfg.id);
    const res = out.rb_results[0];
    expect(res.run_id).toBe(run.id);
    expect(res.case_id).toBe(c.id);
    expect(defCfg).not.toHaveProperty('schema_version');
  });

  test('the content arrives whole: data, study record, run snapshot and result, and the run is current as it was', async () => {
    const world = makeWorld();
    const built = await buildPackage(world, [{ kind: 'rb_case', id: world.caseId }]);
    const sink = makeSink();
    await importPackage(await built.writer.toUint8Array(), sink, {});
    const out = sink.store.rows;
    const srcProd = world.rows.rb_production_data;
    const strip = ({ id, case_id, created_at, ...rest }) => rest;
    expect(out.rb_production_data.map(strip)).toEqual(srcProd.map(strip));
    const defCfg = out.rb_run_configs.find((r) => !r.is_scenario);
    expect(readStudy(defCfg)).toMatchObject({ identification: { analyst: 'A. Okafor', licence: 'OML 143' }, datum: { datum_depth_ft: 9200, reference: 'TVDSS' }, contacts: { initial_owc_ft: 9350, porosity: 0.22 } });
    expect(defCfg.aquifer_params).toEqual(world.rows.rb_run_configs.find((r) => !r.is_scenario).aquifer_params);
    const res = out.rb_results[0];
    const srcRes = world.rows.rb_results[0];
    expect(res.estimated_ooip_stb).toBe(srcRes.estimated_ooip_stb);
    expect(res.plot_data).toEqual(srcRes.plot_data);
    // the stale-run rule on the imported rows: current, as at the source
    const caseData = { ...out.rb_cases[0], production_data: [...out.rb_production_data].sort((a, b) => a.timestep_index - b.timestep_index) };
    const runCfg = out.rb_run_configs.find((r) => r.is_scenario);
    expect(assessRunStaleness({ caseData, defaultCfg: defCfg, run: out.rb_runs[0], runConfig: runCfg, result: res }).stale).toBe(false);
    // and an edit after the import withdraws it, so the check is live
    expect(assessRunStaleness({ caseData: { ...caseData, initial_pressure_psia: 2800 }, defaultCfg: defCfg, run: out.rb_runs[0], runConfig: runCfg, result: res }).stale).toBe(true);
  });

  test('the fluid project a PVT table was taken from: its id follows when it is packaged, and is cleared when it is not', async () => {
    const alone = makeWorld();
    const builtAlone = await buildPackage(alone, [{ kind: 'rb_case', id: alone.caseId }]);
    const sinkAlone = makeSink();
    await importPackage(await builtAlone.writer.toUint8Array(), sinkAlone, {});
    const originAlone = sinkAlone.store.rows.rb_run_configs.find((r) => !r.is_scenario).pvt_correlations[PVT_TABLE_ORIGIN_KEY];
    expect(originAlone.project_id).toBeNull();
    expect(originAlone).toMatchObject({ kind: 'pvt_contract', project_name: 'Wedge reservoir oil PVT', schema: 'pvt-1' }); // the provenance stays
    expect(originAlone.methods.bo.method).toBe('Standing');

    const both = makeWorld({ withFluidProject: true });
    const builtBoth = await buildPackage(both, [{ kind: 'rb_case', id: both.caseId }, { kind: 'saved_project', id: FLUID, table: 'saved_fluid_studio_projects' }]);
    const sinkBoth = makeSink();
    await importPackage(await builtBoth.writer.toUint8Array(), sinkBoth, {});
    const fluid = sinkBoth.store.rows.saved_fluid_studio_projects[0];
    expect(fluid.id).not.toBe(FLUID);
    for (const cfg of sinkBoth.store.rows.rb_run_configs) expect(cfg.pvt_correlations[PVT_TABLE_ORIGIN_KEY].project_id).toBe(fluid.id);
  });

  test('a case whose run lost its config is refused at the export: a run never travels without what it was made on', async () => {
    const world = makeWorld();
    await expect(buildPackage(world, [{ kind: 'rb_case', id: world.caseId }])).resolves.toBeTruthy(); // the control
    const broken = makeWorld();
    broken.rows.rb_run_configs = broken.rows.rb_run_configs.filter((r) => !r.is_scenario);
    await expect(buildPackage(broken, [{ kind: 'rb_case', id: broken.caseId }])).rejects.toThrow(/reference to data it does not contain \(first: rb_runs\.run_config_id/);
  });
});
