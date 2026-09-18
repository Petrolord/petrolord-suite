/**
 * AS6 — what may actually be written to the MOC tables.
 *
 * There was nothing to unpick here, because there was nothing to
 * unpick from. `NewMOC.jsx` had no state at all: not one of its inputs
 * carried a `value` or an `onChange`, and there was no `useState` for
 * any field. Submitting ran `setTimeout(800)` and toasted "Record
 * MOC-2026-090 has been created successfully" with the number written
 * into the string, then navigated to that URL.
 *
 * So a user could fill in a complete change request — the current
 * situation, the proposed change, the justification, the target date —
 * and none of it was even read out of the DOM, let alone saved.
 */
import {
  EXPIRING_TYPES,
  TERMINAL_STAGES,
  parseDateOnly,
  toDateOnlyString,
} from '@/lib/managementOfChange';

/**
 * Every column a client may write on `moc_records`. `org_id`,
 * `moc_code` and `created_by` are set by the hook.
 */
export const MOC_WRITABLE_COLUMNS = Object.freeze([
  'title',
  'description',
  'current_situation',
  'justification',
  'category',
  'type',
  'stage',
  'priority',
  'risk_level',
  'originator_id',
  'owner_id',
  'department',
  'asset_id',
  'target_implementation_date',
  'expiry_date',
  'actual_implementation_date',
  'closure_date',
  'implemented_by',
  'closed_by',
  'rejection_reason',
]);

/** Columns added by migration 20260917400000. */
export const AS6_MOC_COLUMNS = Object.freeze([
  'current_situation', 'implemented_by', 'closed_by', 'rejection_reason',
]);

export const APPROVAL_WRITABLE_COLUMNS = Object.freeze([
  'moc_id', 'approver_id', 'role', 'level', 'status', 'comments', 'decision_date',
]);

export const ACTION_WRITABLE_COLUMNS = Object.freeze([
  'moc_id', 'action_type', 'description', 'assigned_to', 'due_date',
  'status', 'completed_at', 'closure_comments',
]);

export const IMPACT_WRITABLE_COLUMNS = Object.freeze([
  'moc_id', 'impact_area', 'description', 'severity', 'mitigation',
]);

const DATE_COLUMNS = ['target_implementation_date', 'expiry_date', 'due_date'];

const HOUSEKEEPING = [
  'id', 'org_id', 'moc_code', 'created_by', 'created_at', 'updated_at',
  'approvals', 'actions', 'impacts', 'reviews', 'comments',
];

const pick = (source, allowed) => {
  const row = {};
  allowed.forEach((col) => {
    let value = source[col];
    if (value === undefined) return;
    if (value === '') value = null;
    if (value !== null && DATE_COLUMNS.includes(col)) value = toDateOnlyString(value);
    if (value !== null && col === 'level') {
      const n = Number(value);
      value = Number.isFinite(n) ? Math.round(n) : 1;
    }
    row[col] = value;
  });
  return row;
};

export const buildMocWrite = (form = {}, { hasAs6Columns = true } = {}) => {
  const allowed = hasAs6Columns
    ? MOC_WRITABLE_COLUMNS
    : MOC_WRITABLE_COLUMNS.filter((c) => !AS6_MOC_COLUMNS.includes(c));
  return {
    row: pick({ ...form }, allowed),
    dropped: Object.keys(form).filter(
      (k) => !allowed.includes(k) && !HOUSEKEEPING.includes(k)),
  };
};

export const buildApprovalWrite = (form = {}) => ({
  row: pick({ ...form }, APPROVAL_WRITABLE_COLUMNS),
});

export const buildActionWrite = (form = {}) => ({
  row: pick({ ...form }, ACTION_WRITABLE_COLUMNS),
});

export const buildImpactWrite = (form = {}) => ({
  row: pick({ ...form }, IMPACT_WRITABLE_COLUMNS),
});

/** Fallback code while next_moc_code is not deployed yet. */
export const nextCodeFromExisting = (records = [], year = new Date().getFullYear()) => {
  const prefix = `MOC-${year}`;
  const used = records
    .map((m) => new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(String(m.moc_code || '')))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
};

export const validateMoc = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'A change needs a title.';
  if (!String(form.type || '').trim()) errors.type = 'Pick the change type.';
  if (!String(form.category || '').trim()) errors.category = 'Pick a category.';
  if (!String(form.description || '').trim()) {
    errors.description = 'Describe exactly what will be changed.';
  }
  // The database refuses a temporary change past Draft without an expiry
  // date. AS13: the form now asks for it at Save draft as well, because
  // a draft saved without one could not leave Draft afterwards, not even
  // to Cancelled. (Drafts saved before this can add it on the change's
  // page: see validateExpiryEdit.)
  if (EXPIRING_TYPES.includes(form.type) && !parseDateOnly(form.expiry_date)) {
    errors.expiry_date = `A ${String(form.type).toLowerCase()} change needs an expiry date, `
      + 'even as a draft. Without one it is a permanent change nobody decided to make.';
  }
  if (form.target_implementation_date && form.expiry_date
      && toDateOnlyString(form.expiry_date) < toDateOnlyString(form.target_implementation_date)) {
    errors.expiry_date = 'The change would expire before it is implemented.';
  }
  return errors;
};

export const validateAction = (form = {}) => {
  const errors = {};
  if (!String(form.description || '').trim()) errors.description = 'An action needs a description.';
  if (!String(form.action_type || '').trim()) errors.action_type = 'Say when this action falls due.';
  return errors;
};

export const validateImpact = (form = {}) => {
  const errors = {};
  if (!String(form.impact_area || '').trim()) errors.impact_area = 'Name the area affected.';
  return errors;
};

/**
 * AS13: why a change may no longer be changed, or null while it may.
 * A Closed, Rejected or Cancelled change is a record.
 */
export const mocLockReason = (moc) => {
  if (!moc || !TERMINAL_STAGES.includes(moc.stage)) return null;
  return `This change is ${String(moc.stage).toLowerCase()}. Its approval gates, decisions, `
    + 'actions and impacts are the record it finished on and can no longer be changed.';
};

/**
 * AS13: may the expiry date be set to `value` from the change's page?
 * Only on a temporary or emergency change, only in Draft, and only to a
 * readable date that is not before the target implementation date.
 * Returns the reason it may not, or null.
 */
export const validateExpiryEdit = (moc = {}, value) => {
  if (!EXPIRING_TYPES.includes(moc.type)) {
    return 'Only a temporary or emergency change has an expiry date.';
  }
  if (moc.stage !== 'Draft') {
    return 'The expiry date can only be changed while the change is in Draft. After that it '
      + 'is part of what was screened and approved.';
  }
  if (!parseDateOnly(value)) return 'Pick the date this change must be reverted by.';
  if (moc.target_implementation_date
      && toDateOnlyString(value) < toDateOnlyString(moc.target_implementation_date)) {
    return 'The change would expire before it is implemented.';
  }
  return null;
};
