// PP3a gates: the four core families travel through the generic engine.
//   production   po_field root -> wells, models, tests, daily rows; geo link
//                cleared when the well is not in the package
//   apps         a saved project root names its table; its production link
//                is rewritten when the field is packaged and cleared when not
//   economics    epe_case root -> configs, volumes, runs, results, sensitivity
//                chain; run_config_id rewritten
//   simulation   sim_case root -> every deck object under the prefix, deck_path
//                rewritten to the importer's folder; sim_runs never travel

import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import JSZip from 'jszip';
import { buildPackage } from '@/lib/portability/exportPackage';
import { importPackage, readPackage, planImport } from '@/lib/portability/importPackage';
import { validateManifest } from '@/lib/portability/manifest';
import { listFamilies, tableSpec, rootTable } from '@/lib/portability/familySpec';
import { SAVED_PROJECT_TABLES } from '@/lib/portability/familiesCore';
import { walkUuids } from '@/lib/portability/danglingRefs';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const SRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SRC_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DST_ORG = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const FIELD = uid(10); const WELL_A = uid(11); const WELL_B = uid(12); const GEO_WELL = uid(13);
const CHOKE = uid(20); const CASE = uid(30); const CFG = uid(31); const RUN = uid(32); const RES = uid(33); const SENS = uid(34); const SENSR = uid(35);
const SIM = uid(40);

function makeWorld() {
  const rows = {
    po_fields: [{ id: FIELD, user_id: SRC, organization_id: SRC_ORG, name: 'Keta Field', schema_version: 1 }],
    po_wells: [
      { id: WELL_A, user_id: SRC, field_id: FIELD, name: 'KETA-1', geo_well_id: GEO_WELL },
      { id: WELL_B, user_id: SRC, field_id: FIELD, name: 'KETA-2', geo_well_id: null },
    ],
    po_well_models: [{ id: uid(14), user_id: SRC, well_id: WELL_A, model_data: { schema: 1, inflow: { pi: 2.5 } }, schema_version: 1 }],
    po_well_tests: [{ id: uid(15), user_id: SRC, well_id: WELL_A, test_date: '2026-01-05', oil_stb: 1200 }],
    po_deferments: [], po_allocation_factors: [],
    po_daily_production: Array.from({ length: 5 }, (_, i) => ({ id: uid(100 + i), user_id: SRC, well_id: WELL_A, prod_date: `2026-01-0${i + 1}`, oil_stb: 1000 + i })),
    po_field_totals: [{ id: uid(16), user_id: SRC, field_id: FIELD, total_date: '2026-01-01', oil_stb: 2200 }],
    saved_choke_projects: [{ id: CHOKE, user_id: SRC, project_name: 'Choke KETA-1', inputs_data: { id: CHOKE, name: 'Choke KETA-1', schema: 1, inputs: { link: { fieldId: FIELD, wellId: WELL_A }, bean: 32 } }, schema_version: 1 }],
    epe_cases: [{ id: CASE, user_id: SRC, organization_id: SRC_ORG, case_name: 'Keta FDP', description: 'base', schema_version: 1 }],
    epe_run_configs: [{ id: CFG, user_id: SRC, case_id: CASE, discount_rate: 0.1, schema_version: 1 }],
    epe_production_volumes: [{ id: uid(36), user_id: SRC, case_id: CASE, data: [{ year: 2027, oil: 1.2 }], file_name: 'vol.csv' }],
    epe_capex: [], epe_opex: [],
    epe_runs: [{ id: RUN, user_id: SRC, case_id: CASE, run_config_id: CFG, parameters: { discount_rate: 0.1 } }],
    epe_mc_runs: [],
    epe_results: [{ id: RES, user_id: SRC, run_id: RUN, kpis: { npv: 39.5 }, cash_flow_data: [] }],
    epe_sensitivity_runs: [{ id: SENS, user_id: SRC, base_run_id: RUN, base_run_config_id: CFG, status: 'done' }],
    epe_sensitivity_results: [{ id: SENSR, user_id: SRC, sensitivity_run_id: SENS, npv: 30 }],
    epe_assumption_sets: [],
    sim_cases: [{ id: SIM, user_id: SRC, organization_id: SRC_ORG, name: 'SPE1', deck_source: 'template', deck_path: `${SRC}/${SIM}/deck/SPE1.DATA`, deck_bytes: 12, schema_version: 1 }],
  };
  const blobs = new Map([
    [`sim/${SRC}/${SIM}/deck/SPE1.DATA`, new TextEncoder().encode('RUNSPEC\nEND\n')],
    [`sim/${SRC}/${SIM}/deck/INCLUDE/GRID.INC`, new TextEncoder().encode('DX 10*100 /')],
    [`sim/${SRC}/${SIM}/deck/README.txt`, new TextEncoder().encode('spe1')],
  ]);
  return {
    rows, blobs,
    async currentUser() { return { id: SRC, organization_id: SRC_ORG, organization_name: 'Source Co' }; },
    async getRow(table, id) { return (rows[table] || []).find((r) => r.id === id) || null; },
    async listChildren(table, column, parentId) { return (rows[table] || []).filter((r) => r[column] === parentId); },
    async downloadBlob(bucket, path) { const b = blobs.get(`${bucket}/${path}`); if (!b) throw new Error(`no blob ${bucket}/${path}`); return b; },
    async listBlobs(bucket, prefix) { return [...blobs.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}`)).map((k) => ({ path: k.slice(bucket.length + 1), size: blobs.get(k).byteLength })); },
    async listStateRowsForWells() { return []; },
    async getCustomCrs() { return null; },
  };
}

function makeSink() {
  const store = { rows: {}, blobs: new Map(), jobs: new Map(), items: [], crs: {} };
  return {
    store,
    async currentUser() { return { id: DST, organization_id: DST_ORG }; },
    async listMyWells() { return []; },
    async createJob(job) { const id = uid(9000 + store.jobs.size); store.jobs.set(id, { id, ...job }); return id; },
    async updateJob(id, patch) { Object.assign(store.jobs.get(id), patch); },
    async listItems(id) { return store.items.filter((i) => i.job_id === id); },
    async recordItems(id, items) { store.items.push(...items); },
    async mergeCustomCrs(defs) { for (const d of defs) store.crs[d.id] = d; },
    async uploadBlob(bucket, p, bytes, contentType) { store.blobs.set(`${bucket}/${p}`, { bytes: new Uint8Array(bytes), contentType }); },
    async removeBlob(bucket, p) { store.blobs.delete(`${bucket}/${p}`); },
    async insertRows(table, rows) { store.rows[table] = [...(store.rows[table] || []), ...rows.map((r) => JSON.parse(JSON.stringify(r)))]; },
  };
}

const ids = (rows) => { const s = new Set(); for (const r of rows) { const { provenance, ...rest } = r; walkUuids(rest, (id) => s.add(id)); } return s; };

describe('family registry', () => {
  test('five families are registered in insertion order and every table has a spec', () => {
    expect(listFamilies().map((f) => f.name)).toEqual(['geoscience', 'apps', 'production', 'economics', 'simulation']);
    expect(SAVED_PROJECT_TABLES).toHaveLength(50);
    for (const t of SAVED_PROJECT_TABLES) expect(tableSpec(t)).toMatchObject({ family: 'apps', kind: `saved-project:${t}`, stamped: true });
    expect(rootTable('saved_project')).toEqual({ family: 'apps', table: '*' });
    expect(rootTable('po_field')).toEqual({ family: 'production', table: 'po_fields' });
    expect(tableSpec('sim_cases').blob.prefixOf({ deck_path: 'u/c/deck/SPE1.DATA' })).toBe('u/c/deck/');
  });
});

describe('production + apps: a field with its wells and a linked saved project', () => {
  let world; let sink; let result;
  beforeAll(async () => {
    world = makeWorld();
    const built = await buildPackage(world, [
      { kind: 'po_field', id: FIELD },
      { kind: 'saved_project', id: CHOKE, table: 'saved_choke_projects' },
    ], { name: 'Keta production' });
    expect(validateManifest(built.manifest).ok).toBe(true);
    expect(built.manifest.scope.roots[1]).toEqual({ kind: 'saved_project', id: CHOKE, name: 'Choke KETA-1', table: 'saved_choke_projects' });
    expect(built.manifest.tables.po_daily_production.rows).toBe(5);
    expect(built.refs.dangling).toEqual([]);
    expect(built.refs.external).toBe(1); // po_wells.geo_well_id -> a well not packaged, optional
    sink = makeSink();
    result = await importPackage(await built.writer.toUint8Array(), sink);
  });

  test('the field hierarchy is rewritten and rescoped', () => {
    const field = sink.store.rows.po_fields[0];
    expect(field.user_id).toBe(DST);
    expect(field.organization_id).toBeNull();
    const wells = sink.store.rows.po_wells;
    expect(wells).toHaveLength(2);
    for (const w of wells) { expect(w.field_id).toBe(field.id); expect(w.user_id).toBe(DST); expect(w).not.toHaveProperty('organization_id'); }
    const a = wells.find((w) => w.name === 'KETA-1');
    expect(a.geo_well_id).toBeNull(); // the registry well was not in the package
    expect(sink.store.rows.po_daily_production.every((d) => d.well_id === a.id)).toBe(true);
    expect(sink.store.rows.po_well_models[0].well_id).toBe(a.id);
    expect(sink.store.rows.po_well_models[0].schema_version).toBe(1);
    expect(sink.store.rows.po_well_tests[0]).not.toHaveProperty('schema_version'); // no PP0 columns on that table
    expect(result.summary.rowsWritten).toBe(1 + 2 + 1 + 1 + 5 + 1 + 1);
  });

  test('the saved project keeps its payload and its link follows the imported field and well', () => {
    const choke = sink.store.rows.saved_choke_projects[0];
    expect(choke.project_name).toBe('Choke KETA-1');
    expect(choke.inputs_data.inputs.bean).toBe(32);
    expect(choke.inputs_data.inputs.link.fieldId).toBe(sink.store.rows.po_fields[0].id);
    expect(choke.inputs_data.inputs.link.wellId).toBe(sink.store.rows.po_wells.find((w) => w.name === 'KETA-1').id);
    expect(choke.schema_version).toBe(1);
    expect(choke.app_build).toBe('unknown');
    // no id from the source survives anywhere
    const old = new Set([FIELD, WELL_A, WELL_B, CHOKE, ...world.rows.po_daily_production.map((r) => r.id)]);
    for (const rows of Object.values(sink.store.rows)) for (const id of ids(rows)) expect(old.has(id)).toBe(false);
  });

  test('a saved project exported alone has its production link cleared, never dangling', async () => {
    const built = await buildPackage(makeWorld(), [{ kind: 'saved_project', id: CHOKE, table: 'saved_choke_projects' }]);
    expect(built.refs.dangling).toEqual([]);
    expect(built.refs.external).toBe(2);
    const sink2 = makeSink();
    await importPackage(await built.writer.toUint8Array(), sink2);
    const choke = sink2.store.rows.saved_choke_projects[0];
    expect(choke.inputs_data.inputs.link).toEqual({ fieldId: null, wellId: null });
    expect(Object.keys(sink2.store.rows)).toEqual(['saved_choke_projects']);
  });

  test('a saved_project root without a table is rejected before reading', async () => {
    await expect(buildPackage(makeWorld(), [{ kind: 'saved_project', id: CHOKE }])).rejects.toThrow(/needs a table from the apps family/);
  });
});

describe('economics: a case with its run chain', () => {
  test('configs, volumes, runs, results and sensitivities travel and re-link', async () => {
    const built = await buildPackage(makeWorld(), [{ kind: 'epe_case', id: CASE }], { name: 'Keta FDP' });
    expect(built.manifest.scope.roots[0].name).toBe('Keta FDP');
    expect(Object.keys(built.manifest.tables).sort()).toEqual(['epe_cases', 'epe_production_volumes', 'epe_results', 'epe_run_configs', 'epe_runs', 'epe_sensitivity_results', 'epe_sensitivity_runs']);
    expect(built.refs.dangling).toEqual([]);
    const sink = makeSink();
    await importPackage(await built.writer.toUint8Array(), sink, { shareWithOrg: true });
    const c = sink.store.rows.epe_cases[0];
    expect(c.organization_id).toBe(DST_ORG);
    expect(c.case_name).toBe('Keta FDP');
    const cfg = sink.store.rows.epe_run_configs[0];
    const run = sink.store.rows.epe_runs[0];
    expect(run.case_id).toBe(c.id);
    expect(run.run_config_id).toBe(cfg.id);
    expect(sink.store.rows.epe_results[0].run_id).toBe(run.id);
    expect(sink.store.rows.epe_results[0].kpis).toEqual({ npv: 39.5 });
    const sens = sink.store.rows.epe_sensitivity_runs[0];
    expect(sens.base_run_id).toBe(run.id);
    expect(sens.base_run_config_id).toBe(cfg.id);
    expect(sink.store.rows.epe_sensitivity_results[0].sensitivity_run_id).toBe(sens.id);
    expect(sink.store.rows.epe_run_configs[0].schema_version).toBe(1);
    expect(run).not.toHaveProperty('schema_version');
  });
});

describe('simulation: a case with its deck folder', () => {
  test('every deck object travels under the prefix and lands in the importer folder; deck_path follows', async () => {
    const world = makeWorld();
    const built = await buildPackage(world, [{ kind: 'sim_case', id: SIM }]);
    expect(built.manifest.blobs).toHaveLength(3);
    expect(built.manifest.blobs.map((b) => b.path).sort()).toEqual([
      `${SRC}/${SIM}/deck/INCLUDE/GRID.INC`, `${SRC}/${SIM}/deck/README.txt`, `${SRC}/${SIM}/deck/SPE1.DATA`,
    ]);
    const zip = await JSZip.loadAsync(await built.writer.toUint8Array());
    expect(await zip.file(`blobs/sim/${SRC}/${SIM}/deck/SPE1.DATA`).async('string')).toBe('RUNSPEC\nEND\n');

    const sink = makeSink();
    const r = await importPackage(await built.writer.toUint8Array(), sink);
    const c = sink.store.rows.sim_cases[0];
    expect(c.id).not.toBe(SIM);
    expect(c.deck_path).toBe(`${DST}/${c.id}/deck/SPE1.DATA`);
    expect([...sink.store.blobs.keys()].sort()).toEqual([
      `sim/${DST}/${c.id}/deck/INCLUDE/GRID.INC`, `sim/${DST}/${c.id}/deck/README.txt`, `sim/${DST}/${c.id}/deck/SPE1.DATA`,
    ]);
    expect(new TextDecoder().decode(sink.store.blobs.get(`sim/${DST}/${c.id}/deck/INCLUDE/GRID.INC`).bytes)).toBe('DX 10*100 /');
    expect(r.summary.blobsWritten).toBe(3);
    expect(sink.store.rows).not.toHaveProperty('sim_runs');
    expect(c.provenance.imported_from.original_id).toBe(SIM);
  });

  test('a case whose deck folder is empty still imports, with a note', async () => {
    const world = makeWorld();
    world.blobs.clear();
    const built = await buildPackage(world, [{ kind: 'sim_case', id: SIM }]);
    expect(built.manifest.notes.join('\n')).toMatch(/no stored objects under/);
    const pkg = await readPackage(await built.writer.toUint8Array());
    const plan = planImport(pkg, { userId: DST, organizationId: null });
    expect(plan.blobs).toEqual([]);
    expect(plan.planned.sim_cases[0].deck_path).toBe(`${DST}/${plan.planned.sim_cases[0].id}/deck/SPE1.DATA`);
  });
});
