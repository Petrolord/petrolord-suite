/**
 * AS10 — what may actually be written to the audit_* tables.
 *
 * There was nothing to unpick here, and nothing to be careful of
 * except the obvious: this app had no code at all. Both tiles it
 * replaces — `safety-audit-manager` and `audit-trail-manager` — were
 * Active and sellable with no route, no page and no component behind
 * them.
 */
import { toDateOnlyString } from '@/lib/auditManagement';
import { isSamePerson, nameKey } from '../../shared/people';

/** `org_id` and `created_by` are set by the hook, never by a form. */
export const PROGRAMME_WRITABLE_COLUMNS = Object.freeze([
  'title',
  'programme_year',
  'objective',
  'scope_statement',
  'owner_id',
  'owner_name',
  'status',
  'approved_by',
  'approver_name',
  'approved_at',
  'completed_at',
  'notes',
]);

export const TEMPLATE_WRITABLE_COLUMNS = Object.freeze([
  'code',
  'title',
  'description',
  'audit_type',
  'version',
  'status',
]);

export const TEMPLATE_ITEM_WRITABLE_COLUMNS = Object.freeze([
  'template_id',
  'section',
  'item_no',
  'sequence',
  'question',
  'guidance',
  'reference',
  'criticality',
]);

/** `audit_code` is issued by the database, never by the form. */
export const AUDIT_WRITABLE_COLUMNS = Object.freeze([
  'programme_id',
  'template_id',
  'title',
  'audit_type',
  'scope',
  'criteria',
  'site',
  'asset_id',
  'department',
  'contractor',
  'auditee_id',
  'auditee_name',
  'lead_auditor_id',
  'lead_auditor_name',
  'audit_team',
  'planned_start',
  'planned_end',
  'actual_start',
  'actual_end',
  'status',
  'conclusion',
  'report_issued_date',
  'report_issued_by',
  'closed_date',
  'closed_by',
  'cancellation_reason',
]);

export const RESPONSE_WRITABLE_COLUMNS = Object.freeze([
  'audit_id',
  'item_id',
  'result',
  'evidence',
  'note',
  'examined_on',
  'examined_by',
]);

export const FINDING_WRITABLE_COLUMNS = Object.freeze([
  'audit_id',
  'response_id',
  'finding_type',
  'stop_work',
  'title',
  'description',
  'objective_evidence',
  'requirement_ref',
  'department',
  'site',
  'status',
  'raised_by',
  'raised_date',
  'due_date',
  'owner_id',
  'owner_name',
  'correction',
  'root_cause',
  'root_cause_category',
  'closed_date',
  'closed_by',
  'closure_notes',
]);

export const ACTION_WRITABLE_COLUMNS = Object.freeze([
  'finding_id',
  'action_type',
  'description',
  'assigned_to',
  'assignee_name',
  'due_date',
  'status',
  'completed_at',
  'completion_evidence',
  'effectiveness_due',
  'effectiveness_verified',
  'effectiveness_checked_at',
  'effectiveness_verified_by',
  'effectiveness_notes',
]);

const DATE_COLUMNS = [
  'approved_at', 'completed_at', 'planned_start', 'planned_end', 'actual_start',
  'actual_end', 'report_issued_date', 'closed_date', 'examined_on', 'raised_date',
  'due_date', 'effectiveness_due', 'effectiveness_checked_at',
];

const NUMERIC_COLUMNS = ['programme_year', 'sequence'];

const BOOLEAN_COLUMNS = ['stop_work', 'effectiveness_verified'];

const HOUSEKEEPING = [
  'id', 'org_id', 'audit_code', 'finding_code', 'created_by', 'created_at', 'updated_at',
  'items', 'responses', 'findings', 'actions', 'progress', 'audits', 'template', 'programme',
];

const pick = (source, allowed) => {
  const row = {};
  allowed.forEach((col) => {
    let value = source[col];
    if (value === undefined) return;
    if (BOOLEAN_COLUMNS.includes(col)) {
      row[col] = value === true || value === 'true';
      return;
    }
    if (typeof value === 'string' && value.trim() === '') value = null;
    if (value !== null && DATE_COLUMNS.includes(col)) value = toDateOnlyString(value);
    if (value !== null && NUMERIC_COLUMNS.includes(col)) {
      const n = Number(value);
      value = Number.isFinite(n) ? n : null;
    }
    row[col] = value;
  });
  return row;
};

const build = (allowed) => (form = {}) => ({
  row: pick({ ...form }, allowed),
  dropped: Object.keys(form).filter(
    (k) => !allowed.includes(k) && !HOUSEKEEPING.includes(k)),
});

export const buildProgrammeWrite = build(PROGRAMME_WRITABLE_COLUMNS);
export const buildTemplateWrite = build(TEMPLATE_WRITABLE_COLUMNS);
export const buildTemplateItemWrite = build(TEMPLATE_ITEM_WRITABLE_COLUMNS);
export const buildAuditWrite = build(AUDIT_WRITABLE_COLUMNS);
export const buildResponseWrite = build(RESPONSE_WRITABLE_COLUMNS);
export const buildFindingWrite = build(FINDING_WRITABLE_COLUMNS);
export const buildActionWrite = build(ACTION_WRITABLE_COLUMNS);

/* ------------------------------------------------------------------ */
/* Codes, when the database function is not there to issue them        */
/* ------------------------------------------------------------------ */

const nextCodeFromExisting = (rows, field, prefix, year) => {
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const max = rows.reduce((acc, r) => {
    const m = re.exec(r?.[field] || '');
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
};

export const nextAuditCodeFromExisting = (audits = [], year = new Date().getFullYear()) =>
  nextCodeFromExisting(audits, 'audit_code', 'AUD', year);

export const nextFindingCodeFromExisting = (findings = [], year = new Date().getFullYear()) =>
  nextCodeFromExisting(findings, 'finding_code', 'AF', year);

/* ------------------------------------------------------------------ */
/* Validation: what a form must carry before the database sees it      */
/* ------------------------------------------------------------------ */

export const validateProgramme = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'Name the programme.';
  const year = Number(form.programme_year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    errors.programme_year = 'Which year does this programme cover?';
  }
  return errors;
};

export const validateTemplate = (form = {}) => {
  const errors = {};
  if (!String(form.code || '').trim()) errors.code = 'Give the checklist a reference.';
  if (!String(form.title || '').trim()) errors.title = 'Name the checklist.';
  return errors;
};

export const validateTemplateItem = (form = {}) => {
  const errors = {};
  if (!String(form.item_no || '').trim()) errors.item_no = 'Number the item, such as 1.1.';
  if (!String(form.question || '').trim()) errors.question = 'What is the auditor asked to check?';
  return errors;
};

export const validateAudit = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'Name the audit.';
  if (!form.lead_auditor_id && !String(form.lead_auditor_name || '').trim()) {
    errors.lead_auditor_name = 'Name the lead auditor.';
  }
  if (form.planned_start && form.planned_end
      && toDateOnlyString(form.planned_end) < toDateOnlyString(form.planned_start)) {
    errors.planned_end = 'The audit cannot end before it starts.';
  }
  return errors;
};

/**
 * What an answer must carry. The rules are the database's, named here
 * so the auditor is told which field is missing rather than shown a
 * constraint name.
 */
export const validateResponse = (form = {}) => {
  const errors = {};
  if (!form.result) errors.result = 'What was the result?';
  if (form.result && form.result !== 'Not examined' && !form.examined_on) {
    errors.examined_on = 'Record the date this was examined.';
  }
  if (form.result === 'Not applicable' && !String(form.note || '').trim()) {
    errors.note = 'Say why this item does not apply. "Not applicable" is an answer, and an '
      + 'answer has a reason.';
  }
  if (form.result === 'Nonconformant' && !String(form.evidence || '').trim()) {
    errors.evidence = 'What was seen? A nonconformity is an assertion, and this is the '
      + 'evidence for it.';
  }
  return errors;
};

export const validateFinding = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'State the finding in one line.';
  if (!String(form.objective_evidence || '').trim()) {
    errors.objective_evidence = 'Objective evidence: what was seen, where, and when.';
  }
  if (form.stop_work && !String(form.correction || '').trim()) {
    errors.correction = 'A finding that stopped work records what was done about it at the '
      + 'time, not at closure.';
  }
  return errors;
};

export const validateAction = (form = {}) => {
  const errors = {};
  if (!String(form.description || '').trim()) errors.description = 'Say what will be done.';
  if (!String(form.action_type || '').trim()) {
    errors.action_type = 'Corrective (removing this cause) or preventive (stopping it elsewhere)?';
  }
  if (!form.due_date) errors.due_date = 'An action with no due date is not an action.';
  return errors;
};

/* ------------------------------------------------------------------ */
/* AS13: what the pages check before they offer a button               */
/* ------------------------------------------------------------------ */

/**
 * The audit as it WOULD be saved, with the report form's draft merged
 * in.
 *
 * AS10 evaluated the report gate against the saved audit only, and the
 * gate asks for the conclusion, which is only ever saved by the button
 * that gate disabled. So no audit could be reported. The gate for the
 * form is the gate for what the form is about to write.
 */
export const auditAsItWouldBeSaved = (audit, draft) =>
  (audit && draft ? { ...audit, ...draft } : audit);

/**
 * Once an audit is reported its checklist and its list of findings are
 * the report. Answers are not changed and findings are not added after
 * that; existing findings are still worked to closure.
 */
export const AUDIT_LOCKED_STATUSES = Object.freeze(['Reported', 'Closed', 'Cancelled']);

export const auditAcceptsWork = (audit) =>
  Boolean(audit) && !AUDIT_LOCKED_STATUSES.includes(audit.status);

export const auditLockedReason = (audit) => (audit
  ? `${audit.audit_code || 'This audit'} is ${String(audit.status).toLowerCase()}. Its checklist and findings are the report, so answers cannot be changed and findings cannot be added now.`
  : 'That audit is not in this register.');

/**
 * The form as the independence check should see it.
 *
 * The engine compares lead_auditor_id with auditee_id. A typed name
 * has no id, so where the two NAMES are the same person and at least
 * one side has no id, both sides are handed the same stand-in key and
 * the engine's own refusal is what the user reads. The stand-in is
 * never written.
 */
export const independenceSubject = (form = {}) => {
  if (form.lead_auditor_id && form.auditee_id) return form;
  if (!isSamePerson(form.lead_auditor_id, form.lead_auditor_name,
    form.auditee_id, form.auditee_name)) return form;
  const key = nameKey(form.lead_auditor_name);
  return { ...form, lead_auditor_id: key, auditee_id: key };
};

/**
 * How much of the record depends on a checklist question.
 *
 * Deleting an item cascades away every answer given to it (the foreign
 * key is ON DELETE CASCADE), including answers inside reported and
 * closed audits, and the findings raised on those answers lose their
 * link. An item that has been used is kept.
 */
export const itemUsage = (itemId, responses = [], audits = []) => {
  const mine = responses.filter((r) => r.item_id === itemId);
  const auditIds = new Set(mine.map((r) => r.audit_id));
  const used = audits.filter((a) => auditIds.has(a.id));
  return {
    responses: mine.length,
    audits: auditIds.size,
    reportedAudits: used.filter((a) => ['Reported', 'Closed'].includes(a.status)).length,
  };
};

export const canDeleteTemplateItem = (item, responses = [], audits = []) => {
  const usage = itemUsage(item?.id, responses, audits);
  if (!usage.responses) return { ok: true, usage };
  return {
    ok: false,
    usage,
    reason: `Item ${item.item_no} is in the checklist of ${usage.audits} audit${usage.audits === 1 ? '' : 's'}`
      + `${usage.reportedAudits ? `, ${usage.reportedAudits} of them reported` : ''}. `
      + 'Deleting it would delete the answers given to it. Questions cannot be retired one at a '
      + 'time, so to stop asking it, retire this checklist and issue a new version without it.',
  };
};

/**
 * A question's criticality decides whether its failure needed a finding,
 * so changing it after an audit has reported rewrites what that report
 * was held to.
 */
export const canChangeItemCriticality = (item, responses = [], audits = []) => {
  const usage = itemUsage(item?.id, responses, audits);
  if (!usage.reportedAudits) return { ok: true, usage };
  return {
    ok: false,
    usage,
    reason: `Item ${item.item_no} has been answered in ${usage.reportedAudits} reported audit${usage.reportedAudits === 1 ? '' : 's'}, `
      + 'and its criticality is what those reports were held to. Retire this checklist and '
      + 'issue a new version with the new criticality.',
  };
};

/**
 * May this finding be deleted?
 *
 * Only a finding raised in error before anything was done with it: still
 * Open, no correction, root cause or closure recorded, no actions, and
 * its audit not yet reported. Anything else is VOIDED with a reason,
 * which keeps the record and satisfies no closure rule.
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
  if (audit && AUDIT_LOCKED_STATUSES.includes(audit.status)) {
    return {
      ok: false,
      reason: `${code} is part of the report of ${audit.audit_code}, which is ${String(audit.status).toLowerCase()}. Void it with a reason instead.`,
    };
  }
  return { ok: true };
};

/**
 * Where a finding is in its workflow, from what has been recorded.
 *
 * AS10 offered "Action in progress" and "Verification" in the status
 * filter and counted them as open, but no control ever set them. They
 * are now derived: an open action means the action is in progress, and
 * every action finished means the finding is waiting to be verified and
 * closed. Closed and Voided are only ever set by their own gates.
 */
export const progressedFindingStatus = (finding = {}, actions = []) => {
  if (['Closed', 'Voided'].includes(finding.status)) return finding.status;
  const live = actions.filter((a) => a.status !== 'Cancelled');
  if (live.some((a) => ['Open', 'In progress'].includes(a.status))) return 'Action in progress';
  if (live.length && live.every((a) => a.status === 'Complete')) return 'Verification';
  if (String(finding.correction || '').trim()) return 'Correction proposed';
  return 'Open';
};
