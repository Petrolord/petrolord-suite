// Pure helpers for the org-offboard edge function. No imports and no Deno
// APIs on purpose: index.ts (Deno) imports this file directly and the jest
// suite in __tests__/ exercises it under node (one-test-runner rule).

export const OFFBOARD_BUCKETS = ['seismic', 'wells', 'surfaces'];

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * The typed confirmation must match the organization name, ignoring case and
 * whitespace runs. Never trust a bare click for an irreversible schedule.
 */
export function confirmNameMatches(orgName, typed) {
  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(orgName).length > 0 && norm(orgName) === norm(typed);
}

/**
 * Storage folders to remove during a purge: the org's own export archive
 * plus, for every member whose auth account is being deleted, their per-user
 * folder in each data bucket. Surviving members keep their folders (their
 * data was unshared, not destroyed).
 */
export function storagePrefixTargets(orgId, deletedUserIds, extraOrgIds = []) {
  const targets = [orgId, ...extraOrgIds].map((id) => ({ bucket: 'org-exports', prefix: id }));
  for (const uid of deletedUserIds) {
    for (const bucket of OFFBOARD_BUCKETS) targets.push({ bucket, prefix: uid });
  }
  return targets;
}

/** Compact numbers for the completion email; nulls degrade to 0. */
export function summarizeReport(report) {
  const rpc = report?.rpc ?? {};
  return {
    totalRows: Number(rpc?.summary?.total_rows ?? 0),
    tablesAffected: Number(rpc?.summary?.tables_affected ?? 0),
    rowsUnshared: Number(rpc?.summary?.rows_unshared ?? 0),
    objectsRemoved: Number(report?.storage?.objects_removed ?? 0),
    accountsDeleted: Array.isArray(report?.auth?.deleted) ? report.auth.deleted.length : 0,
  };
}

/**
 * A failed auth delete for a user who no longer exists is success on retry,
 * not an error (execute_due re-runs failed requests).
 */
export function isUserGoneError(message) {
  return /user not found|404/i.test(String(message ?? ''));
}

/**
 * Human-readable certificate number: PLD-DC-<year>-<first 8 hex of the
 * request id>. Deterministic per request, so re-issuing a certificate never
 * mints a second number for the same purge.
 */
export function makeCertificateNo(requestId, purgedAtIso) {
  const year = String(purgedAtIso ?? '').slice(0, 4) || '0000';
  const id8 = String(requestId ?? '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return `PLD-DC-${year}-${id8}`;
}

/**
 * The single source of the facts attested by both the PDF and the public
 * verification endpoint. Only snapshot fields that already appear on the
 * certificate; never the verification code.
 */
export function buildCertificateFields(request, certificateNo) {
  const report = request?.purge_report ?? null;
  const rpc = report?.rpc ?? {};
  return {
    certificate_no: certificateNo,
    organization_name: request?.org_name ?? '',
    organization_id: request?.organization_id ?? '',
    requested_by_email: request?.requested_by_email ?? '',
    requested_at: request?.created_at ?? null,
    effective_at: request?.effective_at ?? null,
    purged_at: request?.purged_at ?? null,
    summary: summarizeReport(report),
    extra_org_names: (Array.isArray(rpc?.extra_orgs) ? rpc.extra_orgs : [])
      .map((o) => o?.name).filter(Boolean),
  };
}
