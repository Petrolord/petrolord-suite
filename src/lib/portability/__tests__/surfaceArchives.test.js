// Mapping U2-017 (MAP-U1-034): a .pld carries a surface's re-grid archives
// (<grid path>.prev-<ts>.f32, recorded in provenance.history), and the
// import moves them beside the new grid and rewrites the recorded paths,
// so Restore the previous grid works after a package round trip.

import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildBackup } from '@/lib/portability/backup';
import { importPackage } from '@/lib/portability/importPackage';
import { surfaceArchivePaths, moveSurfaceArchivePaths } from '@/lib/portability/geoscienceSpec';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const S1 = '00000003-0000-4000-8000-000000000000';
const f32 = (a) => new Uint8Array(Float32Array.from(a).buffer);
const MAIN = `${ME}/${S1}/grid.f32`;
const ARCH = `${MAIN}.prev-1790000000000.f32`;

function world({ withArchive = true } = {}) {
  const rows = {
    geo_wells: [], geo_wells_logs: [], geo_wells_tops: [], geo_wells_zones: [], geo_culture: [],
    geo_surfaces: [{
      id: S1, user_id: ME, organization_id: null, name: 'Top Dome', kind: 'structure', origin_x: 0, origin_y: 0, nx: 2, ny: 2, dx: 10, dy: 10,
      rotation_deg: 0, z_domain: 'depth', z_unit: 'm', crs: 'EPSG:32631', storage_path: MAIN,
      provenance: { history: [{ replaced_at: '2026-09-30T10:00:00Z', previous: { nx: 2, ny: 2 }, archive_path: ARCH }, { replaced_at: '2026-09-29T10:00:00Z', archive_path: 'someone-else/other/grid.f32.prev-1.f32' }] },
    }],
  };
  const blobs = new Map([[`surfaces/${MAIN}`, f32([1, 2, 3, 4])]]);
  if (withArchive) blobs.set(`surfaces/${ARCH}`, f32([9, 8, 7, 6]));
  const source = {
    rows, blobs,
    async currentUser() { return { id: ME, organization_id: null }; },
    async getRow(table, id) { return (rows[table] || []).find((r) => r.id === id) || null; },
    async listChildren(table, column, parentId) { return (rows[table] || []).filter((r) => r[column] === parentId); },
    async downloadBlob(bucket, p) { const b = blobs.get(`${bucket}/${p}`); if (!b) throw new Error(`no blob ${bucket}/${p}`); return b; },
    async listBlobs() { return []; },
    async listStateRowsForWells() { return []; },
    async listSessionsForVolumes() { return []; },
    async getCustomCrs() { return null; },
  };
  const deps = { listWells: async () => [], listSurfaces: async () => rows.geo_surfaces, listCulture: async () => [], listRootCandidates: async () => [] };
  return { source, deps };
}
function sink() {
  const store = { rows: {}, blobs: new Map() };
  return {
    store,
    async currentUser() { return { id: DST, organization_id: null }; },
    async listMyWells() { return []; },
    async createJob() { return null; }, async updateJob() {}, async listItems() { return []; }, async recordItems() {},
    async mergeCustomCrs() {},
    async uploadBlob(bucket, p, bytes) { store.blobs.set(`${bucket}/${p}`, new Uint8Array(bytes)); },
    async removeBlob() {},
    async insertRows(table, rs) { store.rows[table] = [...(store.rows[table] || []), ...rs]; },
  };
}

test('the archive travels, lands beside the new grid, and the recorded path follows it', async () => {
  const w = world();
  const backup = await buildBackup(w.source, 'mine', { who: { userId: ME }, deps: w.deps, partBytes: 1e9 });
  expect(backup.manifest.blobs.map((b) => b.path).sort()).toEqual([MAIN, ARCH].sort());
  const archives = await backup.set.finish(backup.manifest);
  const k = sink();
  const r = await importPackage(archives, k);
  const s = k.store.rows.geo_surfaces[0];
  expect(s.storage_path.startsWith(`${DST}/`)).toBe(true);
  const moved = s.provenance.history[0].archive_path;
  expect(moved).toBe(`${s.storage_path}.prev-1790000000000.f32`);
  expect(Array.from(new Float32Array(k.store.blobs.get(`surfaces/${moved}`).buffer))).toEqual([9, 8, 7, 6]);
  expect(Array.from(new Float32Array(k.store.blobs.get(`surfaces/${s.storage_path}`).buffer))).toEqual([1, 2, 3, 4]);
  // a recorded path that is not beside this grid is left as it was
  expect(s.provenance.history[1].archive_path).toBe('someone-else/other/grid.f32.prev-1.f32');
  expect(r.summary.notes.join(' ')).not.toMatch(/belongs to no row/);
  expect(r.summary.blobsWritten).toBe(2);
});

test('negative control: an archive that is gone at export is left out, the row still imports', async () => {
  const w = world({ withArchive: false });
  const backup = await buildBackup(w.source, 'mine', { who: { userId: ME }, deps: w.deps, partBytes: 1e9 });
  expect(backup.manifest.blobs.map((b) => b.path)).toEqual([MAIN]);
  const k = sink();
  await importPackage(await backup.set.finish(backup.manifest), k);
  expect(k.store.rows.geo_surfaces).toHaveLength(1);
  expect([...k.store.blobs.keys()]).toHaveLength(1);
});

test('the helpers only touch archives beside the row grid', () => {
  expect(surfaceArchivePaths({ storage_path: 'a/b/grid.f32', provenance: { history: [{ archive_path: 'a/b/grid.f32.prev-2.f32' }, { archive_path: 'x.f32' }, {}] } })).toEqual(['a/b/grid.f32.prev-2.f32']);
  expect(surfaceArchivePaths({ storage_path: 'a', provenance: {} })).toEqual([]);
  const row = moveSurfaceArchivePaths({ provenance: { history: [{ archive_path: 'old/g.f32.prev-3.f32' }] } }, 'old/g.f32', 'new/g.f32');
  expect(row.provenance.history[0].archive_path).toBe('new/g.f32.prev-3.f32');
});
