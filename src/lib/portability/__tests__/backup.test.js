// PP4 gate, restorable backup: discover every root the caller can back up
// ('mine' vs 'org'), build one package over all of them, wipe the world,
// restore into an empty account, and check that counts match the manifest
// table by table and blobs are byte-identical.

import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { discoverBackupRoots, buildBackup, BACKUP_KINDS } from '@/lib/portability/backup';
import { importPackage } from '@/lib/portability/importPackage';
import { validateManifest } from '@/lib/portability/manifest';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MATE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const W1 = uid(1); const W2 = uid(2); const S1 = uid(3); const F1 = uid(4); const PW = uid(5); const SP = uid(6); const SIM = uid(7);

function makeWorld() {
  const enc = (t) => new TextEncoder().encode(t);
  const f32 = (a) => new Uint8Array(Float32Array.from(a).buffer);
  const rows = {
    geo_wells: [
      { id: W1, user_id: ME, organization_id: ORG, name: 'MINE-1', uwi: 'M1', crs: 'EPSG:32631', deviation: [] },
      { id: W2, user_id: MATE, organization_id: ORG, name: 'MATE-1', uwi: 'T1', crs: 'EPSG:32631', deviation: [] },
    ],
    geo_wells_logs: [
      { id: uid(11), well_id: W1, mnemonic: 'DEPT', unit: 'M', start_md_m: 0, stop_md_m: 3, step_m: 1, n_samples: 4, null_count: 0, provenance: {}, storage_path: `${ME}/${W1}/logs/${uid(11)}.f32` },
      { id: uid(12), well_id: W1, mnemonic: 'GR', unit: 'API', start_md_m: 0, stop_md_m: 3, step_m: 1, n_samples: 4, null_count: 0, provenance: {}, storage_path: `${ME}/${W1}/logs/${uid(12)}.f32` },
      { id: uid(13), well_id: W2, mnemonic: 'DEPT', unit: 'M', start_md_m: 0, stop_md_m: 3, step_m: 1, n_samples: 4, null_count: 0, provenance: {}, storage_path: `${MATE}/${W2}/logs/${uid(13)}.f32` },
    ],
    geo_wells_tops: [{ id: uid(14), well_id: W1, name: 'Top A', md_m: 2, interpreter: 'me' }],
    geo_wells_zones: [],
    geo_surfaces: [{ id: S1, user_id: ME, organization_id: null, name: 'Top A depth', kind: 'depth', origin_x: 0, origin_y: 0, nx: 2, ny: 2, dx: 10, dy: 10, rotation_deg: 0, z_domain: 'depth', z_unit: 'm', null_value: 1e30, crs: 'EPSG:32631', provenance: {}, storage_path: `${ME}/${S1}/grid.f32` }],
    geo_culture: [],
    petro_projects: [], pp_projects: [], rp_projects: [], geo_correlation_sections: [],
    po_fields: [{ id: F1, user_id: ME, organization_id: ORG, name: 'Field', schema_version: 1 }],
    po_wells: [{ id: PW, user_id: ME, field_id: F1, name: 'MINE-1', geo_well_id: W1 }],
    po_well_models: [], po_well_tests: [], po_deferments: [], po_allocation_factors: [], po_daily_production: [], po_field_totals: [],
    saved_choke_projects: [{ id: SP, user_id: ME, project_name: 'Choke', inputs_data: { id: SP, name: 'Choke', inputs: { link: { fieldId: F1, wellId: PW } } }, schema_version: 1 }],
    sim_cases: [{ id: SIM, user_id: ME, organization_id: null, name: 'SPE1', deck_source: 'template', deck_path: `${ME}/${SIM}/deck/SPE1.DATA`, schema_version: 1 }],
  };
  const blobs = new Map([
    [`wells/${ME}/${W1}/logs/${uid(11)}.f32`, f32([0, 1, 2, 3])],
    [`wells/${ME}/${W1}/logs/${uid(12)}.f32`, f32([50, 60, 70, 80])],
    [`wells/${MATE}/${W2}/logs/${uid(13)}.f32`, f32([0, 1, 2, 3])],
    [`surfaces/${ME}/${S1}/grid.f32`, f32([1, 2, 3, 4])],
    [`sim/${ME}/${SIM}/deck/SPE1.DATA`, enc('RUNSPEC\n')],
  ]);
  const source = {
    rows, blobs,
    async currentUser() { return { id: ME, organization_id: ORG, organization_name: 'Org' }; },
    async getRow(table, id) { return (rows[table] || []).find((r) => r.id === id) || null; },
    async listChildren(table, column, parentId) { return (rows[table] || []).filter((r) => r[column] === parentId); },
    async downloadBlob(bucket, path) { const b = blobs.get(`${bucket}/${path}`); if (!b) throw new Error(`no blob ${bucket}/${path}`); return b; },
    async listBlobs(bucket, prefix) { return [...blobs.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}`)).map((k) => ({ path: k.slice(bucket.length + 1), size: blobs.get(k).byteLength })); },
    async listStateRowsForWells() { return []; },
    async listSessionsForVolumes() { return []; },
    async getCustomCrs() { return null; },
  };
  // what the catalog would list under the caller's session (RLS: own + org-shared)
  const deps = {
    listWells: async () => rows.geo_wells.map((w) => ({ ...w, is_own: w.user_id === ME })),
    listSurfaces: async () => rows.geo_surfaces,
    listCulture: async () => [],
    listRootCandidates: async (kind) => {
      if (kind === 'po_field') return rows.po_fields.map((f) => ({ id: f.id, name: f.name, user_id: f.user_id }));
      if (kind === 'saved_project') return rows.saved_choke_projects.map((p) => ({ id: p.id, name: p.project_name, table: 'saved_choke_projects', user_id: p.user_id }));
      if (kind === 'sim_case') return rows.sim_cases.map((c) => ({ id: c.id, name: c.name, user_id: c.user_id }));
      return [];
    },
  };
  return { source, deps, rows, blobs };
}

function makeSink() {
  const store = { rows: {}, blobs: new Map(), jobs: new Map(), items: [] };
  return {
    store,
    async currentUser() { return { id: DST, organization_id: null }; },
    async listMyWells() { return []; },
    async createJob() { return null; }, async updateJob() {}, async listItems() { return []; }, async recordItems() {},
    async mergeCustomCrs() {},
    async uploadBlob(bucket, p, bytes) { store.blobs.set(`${bucket}/${p}`, new Uint8Array(bytes)); },
    async removeBlob() {},
    async insertRows(table, rows) { store.rows[table] = [...(store.rows[table] || []), ...rows]; },
  };
}

describe('discoverBackupRoots', () => {
  test("'mine' lists only what the caller owns; 'org' adds what teammates shared", async () => {
    const { deps } = makeWorld();
    const mine = await discoverBackupRoots('mine', { userId: ME }, deps);
    expect(mine.map((r) => `${r.kind}:${r.name}`).sort()).toEqual(['po_field:Field', 'saved_project:Choke', 'sim_case:SPE1', 'surface:Top A depth', 'well:MINE-1']);
    expect(mine.find((r) => r.kind === 'saved_project').table).toBe('saved_choke_projects');
    const org = await discoverBackupRoots('org', { userId: ME }, deps);
    expect(org.map((r) => r.name).sort()).toEqual(['Choke', 'Field', 'MATE-1', 'MINE-1', 'SPE1', 'Top A depth']);
    expect(BACKUP_KINDS).toContain('seismic_volume');
  });
});

describe('back up, wipe, restore', () => {
  test('a backup of my work restores into an empty account with matching counts and identical blobs', async () => {
    const world = makeWorld();
    const backup = await buildBackup(world.source, 'mine', { who: { userId: ME }, deps: world.deps, partBytes: 1e9 });
    expect(validateManifest(backup.manifest).ok).toBe(true);
    expect(backup.manifest.name).toBe('My Petrolord work');
    expect(backup.manifest.tables.geo_wells.rows).toBe(1); // the teammate's well is not mine
    expect(backup.manifest.tables.po_wells.rows).toBe(1);
    expect(backup.manifest.tables.saved_choke_projects.rows).toBe(1);
    expect(backup.manifest.tables.sim_cases.rows).toBe(1);
    const archives = await backup.set.finish(backup.manifest);
    expect(archives).toHaveLength(1);

    // the world is gone; only the package remains
    const originalBlobs = new Map(world.blobs);
    world.blobs.clear(); for (const k of Object.keys(world.rows)) world.rows[k] = [];

    const sink = makeSink();
    const r = await importPackage(archives, sink);
    for (const [table, info] of Object.entries(backup.manifest.tables)) {
      expect({ table, rows: (sink.store.rows[table] || []).length }).toEqual({ table, rows: info.rows });
    }
    expect(r.summary.blobsWritten).toBe(backup.manifest.blobs.length);
    // blobs byte-identical, matched through the rows' new paths
    const w = sink.store.rows.geo_wells[0];
    for (const log of sink.store.rows.geo_wells_logs) {
      const back = sink.store.blobs.get(`wells/${log.storage_path}`);
      const origLog = [uid(11), uid(12)].map((id) => ({ id, mn: id === uid(11) ? 'DEPT' : 'GR' })).find((l) => l.mn === log.mnemonic);
      expect(Buffer.from(back).equals(Buffer.from(originalBlobs.get(`wells/${ME}/${W1}/logs/${origLog.id}.f32`)))).toBe(true);
      expect(log.well_id).toBe(w.id);
    }
    const s = sink.store.rows.geo_surfaces[0];
    expect(Buffer.from(sink.store.blobs.get(`surfaces/${s.storage_path}`)).equals(Buffer.from(originalBlobs.get(`surfaces/${ME}/${S1}/grid.f32`)))).toBe(true);
    const c = sink.store.rows.sim_cases[0];
    expect(new TextDecoder().decode(sink.store.blobs.get(`sim/${c.deck_path}`))).toBe('RUNSPEC\n');
    // the production well's registry link followed the restored well; the choke project followed the field and well
    expect(sink.store.rows.po_wells[0].geo_well_id).toBe(w.id);
    expect(sink.store.rows.saved_choke_projects[0].inputs_data.inputs.link.fieldId).toBe(sink.store.rows.po_fields[0].id);
  });

  test("an 'org' backup carries the teammate's shared well too, and nothing to back up is a plain message", async () => {
    const world = makeWorld();
    const backup = await buildBackup(world.source, 'org', { who: { userId: ME }, deps: world.deps, partBytes: 1e9 });
    expect(backup.manifest.tables.geo_wells.rows).toBe(2);
    expect(backup.manifest.name).toBe('Organization backup');
    const empty = { ...world.deps, listWells: async () => [], listSurfaces: async () => [], listRootCandidates: async () => [] };
    await expect(buildBackup(world.source, 'mine', { who: { userId: ME }, deps: empty })).rejects.toThrow(/nothing to back up yet/);
  });
});
