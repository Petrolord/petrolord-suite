/**
 * AS7 — what may actually be written to the qa_* tables.
 *
 * There was nothing to unpick, because there was nothing to unpick
 * from. `NewQAPlan.jsx` had no state at all: not one of its three
 * inputs carried a `value` or an `onChange`, and there was no
 * `useState` for any field. Its handler was
 *
 *   const handleSave = () => {
 *     toast({ title: "QA Plan Draft Created", ... });
 *     navigate('/dashboard/apps/assurance/qa-plan/register');
 *   };
 *
 * so a user could type a plan title, a department and a full scope
 * statement, press Create Plan, be told the plan was created, and land
 * on a register of six plans that were written into a data file.
 *
 * Nothing existed at all for checkpoints, non-conformances or
 * corrective actions: their buttons toasted "Add checkpoint dialog..."
 * and "Raise NCR form...".
 */
import {
  CHECKPOINT_DECIDED_STATUSES,
  NCR_TERMINAL_STATUSES,
  PLAN_TERMINAL_STATUSES,
  isBlockingPoint,
  isCapaOpen,
  toDateOnlyString,
} from '@/lib/qualityAssurance';

/**
 * Every column a client may write on `qa_plans`. `org_id`, `plan_code`
 * and `created_by` are set by the hook, never by the form.
 */
export const PLAN_WRITABLE_COLUMNS = Object.freeze([
  'title',
  'description',
  'scope',
  'project_ref',
  'asset_id',
  'discipline',
  'department',
  'contractor',
  'status',
  'revision',
  'quality_objective',
  'owner_id',
  'approver_id',
  'approved_date',
  'start_date',
  'end_date',
]);

export const CHECKPOINT_WRITABLE_COLUMNS = Object.freeze([
  'plan_id',
  'item_no',
  'sequence',
  'title',
  'activity',
  'description',
  'point_type',
  'acceptance_criteria',
  'reference_document',
  'responsible_party',
  'verifying_document',
  'planned_date',
  'status',
  'result_date',
  'verified_by',
  'verifier_name',
  'remarks',
]);

export const NCR_WRITABLE_COLUMNS = Object.freeze([
  'plan_id',
  'checkpoint_id',
  'title',
  'description',
  'severity',
  'status',
  'discipline',
  'department',
  'asset_id',
  'supplier',
  'requirement_ref',
  'quantity_affected',
  'raised_by',
  'raised_date',
  'due_date',
  'disposition',
  'disposition_rationale',
  'disposition_approved_by',
  'disposition_date',
  'root_cause',
  'root_cause_category',
  'cost_impact',
  'cost_currency',
  'closed_date',
  'closed_by',
  'closure_notes',
]);

export const CAPA_WRITABLE_COLUMNS = Object.freeze([
  'ncr_id',
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
  'approved_date', 'start_date', 'end_date', 'planned_date', 'result_date',
  'raised_date', 'due_date', 'disposition_date', 'closed_date',
  'effectiveness_due', 'effectiveness_checked_at',
];

const NUMERIC_COLUMNS = ['cost_impact', 'sequence'];

const HOUSEKEEPING = [
  'id', 'org_id', 'plan_code', 'ncr_code', 'created_by', 'created_at', 'updated_at',
  'checkpoints', 'ncrs', 'capas', 'progress',
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

export const buildPlanWrite = (form = {}) => ({
  row: pick({ ...form }, PLAN_WRITABLE_COLUMNS),
  dropped: Object.keys(form).filter(
    (k) => !PLAN_WRITABLE_COLUMNS.includes(k) && !HOUSEKEEPING.includes(k)),
});

export const buildCheckpointWrite = (form = {}) => ({
  row: pick({ ...form }, CHECKPOINT_WRITABLE_COLUMNS),
});

export const buildNcrWrite = (form = {}) => ({
  row: pick({ ...form }, NCR_WRITABLE_COLUMNS),
});

export const buildCapaWrite = (form = {}) => ({
  row: pick({ ...form }, CAPA_WRITABLE_COLUMNS),
});

/** Fallback codes while the next_*_code functions are not deployed yet. */
const nextFromExisting = (rows, field, prefix, year) => {
  const used = rows
    .map((r) => new RegExp(`^${prefix}-${year}-(\\d+)$`, 'i').exec(String(r?.[field] || '')))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}-${year}-${String(next).padStart(3, '0')}`;
};

export const nextPlanCodeFromExisting = (plans = [], year = new Date().getFullYear()) =>
  nextFromExisting(plans, 'plan_code', 'QAP', year);

export const nextNcrCodeFromExisting = (ncrs = [], year = new Date().getFullYear()) =>
  nextFromExisting(ncrs, 'ncr_code', 'NCR', year);

/**
 * Field-level validation, written so the user sees which field is
 * wrong instead of a constraint name. Every rule here mirrors one in
 * migration 20260917500000, which remains the thing that actually
 * enforces it.
 */
export const validatePlan = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'A quality plan needs a title.';
  if (!String(form.scope || '').trim()) {
    errors.scope = 'Say what this plan covers. A plan with no scope cannot be audited against.';
  }
  if (form.start_date && form.end_date
      && toDateOnlyString(form.end_date) < toDateOnlyString(form.start_date)) {
    errors.end_date = 'The plan would end before it starts.';
  }
  return errors;
};

export const validateCheckpoint = (form = {}) => {
  const errors = {};
  if (!String(form.item_no || '').trim()) {
    errors.item_no = 'Give the item a number, so it can be referred to in a report.';
  }
  if (!String(form.title || '').trim()) errors.title = 'An inspection point needs a title.';
  if (!String(form.point_type || '').trim()) errors.point_type = 'Pick the intervention type.';
  if (form.point_type === 'Hold point' && !String(form.acceptance_criteria || '').trim()) {
    // A hold point stops work until somebody decides it has passed.
    // Against what is not optional.
    errors.acceptance_criteria = 'A hold point stops work until it is verified, so it needs '
      + 'acceptance criteria to be verified against.';
  }
  return errors;
};

export const validateNcr = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'A non-conformance needs a title.';
  if (!String(form.description || '').trim()) {
    errors.description = 'Describe the non-conformance: what was found, and where.';
  }
  if (!String(form.severity || '').trim()) errors.severity = 'Pick the severity.';
  if (!String(form.requirement_ref || '').trim()) {
    // A non-conformance is a departure FROM something. Without the
    // requirement it is an opinion.
    errors.requirement_ref = 'Name the requirement this departs from: the specification, '
      + 'drawing, procedure or clause. Without it there is nothing to conform to.';
  }
  if (form.disposition && !form.disposition_date) {
    errors.disposition_date = 'Record the date the disposition was agreed.';
  }
  if (form.closed_date && form.raised_date
      && toDateOnlyString(form.closed_date) < toDateOnlyString(form.raised_date)) {
    errors.closed_date = 'The non-conformance would close before it was raised.';
  }
  return errors;
};

export const validateCapa = (form = {}) => {
  const errors = {};
  if (!String(form.description || '').trim()) {
    errors.description = 'Say what will be done.';
  }
  if (!String(form.action_type || '').trim()) {
    errors.action_type = 'Corrective (fixing this cause) or preventive (stopping it elsewhere)?';
  }
  if (!form.due_date) {
    errors.due_date = 'An action with no due date is not an action.';
  }
  return errors;
};

/**
 * What the form must add before a checkpoint can be marked decided.
 * The database refuses the write; this names the field first.
 */
export const validateCheckpointDecision = (form = {}, checkpoint = null) => {
  const errors = {};
  if (!form.result_date) errors.result_date = 'Record the date this was decided.';
  if (!form.verified_by && !String(form.verifier_name || '').trim()) {
    errors.verifier_name = 'Name who verified it. A hold point that passed with nobody '
      + 'named did not pass.';
  }
  if (form.status === 'Waived' && !String(form.remarks || '').trim()) {
    errors.remarks = 'Say why it is being waived.';
  }
  if (form.status === 'Not applicable' && isBlockingPoint(checkpoint || {})
    && !String(form.remarks || '').trim()) {
    errors.remarks = 'Say why this hold point does not apply.';
  }
  return errors;
};

/* ------------------------------------------------------------------ */
/* AS13 repairs                                                       */
/* ------------------------------------------------------------------ */

/**
 * Does recording `status` on this checkpoint need a verification record
 * (a date and who decided it)? Every decision does. So does setting a
 * HOLD point to Not applicable: it clears the hold for plan closure just
 * as a waiver does, so the engine asks for the same record plus a reason
 * (AS13-0).
 */
export const needsDecisionRecord = (checkpoint, status) =>
  CHECKPOINT_DECIDED_STATUSES.includes(status)
  || (status === 'Not applicable' && isBlockingPoint(checkpoint || {}));

/** Does recording `status` on this checkpoint need a written reason? */
export const needsDecisionReason = (checkpoint, status) =>
  status === 'Waived'
  || (status === 'Not applicable' && isBlockingPoint(checkpoint || {}));

/**
 * The decision patch as it will be written, with the defaults applied.
 *
 * The form's "Verifier, if not you" field means a blank name is the
 * person recording the result. The hook used to run the gate BEFORE it
 * filled that in, so the gate saw no verifier and refused every Passed,
 * Failed and Waived result recorded without a typed name. The defaults
 * are applied here, first, and the gate then judges the real row.
 *
 * AS13 hardening: a HOLD point set to Not applicable gets the same
 * defaults (pass the checkpoint), so the engine's new rule asks the user
 * only for the reason.
 *
 * No user and no typed name leaves the verifier empty, and the gate
 * refuses: nobody is invented.
 */
export const withDecisionDefaults = (
  patch = {}, status, userId, today = new Date(), checkpoint = null,
) => {
  const row = { ...patch };
  if (!needsDecisionRecord(checkpoint, status)) return row;
  if (!row.result_date) row.result_date = toDateOnlyString(today);
  if (String(row.verifier_name || '').trim()) {
    // A named verifier with no Suite login. The name is the record; a
    // verifier id left over from an earlier result would contradict it.
    row.verified_by = null;
  } else if (!row.verified_by && userId) {
    row.verified_by = userId;
  }
  return row;
};

/**
 * Why a plan's inspection and test plan may no longer be changed, or
 * null while it may. A closed, superseded or cancelled plan is a
 * record: its items and results are what it was finished on.
 */
export const planLockReason = (plan) => {
  if (!plan || !PLAN_TERMINAL_STATUSES.includes(plan.status)) return null;
  return `This plan is ${String(plan.status).toLowerCase()}. Its inspection points and `
    + 'results are the record it was finished on and can no longer be changed.';
};

/** The same for a closed or voided non-conformance and its actions. */
export const ncrLockReason = (ncr) => {
  if (!ncr || !NCR_TERMINAL_STATUSES.includes(ncr.status)) return null;
  return `This non-conformance is ${String(ncr.status).toLowerCase()}. Its actions are `
    + 'part of the record and can no longer be changed.';
};

/**
 * Where a non-conformance stands once its disposition is agreed,
 * counted from its corrective and preventive actions:
 *
 *   no live action          Disposition agreed
 *   any action still open   Actions in progress
 *   every action finished   Verification (awaiting the close-out)
 *
 * Before the disposition is agreed (Open, Under investigation) and once
 * it is closed or voided, the status is not the actions' to change.
 * 'Actions in progress' and 'Verification' were offered in the
 * register's filter and never written by anything, so filtering on
 * either always returned nothing.
 */
export const NCR_ACTION_DRIVEN_STATUSES = Object.freeze([
  'Disposition agreed', 'Actions in progress', 'Verification',
]);

export const ncrStatusFromActions = (ncr = {}, capas = []) => {
  if (!NCR_ACTION_DRIVEN_STATUSES.includes(ncr.status)) return ncr.status;
  const live = capas.filter((c) => c.status !== 'Cancelled');
  if (!live.length) return 'Disposition agreed';
  if (live.some(isCapaOpen)) return 'Actions in progress';
  return 'Verification';
};
