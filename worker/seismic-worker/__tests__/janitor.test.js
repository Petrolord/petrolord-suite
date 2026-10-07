/**
 * @jest-environment node
 */
// Worker housekeeping (QI programme Q0b-2): abandoned uploads aborted after
// 7 days, raw SEG-Y removed 30 days after upload, nothing younger touched,
// store errors counted and retried next run, and a row changed elsewhere in
// the meantime left alone.
import { runJanitor, ABANDON_AFTER_DAYS, RAW_RETENTION_DAYS } from '../src/janitor.js';

const DAY = 86400e3;
const NOW = Date.parse('2026-11-20T12:00:00Z');
const ago = (d) => new Date(NOW - d * DAY).toISOString();

function adminMock(rows) {
  const updates = [];
  const from = () => {
    const f = { eq: [], lt: [], isNull: [] };
    let patch = null;
    const b = {
      select: () => b,
      update: (p) => { patch = p; return b; },
      eq: (c, v) => { f.eq.push([c, v]); return b; },
      lt: (c, v) => { f.lt.push([c, v]); return b; },
      is: (c, v) => { f.isNull.push([c, v]); return b; },
      order: () => b,
      // copies, as a real query returns: later changes to a stored row do not reach them
      limit: async () => ({ data: structuredClone(rows.filter((r) => f.eq.every(([c, v]) => r[c] === v) && f.lt.every(([c, v]) => r[c] && r[c] < v) && f.isNull.every(([c]) => (c === 'result_refs->>removed_at' ? !r.result_refs?.removed_at : r[c] == null)))), error: null }),
      then: (res) => {
        const r = rows.find((x) => f.eq.every(([c, v]) => x[c] === v));
        if (r) { Object.assign(r, patch); updates.push({ id: r.id, ...patch }); }
        res({ error: null });
      },
    };
    return b;
  };
  return { from, updates };
}

const sign = async (method, bucket, key, q = {}) => `https://store/${bucket}/${key}?m=${method}${q.uploadId ? `&uploadId=${q.uploadId}` : ''}`;
const base = { bucket: 'seismic-raw', meta: {} };

test('abandons only uploads older than the limit and expires only raw files past retention', async () => {
  const rows = [
    { ...base, id: 'old-up', status: 'uploading', created_at: ago(ABANDON_AFTER_DAYS + 1), object_key: 'u/a.sgy', upload_id: 'U1' },
    { ...base, id: 'new-up', status: 'uploading', created_at: ago(1), object_key: 'u/b.sgy', upload_id: 'U2' },
    { ...base, id: 'old-raw', status: 'uploaded', created_at: ago(60), uploaded_at: ago(RAW_RETENTION_DAYS + 2), object_key: 'u/c.sgy' },
    { ...base, id: 'new-raw', status: 'uploaded', created_at: ago(5), uploaded_at: ago(5), object_key: 'u/d.sgy' },
  ];
  const admin = adminMock(rows);
  const calls = [];
  const out = await runJanitor({ admin, sign, now: () => NOW, fetchImpl: async (url, init) => { calls.push(`${init.method} ${url}`); return { ok: true, status: 204 }; }, log: { warn() {} } });
  expect(out).toEqual({ abandoned: 1, expired: 1, exports: 0, errors: 0 });
  expect(calls).toEqual([
    'DELETE https://store/seismic-raw/u/a.sgy?m=DELETE&uploadId=U1',
    'DELETE https://store/seismic-raw/u/c.sgy?m=DELETE',
  ]);
  expect(rows.find((r) => r.id === 'old-up')).toMatchObject({ status: 'deleted', upload_id: null });
  expect(rows.find((r) => r.id === 'old-raw').meta.janitor.note).toMatch(/30 days/);
  expect(rows.find((r) => r.id === 'new-up').status).toBe('uploading');
  expect(rows.find((r) => r.id === 'new-raw').status).toBe('uploaded');
});

test('an object already gone (404) still counts as done', async () => {
  const rows = [{ ...base, id: 'x', status: 'uploaded', created_at: ago(90), uploaded_at: ago(90), object_key: 'u/x.sgy' }];
  const out = await runJanitor({ admin: adminMock(rows), sign, now: () => NOW, fetchImpl: async () => ({ ok: false, status: 404 }), log: { warn() {} } });
  expect(out.expired).toBe(1);
  expect(rows[0].status).toBe('deleted');
});

test('a store failure is counted and the row kept for the next run (negative control)', async () => {
  const rows = [{ ...base, id: 'y', status: 'uploaded', created_at: ago(90), uploaded_at: ago(90), object_key: 'u/y.sgy' }];
  const out = await runJanitor({ admin: adminMock(rows), sign, now: () => NOW, fetchImpl: async () => ({ ok: false, status: 503 }), log: { warn() {} } });
  expect(out).toEqual({ abandoned: 0, expired: 0, exports: 0, errors: 1 });
  expect(rows[0].status).toBe('uploaded');
});

test('the update is guarded on the status it read, so a row changed meanwhile is left alone', async () => {
  const rows = [{ ...base, id: 'z', status: 'uploading', created_at: ago(30), object_key: 'u/z.sgy', upload_id: 'U9' }];
  const admin = adminMock(rows);
  await runJanitor({ admin, sign, now: () => NOW, fetchImpl: async () => { rows[0].status = 'uploaded'; return { ok: true, status: 204 }; }, log: { warn() {} } });
  expect(rows[0].status).toBe('uploaded');
  expect(admin.updates).toEqual([]);
});

test('removes SEG-Y exports past their retention once, and keeps younger ones', async () => {
  const { EXPORT_RETENTION_DAYS } = require('../src/janitor.js');
  const rows = [
    { id: 'old-ex', kind: 'export_segy', status: 'succeeded', finished_at: ago(EXPORT_RETENTION_DAYS + 1), result_refs: { bucket: 'seismic-work', key: 'exports/u/j1/a.sgy', url: 'https://x' } },
    { id: 'new-ex', kind: 'export_segy', status: 'succeeded', finished_at: ago(1), result_refs: { bucket: 'seismic-work', key: 'exports/u/j2/b.sgy', url: 'https://y' } },
  ];
  const admin = adminMock(rows);
  const calls = [];
  const run = () => runJanitor({ admin, sign, now: () => NOW, fetchImpl: async (url, init) => { calls.push(`${init.method} ${url}`); return { ok: true, status: 204 }; }, log: { warn() {} } });
  expect(await run()).toMatchObject({ exports: 1, errors: 0 });
  expect(calls).toEqual(['DELETE https://store/seismic-work/exports/u/j1/a.sgy?m=DELETE']);
  expect(rows[0].result_refs).toMatchObject({ url: null, key: 'exports/u/j1/a.sgy' });
  expect(rows[0].result_refs.removed_at).toBeTruthy();
  expect(rows[1].result_refs.url).toBe('https://y');
  // a second run leaves the removed one alone
  expect(await run()).toMatchObject({ exports: 0 });
});
