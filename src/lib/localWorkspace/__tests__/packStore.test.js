/**
 * @jest-environment node
 */
// Local workspace core: the incremental SHA-256 against node:crypto, the
// content identity, the pack store (write, read back, reopen after a
// restart, an unfinished pack dropped, the spool interface the conversion and
// upload use), brick roots and verification with a corrupted brick as the
// negative control, and the routed brick fetcher (local volume read from the
// store, cloud volume untouched).
import { createHash, randomBytes } from 'node:crypto';
import { createSha256, sha256Hex, canonicalJson, sha256File } from '../sha256';
import { contentIdOf, brickRootOf, brickRootText } from '../identity';
import { openPackStore, localWriteError } from '../packStore';
import { memoryDirectory } from '../memoryDir';
import { memoryRegistry } from '../registry';
import { createWorkspace, openLocalVolume, removeLocalVolume, checkLocalSpace, NeedsPermissionError, workspaceRoot } from '../workspace';
import { createLocalBrickSource, withLocalBricks, splitBrickPath } from '../localBricks';

const nodeSha = (b) => createHash('sha256').update(b).digest('hex');

describe('sha256', () => {
  test.each([0, 1, 55, 56, 63, 64, 65, 119, 128, 1000, 100003])('matches node:crypto for %i bytes', (n) => {
    const b = randomBytes(n);
    expect(createSha256().update(b).hex()).toBe(nodeSha(b));
  });
  test('incremental updates in odd pieces equal one update', () => {
    const b = randomBytes(300001);
    const h = createSha256();
    let off = 0;
    for (const step of [1, 7, 63, 64, 65, 1000, 4096, 99999]) { h.update(b.subarray(off, off + step)); off += step; }
    h.update(b.subarray(off));
    expect(h.hex()).toBe(nodeSha(b));
  });
  test('the empty string', () => {
    expect(createSha256().hex()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  test('sha256Hex (subtle) and sha256File agree', async () => {
    const b = randomBytes(5 * 1024 * 1024 + 17);
    expect(await sha256Hex(b)).toBe(nodeSha(b));
    const blob = new Blob([b]);
    expect(await sha256File(blob, { chunkBytes: 1024 * 1024 + 3 })).toBe(nodeSha(b));
  });
  test('canonicalJson sorts keys at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  });
});

describe('identity', () => {
  test('content_id is stable under key order and changes with any input', async () => {
    const base = { source: { sha256: 'aa', size: 10 }, mapping: { ilByte: 189, xlByte: 193 }, codec: { f32: 'deflate-raw' } };
    const a = await contentIdOf(base);
    const b = await contentIdOf({ codec: { f32: 'deflate-raw' }, mapping: { xlByte: 193, ilByte: 189 }, source: { size: 10, sha256: 'aa' } });
    expect(a).toBe(b);
    expect(a).toMatch(/^lv1-[0-9a-f]{64}$/);
    expect(await contentIdOf({ ...base, mapping: { ilByte: 9, xlByte: 193 } })).not.toBe(a);
    expect(await contentIdOf({ ...base, parent: a, job: { kind: 'attribute_volume', params: { name: 'envelope' } }, engine: 'x' })).not.toBe(a);
  });
  test('brick root sorts by key and depends on every hash', async () => {
    const r1 = await brickRootOf([['b', '2'], ['a', '1']]);
    expect(r1).toBe(await brickRootOf([['a', '1'], ['b', '2']]));
    expect(brickRootText([['b', '2'], ['a', '1']])).toBe('a 1\nb 2\n');
    expect(await brickRootOf([['a', '1'], ['b', '3']])).not.toBe(r1);
  });
});

const bytesOf = (n, seed) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + seed * 7) & 255; return b; };

describe('pack store', () => {
  test('bricks round-trip, roll over into several packs and survive a reopen', async () => {
    const dir = memoryDirectory('vol');
    const s = await openPackStore(dir, { write: true, packBytes: 1000 });
    const keys = [];
    for (let i = 0; i < 25; i++) { const k = `v4/f/${i}-0-0.f32z`; keys.push(k); await s.put(k, bytesOf(300 + i, i)); }
    expect(await s.get('v4/f/3-0-0.f32z')).toEqual(bytesOf(303, 3));
    await s.putJson('conversion', { ok: 1 });
    const packs = await dir.getDirectoryHandle('packs');
    const names = []; for await (const n of packs.keys()) names.push(n);
    expect(names.filter((n) => n.endsWith('.pack')).length).toBeGreaterThan(5);
    expect(names.filter((n) => n.endsWith('.idx.json')).length).toBe(names.filter((n) => n.endsWith('.pack')).length);
    const root = await s.brickRoot();

    const r = await openPackStore(dir);
    expect((await r.keys()).sort()).toEqual([...keys].sort());
    for (let i = 0; i < 25; i++) expect(await r.get(`v4/f/${i}-0-0.f32z`)).toEqual(bytesOf(300 + i, i));
    expect(await r.getJson('conversion')).toEqual({ ok: 1 });
    expect(await r.bytes()).toBe(keys.reduce((a, _, i) => a + 300 + i, 0));
    expect(await r.brickRoot()).toBe(root);
    expect(r.entries().every(([, sha]) => /^[0-9a-f]{64}$/.test(sha))).toBe(true);
  });

  test('a pack that never closed is dropped by the next writer; readers do not touch it', async () => {
    const dir = memoryDirectory('vol');
    const s = await openPackStore(dir, { write: true, packBytes: 1 << 20 });
    await s.put('a', bytesOf(10, 1));
    await s.flush();
    await s.put('b', bytesOf(10, 2)); // left open: the tab "closes" here
    const reader = await openPackStore(dir);
    expect(await reader.has('a')).toBe(true);
    expect(await reader.has('b')).toBe(false);
    const packs = await dir.getDirectoryHandle('packs');
    const before = []; for await (const n of packs.keys()) before.push(n);
    expect(before).toContain('000002.pack');
    const w2 = await openPackStore(dir, { write: true });
    const after = []; for await (const n of packs.keys()) after.push(n);
    expect(after).not.toContain('000002.pack');
    await w2.put('c', bytesOf(5, 3));
    await w2.flush();
    expect((await (await openPackStore(dir)).keys()).sort()).toEqual(['a', 'c']);
  });

  test('a reader of the open pack flushes it (createWritable) or reads it in place (sync handle)', async () => {
    const dir = memoryDirectory('vol');
    const s = await openPackStore(dir, { write: true });
    await s.put('k', bytesOf(64, 9));
    expect(await s.get('k')).toEqual(bytesOf(64, 9));
    expect(await s.has('k')).toBe(true);
  });

  test('verify passes, then fails on one altered byte (negative control)', async () => {
    const dir = memoryDirectory('vol');
    const s = await openPackStore(dir, { write: true, packBytes: 500 });
    for (let i = 0; i < 6; i++) await s.put(`bricks/${i}-0-0.f32`, bytesOf(200, i));
    const root = await s.brickRoot();
    const ok = await s.verify({ root });
    expect(ok).toMatchObject({ ok: true, checked: 6, bad: [], rootMatches: true });
    const packs = await dir.getDirectoryHandle('packs');
    const raw = packs.rawFile('000002.pack');
    raw.bytes[5] ^= 0xff;
    const r = await openPackStore(dir);
    const bad = await r.verify({ root });
    expect(bad.ok).toBe(false);
    expect(bad.rootMatches).toBe(false);
    expect(bad.bad).toHaveLength(1);
  });

  test('a full disk fails the put with a plain message and later puts do not pretend to work', async () => {
    const dir = memoryDirectory('vol', { failWritesAfter: 700 });
    const s = await openPackStore(dir, { write: true, packBytes: 1 << 20 });
    await s.put('a', bytesOf(400, 1));
    await expect(s.put('b', bytesOf(400, 2))).rejects.toThrow(/not enough free space/);
    await expect(s.put('c', bytesOf(10, 3))).rejects.toThrow(/not enough free space/);
    expect(localWriteError({ name: 'NotAllowedError' }).message).toMatch(/permission/);
  });

  test('a short sync-handle write (Firefox at its quota) fails instead of truncating the pack', async () => {
    const dir = memoryDirectory('vol');
    const packs = await dir.getDirectoryHandle('packs', { create: true });
    const real = packs.getFileHandle.bind(packs);
    packs.getFileHandle = async (n, o) => {
      const h = await real(n, o);
      if (n.endsWith('.pack')) h.createSyncAccessHandle = async () => ({ truncate() {}, write: (b) => b.byteLength - 1, flush() {}, close() {}, read() { return 0; } });
      return h;
    };
    const g = globalThis.window; delete globalThis.window;
    const s = await openPackStore(dir, { write: true });
    await expect(s.put('a', bytesOf(100, 1))).rejects.toThrow(/not enough free space/);
    if (g) globalThis.window = g;
  });

  test('read-only stores refuse writes', async () => {
    const dir = memoryDirectory('vol');
    await (await openPackStore(dir, { write: true })).flush();
    const r = await openPackStore(dir);
    await expect(r.put('x', new Uint8Array(1))).rejects.toThrow(/read-only/);
  });
});

describe('workspace and routed bricks', () => {
  const UID = '11111111-1111-4111-8111-111111111111';
  const VOL = '22222222-2222-4222-8222-222222222222';
  const CLOUD = '33333333-3333-4333-8333-333333333333';

  async function setup() {
    const registry = memoryRegistry();
    const folder = memoryDirectory('D');
    await createWorkspace({ userId: UID, label: "Ayo's PC", backend: 'memory', handle: folder, registry });
    const store = await openLocalVolume(VOL, { write: true, create: true, registry, userId: UID, projectId: 'p1' });
    await store.put('v4/f/0-0-0.f32z', bytesOf(100, 1));
    await store.putJson('manifest', { manifest_version: 4, name: 'Local' });
    await registry.patchVolume(VOL, { state: 'ready' });
    return { registry, folder, store };
  }

  test('the workspace layout is projects/<project>/volumes/<volume> beside a marker file', async () => {
    const { folder } = await setup();
    const marker = JSON.parse(await (await (await folder.getFileHandle('petrolord-workspace.json')).getFile()).text());
    expect(marker).toMatchObject({ format: 1, label: "Ayo's PC" });
    const v = await (await (await (await folder.getDirectoryHandle('projects')).getDirectoryHandle('p1')).getDirectoryHandle('volumes')).getDirectoryHandle(VOL);
    expect(v).toBeTruthy();
  });

  test('a local volume reads from the store and never calls the cloud fetcher; a cloud volume does', async () => {
    const { registry } = await setup();
    const cloud = jest.fn(async () => new Uint8Array([7, 7]).buffer);
    const f = withLocalBricks(cloud, createLocalBrickSource({ registry }));
    expect(new Uint8Array(await f(`${UID}/${VOL}/v4/f/0-0-0.f32z`))).toEqual(bytesOf(100, 1));
    expect(JSON.parse(new TextDecoder().decode(await f(`${UID}/${VOL}/manifest.json`)))).toMatchObject({ name: 'Local' });
    expect(cloud).not.toHaveBeenCalled();
    expect(new Uint8Array(await f(`${UID}/${CLOUD}/v4/f/0-0-0.f32z`))).toEqual(new Uint8Array([7, 7]));
    expect(cloud).toHaveBeenCalledTimes(1);
    expect(splitBrickPath('x/y')).toBeNull();
  });

  test('a missing brick of a local volume fails loudly instead of falling back to the cloud', async () => {
    const { registry } = await setup();
    const cloud = jest.fn();
    const f = withLocalBricks(cloud, createLocalBrickSource({ registry }));
    await expect(f(`${UID}/${VOL}/v4/f/9-9-9.f32z`)).rejects.toThrow(/missing/);
    expect(cloud).not.toHaveBeenCalled();
  });

  test('a volume marked missing (site data cleared) is not read locally', async () => {
    const { registry } = await setup();
    await registry.patchVolume(VOL, { state: 'missing' });
    const cloud = jest.fn(async () => new ArrayBuffer(1));
    await withLocalBricks(cloud, createLocalBrickSource({ registry }))(`${UID}/${VOL}/v4/f/0-0-0.f32z`);
    expect(cloud).toHaveBeenCalled();
  });

  test('remove deletes the files and the record', async () => {
    const { registry, folder } = await setup();
    expect(await removeLocalVolume(VOL, { registry })).toBe(true);
    expect(await registry.getVolume(VOL)).toBeNull();
    const vols = await (await (await folder.getDirectoryHandle('projects')).getDirectoryHandle('p1')).getDirectoryHandle('volumes');
    await expect(vols.getDirectoryHandle(VOL)).rejects.toThrow();
  });

  test('a folder that needs a click again raises NeedsPermissionError', async () => {
    const handle = { queryPermission: async () => 'prompt' };
    await expect(workspaceRoot({ backend: 'folder', handle, label: 'PC' })).rejects.toBeInstanceOf(NeedsPermissionError);
  });

  test('space checks: OPFS refuses what does not fit; a folder asks the user to check the drive', async () => {
    const no = await checkLocalSpace(5e9, { backend: 'opfs' }, { freeBytes: async () => 1e9 });
    expect(no.ok).toBe(false);
    expect(no.message).toMatch(/5\.0 GB.*1\.0 GB/);
    const yes = await checkLocalSpace(5e9, { backend: 'folder' }, { freeBytes: async () => 1e9 });
    expect(yes.ok).toBe(true);
    expect(yes.message).toMatch(/drive that holds your workspace folder/);
  });
});
