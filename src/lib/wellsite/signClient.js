// Client side of the platform countersignature (WS8, spec section 32).
// requestCountersign never blocks a sign-off: the sign-off row is the
// record, the countersignature arrives when the platform reachable, and
// its absence is stated plainly. verifyCountersignature checks a
// countersignature offline against the public keys that ship with the
// Suite (the same keys as the .pld exports; one platform key).
import { canonicalJson } from './reports';

// the public keys ship with the .pld signing kit; loaded on demand so that module never sits in the workstation's mount graph
async function platformKeys() { const m = await import('@/lib/portability/signing'); return m.PUBLIC_KEYS; }

export const SIGNATURE_ALG = 'ECDSA-P256-SHA256';

/** The bytes the platform signed: the sign-off's identity plus the hash it attests (mirrors ws-sign/helpers.js). */
export function countersignPayload(signoff, report) {
  return {
    signoff_id: signoff.id, report_id: report.id, well_id: report.well_id, kind: report.kind,
    report_version: signoff.report_version, content_hash: signoff.content_hash,
    user_id: signoff.user_id, role: signoff.role, signed_at: signoff.signed_at, statement: signoff.statement,
  };
}

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/**
 * @returns {Promise<{status:'valid'|'invalid'|'not_countersigned'|'unknown-key'|'unsupported', key_id?:string}>}
 */
export async function verifyCountersignature(signoff, report, keys = null) {
  const cs = signoff && signoff.countersignature;
  if (!cs || !cs.value) return { status: 'not_countersigned' };
  const table = keys || await platformKeys();
  const jwk = table[cs.key_id];
  if (!jwk) return { status: 'unknown-key', key_id: cs.key_id };
  const subtle = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
  if (!subtle) return { status: 'unsupported', key_id: cs.key_id };
  try {
    const key = await subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const bytes = new TextEncoder().encode(canonicalJson(countersignPayload(signoff, report)));
    const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64ToBytes(cs.value), bytes);
    return { status: ok ? 'valid' : 'invalid', key_id: cs.key_id };
  } catch { return { status: 'invalid', key_id: cs.key_id }; }
}

/** Plain words for the sign-off block. */
export function countersignMessage(result, signoff) {
  if (!result || result.status === 'not_countersigned') return 'Platform countersignature pending until synchronised.';
  if (result.status === 'valid') return `Countersigned by Petrolord (key ${result.key_id}) at ${signoff.countersigned_at}${signoff.countersignature && signoff.countersignature.certificate_no ? `, certificate ${signoff.countersignature.certificate_no}` : ''}; verified on this device.`;
  if (result.status === 'unknown-key') return `Countersigned with a key this build does not carry (${result.key_id}); update the Suite to verify it.`;
  if (result.status === 'unsupported') return 'Countersigned; this device cannot verify signatures.';
  return 'The countersignature does not verify against the report; treat this sign-off as unverified.';
}
