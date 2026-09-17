/**
 * AS8 — what may actually be written to the iso_* tables.
 *
 * There was nothing to unpick. The app's only write was the shell's
 * Add Clause modal, which read its fields out of the DOM with
 * `new FormData(e.target)`, built a row with
 * `id: \`CLAUSE-${Math.floor(Math.random() * 10000)}\`` and
 * `status: 'Compliant'`, pushed it onto `useState`, and toasted "The
 * new ISO clause has been successfully registered". Nothing else in
 * the app wrote anything at all: there was no create path for a
 * standard, an audit, a finding or an action.
 */
import { toDateOnlyString } from '@/lib/isoCompliance';

/** `org_id`, the codes and `created_by` are set by the hook, never by a form. */
export const STANDARD_WRITABLE_COLUMNS = Object.freeze([
  'code',
  'title',
  'scope_statement',
  'certification_status',
  'certification_body',
  'certificate_number',
  'certified_from',
  'certificate_expires',
  'next_surveillance',
  'cycle_years',
  'owner_id',
  'notes',
]);

export const CLAUSE_WRITABLE_COLUMNS = Object.freeze([
  'standard_id',
  'clause_ref',
  'title',
  'requirement',
  'department',
  'owner_id',
  'owner_name',
  'applicability',
  'applicability_justification',
  'status',
  'evidence_reference',
  'evidence_document_id',
  'assessed_date',
  'assessed_by',
  'assessor_name',
  'next_review_due',
  'notes',
]);

export const AUDIT_WRITABLE_COLUMNS = Object.freeze([
  'standard_id',
  'title',
  'audit_type',
  'scope',
  'criteria',
  'department',
  'lead_auditor_id',
  'lead_auditor_name',
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
]);

export const COVERAGE_WRITABLE_COLUMNS = Object.freeze([
  'audit_id',
  'clause_id',
  'result',
  'evidence_seen',
  'examined_on',
  'notes',
]);

export const FINDING_WRITABLE_COLUMNS = Object.freeze([
  'audit_id',
  'clause_id',
  'standard_id',
  'finding_type',
  'title',
  'description',
  'objective_evidence',
  'requirement_ref',
  'department',
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
  'certified_from', 'certificate_expires', 'next_surveillance', 'assessed_date',
  'next_review_due', 'planned_start', 'planned_end', 'actual_start', 'actual_end',
  'report_issued_date', 'closed_date', 'examined_on', 'raised_date', 'due_date',
  'effectiveness_due', 'effectiveness_checked_at',
];

const NUMERIC_COLUMNS = ['cycle_years'];

const HOUSEKEEPING = [
  'id', 'org_id', 'audit_code', 'finding_code', 'created_by', 'created_at', 'updated_at',
  'clauses', 'findings', 'actions', 'coverage', 'standard', 'audit', 'clause',
];

const pick = (source, allowed) => {
  const row = {};
  allowed.forEach((col) => {
    let value = source[col];
    if (value === undefined) return;
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

export const buildStandardWrite = build(STANDARD_WRITABLE_COLUMNS);
export const buildClauseWrite = build(CLAUSE_WRITABLE_COLUMNS);
export const buildAuditWrite = build(AUDIT_WRITABLE_COLUMNS);
export const buildCoverageWrite = build(COVERAGE_WRITABLE_COLUMNS);
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
  nextCodeFromExisting(audits, 'audit_code', 'IA', year);

export const nextFindingCodeFromExisting = (findings = [], year = new Date().getFullYear()) =>
  nextCodeFromExisting(findings, 'finding_code', 'IAF', year);

/* ------------------------------------------------------------------ */
/* Validation: what a form must carry before the database sees it      */
/* ------------------------------------------------------------------ */

export const validateStandard = (form = {}) => {
  const errors = {};
  if (!String(form.code || '').trim()) {
    errors.code = 'Name the standard, as it is written on the certificate.';
  }
  if (form.certification_status === 'Certified') {
    if (!String(form.certificate_number || '').trim()) {
      errors.certificate_number = 'A certified standard has a certificate number.';
    }
    if (!String(form.certification_body || '').trim()) {
      errors.certification_body = 'Which certification body issued it?';
    }
    if (!form.certificate_expires) {
      errors.certificate_expires = 'When does the certificate expire?';
    }
  }
  return errors;
};

export const validateClause = (form = {}) => {
  const errors = {};
  if (!form.standard_id) errors.standard_id = 'Which standard is this clause from?';
  if (!String(form.clause_ref || '').trim()) errors.clause_ref = 'The clause reference, such as 7.1.5.';
  if (!String(form.title || '').trim()) errors.title = 'The clause title.';
  if (form.applicability === 'Not applicable'
      && !String(form.applicability_justification || '').trim()) {
    errors.applicability_justification = 'ISO 9001:2015 §4.3 requires the justification for a '
      + 'requirement determined not applicable to be kept.';
  }
  return errors;
};

export const validateAudit = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'What is this audit called?';
  if (!form.lead_auditor_id && !String(form.lead_auditor_name || '').trim()) {
    errors.lead_auditor_name = 'Name the lead auditor.';
  }
  if (form.planned_start && form.planned_end
      && toDateOnlyString(form.planned_end) < toDateOnlyString(form.planned_start)) {
    errors.planned_end = 'The audit cannot end before it starts.';
  }
  return errors;
};

export const validateFinding = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'State the finding in one line.';
  if (!String(form.description || '').trim()) {
    errors.description = 'What was found, and against which requirement?';
  }
  if (!String(form.objective_evidence || '').trim()) {
    errors.objective_evidence = 'Objective evidence: what was seen. A finding without it is '
      + 'an assertion, and it is the first thing an auditee will ask for.';
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

export const validateCoverage = (form = {}) => {
  const errors = {};
  if (!form.result) errors.result = 'What was the result?';
  if (form.result && form.result !== 'Not examined' && !form.examined_on) {
    errors.examined_on = 'Record the date it was examined.';
  }
  return errors;
};
