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
import { isSamePerson, nameKey, normaliseName } from '../../shared/people';

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

/* ------------------------------------------------------------------ */
/* AS13: what the pages and the hook check before a write              */
/* ------------------------------------------------------------------ */

/** The verdicts that record an assessment, and so an assessor. */
export const ASSESSED_STATUSES = Object.freeze(['Conformant', 'Partially conformant', 'Nonconformant']);

/**
 * Who assessed this, applied BEFORE the gate.
 *
 * "Assessor (leave blank to record yourself)": a blank name records the
 * signed-in user; a typed name records that person (somebody without a
 * Suite account) and clears the account. Both are written every time,
 * so a re-assessment by B never keeps A as the assessor. AS8 filled the
 * user in after canSetClauseStatus had already refused the blank name.
 */
export const withAssessor = (patch = {}, userId = null) => {
  const typed = String(patch.assessor_name || '').trim();
  return {
    ...patch,
    assessed_date: patch.assessed_date || toDateOnlyString(new Date()),
    assessor_name: typed || null,
    assessed_by: typed ? null : (userId || null),
  };
};

/**
 * The audit and the clauses as ISO 19011's independence check should
 * see them.
 *
 * The engine compares the lead auditor's id with each clause owner's id.
 * Forms that only typed names gave it nothing to compare, so the check
 * never fired. Where the two ids are not both known, a clause whose owner
 * is the same person as the lead auditor by name is handed the lead
 * auditor's key, and the refusal the user reads is the engine's own.
 * The stand-in keys are never written.
 */
export const independenceView = (audit = {}, clauses = []) => {
  const leadKey = audit.lead_auditor_id
    || (normaliseName(audit.lead_auditor_name) ? nameKey(audit.lead_auditor_name) : null);
  if (!leadKey) return { audit, clauses };
  return {
    audit: { ...audit, lead_auditor_id: leadKey },
    clauses: clauses.map((c) => {
      if (!c) return c;
      if (audit.lead_auditor_id && c.owner_id) return c;
      return isSamePerson(audit.lead_auditor_id, audit.lead_auditor_name, c.owner_id, c.owner_name)
        ? { ...c, owner_id: leadKey }
        : c;
    }),
  };
};

/**
 * A finding raised from an audit carries that audit's standard, so a
 * major nonconformity raised from the audit page counts against the
 * standard's certification readiness. The form may still name another.
 */
export const findingWithAuditStandard = (form = {}, audits = []) => {
  if (!form.audit_id || form.standard_id) return form;
  const audit = audits.find((a) => a.id === form.audit_id);
  return audit?.standard_id ? { ...form, standard_id: audit.standard_id } : form;
};

/**
 * What removing a standard takes with it, counted, for the confirmation.
 * Migration 20260917600000: its clauses go (ON DELETE CASCADE), and with
 * them every audit result recorded against them; its audits and findings
 * are kept with the standard unset (ON DELETE SET NULL).
 */
export const standardRemovalImpact = (standard, { clauses = [], auditClauses = [], audits = [], findings = [] } = {}) => {
  const mine = new Set(clauses.filter((c) => c.standard_id === standard?.id).map((c) => c.id));
  return {
    clauses: mine.size,
    results: auditClauses.filter((r) => mine.has(r.clause_id)).length,
    audits: audits.filter((a) => a.standard_id === standard?.id).length,
    findings: findings.filter((f) => f.standard_id === standard?.id).length,
  };
};

export { canDeleteFinding, progressedFindingStatus } from '../../shared/findingWorkflow';
