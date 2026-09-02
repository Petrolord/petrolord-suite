// Manifest signatures (Project Portability PP5, PLAN §4.7).
//
// Origin, not secrecy: a signature lets an importer tell a package Petrolord
// wrote from one edited afterwards. Editing is reported, never forbidden.
//
//   canonicalManifestBytes(m)  JSON with keys sorted at every level and the
//                              `signature` field removed; what gets signed
//   manifestDigestHex(m)       sha256 of those bytes (also the certificate's
//                              "manifest digest")
//   verifyManifestSignature(m) { status: 'unsigned' | 'valid' | 'invalid' |
//                                'unknown-key' | 'unsupported', key_id }
//
// Algorithm: ECDSA P-256 over SHA-256 (WebCrypto everywhere: browsers, Deno
// edge functions, Node 18 under jest). The private key lives only in the
// `pld-sign` edge function's secret; the public keys ship here so
// verification works offline, which is what an archive or a regulator needs.
// Signature value: base64 of the 64-byte raw r||s (WebCrypto's native form).
//
// Key rotation: add the new public JWK under a new key_id and keep the old
// one, so packages signed earlier still verify.

import { sha256Hex } from './zipWriter';

export const SIGNATURE_ALG = 'ECDSA-P256-SHA256';

/**
 * Public keys by key_id. Filled when the owner generates the signing key
 * (tools/portability/gen-signing-key.mjs prints both halves; the private JWK
 * goes to `supabase secrets set PLD_SIGNING_PRIVATE_JWK=...`, the public JWK
 * is pasted here). Until then every package is reported as unsigned.
 */
export const PUBLIC_KEYS = {
  // 'pld-2026-09': { kty: 'EC', crv: 'P-256', x: '...', y: '...' },
};

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

let encoder = null;
async function textEncoder() {
  if (encoder) return encoder;
  if (typeof globalThis.TextEncoder === 'function') encoder = new globalThis.TextEncoder();
  else { const util = await import('node:util'); encoder = new util.TextEncoder(); }
  return encoder;
}

/** The bytes a signature covers: canonical JSON of the manifest without `signature`. */
export async function canonicalManifestBytes(manifest) {
  const { signature, ...rest } = manifest;
  return (await textEncoder()).encode(JSON.stringify(sortKeys(rest)));
}

export async function manifestDigestHex(manifest) {
  return sha256Hex(await canonicalManifestBytes(manifest));
}

async function subtle() {
  if (globalThis.crypto?.subtle) return globalThis.crypto.subtle;
  const { webcrypto } = await import('node:crypto');
  return webcrypto.subtle;
}

const b64ToBytes = (s) => {
  if (typeof atob === 'function') return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return new Uint8Array(globalThis.Buffer.from(s, 'base64'));
};
export const bytesToB64 = (u8) => {
  if (typeof btoa === 'function') { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
  return globalThis.Buffer.from(u8).toString('base64');
};

/** Verify with an explicit public JWK (tests, and key lookups). */
export async function verifyWithKey(manifest, publicJwk) {
  const sig = manifest?.signature;
  if (!sig?.value) return false;
  const s = await subtle();
  const key = await s.importKey('jwk', { ...publicJwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return s.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64ToBytes(sig.value), await canonicalManifestBytes(manifest));
}

/**
 * @returns {Promise<{status: 'unsigned'|'valid'|'invalid'|'unknown-key'|'unsupported', key_id: string|null}>}
 */
export async function verifyManifestSignature(manifest, keys = PUBLIC_KEYS) {
  const sig = manifest?.signature;
  if (!sig || !sig.value) return { status: 'unsigned', key_id: null };
  if (sig.alg !== SIGNATURE_ALG) return { status: 'unsupported', key_id: sig.key_id ?? null };
  const jwk = keys[sig.key_id];
  if (!jwk) return { status: 'unknown-key', key_id: sig.key_id ?? null };
  try {
    const ok = await verifyWithKey(manifest, jwk);
    return { status: ok ? 'valid' : 'invalid', key_id: sig.key_id };
  } catch (e) {
    return { status: 'invalid', key_id: sig.key_id };
  }
}

/** Sign with a private JWK (the edge function does this; tests use it to make fixtures). */
export async function signManifestWithKey(manifest, privateJwk, keyId) {
  const s = await subtle();
  const key = await s.importKey('jwk', { ...privateJwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const raw = await s.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, await canonicalManifestBytes(manifest));
  return { alg: SIGNATURE_ALG, key_id: keyId, value: bytesToB64(new Uint8Array(raw)) };
}

/** User-facing one-liners for the review panel (no em dashes). */
export function signatureMessage(result) {
  switch (result?.status) {
    case 'valid': return `Signed by Petrolord (key ${result.key_id}); the manifest has not changed since export.`;
    case 'invalid': return `This package carries a Petrolord signature that does not match its manifest. The package was changed after it was signed.`;
    case 'unknown-key': return `This package is signed with a key this build does not know (${result.key_id}). Reload the page to get the latest build, or treat the package as unsigned.`;
    case 'unsupported': return 'This package carries a signature in a form this build cannot check.';
    default: return 'This package is not signed. Its file checksums still verify, but its origin cannot be confirmed.';
  }
}
