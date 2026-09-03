// Pure helpers for the pld-sign edge function (Project Portability PP5).
// No imports, no Deno APIs: jest runs these under node, and the SPA's
// signing.test.js checks that canonicalJson() matches the browser side
// byte for byte (the signature covers exactly these bytes).

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

/** Canonical JSON of a manifest without its `signature` field. */
export function canonicalJson(manifest) {
  const { signature, ...rest } = manifest || {};
  return JSON.stringify(sortKeys(rest));
}

/** PLD-EX-<year>-<first 8 hex of the package id, upper case>. Deterministic. */
export function makeExportCertificateNo(packageId, exportedAtIso) {
  const year = String(exportedAtIso ?? '').slice(0, 4) || '0000';
  const id8 = String(packageId ?? '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return `PLD-EX-${year}-${id8}`;
}

/**
 * The facts printed on the certificate and returned by verify_certificate.
 * Never includes the verification code.
 */
export function buildExportCertificateFields(row) {
  const tables = row.tables && typeof row.tables === 'object' ? row.tables : {};
  const rowsTotal = Object.values(tables).reduce((n, v) => n + (Number(v) || 0), 0);
  return {
    certificate_no: row.certificate_no,
    package_id: row.package_id,
    package_name: row.package_name ?? null,
    exported_at: row.exported_at,
    exporter_email: row.exporter_email ?? null,
    organization_name: row.organization_name ?? null,
    manifest_digest: row.manifest_digest,
    signature_key_id: row.signature_key_id ?? null,
    platform_sha: row.platform_sha ?? null,
    tables,
    rows_total: rowsTotal,
    blobs: Number(row.blobs) || 0,
    parts: Number(row.parts) || 1,
  };
}

/** Minimal shape check on a manifest before signing (the SPA validates fully). */
export function manifestLooksSane(m) {
  return !!(m && m.format === 'pld' && Number.isInteger(m.package_version) && typeof m.package_id === 'string'
    && m.tables && typeof m.tables === 'object' && Array.isArray(m.blobs) && m.files && typeof m.files === 'object');
}
