// PP5 gate, signatures: a package signed with the platform key verifies;
// one altered after signing is flagged; an unsigned package is reported as
// unsigned; an unknown key is reported, not trusted. Canonical bytes are
// stable under key order and ignore the signature field itself.

import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { webcrypto } from 'node:crypto';
import {
  canonicalManifestBytes, manifestDigestHex, signManifestWithKey, verifyManifestSignature, verifyWithKey, signatureMessage, SIGNATURE_ALG,
} from '@/lib/portability/signing';
import { buildManifest } from '@/lib/portability/manifest';
import { PUBLIC_KEYS } from '@/lib/portability/signing';
import { PackageWriter } from '@/lib/portability/zipWriter';
import { readPackage } from '@/lib/portability/importPackage';
import JSZip from 'jszip';
import { canonicalJson, makeExportCertificateNo, buildExportCertificateFields } from '../../../../supabase/functions/pld-sign/helpers.js';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PKG = '12345678-1234-4123-8123-123456789abc';

async function keyPair() {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { priv: await webcrypto.subtle.exportKey('jwk', kp.privateKey), pub: await webcrypto.subtle.exportKey('jwk', kp.publicKey) };
}

function manifest() {
  return buildManifest({
    name: 'Handover', packageId: PKG, createdAt: '2026-09-02T12:00:00.000Z',
    source: { user_id: USER, organization_id: null },
    roots: [{ kind: 'well', id: '11111111-1111-4111-8111-111111111111', name: 'KETA-1' }],
    tables: { geo_wells: { rows: 1, schemaVersions: [1], pk: 'id' } },
    files: { 'data/geo_wells.jsonl': { bytes: 10, sha256: 'a'.repeat(64) } },
  });
}

describe('canonical form', () => {
  test('is stable under key order and ignores the signature field', async () => {
    const m = manifest();
    const shuffled = Object.fromEntries(Object.entries(m).reverse());
    shuffled.signature = { alg: 'x', key_id: 'y', value: 'z' };
    expect(Buffer.from(await canonicalManifestBytes(m)).toString()).toBe(Buffer.from(await canonicalManifestBytes(shuffled)).toString());
    expect(await manifestDigestHex(m)).toBe(await manifestDigestHex(shuffled));
    // the edge function canonicalises identically (pure helper shared by both sides)
    expect(canonicalJson(shuffled)).toBe(Buffer.from(await canonicalManifestBytes(m)).toString());
  });
});

describe('sign and verify', () => {
  let keys;
  beforeAll(async () => { keys = await keyPair(); });

  test('a signed manifest verifies with the matching public key and reads as valid', async () => {
    const m = manifest();
    m.signature = await signManifestWithKey(m, keys.priv, 'pld-test');
    expect(m.signature.alg).toBe(SIGNATURE_ALG);
    expect(await verifyWithKey(m, keys.pub)).toBe(true);
    const r = await verifyManifestSignature(m, { 'pld-test': keys.pub });
    expect(r).toEqual({ status: 'valid', key_id: 'pld-test' });
    expect(signatureMessage(r)).toMatch(/Signed by Petrolord \(key pld-test\)/);
  });

  test('a manifest changed after signing is flagged as invalid', async () => {
    const m = manifest();
    m.signature = await signManifestWithKey(m, keys.priv, 'pld-test');
    m.tables.geo_wells.rows = 2;
    const r = await verifyManifestSignature(m, { 'pld-test': keys.pub });
    expect(r.status).toBe('invalid');
    expect(signatureMessage(r)).toMatch(/changed after it was signed/);
    expect(signatureMessage(r)).not.toContain('—');
  });

  test('unsigned, unknown key and unsupported algorithm are reported, never trusted', async () => {
    const m = manifest();
    expect(await verifyManifestSignature(m, {})).toEqual({ status: 'unsigned', key_id: null });
    m.signature = await signManifestWithKey(m, keys.priv, 'pld-other');
    expect(await verifyManifestSignature(m, { 'pld-test': keys.pub })).toEqual({ status: 'unknown-key', key_id: 'pld-other' });
    m.signature.alg = 'HMAC';
    expect((await verifyManifestSignature(m, { 'pld-other': keys.pub })).status).toBe('unsupported');
    m.signature = { alg: SIGNATURE_ALG, key_id: 'pld-test', value: 'not base64 at all' };
    expect((await verifyManifestSignature(m, { 'pld-test': keys.pub })).status).toBe('invalid');
  });
});

describe('certificate helpers (pure, shared with the edge function)', () => {
  test('the number is deterministic from the package id and export year', () => {
    expect(makeExportCertificateNo(PKG, '2026-09-02T12:00:00Z')).toBe('PLD-EX-2026-12345678');
    expect(makeExportCertificateNo(PKG, '2026-09-02T12:00:00Z')).toBe(makeExportCertificateNo(PKG, '2026-12-31T00:00:00Z'));
  });
  test('the fields never include the verification code and summarise the manifest', () => {
    const m = manifest();
    const f = buildExportCertificateFields({
      certificate_no: 'PLD-EX-2026-12345678', package_id: PKG, package_name: 'Handover', exported_at: m.created_at,
      exporter_email: 'x@y.z', organization_name: null, manifest_digest: 'ab'.repeat(32), signature_key_id: 'pld-test',
      platform_sha: 'abc123', tables: { geo_wells: 1 }, blobs: 0, parts: 1, verification_code: 'secret',
    });
    expect(f.verification_code).toBeUndefined();
    expect(f.certificate_no).toBe('PLD-EX-2026-12345678');
    expect(f.rows_total).toBe(1);
    expect(f.tables).toEqual({ geo_wells: 1 });
  });
});

describe('import: signature enforcement', () => {
  let keys;
  beforeAll(async () => { keys = await keyPair(); PUBLIC_KEYS['pld-test'] = keys.pub; });
  afterAll(() => { delete PUBLIC_KEYS['pld-test']; });

  async function signedArchive(mutateAfterSign) {
    const w = new PackageWriter();
    await w.addText('data/geo_wells.jsonl', '{"id":"11111111-1111-4111-8111-111111111111","name":"KETA-1"}\n');
    const m = buildManifest({
      name: 'Signed', packageId: PKG, createdAt: '2026-09-02T12:00:00.000Z', source: { user_id: USER, organization_id: null },
      roots: [{ kind: 'well', id: '11111111-1111-4111-8111-111111111111', name: 'KETA-1' }],
      tables: { geo_wells: { rows: 1, schemaVersions: [1], pk: 'id' } }, files: w.files,
    });
    m.signature = await signManifestWithKey(m, keys.priv, 'pld-test');
    if (mutateAfterSign) mutateAfterSign(m);
    w.addManifest(m);
    return w.toUint8Array();
  }

  test('a signed, untouched package reads as valid', async () => {
    const pkg = await readPackage(await signedArchive());
    expect(pkg.signature).toEqual({ status: 'valid', key_id: 'pld-test' });
  });

  test('a signed package whose manifest was edited after signing is refused, even though every file hash still matches', async () => {
    const bytes = await signedArchive((m) => { m.name = 'Renamed after signing'; });
    await expect(readPackage(bytes)).rejects.toMatchObject({ code: 'bad-signature', key_id: 'pld-test' });
    const pkg = await readPackage(bytes, { allowInvalidSignature: true });
    expect(pkg.signature.status).toBe('invalid');
  });

  test('an unsigned package reads as unsigned; a zip re-packed without the signature is unsigned too', async () => {
    const bytes = await signedArchive((m) => { m.signature = null; });
    expect((await readPackage(bytes)).signature.status).toBe('unsigned');
    const zip = await JSZip.loadAsync(bytes);
    expect(JSON.parse(await zip.file('manifest.json').async('string')).signature).toBeNull();
  });
});
