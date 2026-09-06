// Pure helpers for ws-sign (Wellsite Studio WS8). The canonical form is
// the engine's (packages/engines/engines/wellsite/reports.js
// canonicalJson): keys sorted at every level, compact, undefined as
// null. The client hashes the same bytes, so a mismatch means the
// report changed after it was signed.

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value === undefined ? null : value);
}

/** The bytes the platform signs for a sign-off: the sign-off's identity plus the hash it attests. */
export function countersignPayload(signoff, report) {
  return {
    signoff_id: signoff.id, report_id: report.id, well_id: report.well_id, kind: report.kind,
    report_version: signoff.report_version, content_hash: signoff.content_hash,
    user_id: signoff.user_id, role: signoff.role, signed_at: signoff.signed_at, statement: signoff.statement,
  };
}

/** WS-SO-<year>-<8 hex of the sign-off id>. */
export function makeCertificateNo(signoffId, signedAtIso) {
  const year = String(signedAtIso || '').slice(0, 4) || new Date().getUTCFullYear();
  return `WS-SO-${year}-${String(signoffId).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
