// The content hash of a report (spec section 32): SHA-256 over the
// canonical JSON of the model when WebCrypto is present, else the
// engine's FNV-1a as a clearly labelled fallback. Two renderings of the
// same model hash alike; a change to any cited fact changes the hash.
import { canonicalJson, fnv1a64 } from './reports';

export async function sha256Hex(text) {
  const subtle = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
  if (!subtle) return null;
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** { hash, algorithm, canonical } for a report model. */
export async function hashModel(model) {
  const canonical = canonicalJson(model);
  const sha = await sha256Hex(canonical);
  if (sha) return { hash: sha, algorithm: 'sha256', canonical };
  return { hash: `fnv:${fnv1a64(canonical)}`, algorithm: 'fnv1a64', canonical };
}
