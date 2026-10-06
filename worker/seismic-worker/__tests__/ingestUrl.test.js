/**
 * @jest-environment node
 */
// ingest_url and scan_dataset (QI programme Q0b-3). The link's bytes must
// land in the store intact across several 64 MiB parts, the dataset row
// must carry the same fingerprint the browser computes, the source is kept
// without its query, and every refusal path starts no upload or aborts it.
// scan_dataset must give the browser scan worker's own answer.
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { ingestUrl, fileNameFor, describeSource } from '../src/handlers/ingestUrl.js';
import { scanDataset } from '../src/handlers/scanDataset.js';
import { fileFingerprint } from '../../../src/pages/apps/Seismolord/services/ingestResume';
import { PART_SIZE } from '../../../supabase/functions/qi-upload-url/logic.ts';
import { bufferReader } from '../../../packages/engines/engines/seismolord/reader';
import { scanGeometry } from '../../../packages/engines/engines/seismolord/segyScan';
import { openSegyDoor } from '../../../src/pages/apps/Seismolord/lib/segyDoor';

jest.setTimeout(120000);
const UID = '11111111-1111-4111-8111-111111111111';
const DS = '22222222-2222-4222-8222-222222222222';

// A minimal S3: multipart upload, ranged GET, abort.
function fakeStore() {
  const objects = new Map(); const uploads = new Map(); const calls = [];
  const sign = async (method, bucket, key, q = {}) => {
    const qs = new URLSearchParams(q).toString();
    return `https://store/${bucket}/${key}?${qs}&m=${method}`;
  };
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url); const key = u.pathname.slice(1); const q = u.searchParams; const method = init.method || 'GET';
    calls.push(`${method} ${q.has('uploads') ? 'initiate' : q.has('partNumber') ? `part ${q.get('partNumber')}` : q.has('uploadId') ? (method === 'DELETE' ? 'abort' : 'complete') : 'object'}`);
    const ok = (body = '', headers = {}) => ({ ok: true, status: 200, text: async () => body, arrayBuffer: async () => body, headers: { get: (h) => headers[h.toLowerCase()] ?? null } });
    if (method === 'POST' && q.has('uploads')) { uploads.set('U1', new Map()); return ok('<InitiateMultipartUploadResult><UploadId>U1</UploadId></InitiateMultipartUploadResult>'); }
    if (method === 'PUT' && q.has('partNumber')) { uploads.get(q.get('uploadId')).set(Number(q.get('partNumber')), new Uint8Array(init.body)); return ok('', { etag: `"e${q.get('partNumber')}"` }); }
    if (method === 'POST' && q.has('uploadId')) {
      const parts = [...uploads.get(q.get('uploadId'))].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
      const all = new Uint8Array(parts.reduce((n, b) => n + b.length, 0)); let at = 0;
      for (const b of parts) { all.set(b, at); at += b.length; }
      objects.set(key, all); uploads.delete(q.get('uploadId'));
      return ok('<CompleteMultipartUploadResult/>');
    }
    if (method === 'DELETE') { uploads.delete(q.get('uploadId')); return { ok: true, status: 204, headers: { get: () => null } }; }
    const range = /bytes=(\d+)-(\d+)/.exec(init.headers?.Range || '');
    const obj = objects.get(key);
    const slice = obj.slice(Number(range[1]), Number(range[2]) + 1);
    return { ok: true, status: 206, arrayBuffer: async () => slice.buffer, headers: { get: () => null } };
  };
  return { sign, fetchImpl, objects, uploads, calls };
}

// a 1 MiB pattern tiled with a per-tile marker, so a shifted or repeated
// part would be caught by the byte comparison
function sourceBytes(n) {
  const tile = new Uint8Array(1 << 20);
  for (let i = 0; i < tile.length; i++) tile[i] = (i * 7 + (i >> 11)) & 255;
  const b = new Uint8Array(n);
  for (let at = 0, t = 0; at < n; at += tile.length, t++) { b.set(tile.subarray(0, Math.min(tile.length, n - at)), at); b[at] = t & 255; }
  return b;
}
function fakeResponse(bytes, { status = 200, headers = {}, chunk = 3 * 1024 * 1024 } = {}) {
  return {
    statusCode: status, headers,
    destroy: jest.fn(), resume: jest.fn(),
    async* [Symbol.asyncIterator]() { for (let i = 0; i < bytes.length; i += chunk) yield bytes.subarray(i, Math.min(i + chunk, bytes.length)); },
  };
}
function adminMock({ used = 0 } = {}) {
  const inserted = [];
  return { inserted, rpc: async () => ({ data: used, error: null }), from: () => ({ insert: async (row) => { inserted.push(row); return { error: null }; } }) };
}
const ctxFor = (params) => ({ job: { id: 'j', attempt: 1, user_id: UID }, params, cancelled: false, progress: () => {} });

describe('ingest_url', () => {
  const N = 2 * PART_SIZE + 12345; // three parts
  const src = sourceBytes(N);

  test('stores the link byte for byte in three parts and registers the browser fingerprint', async () => {
    const store = fakeStore(); const admin = adminMock();
    const get = async () => ({ res: fakeResponse(src, { headers: { 'content-length': String(N) } }), finalUrl: 'https://cdn.example/surveys/F3%20full.sgy?sig=SECRET' });
    const out = await ingestUrl(ctxFor({ url: 'https://data.example/f3' }), { admin, get, sign: store.sign, fetchImpl: store.fetchImpl, newId: () => DS });
    const key = `seismic-raw/${UID}/${DS}/F3_full.sgy`;
    expect(store.calls.filter((c) => c.startsWith('PUT'))).toEqual(['PUT part 1', 'PUT part 2', 'PUT part 3']);
    const stored = store.objects.get(key);
    expect(stored.length).toBe(N);
    expect(Buffer.compare(Buffer.from(stored.buffer, stored.byteOffset, stored.length), Buffer.from(src.buffer, src.byteOffset, src.length))).toBe(0);
    const expected = await fileFingerprint({ size: N, slice: (a, b) => ({ arrayBuffer: async () => src.slice(a, b).buffer }) }, (b) => webcrypto.subtle.digest('SHA-256', b));
    expect(out).toMatchObject({ dataset_id: DS, bytes: N, file_name: 'F3 full.sgy', fingerprint: expected });
    expect(admin.inserted[0]).toMatchObject({ id: DS, user_id: UID, status: 'uploaded', bytes: N, part_count: 3, meta: { fingerprint: expected, source: 'cdn.example/surveys/F3%20full.sgy' } });
    expect(JSON.stringify(admin.inserted[0])).not.toMatch(/SECRET/);
  });

  test('a declared size over the allowance is refused before any upload starts', async () => {
    const store = fakeStore();
    const get = async () => ({ res: fakeResponse(src, { headers: { 'content-length': String(500 * 1024 ** 3) } }), finalUrl: 'https://x.example/a.sgy' });
    await expect(ingestUrl(ctxFor({ url: 'https://x.example/a.sgy' }), { admin: adminMock(), get, sign: store.sign, fetchImpl: store.fetchImpl })).rejects.toMatchObject({ stage: 'too_large' });
    expect(store.calls).toEqual([]);
  });

  test('a file that runs past the allowance mid-stream (no declared size) is aborted', async () => {
    const store = fakeStore();
    const admin = adminMock({ used: 150 * 1024 ** 3 - PART_SIZE }); // room for one part only
    const get = async () => ({ res: fakeResponse(src), finalUrl: 'https://x.example/a.sgy' });
    await expect(ingestUrl(ctxFor({ url: 'https://x.example/a.sgy' }), { admin, get, sign: store.sign, fetchImpl: store.fetchImpl })).rejects.toMatchObject({ stage: 'over_quota' });
    expect(store.calls).toContain('DELETE abort');
    expect(admin.inserted).toEqual([]);
  });

  test('a short body (declared more than sent) is aborted, not registered', async () => {
    const store = fakeStore(); const admin = adminMock();
    const get = async () => ({ res: fakeResponse(src.subarray(0, 1000), { headers: { 'content-length': '5000' } }), finalUrl: 'https://x.example/a.sgy' });
    await expect(ingestUrl(ctxFor({ url: 'https://x.example/a.sgy' }), { admin, get, sign: store.sign, fetchImpl: store.fetchImpl })).rejects.toMatchObject({ stage: 'fetch_failed' });
    expect(store.calls).toContain('DELETE abort');
    expect(admin.inserted).toEqual([]);
  });

  test('a refused link, a non-200 answer and a cancel', async () => {
    await expect(ingestUrl(ctxFor({ url: 'http://x.example/a' }), { admin: adminMock(), sign: async () => '' })).rejects.toMatchObject({ stage: 'validate_failed' });
    const refused = async () => { throw new Error('That link points to a private or reserved address.'); };
    await expect(ingestUrl(ctxFor({ url: 'https://x.example/a' }), { admin: adminMock(), get: refused, sign: async () => '' })).rejects.toMatchObject({ stage: 'fetch_refused' });
    const notFound = async () => ({ res: fakeResponse(src, { status: 404 }), finalUrl: 'https://x.example/a' });
    await expect(ingestUrl(ctxFor({ url: 'https://x.example/a' }), { admin: adminMock(), get: notFound, sign: async () => '' })).rejects.toMatchObject({ stage: 'fetch_failed' });
    const store = fakeStore();
    const ctx = ctxFor({ url: 'https://x.example/a' });
    let n = 0; ctx.progress = () => { n += 1; if (n === 3) ctx.cancelled = true; };
    const get = async () => ({ res: fakeResponse(src), finalUrl: 'https://x.example/a.sgy' });
    expect(await ingestUrl(ctx, { admin: adminMock(), get, sign: store.sign, fetchImpl: store.fetchImpl })).toBeNull();
    expect(store.calls).toContain('DELETE abort');
  });

  test('file names and sources', () => {
    expect(fileNameFor('https://h/x/y.sgy?a=1', 'attachment; filename="Survey 2.segy"')).toBe('Survey 2.segy');
    expect(fileNameFor('https://h/x/F3%20cube.sgy', null)).toBe('F3 cube.sgy');
    expect(fileNameFor('https://h/', null)).toBe('download.sgy');
    expect(describeSource('https://h.example/a/b.sgy?token=abc')).toBe('h.example/a/b.sgy');
  });
});

describe('scan_dataset', () => {
  const fixture = fs.readFileSync(path.resolve(__dirname, '../../../test-data/seismolord/segy/dome_ieee.sgy'));
  const buf = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.length);
  const ds = { id: DS, user_id: UID, status: 'uploaded', bucket: 'seismic-raw', object_key: 'k', bytes: fixture.length };
  const admin = (row) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) });

  test('gives the browser scan worker\'s geometry for the same file and mapping', async () => {
    const out = await scanDataset(ctxFor({ dataset_id: DS, mapping: {} }), { admin: admin(ds), makeReader: () => bufferReader(buf) });
    const { reader } = await openSegyDoor(bufferReader(buf));
    const direct = await scanGeometry(reader, {}, { maxTraces: 20000 });
    expect(out.scan.il).toEqual(direct.il);
    expect(out.scan.xl).toEqual(direct.xl);
    expect(out.scan.ns).toBe(direct.ns);
    expect(out.textLines.length).toBe(40);
    expect(out.preview.length).toBeGreaterThan(0);
  });

  test("another user's file, and a file that is not SEG-Y, are refused", async () => {
    await expect(scanDataset(ctxFor({ dataset_id: DS }), { admin: admin({ ...ds, user_id: 'x' }), makeReader: () => bufferReader(buf) })).rejects.toMatchObject({ stage: 'not_found' });
    const junk = new Uint8Array(5000).fill(7).buffer;
    await expect(scanDataset(ctxFor({ dataset_id: DS }), { admin: admin({ ...ds, bytes: 5000 }), makeReader: () => bufferReader(junk) })).rejects.toMatchObject({ stage: 'not_segy' });
  });
});
