/**
 * @jest-environment node
 */
// export_segy (QI programme Q11): a stored volume streamed as SEG-Y into a
// multipart upload, in inline then crossline order, all-null traces left
// out; the assembled file reads back with the engines' own SEG-Y reader with
// the brick values, the inline and crossline numbers and the coordinates.
// Then the guards and the cancel (the upload is aborted).
import { exportSegy, validateExportParams, exportFileName, exportCards } from '../src/handlers/exportSegy.js';
import { readFileHeaders, scanGeometry, readTextualHeader } from '../../../packages/engines/engines/seismolord/segyScan';
import { decodeSamples, readHeaderInt32, readHeaderInt16, applyCoordScalar } from '../../../packages/engines/engines/seismolord/segyDecode';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(120000);
const UID = '11111111-1111-4111-8111-111111111111';
const VOL = '22222222-2222-4222-8222-222222222222';
const NIL = 20; const NXL = 18; const NS = 40; const B = 16;
const GRID = [Math.ceil(NIL / B), Math.ceil(NXL / B), Math.ceil(NS / B)];
const MANIFEST = {
  manifest_version: 1, app: 'seismolord', volume_id: VOL, name: 'Keta full stack',
  geometry: {
    il: { min: 1000, max: 1000 + 2 * (NIL - 1), step: 2, count: NIL }, xl: { min: 500, max: 500 + NXL - 1, step: 1, count: NXL }, ns: NS, dt_us: 4000,
    corners: [[0, 0], [1, 0], [0, 1]],
    affine: { origin: { x: 431000, y: 6512000 }, il_vec: { x: 0, y: 25 }, xl_vec: { x: 12.5, y: 0 } },
  },
  brick: { size: B, grid: GRID, count: GRID[0] * GRID[1] * GRID[2], dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1.0e30 },
  stats: { min: -1, max: 1, mean: 0, rms: 0.5, live_samples: 1 }, trace_count: NIL * NXL,
};
const value = (il, xl, s) => Math.fround(Math.sin(s / 3 + il / 5) * (1 + xl / 10));
const dead = (il, xl) => il === 3 && xl === 4; // one trace outside the survey
const STORE = (() => {
  const m = new Map();
  for (let i = 0; i < GRID[0]; i++) for (let j = 0; j < GRID[1]; j++) for (let k = 0; k < GRID[2]; k++) m.set(`${i}-${j}-${k}`, new Float32Array(B ** 3).fill(NULL_VALUE));
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s++) {
    if (dead(il, xl)) continue;
    m.get(`${Math.floor(il / B)}-${Math.floor(xl / B)}-${Math.floor(s / B)}`)[((il % B) * B + (xl % B)) * B + (s % B)] = value(il, xl, s);
  }
  return m;
})();
const ROW = { id: VOL, user_id: UID, status: 'ready', name: 'Keta full stack', storage_path: `${UID}/${VOL}`, crs: 'EPSG:32631' };
const adminFor = (row) => ({ from: () => { const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: row, error: null }) }; return b; } });
function fakeStore() {
  const parts = new Map(); const calls = [];
  const sign = async (method, bucket, key, q = {}) => `https://store/${bucket}/${key}?m=${method}&${new URLSearchParams(q)}`;
  const fetchImpl = async (url, init) => {
    const u = new URL(url); calls.push(`${init.method} ${u.searchParams.get('partNumber') || ''}${u.searchParams.has('uploads') ? 'init' : ''}`);
    if (u.searchParams.has('uploads')) return { ok: true, text: async () => '<InitiateMultipartUploadResult><UploadId>UP1</UploadId></InitiateMultipartUploadResult>' };
    if (init.method === 'PUT') { parts.set(Number(u.searchParams.get('partNumber')), new Uint8Array(init.body)); return { ok: true, headers: { get: () => `"e${u.searchParams.get('partNumber')}"` } }; }
    return { ok: true, status: 200 };
  };
  const file = () => {
    const keys = [...parts.keys()].sort((a, b) => a - b);
    const total = keys.reduce((n, k) => n + parts.get(k).length, 0);
    const out = new Uint8Array(total); let at = 0;
    for (const k of keys) { out.set(parts.get(k), at); at += parts.get(k).length; }
    return out;
  };
  return { sign, fetchImpl, file, calls };
}
const ctxFor = (params, { cancelled = false } = {}) => ({ params, job: { id: 'job-1', user_id: UID }, progress: () => {}, get cancelled() { return cancelled; }, log: {} });
const depsFor = (store, row = ROW) => ({
  admin: adminFor(row), sign: store.sign, fetchImpl: store.fetchImpl, workBucket: 'seismic-work', engineCommit: 'suite-test+engines-test',
  makeFetcher: () => async (path) => STORE.get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
  readManifest: async () => MANIFEST,
});

test('the kind is registered', () => expect(KINDS).toContain('export_segy'));

test('the file reads back: headers, geometry, coordinates and samples, the dead trace left out', async () => {
  const store = fakeStore();
  const out = await exportSegy(ctxFor({ volume_id: VOL }), depsFor(store));
  expect(out.traces).toBe(NIL * NXL - 1);
  expect(out.key).toBe(`exports/${UID}/job-1/Keta_full_stack.sgy`);
  expect(out.url).toMatch(/response-content-disposition/);
  const bytes = store.file();
  expect(bytes.length).toBe(out.bytes);
  const reader = { size: bytes.length, read: async (off, len) => bytes.slice(off, off + len).buffer };
  const h = await readFileHeaders(reader);
  expect([h.ns, h.dtUs, h.formatCode, h.totalTraces, h.trailingBytes]).toEqual([NS, 4000, 5, NIL * NXL - 1, 0]);
  expect((await readTextualHeader(reader)).join('\n')).toMatch(/Inline byte 189/);
  const g = await scanGeometry(reader);
  expect([g.il.min, g.il.max, g.il.step, g.xl.min, g.xl.max, g.xl.step]).toEqual([1000, 1038, 2, 500, 517, 1]);
  // inline 2 (index 1), crossline 503 (index 3): the trace in file order
  const order = []; for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) if (!dead(il, xl)) order.push([il, xl]);
  for (const [il, xl] of [[1, 3], [3, 5], [19, 17]]) {
    const k = order.findIndex(([a, b]) => a === il && b === xl);
    const at = 3600 + k * (240 + 4 * NS);
    const dv = new DataView(bytes.buffer, at, 240);
    expect(readHeaderInt32(dv, 189)).toBe(1000 + 2 * il);
    expect(readHeaderInt32(dv, 193)).toBe(500 + xl);
    expect(applyCoordScalar(readHeaderInt32(dv, 181), readHeaderInt16(dv, 71))).toBeCloseTo(431000 + 12.5 * xl, 2);
    expect(applyCoordScalar(readHeaderInt32(dv, 185), readHeaderInt16(dv, 71))).toBeCloseTo(6512000 + 25 * il, 2);
    const s = decodeSamples(new DataView(bytes.buffer, at + 240, 4 * NS), 0, NS, 5);
    for (let i = 0; i < NS; i++) expect(s[i]).toBe(value(il, xl, i));
  }
});

test('guards and cancel', async () => {
  expect(validateExportParams({ volume_id: 'x' })).toMatch(/volume_id/);
  expect(validateExportParams({ volume_id: VOL, coord_scalar: -7 })).toMatch(/coord_scalar/);
  expect(exportFileName('a/b c')).toBe('a_b_c.sgy');
  expect(exportCards({ volume: ROW, manifest: MANIFEST, engineCommit: 'e', coordScalar: -100 }).every((l) => l.length <= 76)).toBe(true);
  await expect(exportSegy(ctxFor({ volume_id: VOL }), depsFor(fakeStore(), { ...ROW, user_id: 'x' }))).rejects.toMatchObject({ stage: 'not_found' });
  await expect(exportSegy(ctxFor({ volume_id: VOL }), depsFor(fakeStore(), { ...ROW, status: 'ingesting' }))).rejects.toMatchObject({ stage: 'validate_failed' });
  const store = fakeStore();
  expect(await exportSegy(ctxFor({ volume_id: VOL }, { cancelled: true }), depsFor(store))).toBeNull();
  expect(store.calls).toContain('DELETE ');
});

test('parts: a file cut into many parts is the same file', async () => {
  const one = fakeStore(); const many = fakeStore();
  await exportSegy(ctxFor({ volume_id: VOL }), depsFor(one));
  await exportSegy(ctxFor({ volume_id: VOL }), { ...depsFor(many), partSize: 1000 });
  expect(many.calls.filter((c) => c.startsWith('PUT')).length).toBeGreaterThan(50);
  expect(Buffer.from(many.file()).equals(Buffer.from(one.file()))).toBe(true);
});
