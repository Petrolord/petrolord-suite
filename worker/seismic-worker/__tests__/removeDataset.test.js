/**
 * @jest-environment node
 */
// remove_dataset (2026-10-09): a user removes one of their worker files. A
// gather store goes with every block its manifest lists; a raw upload is one
// object; the row is marked deleted (that frees the allowance). Negative
// controls: another user's file, a file a running job reads, and a file still
// uploading are all refused and nothing is removed.
import { removeDataset, validateRemoveParams, datasetKeys } from '../src/handlers/removeDataset.js';
import { gatherBlockKey, foldBlockKey } from '../../../packages/engines/engines/qi/gatherStore';
import { KINDS } from '../src/handlers/index.js';

const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const STORE = '33333333-3333-4333-8333-333333333333';
const RAW = '22222222-2222-4222-8222-222222222222';

function fixture({ rows, jobs = [] }) {
  const objects = new Map();
  const deleted = [];
  const updates = [];
  for (const r of rows) {
    objects.set(r.object_key, r.kind === 'gathers_offset' ? new TextEncoder().encode(JSON.stringify({ blocks_present: [[0, 0], [0, 1]] })).buffer : new ArrayBuffer(8));
    if (r.kind === 'gathers_offset') {
      const prefix = r.object_key.replace(/\/manifest\.json$/, '');
      for (const [bi, bj] of [[0, 0], [0, 1]]) { objects.set(`${prefix}/${gatherBlockKey(bi, bj)}`, new ArrayBuffer(4)); objects.set(`${prefix}/${foldBlockKey(bi, bj)}`, new ArrayBuffer(4)); }
    }
  }
  const admin = {
    from(table) {
      const q = { table, filters: [] };
      const api = {
        select() { return api; },
        eq(k, v) { q.filters.push([k, v]); return api; },
        in(k, v) { q.in = [k, v]; return api; },
        update(patch) { q.patch = patch; return api; },
        async maybeSingle() { return { data: rows.find((r) => q.filters.every(([k, v]) => r[k] === v)) || null, error: null }; },
        then(res) {
          if (q.patch) { updates.push({ filters: q.filters, patch: q.patch }); return res({ error: null }); }
          if (table === 'qi_jobs') return res({ data: jobs.filter((j) => j.user_id === q.filters[0][1] && q.in[1].includes(j.status)), error: null });
          return res({ data: [], error: null });
        },
      };
      return api;
    },
  };
  const sign = async (method, bucket, key) => `${method} ${key}`;
  const fetchImpl = async (url, opts = {}) => {
    const [method, key] = url.split(' ');
    if (method === 'GET') return { ok: objects.has(key), status: objects.has(key) ? 200 : 404, arrayBuffer: async () => objects.get(key) };
    if ((opts.method || method) === 'DELETE') { deleted.push(key); const had = objects.delete(key); return { ok: had, status: had ? 204 : 404 }; }
    return { ok: false, status: 400 };
  };
  const ctx = (datasetId, jobId = 'job-1') => ({ params: { dataset_id: datasetId }, job: { id: jobId, user_id: UID }, progress: () => {}, cancelled: false });
  return { objects, deleted, updates, deps: { admin, sign, fetchImpl }, ctx };
}

const storeRow = (over = {}) => ({ id: STORE, user_id: UID, kind: 'gathers_offset', status: 'uploaded', bucket: 'seismic-work', object_key: `gathers/${UID}/${STORE}/manifest.json`, bytes: 1000, name: 'Ekene gathers', meta: {}, ...over });
const rawRow = (over = {}) => ({ id: RAW, user_id: UID, kind: 'segy_upload', status: 'uploaded', bucket: 'seismic-raw', object_key: `raw/${UID}/${RAW}.sgy`, bytes: 500, name: 'EKENE3D-gathers-nmo.sgy', meta: {}, ...over });

test('the kind is registered and the settings are checked', () => {
  expect(KINDS).toContain('remove_dataset');
  expect(validateRemoveParams({})).toMatch(/dataset_id/);
  expect(validateRemoveParams({ dataset_id: STORE })).toBeNull();
});

test('a gather store goes with its manifest and every block the manifest lists, and the row is marked deleted', async () => {
  const f = fixture({ rows: [storeRow()] });
  const out = await removeDataset(f.ctx(STORE), f.deps);
  expect(out.removed_objects).toBe(5);              // 2 blocks x (samples + fold) + the manifest
  expect(f.objects.size).toBe(0);
  expect(f.updates[0].patch.status).toBe('deleted');
  expect(f.updates[0].filters).toEqual([['id', STORE], ['status', 'uploaded']]);
});

test('a raw upload is one object; one already gone still counts as removed', async () => {
  const f = fixture({ rows: [rawRow()] });
  f.objects.clear();
  const out = await removeDataset(f.ctx(RAW), f.deps);
  expect(out.removed_objects).toBe(1);
  expect(f.updates[0].patch.status).toBe('deleted');
  expect(await datasetKeys(rawRow(), async () => new ArrayBuffer(0))).toEqual([rawRow().object_key]);
});

test("negative controls: another user's file, a file a running job reads, and an unfinished upload are refused untouched", async () => {
  const f1 = fixture({ rows: [storeRow({ user_id: OTHER })] });
  await expect(removeDataset(f1.ctx(STORE), f1.deps)).rejects.toThrow(/not found in your account/);
  expect(f1.deleted).toHaveLength(0);

  const f2 = fixture({ rows: [storeRow()], jobs: [{ id: 'job-9', user_id: UID, kind: 'angle_stacks', status: 'running', params: { dataset_id: STORE } }] });
  await expect(removeDataset(f2.ctx(STORE), f2.deps)).rejects.toThrow(/angle stacks job is using this file/);
  expect(f2.deleted).toHaveLength(0);

  const f3 = fixture({ rows: [rawRow({ status: 'uploading' })] });
  await expect(removeDataset(f3.ctx(RAW), f3.deps)).rejects.toThrow(/only a finished or failed file/);
  expect(f3.deleted).toHaveLength(0);
});
