// PP1 gates for the package core: manifest build/validate, the writer's
// hashing and archive round trip, and the dangling-reference detector.

import fs from 'node:fs';
import path from 'node:path';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import JSZip from 'jszip';
import {
  buildManifest, validateManifest, packageVersionCheck, PACKAGE_VERSION, ROOT_KINDS, OPEN_KINDS, newPackageId, UUID_RE,
} from '@/lib/portability/manifest';
import { PackageWriter, sha256Hex, packageFilename } from '@/lib/portability/zipWriter';
import { detectDanglingRefs, walkUuids } from '@/lib/portability/danglingRefs';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../test-data/portability/manifest.schema.json'), 'utf8'));

function goodManifest(extra = {}) {
  return buildManifest({
    name: 'Type well',
    source: { user_id: USER, organization_id: null },
    roots: [{ kind: 'well', id: U1, name: 'KETA-1' }],
    tables: { geo_wells: { rows: 1, schemaVersions: [1], pk: 'id' }, geo_wells_logs: { rows: 3, schemaVersions: [1, 1, 1] } },
    blobs: [{ bucket: 'wells', path: `${USER}/${U1}/logs/${U2}.f32`, file: `blobs/wells/${USER}/${U1}/logs/${U2}.f32`, bytes: 804, table: 'geo_wells_logs', row_id: U2 }],
    open: [{ kind: 'las', file: 'open/wells/KETA-1.las', table: 'geo_wells', row_id: U1 }, { kind: 'readme', file: 'README.txt' }],
    files: {
      'data/geo_wells.jsonl': { bytes: 10, sha256: 'a'.repeat(64) },
      'data/geo_wells_logs.jsonl': { bytes: 10, sha256: 'b'.repeat(64) },
      [`blobs/wells/${USER}/${U1}/logs/${U2}.f32`]: { bytes: 804, sha256: 'c'.repeat(64) },
      'open/wells/KETA-1.las': { bytes: 10, sha256: 'd'.repeat(64) },
      'README.txt': { bytes: 10, sha256: 'e'.repeat(64) },
    },
    ...extra,
  });
}

describe('manifest schema of record', () => {
  test('the validator and the JSON Schema agree on root keys and enums', () => {
    expect(schema.required.sort()).toEqual(['blobs', 'created_at', 'files', 'format', 'open', 'package_id', 'package_version', 'platform', 'scope', 'source', 'tables'].sort());
    expect(schema.properties.scope.properties.roots.items.properties.kind.enum).toEqual(ROOT_KINDS);
    expect(schema.properties.open.items.properties.kind.enum).toEqual(OPEN_KINDS);
    expect(schema.properties.format.const).toBe('pld');
  });
});

describe('buildManifest + validateManifest', () => {
  test('a well-formed manifest validates and carries the build, roots, tables, files', () => {
    const m = goodManifest();
    const res = validateManifest(m);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
    expect(m.package_version).toBe(PACKAGE_VERSION);
    expect(m.platform.version).toBe('dev');
    expect(m.tables.geo_wells).toEqual({ rows: 1, file: 'data/geo_wells.jsonl', schema_version: { min: 1, max: 1 }, pk: 'id' });
    expect(m.signature).toBeNull();
  });

  test('every schema violation is named', () => {
    const m = goodManifest();
    delete m.files['README.txt'];
    m.scope.roots.push({ kind: 'volume', id: 'nope' });
    m.tables.geo_wells.schema_version = { min: 3, max: 1 };
    m.extra = true;
    const { ok, errors } = validateManifest(m);
    expect(ok).toBe(false);
    expect(errors).toEqual(expect.arrayContaining([
      'files: missing entry for README.txt',
      expect.stringMatching(/scope\.roots\[1\]\.kind/),
      expect.stringMatching(/scope\.roots\[1\]\.id: uuid/),
      'tables.geo_wells.schema_version: min > max',
      'manifest: unexpected property "extra"',
    ]));
  });

  test('garbage input never throws', () => {
    expect(validateManifest(null).ok).toBe(false);
    expect(validateManifest('x').ok).toBe(false);
    expect(validateManifest({ tables: 5, blobs: {}, open: 1, files: [] }).ok).toBe(false);
  });

  test('the Petrel rule at package level: newer packages are refused, naming both versions', () => {
    expect(packageVersionCheck({ package_version: 1 }).ok).toBe(true);
    const r = packageVersionCheck({ package_version: 2 }, 1);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/package version 2; this build reads up to version 1/);
    expect(r.message).not.toContain('—');
    expect(packageVersionCheck({}).ok).toBe(false);
  });

  test('newPackageId is a v4 uuid', () => {
    expect(newPackageId()).toMatch(UUID_RE);
  });
});

describe('PackageWriter', () => {
  test('hashes every file, stores f32 uncompressed and round-trips through jszip', async () => {
    const w = new PackageWriter();
    const f32 = new Float32Array([1.5, -2.25, 3e10, NaN]);
    const bytes = new Uint8Array(f32.buffer);
    const e1 = await w.addText('data/geo_wells.jsonl', '{"id":"a"}\n');
    const e2 = await w.addBytes('blobs/wells/x.f32', bytes);
    expect(e1).toEqual({ bytes: 11, sha256: await sha256Hex(new TextEncoder().encode('{"id":"a"}\n')) });
    expect(e2.bytes).toBe(16);
    expect(e2.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(w.totalBytes).toBe(27);
    await expect(w.addText('data/geo_wells.jsonl', 'dup')).rejects.toThrow(/duplicate/);
    await expect(w.addText('../escape', 'x')).rejects.toThrow(/bad path/);

    const manifest = goodManifest({ files: w.files });
    w.addManifest(manifest);
    const archive = await w.toUint8Array();
    const zip = await JSZip.loadAsync(archive);
    expect(Object.keys(zip.files).sort()).toEqual(['blobs/wells/x.f32', 'data/geo_wells.jsonl', 'manifest.json']);
    const raw = await zip.file('blobs/wells/x.f32').async('uint8array');
    const back = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    expect(Array.from(back.subarray(0, 3))).toEqual(Array.from(f32.subarray(0, 3)));
    expect(Number.isNaN(back[3])).toBe(true);
    const parsed = JSON.parse(await zip.file('manifest.json').async('string'));
    expect(parsed.files['blobs/wells/x.f32'].sha256).toBe(e2.sha256);
  });

  test('sha256Hex matches a known vector', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('packageFilename slugs and dates', () => {
    expect(packageFilename('KETA Field / Q3', new Date('2026-09-02T10:00:00Z'))).toBe('keta-field-q3-20260902.pld');
    expect(packageFilename('', new Date('2026-09-02T10:00:00Z'))).toBe('petrolord-package-20260902.pld');
  });
});

describe('detectDanglingRefs', () => {
  test('finds ids hidden anywhere in jsonb and classifies them', () => {
    const tables = {
      geo_wells: [{ id: U1, user_id: USER, organization_id: null }],
      geo_wells_logs: [{ id: U2, well_id: U1, provenance: { computed: true, input_log_ids: [U3] } }],
      petro_projects: [{ id: U3, user_id: USER, well_ids: [U1], layouts: { templates: [{ tracks: [{ curve: `output:${U2}` }] }] } }],
    };
    const r = detectDanglingRefs(tables);
    expect(r.dangling).toEqual([]);
    expect(r.internal).toBeGreaterThanOrEqual(4);
    expect(r.scope).toBe(2);

    const bad = detectDanglingRefs({ ...tables, geo_wells_logs: [{ id: U2, well_id: U1, provenance: { input_log_ids: ['99999999-9999-4999-8999-999999999999'] } }] });
    expect(bad.dangling).toEqual([{ table: 'geo_wells_logs', rowId: U2, path: 'provenance.input_log_ids[0]', id: '99999999-9999-4999-8999-999999999999' }]);

    const allowed = detectDanglingRefs(bad.dangling.length ? { geo_wells_logs: [{ id: U2, ref: '99999999-9999-4999-8999-999999999999' }] } : {}, { allow: ['99999999-9999-4999-8999-999999999999'] });
    expect(allowed.dangling).toEqual([]);
    expect(allowed.allowed).toBe(1);
  });

  test('walkUuids reports paths', () => {
    const seen = [];
    walkUuids({ a: [{ b: U1 }], c: `x ${U2} y` }, (id, p) => seen.push([id, p]));
    expect(seen).toEqual([[U1, 'a[0].b'], [U2, 'c']]);
  });
});
