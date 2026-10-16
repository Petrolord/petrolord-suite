/**
 * @jest-environment node
 */
// Local Workspace L1: import from disk with no upload. The real v4
// conversion writes into a workspace pack store (here in memory); the bricks
// equal, key for key and byte for byte, what the same conversion writes into
// the upload spool; nothing but the manifest reaches the cloud; the row,
// registry and replica say where the volume lives; the identity is the full
// source SHA-256 plus recipe, equal for a second import of the same file and
// different for a different mapping; the store verifies against its root and
// fails on a flipped byte; a failed conversion abandons the row and files.
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';
import { runLocalImport, localImportBytes, localVsUploadEstimate, durationWords, sizeWords } from '../services/localImport';
import { convertToSpool } from '../services/conversionV4';
import { memorySpool } from '../services/brickSpool';
import { DEFLATE_RAW, v4BrickFetcher } from '../engine/brickCodecV4';
import { bufferReader } from '../engine/reader';
import { makeSegy, scanOf } from '../../../../../packages/engines/__tests__/seismolordSegyFixture';
import { memoryDirectory } from '@/lib/localWorkspace/memoryDir';
import { memoryRegistry } from '@/lib/localWorkspace/registry';
import { createWorkspace, openLocalVolume } from '@/lib/localWorkspace/workspace';
import { withLocalBricks, createLocalBrickSource } from '@/lib/localWorkspace/localBricks';
import { sha256File } from '@/lib/localWorkspace/sha256';

if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;
jest.setTimeout(60000);

const ZLIB = {
  compression: DEFLATE_RAW,
  deflate: async (b) => new Uint8Array(zlib.deflateRawSync(b)),
  inflate: async (b) => new Uint8Array(zlib.inflateRawSync(b)),
};
const UID = '11111111-1111-4111-8111-111111111111';
const B = 8;
const dims = { nIl: 12, nXl: 10, ns: 20 };
const fix = makeSegy(dims);
const scan = scanOf(dims);
const file = new Blob([fix.buffer]);
file.name = 'stack.sgy';
let n = 0;
const nextId = () => { n += 1; return `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`; };

async function setup({ failConvert = false } = {}) {
  const registry = memoryRegistry();
  await createWorkspace({ userId: UID, label: "Ayo's PC", backend: 'memory', handle: memoryDirectory('D'), registry, deviceId: 'dev-1' });
  const cloud = { uploads: [], rows: new Map(), replicas: [], abandoned: [] };
  const deps = {
    device: async () => ({ deviceId: 'dev-1', label: "Ayo's PC", userId: UID, projectId: 'proj-1', backend: 'memory' }),
    prepare: async ({ name, location, mapping }) => {
      const volumeId = nextId();
      cloud.rows.set(volumeId, { id: volumeId, status: 'converting', ...location });
      return {
        volumeId, userId: UID, name: name || 'stack.sgy',
        ingestRec: { fingerprint: { algo: 'sampled' }, pipeline: 'v4', mapping },
        crsPlan: { needsTransform: false, storeTag: 'UNKNOWN' }, customDefs: {},
      };
    },
    convert: ({ spool, onProgress }) => {
      if (failConvert) return Promise.reject(new Error('Trace 3 is out of order.'));
      return convertToSpool({ reader: bufferReader(fix.buffer), scan, spool, codec: ZLIB, brickSize: B, levels: 2, onProgress });
    },
    hashFile: (f, o) => sha256File(f, o),
    openStore: (volumeId, o) => openLocalVolume(volumeId, { ...o, registry }),
    registry,
    uploadManifest: async (path, manifest) => { cloud.uploads.push([path, JSON.stringify(manifest).length]); },
    updateRow: async (id, patch) => { cloud.rows.set(id, { ...cloud.rows.get(id), ...patch }); return cloud.rows.get(id); },
    recordReplica: async (r) => { cloud.replicas.push(r); },
    abandon: async (id) => { cloud.abandoned.push(id); cloud.rows.delete(id); },
  };
  return { registry, cloud, deps };
}

describe('local import, zero upload', () => {
  let s; let res;
  beforeAll(async () => {
    s = await setup();
    res = await runLocalImport(s.deps, { file, mapping: { ilByte: 189, xlByte: 193 }, scan });
  });

  test('the only cloud upload is the manifest (metadata, a few KB)', () => {
    expect(s.cloud.uploads).toHaveLength(1);
    expect(s.cloud.uploads[0][0]).toBe(`${UID}/${res.volumeId}/manifest.json`);
    expect(s.cloud.uploads[0][1]).toBeLessThan(64 * 1024);
  });

  test('the row says local, this device, ready, with the identity hashes', () => {
    const row = s.cloud.rows.get(res.volumeId);
    expect(row).toMatchObject({ storage_location: 'local', device_id: 'dev-1', status: 'ready', brick_root: res.brickRoot, content_id: res.contentId });
    expect(row.survey_meta.local_bytes).toBe(res.bytes);
    expect(s.cloud.replicas[0]).toMatchObject({ volumeId: res.volumeId, deviceId: 'dev-1', deviceLabel: "Ayo's PC", state: 'ready', verified: true });
  });

  test('the bricks equal the upload spool conversion, key for key and byte for byte', async () => {
    const spool = memorySpool();
    await convertToSpool({ reader: bufferReader(fix.buffer), scan, spool, codec: ZLIB, brickSize: B, levels: 2 });
    const store = await openLocalVolume(res.volumeId, { registry: s.registry });
    const keys = (await spool.keys()).sort();
    expect((await store.keys()).sort()).toEqual(keys);
    for (const k of keys) expect([k, Buffer.from(await store.get(k)).equals(Buffer.from(await spool.get(k)))]).toEqual([k, true]);
  });

  test('the full source SHA-256 is on the manifest and both copies are complete', async () => {
    const store = await openLocalVolume(res.volumeId, { registry: s.registry });
    const m = await store.getJson('manifest');
    expect(m.source.sha256).toBe(createHash('sha256').update(Buffer.from(fix.buffer)).digest('hex'));
    expect(m.display.complete).toBe(true);
    expect(m.f32.complete).toBe(true);
    expect(m.local).toMatchObject({ content_id: res.contentId, brick_root: res.brickRoot });
  });

  test('the viewer path reads float32 bricks from this computer with no cloud call', async () => {
    const store = await openLocalVolume(res.volumeId, { registry: s.registry });
    const m = await store.getJson('manifest');
    const cloudFetch = jest.fn();
    const f = v4BrickFetcher(withLocalBricks(cloudFetch, createLocalBrickSource({ registry: s.registry })), m, { inflate: ZLIB.inflate });
    const brick = new Float32Array(await f(`${UID}/${res.volumeId}/bricks/0-0-0.f32`));
    // trace (il 0, xl 0), sample 3 of the fixture
    expect(brick[3]).toBe(new DataView(fix.buffer).getFloat32(3600 + 240 + 12, false));
    expect(cloudFetch).not.toHaveBeenCalled();
  });

  test('verify passes against the root; a flipped byte fails it (negative control)', async () => {
    const store = await openLocalVolume(res.volumeId, { registry: s.registry });
    expect((await store.verify({ root: res.brickRoot })).ok).toBe(true);
    const rec = await s.registry.getWorkspace(UID);
    const packs = await (await (await (await (await rec.handle.getDirectoryHandle('projects')).getDirectoryHandle('proj-1')).getDirectoryHandle('volumes')).getDirectoryHandle(res.volumeId)).getDirectoryHandle('packs');
    packs.rawFile('000001.pack').bytes[10] ^= 1;
    const again = await openLocalVolume(res.volumeId, { registry: s.registry });
    const v = await again.verify({ root: res.brickRoot });
    expect(v.ok).toBe(false);
    expect(v.bad.length).toBe(1);
  });

  test('a second import of the same file has the same content id and brick root; a new mapping does not', async () => {
    const t = await setup();
    const again = await runLocalImport(t.deps, { file, mapping: { ilByte: 189, xlByte: 193 }, scan });
    expect(again.contentId).toBe(res.contentId);
    expect(again.brickRoot).toBe(res.brickRoot);
    const other = await runLocalImport(t.deps, { file, mapping: { ilByte: 9, xlByte: 193 }, scan });
    expect(other.contentId).not.toBe(res.contentId);
  });
});

test('a failed conversion abandons the row and the local files', async () => {
  const s = await setup({ failConvert: true });
  await expect(runLocalImport(s.deps, { file, mapping: {}, scan })).rejects.toThrow(/out of order/);
  expect(s.cloud.abandoned).toHaveLength(1);
  expect(s.cloud.uploads).toHaveLength(0);
});

test('disk and time estimates', () => {
  expect(localImportBytes(80e9)).toBe(104e9);
  const e = localVsUploadEstimate({ bytes: 80e9, readMBps: 68, uploadMBps: 1 });
  expect(durationWords(e.keepSeconds)).toBe('about 20 min');
  expect(durationWords(e.uploadSeconds)).toBe('about 22 h');
  expect(durationWords(400e9 / 1e6)).toBe('about 4.6 days');
});

test('size words: a small file reads in MB, never "0 GB"', () => {
  // the 80.5 MB Ekene stack used to read "needs about 0 GB"
  expect(sizeWords(localImportBytes(80.5e6))).toBe('105 MB');
  expect(sizeWords(2.4e9)).toBe('2.4 GB');
  expect(sizeWords(104e9)).toBe('104 GB');
  expect(sizeWords(3e5)).toBe('1 MB');
});
