/**
 * AS13 — two finding workflow helpers, shared by ISO Compliance and the
 * Audit & Findings Manager because their findings share one vocabulary
 * (the AS8 statuses, which AS10 adopted on purpose).
 *
 * Neither is a rule about when a finding may close: that is
 * canCloseFinding in the engine, and nothing here restates it. These
 * say where a finding is in its workflow, and when deleting one is
 * the honest thing to do rather than voiding it.
 */

/** Once an audit is reported, the findings it raised are part of the report. */
export const REPORTED_AUDIT_STATUSES = Object.freeze(['Reported', 'Closed', 'Cancelled']);

/**
 * May this finding be deleted?
 *
 * Only a finding raised in error before anything was done with it: still
 * Open, no correction, root cause or closure recorded, no actions, and
 * its audit not yet reported. Anything else is VOIDED with a reason,
 * which keeps the record and satisfies no closure rule. Before AS13 both
 * apps deleted a finding in any status on one click, so an open major
 * nonconformity could be deleted and its audit closed over it.
 */
export const canDeleteFinding = (finding = {}, audit = null, actions = []) => {
  const code = finding.finding_code || 'This finding';
  if (finding.status !== 'Open') {
    return {
      ok: false,
      reason: `${code} is ${String(finding.status).toLowerCase()}. Only an open finding with nothing recorded against it can be deleted. Void it with a reason instead.`,
    };
  }
  if (actions.length || String(finding.correction || '').trim()
      || String(finding.root_cause || '').trim() || finding.closed_date
      || String(finding.closure_notes || '').trim()) {
    return {
      ok: false,
      reason: `${code} already has work recorded against it. Void it with a reason instead, so that record is kept.`,
    };
  }
  if (audit && REPORTED_AUDIT_STATUSES.includes(audit.status)) {
    return {
      ok: false,
      reason: `${code} is part of the report of ${audit.audit_code || 'its audit'}, which is ${String(audit.status).toLowerCase()}. Void it with a reason instead.`,
    };
  }
  return { ok: true };
};

/**
 * Where a finding is in its workflow, from what has been recorded.
 *
 * Both apps offered "Action in progress" and "Verification" in the
 * status filter and counted them as open, but no control ever set them.
 * They are now derived: an open action means the action is in progress,
 * and every action finished means the finding is waiting to be verified
 * and closed. Closed and Voided are only ever set by their own gates.
 */
export const progressedFindingStatus = (finding = {}, actions = []) => {
  if (['Closed', 'Voided'].includes(finding.status)) return finding.status;
  const live = actions.filter((a) => a.status !== 'Cancelled');
  if (live.some((a) => ['Open', 'In progress'].includes(a.status))) return 'Action in progress';
  if (live.length && live.every((a) => a.status === 'Complete')) return 'Verification';
  if (String(finding.correction || '').trim()) return 'Correction proposed';
  return 'Open';
};
