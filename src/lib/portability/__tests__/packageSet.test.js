// PP4 gate, multi-part packages: a package whose blobs exceed the part size
// splits into numbered parts with one manifest; the importer accepts all
// parts together, refuses a missing or altered part, and refuses extra
// files for a single-part package.

import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import JSZip from 'jszip';
import { buildPackageInto } from '@/lib/portability/exportPackage';
import { PackageSet, partFilename } from '@/lib/portability/packageSet';
import { readPackage, importPackage } from '@/lib/portability/importPackage';
import { validateManifest } from '@/lib/portability/manifest';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const SRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const WELL = uid(1);

/** A well with N curves of `bytes` bytes each, so blobs dominate the package. */
function makeWorld(nCurves = 6, samples = 256) {
  const logs = Array.from({ length: nCurves }, (_, i) => ({ id: uid(100 + i), well_id: WELL, mnemonic: i === 0 ? 'DEPT' : `C${i}`, unit: i === 0 ? 'M' : '', start_md_m: 0, stop_md_m: samples - 1, step_m: 1, n_samples: samples, null_count: 0, provenance: {}, storage_path: `${SRC}/${WELL}/logs/${uid(100 + i)}.f32` }));
  const rows = { geo_wells: [{ id: WELL, user_id: SRC, organization_id: null, name: 'BIG-1', uwi: 'BIG-1', crs: 'EPSG:32631', deviation: [] }], geo_wells_logs: logs, geo_wells_tops: [], geo_wells_zones: [] };
  const blobs = new Map(logs.map((l, i) => [`wells/${l.storage_path}`, new Uint8Array(Float32Array.from({ length: samples }, (_, k) => k + i * 1000).buffer)]));
  return {
    rows, blobs,
    async currentUser() { return { id: SRC, organization_id: null, organization_name: null }; },
    async getRow(table, id) { return (rows[table] || []).find((r) => r.id === id) || null; },
    async listChildren(table, column, parentId) { return (rows[table] || []).filter((r) => r[column] === parentId); },
    async downloadBlob(bucket, path) { const b = blobs.get(`${bucket}/${path}`); if (!b) throw new Error(`no blob ${path}`); return b; },
    async listBlobs() { return []; },
    async listStateRowsForWells() { return []; },
    async listSessionsForVolumes() { return []; },
    async getCustomCrs() { return null; },
  };
}

function makeSink() {
  const store = { rows: {}, blobs: new Map(), jobs: new Map(), items: [] };
  return {
    store,
    async currentUser() { return { id: DST, organization_id: null }; },
    async listMyWells() { return []; },
    async createJob() { return null; },
    async updateJob() {},
    async listItems() { return []; },
    async recordItems() {},
    async mergeCustomCrs() {},
    async uploadBlob(bucket, p, bytes) { store.blobs.set(`${bucket}/${p}`, new Uint8Array(bytes)); },
    async removeBlob() {},
    async insertRows(table, rows) { store.rows[table] = [...(store.rows[table] || []), ...rows]; },
  };
}

async function buildParts(partBytes) {
  const set = new PackageSet({ partBytes });
  const built = await buildPackageInto(set, makeWorld(), [{ kind: 'well', id: WELL }], { name: 'Big well' });
  const archives = await set.finish(built.manifest);
  return { set, built, archives };
}

describe('PackageSet', () => {
  test('a small package stays a single archive with no parts list', async () => {
    const { archives, built } = await buildParts(1e9);
    expect(archives).toHaveLength(1);
    expect(built.manifest.parts).toBeUndefined();
    expect(built.manifest.blobs.every((b) => !('part' in b))).toBe(true);
    expect(partFilename('Big well', 1, 1, new Date('2026-09-02T00:00:00Z'))).toBe('big-well-20260902.pld');
  });

  test('blobs over the part size spill into numbered parts; the manifest lists them with hashes', async () => {
    // each curve is 1024 bytes; rows + sidecars land in part 1; a 2.5 KB part size forces spills
    const { archives, built, set } = await buildParts(2500);
    expect(archives.length).toBeGreaterThanOrEqual(3);
    expect(validateManifest(built.manifest)).toEqual({ ok: true, errors: [] });
    expect(built.manifest.parts).toHaveLength(archives.length);
    expect(built.manifest.parts[0]).toEqual({ index: 1, file: null, bytes: null, sha256: null });
    for (const p of built.manifest.parts.slice(1)) expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
    const inLater = built.manifest.blobs.filter((b) => b.part > 1);
    expect(inLater.length).toBeGreaterThan(0);
    expect(set.partOf(inLater[0].file)).toBe(inLater[0].part);
    // part 1 has the manifest and the rows; a later part has only blobs
    const z1 = await JSZip.loadAsync(archives[0]);
    expect(z1.file('manifest.json')).not.toBeNull();
    expect(z1.file('data/geo_wells.jsonl')).not.toBeNull();
    const z2 = await JSZip.loadAsync(archives[1]);
    expect(z2.file('manifest.json')).toBeNull();
    expect(Object.keys(z2.files).filter((n) => !z2.files[n].dir).every((n) => n.startsWith('blobs/'))).toBe(true);
    expect(partFilename('Big well', 2, archives.length, new Date('2026-09-02T00:00:00Z'))).toBe(`big-well-20260902.part2of${archives.length}.pld`);
  });

  test('the importer opens all parts together and restores every blob byte for byte', async () => {
    const world = makeWorld();
    const set = new PackageSet({ partBytes: 2500 });
    const built = await buildPackageInto(set, world, [{ kind: 'well', id: WELL }], { name: 'Big well' });
    const archives = await set.finish(built.manifest);
    // parts may arrive in any order
    const pkg = await readPackage([...archives].reverse());
    expect(pkg.integrity.checked).toBe(Object.keys(built.manifest.files).length);
    const sink = makeSink();
    const r = await importPackage([...archives].reverse(), sink);
    expect(r.summary.blobsWritten).toBe(6);
    for (const log of sink.store.rows.geo_wells_logs) {
      const back = sink.store.blobs.get(`wells/${log.storage_path}`);
      const original = world.blobs.get(`wells/${world.rows.geo_wells_logs.find((l) => l.mnemonic === log.mnemonic).storage_path}`);
      expect(Buffer.from(back).equals(Buffer.from(original))).toBe(true);
    }
  });

  test('a missing part, an altered part, and an extra file are refused', async () => {
    const { archives } = await buildParts(2500);
    await expect(readPackage([archives[0]])).rejects.toMatchObject({ code: 'missing-part' });
    await expect(readPackage([archives[0]])).rejects.toThrow(/Choose all \d+ part files together/);
    const altered = [...archives];
    // flip a byte inside a stored (uncompressed) f32 payload, leaving the zip structure valid
    altered[1] = new Uint8Array(archives[1]); altered[1][Math.floor(archives[1].byteLength / 2)] ^= 0x01;
    await expect(readPackage(altered)).rejects.toMatchObject({ code: 'tampered', part: 2 });
    const { archives: single } = await buildParts(1e9);
    await expect(readPackage([single[0], archives[1]])).rejects.toMatchObject({ code: 'unexpected-part' });
    await expect(readPackage([])).rejects.toMatchObject({ code: 'no-file' });
  });
});
