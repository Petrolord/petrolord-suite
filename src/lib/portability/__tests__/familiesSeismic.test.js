// PP3c gate: a seismic project travels with its volume, bricks, horizons
// (with confidence companions), faults, exported surface, a 2D line with its
// picks, and the sessions that open the volume.
//   - the volume prefix carries manifest + bricks but NOT horizons/ objects,
//     which travel with their rows and land under the new volume folder
//   - a horizon's .conf.f32 companion follows the horizon's new path
//   - line prefix excludes picks/; picks land under the new line folder
//   - sessions come along through the hook; their payload ids follow
//   - a session for a volume outside the package is left out
//   - member horizon stored under a non-owner prefix still travels

import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildPackage } from '@/lib/portability/exportPackage';
import { importPackage } from '@/lib/portability/importPackage';
import { validateManifest } from '@/lib/portability/manifest';
import { getFamily, tableSpec } from '@/lib/portability/familySpec';
import { horizonConfidencePath } from '@/lib/portability/familiesSeismic';
import { walkUuids } from '@/lib/portability/danglingRefs';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const SRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SRC_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const PROJ = uid(1); const VOL = uid(2); const HZ = uid(3); const HZM = uid(4); const FLT = uid(5); const EXP = uid(6);
const LINE = uid(7); const PICK = uid(8); const SESS = uid(9); const SESS_OTHER = uid(10); const OTHER_VOL = uid(11); const SURF = uid(12);

const enc = (t) => new TextEncoder().encode(t);
const f32 = (arr) => new Uint8Array(Float32Array.from(arr).buffer);

function makeWorld() {
  const rows = {
    seismic_projects: [{ id: PROJ, user_id: SRC, name: 'Keta 3D', schema_version: 1 }],
    seismic_volumes: [{ id: VOL, user_id: SRC, organization_id: SRC_ORG, project_id: PROJ, parent_volume_id: null, name: 'KETA PSTM', kind: 'seismic', storage_path: `${SRC}/${VOL}`, survey_meta: { ingest: { il: [1, 10] }, storage_bytes: 96 } }],
    seismic_horizons: [
      { id: HZ, user_id: SRC, volume_id: VOL, parent_version_id: null, name: 'Top Sand A', storage_path: `${SRC}/${VOL}/horizons/${HZ}.f32` },
      // a member's horizon on the shared volume lives under the member's prefix
      { id: HZM, user_id: MEMBER, volume_id: VOL, parent_version_id: HZ, name: 'Top Sand A (member)', storage_path: `${MEMBER}/${VOL}/horizons/${HZM}.f32` },
    ],
    seismic_faults: [{ id: FLT, user_id: SRC, volume_id: VOL, parent_version_id: null, name: 'F1', sticks: [[{ il: 1, xl: 1, t: 1000 }]] }],
    seismic_exported_surfaces: [{ id: EXP, user_id: SRC, volume_id: VOL, horizon_id: HZ, name: 'Top Sand A xyz', storage_path: `${SRC}/exports/${EXP}.xyz`, provenance: { volume: { id: VOL, name: 'KETA PSTM' }, horizon: { id: HZ, name: 'Top Sand A' } } }],
    seismic_lines: [{ id: LINE, user_id: SRC, organization_id: null, project_id: PROJ, name: 'L-01', storage_path: `${SRC}/${LINE}` }],
    seismic_line_picks: [{ id: PICK, user_id: SRC, line_id: LINE, name: 'Top Sand A 2D', storage_path: `${SRC}/${LINE}/picks/${PICK}.f32` }],
    seismic_sessions: [
      { id: SESS, user_id: SRC, kind: 'session', name: 'Interp day 1', payload: { v: 1, volume_id: VOL, visibleIds: [HZ, HZM], visibleFaultIds: [FLT], visibleSurfaceIds: [SURF], camera: {} }, schema_version: 1 },
      { id: SESS_OTHER, user_id: SRC, kind: 'bookmark', name: 'elsewhere', payload: { v: 1, volume_id: OTHER_VOL }, schema_version: 1 },
    ],
  };
  const blobs = new Map([
    [`seismic/${SRC}/${VOL}/manifest.json`, enc('{"il":[1,10]}')],
    [`seismic/${SRC}/${VOL}/bricks/0-0-0.f32`, f32([1, 2, 3])],
    [`seismic/${SRC}/${VOL}/bricks/0-0-1.f32`, f32([4, 5, 6])],
    [`seismic/${SRC}/${VOL}/horizons/${HZ}.f32`, f32([1000, 1001])],
    [`seismic/${SRC}/${VOL}/horizons/${HZ}.conf.f32`, f32([0.9, 0.8])],
    [`seismic/${MEMBER}/${VOL}/horizons/${HZM}.f32`, f32([1010, 1011])],
    [`seismic/${SRC}/exports/${EXP}.xyz`, enc('1 2 1000\n')],
    [`seismic/${SRC}/${LINE}/manifest.json`, enc('{"n":2}')],
    [`seismic/${SRC}/${LINE}/nav.bin`, f32([0, 0, 1, 1])],
    [`seismic/${SRC}/${LINE}/picks/${PICK}.f32`, f32([900, 901])],
  ]);
  return {
    rows, blobs,
    async currentUser() { return { id: SRC, organization_id: SRC_ORG, organization_name: 'Source Co' }; },
    async getRow(table, id) { return (rows[table] || []).find((r) => r.id === id) || null; },
    async listChildren(table, column, parentId) { return (rows[table] || []).filter((r) => r[column] === parentId); },
    async downloadBlob(bucket, path) { const b = blobs.get(`${bucket}/${path}`); if (!b) throw new Error(`no blob ${bucket}/${path}`); return b; },
    async listBlobs(bucket, prefix) { return [...blobs.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}/`)).map((k) => ({ path: k.slice(bucket.length + 1), size: blobs.get(k).byteLength })); },
    async listSessionsForVolumes(volumeIds) { return rows.seismic_sessions.filter((s) => volumeIds.includes(s.payload.volume_id)); },
    async listStateRowsForWells() { return []; },
    async getCustomCrs() { return null; },
  };
}

function makeSink() {
  const store = { rows: {}, blobs: new Map(), jobs: new Map(), items: [] };
  return {
    store,
    async currentUser() { return { id: DST, organization_id: null }; },
    async listMyWells() { return []; },
    async createJob(job) { const id = uid(9000 + store.jobs.size); store.jobs.set(id, { id, ...job }); return id; },
    async updateJob(id, patch) { Object.assign(store.jobs.get(id), patch); },
    async listItems() { return []; },
    async recordItems(id, items) { store.items.push(...items); },
    async mergeCustomCrs() {},
    async uploadBlob(bucket, p, bytes, contentType) { if (store.blobs.has(`${bucket}/${p}`)) throw new Error(`duplicate ${p}`); store.blobs.set(`${bucket}/${p}`, { bytes: new Uint8Array(bytes), contentType }); },
    async removeBlob(bucket, p) { store.blobs.delete(`${bucket}/${p}`); },
    async insertRows(table, rows) { store.rows[table] = [...(store.rows[table] || []), ...rows.map((r) => JSON.parse(JSON.stringify(r)))]; },
  };
}

describe('seismic family', () => {
  test('is registered with three roots, sessions hook, and companion/exclusion rules', () => {
    const f = getFamily('seismic');
    expect(Object.keys(f.roots)).toEqual(['seismic_project', 'seismic_volume', 'seismic_line']);
    expect(typeof f.hooks.afterRoots).toBe('function');
    expect(tableSpec('seismic_volumes').blob.prefixExclude('horizons/x.f32')).toBe(true);
    expect(tableSpec('seismic_volumes').blob.prefixExclude('bricks/0-0-0.f32')).toBe(false);
    expect(horizonConfidencePath('u/v/horizons/h.f32')).toBe('u/v/horizons/h.conf.f32');
    expect(tableSpec('seismic_sessions')).toMatchObject({ kind: 'seismic-session', stamped: true });
    expect(tableSpec('seismic_volumes').stamped).toBe(true); // registry half applied 2026-09-03
  });

  describe('a project round trip', () => {
    let world; let sink; let built;
    beforeAll(async () => {
      world = makeWorld();
      built = await buildPackage(world, [{ kind: 'seismic_project', id: PROJ }], { name: 'Keta 3D' });
      expect(validateManifest(built.manifest).ok).toBe(true);
      expect(built.refs.dangling).toEqual([]);
      sink = makeSink();
      await importPackage(await built.writer.toUint8Array(), sink);
    });

    test('the export carries every object exactly once, horizons and picks through their rows', () => {
      const paths = built.manifest.blobs.map((b) => b.path).sort();
      expect(paths).toEqual([
        `${MEMBER}/${VOL}/horizons/${HZM}.f32`,
        `${SRC}/${LINE}/manifest.json`, `${SRC}/${LINE}/nav.bin`, `${SRC}/${LINE}/picks/${PICK}.f32`,
        `${SRC}/${VOL}/bricks/0-0-0.f32`, `${SRC}/${VOL}/bricks/0-0-1.f32`,
        `${SRC}/${VOL}/horizons/${HZ}.conf.f32`, `${SRC}/${VOL}/horizons/${HZ}.f32`,
        `${SRC}/${VOL}/manifest.json`, `${SRC}/exports/${EXP}.xyz`,
      ].sort());
      const byRow = (id) => built.manifest.blobs.filter((b) => b.row_id === id).map((b) => b.path).sort();
      expect(byRow(VOL)).toEqual([`${SRC}/${VOL}/bricks/0-0-0.f32`, `${SRC}/${VOL}/bricks/0-0-1.f32`, `${SRC}/${VOL}/manifest.json`]);
      expect(byRow(HZ)).toEqual([`${SRC}/${VOL}/horizons/${HZ}.conf.f32`, `${SRC}/${VOL}/horizons/${HZ}.f32`]);
      expect(built.manifest.tables.seismic_sessions.rows).toBe(1); // the bookmark for another volume stays behind
    });

    test('the volume lands under the importer prefix with bricks and manifest; horizons and companions follow', () => {
      const vol = sink.store.rows.seismic_volumes[0];
      expect(vol.storage_path).toBe(`${DST}/${vol.id}`);
      expect(vol.user_id).toBe(DST);
      expect(vol.organization_id).toBeNull();
      expect(vol.project_id).toBe(sink.store.rows.seismic_projects[0].id);
      const keys = [...sink.store.blobs.keys()].sort();
      const hz = sink.store.rows.seismic_horizons.find((h) => h.name === 'Top Sand A');
      const hzm = sink.store.rows.seismic_horizons.find((h) => h.name === 'Top Sand A (member)');
      expect(hz.storage_path).toBe(`${DST}/${vol.id}/horizons/${hz.id}.f32`);
      expect(hzm.storage_path).toBe(`${DST}/${vol.id}/horizons/${hzm.id}.f32`);
      expect(hzm.user_id).toBe(DST);
      expect(hzm.parent_version_id).toBe(hz.id);
      expect(keys).toEqual([
        `seismic/${DST}/${vol.id}/bricks/0-0-0.f32`, `seismic/${DST}/${vol.id}/bricks/0-0-1.f32`,
        `seismic/${DST}/${vol.id}/horizons/${hz.id}.conf.f32`, `seismic/${DST}/${vol.id}/horizons/${hz.id}.f32`,
        `seismic/${DST}/${vol.id}/horizons/${hzm.id}.f32`, `seismic/${DST}/${vol.id}/manifest.json`,
        ...[
          `seismic/${DST}/${sink.store.rows.seismic_lines[0].id}/manifest.json`,
          `seismic/${DST}/${sink.store.rows.seismic_lines[0].id}/nav.bin`,
          `seismic/${DST}/${sink.store.rows.seismic_lines[0].id}/picks/${sink.store.rows.seismic_line_picks[0].id}.f32`,
          `seismic/${DST}/exports/${sink.store.rows.seismic_exported_surfaces[0].id}.xyz`,
        ],
      ].sort());
      expect(Array.from(new Float32Array(sink.store.blobs.get(`seismic/${DST}/${vol.id}/horizons/${hz.id}.conf.f32`).bytes.buffer))).toEqual(Array.from(Float32Array.from([0.9, 0.8])));
    });

    test('faults, exported surface, line and picks re-link', () => {
      const vol = sink.store.rows.seismic_volumes[0];
      const hz = sink.store.rows.seismic_horizons.find((h) => h.name === 'Top Sand A');
      expect(sink.store.rows.seismic_faults[0].volume_id).toBe(vol.id);
      const exp = sink.store.rows.seismic_exported_surfaces[0];
      expect(exp.volume_id).toBe(vol.id);
      expect(exp.horizon_id).toBe(hz.id);
      expect(exp.provenance.volume.id).toBe(vol.id);
      expect(exp.provenance.horizon.id).toBe(hz.id);
      expect(exp.storage_path).toBe(`${DST}/exports/${exp.id}.xyz`);
      const line = sink.store.rows.seismic_lines[0];
      expect(line.storage_path).toBe(`${DST}/${line.id}`);
      expect(line.project_id).toBe(sink.store.rows.seismic_projects[0].id);
      expect(sink.store.rows.seismic_line_picks[0].line_id).toBe(line.id);
    });

    test('the session follows its volume, horizons and fault; the unknown surface id is dropped', () => {
      const sess = sink.store.rows.seismic_sessions;
      expect(sess).toHaveLength(1);
      const s = sess[0];
      const vol = sink.store.rows.seismic_volumes[0];
      const hzIds = sink.store.rows.seismic_horizons.map((h) => h.id).sort();
      expect(s.payload.volume_id).toBe(vol.id);
      expect([...s.payload.visibleIds].sort()).toEqual(hzIds);
      expect(s.payload.visibleFaultIds).toEqual([sink.store.rows.seismic_faults[0].id]);
      expect(s.payload.visibleSurfaceIds).toEqual([]);
      expect(s.schema_version).toBe(1);
      expect(s.user_id).toBe(DST);
    });

    test('no source id survives outside provenance', () => {
      const old = new Set([PROJ, VOL, HZ, HZM, FLT, EXP, LINE, PICK, SESS, SURF, OTHER_VOL]);
      for (const rows of Object.values(sink.store.rows)) for (const r of rows) { const { provenance, ...rest } = r; walkUuids(rest, (id) => expect(old.has(id)).toBe(false)); }
    });
  });

  test('a volume root alone brings its horizons, faults and sessions but not the project or the line', async () => {
    const built = await buildPackage(makeWorld(), [{ kind: 'seismic_volume', id: VOL }]);
    expect(Object.keys(built.manifest.tables).sort()).toEqual(['seismic_exported_surfaces', 'seismic_faults', 'seismic_horizons', 'seismic_sessions', 'seismic_volumes']);
    expect(built.refs.external).toBeGreaterThanOrEqual(1); // project_id, optional
    const sink = makeSink();
    await importPackage(await built.writer.toUint8Array(), sink);
    expect(sink.store.rows.seismic_volumes[0].project_id).toBeNull();
  });
});
