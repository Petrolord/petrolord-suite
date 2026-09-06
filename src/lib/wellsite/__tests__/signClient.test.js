// WS8: the countersignature verifies offline against a public key; a changed fact fails; a missing one is stated.
import { webcrypto } from 'node:crypto';
import { verifyCountersignature, countersignPayload, countersignMessage } from '@/lib/wellsite/signClient';
import { canonicalJson } from '@/lib/wellsite/reports';

if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = require('node:util').TextEncoder;

const report = { id: 'r1', well_id: 'w1', kind: 'handover', version_no: 1, content_hash: 'sha256:abc' };
const signoff = { id: 's1', report_id: 'r1', user_id: 'u1', role: 'wellsite_geologist', signed_at: '2026-09-07T18:00:00.000Z', report_version: 1, content_hash: 'sha256:abc', statement: 'ok', countersignature: null, countersigned_at: null };

async function keyPair() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  return { kp, pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y } };
}
async function sign(kp, payload) {
  const raw = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(canonicalJson(payload)));
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

test('a countersignature over the sign-off identity and hash verifies; tampering fails; missing is pending', async () => {
  const { kp, pub } = await keyPair();
  const keys = { 'test-key': pub };
  expect(await verifyCountersignature(signoff, report, keys)).toEqual({ status: 'not_countersigned' });
  expect(countersignMessage({ status: 'not_countersigned' }, signoff)).toBe('Platform countersignature pending until synchronised.');
  const value = await sign(kp, countersignPayload(signoff, report));
  const signed = { ...signoff, countersignature: { alg: 'ECDSA-P256-SHA256', key_id: 'test-key', value, certificate_no: 'WS-SO-2026-S1' }, countersigned_at: '2026-09-07T19:00:00.000Z' };
  expect(await verifyCountersignature(signed, report, keys)).toEqual({ status: 'valid', key_id: 'test-key' });
  expect(countersignMessage({ status: 'valid', key_id: 'test-key' }, signed)).toMatch(/Countersigned by Petrolord \(key test-key\) at 2026-09-07T19:00:00.000Z, certificate WS-SO-2026-S1; verified on this device\./);
  expect(await verifyCountersignature({ ...signed, content_hash: 'sha256:changed' }, report, keys)).toEqual({ status: 'invalid', key_id: 'test-key' });
  expect(await verifyCountersignature(signed, report, {})).toEqual({ status: 'unknown-key', key_id: 'test-key' });
});
