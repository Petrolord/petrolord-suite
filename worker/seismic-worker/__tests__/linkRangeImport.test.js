/**
 * @jest-environment node
 */
// Import from a link by byte ranges (2026-10-15, QI round 3). A link whose
// server answers ranges is registered without a copy, and the preview scan,
// the crop plan and the conversion read only what they need from it. A real
// local HTTP server serves the file and counts every byte it sends; a server
// without ranges is the negative control (the whole file is copied, as before).
import http from 'node:http';
import zlib from 'node:zlib';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { TextEncoder, TextDecoder } from 'node:util';
import { ingestUrl } from '../src/handlers/ingestUrl.js';
import { scanDataset } from '../src/handlers/scanDataset.js';
import { stackToV4 } from '../src/handlers/stackToV4.js';
import { linkRangeReader, parseContentRange, probeRanges } from '../src/linkReader.js';
import { bufferReader } from '../../../packages/engines/engines/seismolord/reader';
import { DEFLATE_RAW } from '../../../packages/engines/engines/seismolord/brickCodecV4';
import { makeSegy, scanOf } from '../../../packages/engines/__tests__/seismolordSegyFixture';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;
jest.setTimeout(120000);

const ZLIB = { compression: DEFLATE_RAW, deflate: async (b) => new Uint8Array(zlib.deflateRawSync(b)), inflate: async (b) => new Uint8Array(zlib.inflateRawSync(b)) };
const CONVERT = { brickSize: 8, levels: 2 };
const UID = '11111111-1111-4111-8111-111111111111';
const VOL = '22222222-2222-4222-8222-222222222222';
const DS = '33333333-3333-4333-8333-333333333333';
const MAP = { ilByte: 189, xlByte: 193 };
// 25,000 traces, so the preview scan samples the file as it does a real survey
const shape = { nIl: 250, nXl: 100, ns: 200, il0: 100, xl0: 200 };
const amp = (il, xl, s) => 500 * Math.sin(0.21 * s + 0.05 * il) * Math.cos(0.03 * xl) + il - xl;
const fix = makeSegy({ ...shape, amp, format: 1 });
const FILE = new Uint8Array(fix.buffer);
// a thin survey (100,000 traces of 10 samples) for the preview scan, which samples above 20,000 traces
const thin = makeSegy({ nIl: 1000, nXl: 100, ns: 10, amp, format: 1 });
const scan = { ...scanOf({ ...shape, format: 1 }), dtUs: 4000, coordScalar: -100, corners: { first: null, last: null }, affine: null };
// a pilot of 30 inlines x 40 crosslines and 400 of the 800 ms
const DEF = { name: 'Pilot', il: { from: 200, to: 229 }, xl: { from: 230, to: 269 }, window: { from: 200, to: 600 } };
// the reader's request floor scaled to this small file (a real survey's kept run is megabytes)
const READER = { blockBytes: 16 * 1024 };

function fileServer() {
  const s = { file: FILE, ranges: true, etag: '"v1"', status: null, bytes: 0, requests: 0, served: [] };
  s.server = http.createServer((req, res) => {
    s.requests += 1;
    if (s.status) { res.writeHead(s.status); res.end(); return; }
    const FILE = s.file;
    const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
    if (s.ranges && m) {
      const a = Number(m[1]); const b = Math.min(Number(m[2]), FILE.length - 1);
      res.writeHead(206, { 'Content-Range': `bytes ${a}-${b}/${FILE.length}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes', ETag: s.etag, 'Content-Disposition': 'attachment; filename="pilot stack.sgy"' });
      s.bytes += b - a + 1; s.served.push([a, b]);
      res.end(Buffer.from(FILE.buffer, a, b - a + 1));
      return;
    }
    res.writeHead(200, { 'Content-Length': FILE.length, ETag: s.etag });
    s.bytes += FILE.length;
    res.end(Buffer.from(FILE.buffer));
  });
  return s;
}
// guardedGet's shape, to the local server (netGuard itself is covered in netGuard.test.js)
const localGet = (s) => (url, { headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: s.server.address().port, path: '/f.sgy', headers }, (res) => resolve({ res, finalUrl: 'https://data.example/surveys/f.sgy' }));
  req.on('error', reject); req.end();
});

function fakeStore() {
  const objects = new Map(); const parts = new Map(); const calls = [];
  const sign = async (method, bucket, key, q = {}) => `https://store/${bucket}/${key}?${new URLSearchParams(q)}&m=${method}`;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url); const key = u.pathname.slice(1); const q = u.searchParams; const method = init.method || 'GET';
    calls.push(method);
    const ok = (body = '', h = {}) => ({ ok: true, status: 200, text: async () => body, arrayBuffer: async () => body, headers: { get: (k) => h[k] ?? null } });
    if (method === 'POST' && q.has('uploads')) return ok('<InitiateMultipartUploadResult><UploadId>U1</UploadId></InitiateMultipartUploadResult>');
    if (method === 'PUT') { parts.set(Number(q.get('partNumber')), new Uint8Array(init.body)); return ok('', { etag: '"e"' }); }
    if (method === 'POST') { const all = Buffer.concat([...parts].sort((a, b) => a[0] - b[0]).map(([, b]) => b)); objects.set(key, new Uint8Array(all)); return ok('<x/>'); }
    if (method === 'DELETE') return { ok: true, status: 204, headers: { get: () => null } };
    const r = /bytes=(\d+)-(\d+)/.exec(init.headers?.Range || ''); const o = objects.get(key);
    return { ok: true, status: 206, arrayBuffer: async () => o.slice(Number(r[1]), Number(r[2]) + 1).buffer, headers: { get: () => null } };
  };
  return { sign, fetchImpl, objects, calls };
}
function storageMock() {
  const objects = new Map();
  return {
    objects,
    async upload(p, bytes, { upsert } = {}) { if (objects.has(p) && !upsert) return 'exists'; objects.set(p, new Uint8Array(bytes)); return 'uploaded'; },
    async list(dir) { const pre = `${dir}/`; return [...objects.keys()].filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map((k) => k.slice(pre.length)); },
  };
}
function adminMock(dataset) {
  const tables = { qi_datasets: dataset ? [dataset] : [], seismic_volumes: [{ id: VOL, user_id: UID, status: 'converting', name: 'Pilot' }] };
  const builder = (table) => {
    const filters = []; let patch = null;
    const b = {
      select: () => b, update: (p) => { patch = p; return b; }, eq: (c, v) => { filters.push([c, v]); return b; },
      insert: async (row) => { tables[table].push(row); return { error: null }; },
      maybeSingle: async () => ({ data: tables[table].find((r) => filters.every(([c, v]) => r[c] === v)) || null, error: null }),
      then: (resolve) => { tables[table].filter((r) => filters.every(([c, v]) => r[c] === v)).forEach((r) => Object.assign(r, patch)); resolve({ error: null }); },
    };
    return b;
  };
  return { tables, from: builder, rpc: async (fn) => ({ data: fn.startsWith('seismic_storage_quota_bytes') ? 20 * 1024 ** 3 : 0, error: null }) };
}
const ctxFor = (params) => ({ job: { id: 'j', attempt: 1, user_id: UID }, params, cancelled: false, progress: () => {}, log: console });

let srv; let scratch;
beforeAll(async () => {
  srv = fileServer();
  await new Promise((r) => srv.server.listen(0, '127.0.0.1', r));
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'link-range-'));
});
afterAll(async () => { await new Promise((r) => srv.server.close(r)); fs.rmSync(scratch, { recursive: true, force: true }); });
beforeEach(() => { Object.assign(srv, { file: FILE, ranges: true, etag: '"v1"', status: null, bytes: 0, requests: 0, served: [] }); });

async function convert(dataset, extraDeps) {
  const admin = adminMock(dataset); const storage = storageMock();
  const ctx = ctxFor({ dataset_id: DS, volume_id: VOL, name: 'Pilot', file_name: 'pilot stack.sgy', scan, crs_plan: { needsTransform: false, storeTag: 'UNKNOWN' }, custom_defs: {}, ingest_rec: { fingerprint: { algo: 'x' }, pipeline: 'v4' }, crop: { def: DEF } });
  const result = await stackToV4(ctx, { admin, storage, scratchDir: scratch, codec: ZLIB, convertOptions: CONVERT, ...extraDeps });
  return { storage, result, row: admin.tables.seismic_volumes[0] };
}

describe('import from a link by byte ranges', () => {
  let linked;
  test('a link that serves ranges is registered without a copy: only the fingerprint\'s bytes cross', async () => {
    const store = fakeStore(); const admin = adminMock(null);
    const out = await ingestUrl(ctxFor({ url: 'https://data.example/surveys/f.sgy?sig=abc' }), { admin, get: localGet(srv), sign: store.sign, fetchImpl: store.fetchImpl, newId: () => DS });
    expect(out).toMatchObject({ dataset_id: DS, bytes: FILE.length, file_name: 'pilot stack.sgy', linked: true });
    expect(store.calls).toEqual([]); // nothing stored
    linked = admin.tables.qi_datasets[0];
    expect(linked.meta.link).toMatchObject({ url: 'https://data.example/surveys/f.sgy?sig=abc', size: FILE.length, etag: '"v1"' });
    expect(linked.meta.source).toBe('data.example/surveys/f.sgy');
    // the same fingerprint the copy path computes
    const store2 = fakeStore(); srv.ranges = false;
    const copied = await ingestUrl(ctxFor({ url: 'https://data.example/surveys/f.sgy' }), { admin: adminMock(null), get: localGet(srv), sign: store2.sign, fetchImpl: store2.fetchImpl, newId: () => DS });
    expect(copied.fingerprint).toEqual(out.fingerprint);
    console.log(`file ${FILE.length} bytes; linked: probe + fingerprint ${out.fetched_bytes + 1} bytes`);
    expect(out.fetched_bytes).toBeLessThan(0.15 * FILE.length);
  });

  test('negative control: a server without ranges gets the whole file copied into the store, as before', async () => {
    srv.ranges = false;
    const store = fakeStore();
    const out = await ingestUrl(ctxFor({ url: 'https://data.example/surveys/f.sgy' }), { admin: adminMock(null), get: localGet(srv), sign: store.sign, fetchImpl: store.fetchImpl, newId: () => DS });
    expect(out.linked).toBeUndefined();
    expect(srv.bytes).toBe(FILE.length);
    expect(store.calls).toContain('PUT');
    expect(Buffer.compare(Buffer.from([...store.objects.values()][0]), Buffer.from(FILE))).toBe(0);
  });

  test('the preview scan reads the link and gives the stored file\'s answer', async () => {
    srv.file = new Uint8Array(thin.buffer);
    const ds = { ...linked, bytes: thin.buffer.byteLength, meta: { ...linked.meta, link: { ...linked.meta.link, size: thin.buffer.byteLength } } };
    const viaLink = await scanDataset(ctxFor({ dataset_id: DS, mapping: MAP }), { admin: adminMock(ds), linkGet: localGet(srv), linkReaderOptions: READER });
    const scanBytes = srv.bytes; console.log(JSON.stringify(srv.served.filter(([a, b]) => b - a > 100000).slice(0, 20)));
    const viaStore = await scanDataset(ctxFor({ dataset_id: DS, mapping: MAP }), { admin: adminMock(ds), makeReader: () => bufferReader(thin.buffer) });
    expect(viaLink.scan).toEqual(viaStore.scan);
    expect(viaLink.textLines).toEqual(viaStore.textLines);
    console.log(`scan of a ${thin.buffer.byteLength}-byte, 100,000-trace file read ${scanBytes} bytes (${(100 * scanBytes / thin.buffer.byteLength).toFixed(1)} percent) in ${srv.requests} requests`);
    expect(scanBytes).toBeLessThan(0.35 * thin.buffer.byteLength);
  });

  test('a crop converted from the link reads the kept traces only and stores the same bricks as the copy', async () => {
    const viaLink = await convert(linked, { linkGet: localGet(srv), linkReaderOptions: READER });
    const linkBytes = srv.bytes;
    const viaCopy = await convert(linked, { makeReader: () => bufferReader(fix.buffer) });
    const keys = [...viaCopy.storage.objects.keys()].sort();
    expect([...viaLink.storage.objects.keys()].sort()).toEqual(keys);
    for (const k of keys) {
      if (k.endsWith('manifest.json')) continue;
      expect(Buffer.compare(Buffer.from(viaLink.storage.objects.get(k)), Buffer.from(viaCopy.storage.objects.get(k)))).toBe(0);
    }
    expect(viaLink.row.status).toBe('ready');
    // what the crop keeps: 30 x 40 whole source traces (the samples are cut after the read)
    const keptSource = 30 * 40 * (240 + shape.ns * 4);
    console.log(`conversion read ${linkBytes} bytes in ${srv.requests} requests; kept source traces ${keptSource}; file ${FILE.length}`);
    // the kept traces once (copied to scratch), the gather check's 600 traces and the file headers
    expect(linkBytes).toBeLessThan(keptSource + 600 * (240 + shape.ns * 4) + 64 * 1024);
    expect(linkBytes).toBeLessThan(0.1 * FILE.length);
    expect(fs.readdirSync(scratch).filter((f) => f.endsWith('.source.sgy'))).toEqual([]); // the copy is removed
  });

  test('a changed file, a dead link and a server that stops serving ranges fail with their reason', async () => {
    srv.etag = '"v2"';
    await expect(convert(linked, { linkGet: localGet(srv), linkReaderOptions: READER })).rejects.toMatchObject({ stage: expect.stringMatching(/link_changed|validate_failed/) });
    srv.etag = '"v1"'; srv.status = 403;
    await expect(scanDataset(ctxFor({ dataset_id: DS, mapping: MAP }), { admin: adminMock(linked), linkGet: localGet(srv) })).rejects.toMatchObject({ stage: expect.stringMatching(/link_gone|not_segy/) });
    srv.status = null; srv.ranges = false;
    const r = linkRangeReader({ url: 'https://data.example/f.sgy', size: FILE.length, version: { etag: '"v1"' }, get: localGet(srv) });
    await expect(r.read(5000, 100)).rejects.toMatchObject({ stage: 'link_no_ranges' });
  });

  test('the reader: exact large reads, cached small ones, and Content-Range parsing', async () => {
    const r = linkRangeReader({ url: 'https://data.example/f.sgy', size: FILE.length, version: { etag: '"v1"' }, get: localGet(srv), blockBytes: 4096 });
    const a = new Uint8Array(await r.read(100000, 50000));
    expect(Buffer.compare(Buffer.from(a), Buffer.from(FILE.subarray(100000, 150000)))).toBe(0);
    expect(srv.served).toEqual([[100000, 149999]]);
    for (let k = 0; k < 10; k++) await r.read(8192 + k * 240, 240); // neighbouring headers: one block
    expect(srv.served.length).toBe(2);
    const b = new Uint8Array(await r.read(4090, 20)); // across two blocks
    expect(Buffer.compare(Buffer.from(b), Buffer.from(FILE.subarray(4090, 4110)))).toBe(0);
    expect(parseContentRange('bytes 0-0/123')).toEqual({ start: 0, end: 0, total: 123 });
    expect(parseContentRange('bytes 0-0/*')).toEqual({ start: 0, end: 0, total: null });
    expect(parseContentRange('nonsense')).toBeNull();
    const p = await probeRanges('https://data.example/f.sgy', { get: localGet(srv) });
    expect(p).toMatchObject({ ranged: true, size: FILE.length, version: { etag: '"v1"' } });
  });
});
