/**
 * Surface grids are overwritten in place (re-grid, Replace grid from a file,
 * restore, reprojection). Storage served them "public, max-age=3600", so a
 * browser kept an old grid for up to an hour and ReservoirCalc Pro's Refresh
 * from source did not move the volume (Ekene demo, 2026-10-12). Every read
 * now names the row's version and uploads say max-age 0.
 * Negative control: the plain storage path (the old read) is the same before
 * and after a replace, so a cached copy would be served.
 */
const calls = { download: [], upload: [] };
jest.mock('@/lib/customSupabaseClient', () => {
  const storage = {
    from: () => ({
      download: async (p) => { calls.download.push(p); return { data: { arrayBuffer: async () => new Float32Array(4).buffer }, error: null }; },
      upload: async (p, b, o) => { calls.upload.push({ p, o }); return { error: null }; },
      copy: async () => ({ error: null }),
    }),
  };
  const chain = { update: () => chain, eq: () => chain, select: () => chain, single: async () => ({ data: { id: 's1' }, error: null }) };
  return { supabase: { storage, from: () => chain, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } };
});

import { downloadSurfaceGrid, gridDownloadPath, GRID_CACHE_CONTROL, replaceSurfaceGrid } from '@/lib/surfacesRegistry';

const row = (updated) => ({ id: 's1', name: 'Top', storage_path: 'u1/s1/grid.f32', nx: 2, ny: 2, updated_at: updated });

test('a read names the row version, so a replaced grid is never served from a cached copy', async () => {
  const before = row('2026-10-12T22:58:00Z');
  const after = row('2026-10-12T22:59:06Z');
  expect(gridDownloadPath(before)).not.toBe(gridDownloadPath(after));
  expect(gridDownloadPath(after)).toBe('u1/s1/grid.f32?v=2026-10-12T22%3A59%3A06Z');
  // negative control: the bare path the old read used is the same for both
  expect(before.storage_path).toBe(after.storage_path);
  await downloadSurfaceGrid(after);
  expect(calls.download.pop()).toBe('u1/s1/grid.f32?v=2026-10-12T22%3A59%3A06Z');
  expect(gridDownloadPath({ storage_path: 'x.f32' })).toBe('x.f32');
});

test('a replacement upload tells storage not to let browsers cache it', async () => {
  await replaceSurfaceGrid(row('t'), { spec: { x0: 0, y0: 0, dx: 1, dy: 1, nx: 2, ny: 2 }, grid: new Float32Array(4), provenance: {} }).catch(() => {});
  const up = calls.upload.find((u) => u.p === 'u1/s1/grid.f32');
  expect(up.o).toMatchObject({ upsert: true, cacheControl: GRID_CACHE_CONTROL });
  expect(GRID_CACHE_CONTROL).toBe('0');
});
