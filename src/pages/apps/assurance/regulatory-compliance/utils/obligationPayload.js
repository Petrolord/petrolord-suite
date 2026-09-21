/**
 * AS3 — what may actually be written to the regulatory tables.
 *
 * The AS2 riskPayload precedent, for the same reason. The risk
 * register's create flow was broken outright because the form collected
 * columns that did not exist. Regulatory Compliance was worse: its
 * form did not exist at all. `NewCompliance.jsx` rendered "New
 * compliance creation form will be implemented here", the Add Obligation
 * button in the app header navigated straight to it, and every other
 * control in the app answered a click with a toast saying the feature
 * was not implemented. `addRecord` and `addRegulator` were written, and
 * nothing in the UI ever called either one. The app could read a
 * register it gave nobody any way to fill.
 *
 * So this module is the whole contract between a form and the database,
 * and it refuses to invent a column.
 */
import { DEFAULT_LEAD_TIME_DAYS, deriveStatus, toDateOnlyString } from '@/lib/complianceStatus';

/**
 * Every column a client may write on regulatory_obligations.
 * `org_id`, `obligation_code` and `created_by` are set by the hook, not
 * by the form, so they are not here.
 */
export const OBLIGATION_WRITABLE_COLUMNS = Object.freeze([
  'title',
  'description',
  'authority_id',
  'owner_id',
  'facility',
  'regime',
  'obligation_type',
  'jurisdiction',
  'reference',
  'frequency',
  'lifecycle',
  'due_date',
  'effective_date',
  'expiry_date',
  'last_submitted_date',
  'lead_time_days',
  'consequence',
  'notes',
  'status',
]);

/**
 * Columns added by migration 20260917100000, omitted while it is
 * unapplied. Production applies are owner-run and held, so this is the
 * state the front end ships in: the app has to work against the old
 * five-column table and the new one, on the AS2 precedent.
 */
export const AS3_OBLIGATION_COLUMNS = Object.freeze([
  'description',
  'regime',
  'obligation_type',
  'jurisdiction',
  'reference',
  'frequency',
  'lifecycle',
  'effective_date',
  'expiry_date',
  'last_submitted_date',
  'lead_time_days',
  'consequence',
  'notes',
]);

export const AUTHORITY_WRITABLE_COLUMNS = Object.freeze([
  'name',
  'acronym',
  'jurisdiction',
  'contact_name',
  'email',
  'phone',
  'website',
  'notes',
]);

export const AS3_AUTHORITY_COLUMNS = Object.freeze(['website', 'notes']);

const DATE_COLUMNS = ['due_date', 'effective_date', 'expiry_date', 'last_submitted_date'];

/** Columns the hook or the database owns; never dropped-field warnings. */
const HOUSEKEEPING = [
  'id', 'org_id', 'obligation_code', 'created_by', 'created_at', 'updated_at',
  'authority', 'owner', 'evidence',
];

const pick = (source, allowed) => {
  const row = {};
  allowed.forEach((col) => {
    let value = source[col];
    if (value === undefined) return;
    // An empty form field means "not set", which is null, not ''. A
    // '' into a date column is a Postgres error, and into a checked
    // text column it fails the vocabulary constraint.
    if (value === '') value = null;
    if (value !== null && DATE_COLUMNS.includes(col)) value = toDateOnlyString(value);
    if (value !== null && col === 'lead_time_days') {
      const n = Number(value);
      value = Number.isFinite(n) ? Math.round(n) : null;
    }
    row[col] = value;
  });
  return row;
};

/**
 * Build the obligation row from a form payload.
 *
 * `status` is DERIVED here and written as a cache, never taken from the
 * form. The user sets `lifecycle`; src/lib/complianceStatus.js decides
 * what that plus the dates means. This is the same treatment AS2 gives
 * risk_register.rating, and it is why the register can no longer show
 * "Compliant" on a permit that expired last month.
 */
export const buildObligationWrite = (form = {}, { hasAs3Columns = true, today } = {}) => {
  const allowed = hasAs3Columns
    ? OBLIGATION_WRITABLE_COLUMNS
    : OBLIGATION_WRITABLE_COLUMNS.filter((c) => !AS3_OBLIGATION_COLUMNS.includes(c));

  const row = pick({ ...form }, allowed);
  row.status = deriveStatus({ ...form }, today || new Date());

  return {
    row,
    // Anything the form collected that has no home. Empty today; it
    // exists so the next field someone adds fails loudly in a test
    // rather than silently at the database, which is exactly how the
    // risk register's create flow came to be broken for everyone.
    dropped: Object.keys(form).filter(
      (k) => !allowed.includes(k) && !HOUSEKEEPING.includes(k),
    ),
  };
};

export const buildAuthorityWrite = (form = {}, { hasAs3Columns = true } = {}) => {
  const allowed = hasAs3Columns
    ? AUTHORITY_WRITABLE_COLUMNS
    : AUTHORITY_WRITABLE_COLUMNS.filter((c) => !AS3_AUTHORITY_COLUMNS.includes(c));
  return {
    row: pick({ ...form }, allowed),
    dropped: Object.keys(form).filter(
      (k) => !allowed.includes(k)
        && !['id', 'org_id', 'created_by', 'created_at', 'updated_at'].includes(k),
    ),
  };
};

/**
 * AS13 hardening: what a save without migration 20260917100000 loses.
 *
 * The schema used to be detected only from the columns of a loaded row,
 * so an EMPTY register (the first use of every organization) was
 * assumed to have the new schema, the full form was offered, the insert
 * failed on an unknown column, and the retry dropped the AS3 fields and
 * reported "Obligation created". These helpers name what was dropped so
 * the save is never reported as a plain success.
 *
 * Values left at the form's defaults are not counted: without the
 * column the default is what the app assumes anyway.
 */
const AS3_OBLIGATION_LABELS = {
  description: 'what it requires',
  regime: 'regime',
  obligation_type: 'type',
  jurisdiction: 'jurisdiction',
  reference: 'permit or licence number',
  frequency: 'frequency',
  lifecycle: 'lifecycle',
  effective_date: 'in force from date',
  expiry_date: 'expiry date',
  last_submitted_date: 'last submission date',
  lead_time_days: 'warning lead time',
  consequence: 'consequence of breach',
  notes: 'notes',
};

export const AS3_FORM_DEFAULTS = Object.freeze({
  frequency: 'Annual',
  lifecycle: 'Active',
  lead_time_days: DEFAULT_LEAD_TIME_DAYS,
});

const entered = (form, col) => {
  const v = form[col];
  if (v === undefined || v === null || String(v).trim() === '') return false;
  const d = AS3_FORM_DEFAULTS[col];
  return d === undefined || String(v) !== String(d);
};

export const as3ValuesEntered = (form = {}) => AS3_OBLIGATION_COLUMNS
  .filter((c) => entered(form, c))
  .map((c) => AS3_OBLIGATION_LABELS[c] || c);

export const as3AuthorityValuesEntered = (form = {}) => AS3_AUTHORITY_COLUMNS
  .filter((c) => entered(form, c));

/** Said on a save that could not store AS3 values. Never a plain success. */
export const as3SchemaMessage = (labels = []) => {
  const list = labels.length > 1
    ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
    : labels[0];
  return `Saved without the ${list}: this database does not have the compliance update yet (migration 20260917100000), so ${labels.length > 1 ? 'they were' : 'it was'} not stored. Ask your administrator to apply it.`;
};

/**
 * Fallback code while next_obligation_code is not deployed yet. The
 * caller retries on a unique violation, because two people filing at
 * the same moment both read the same maximum.
 */
export const nextCodeFromExisting = (obligations = []) => {
  const numbers = obligations
    .map((o) => /^REG-(\d+)$/i.exec(String(o.obligation_code || '')))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (numbers.length ? Math.max(...numbers) : 1000) + 1;
  return `REG-${String(next).padStart(4, '0')}`;
};

/** A required-field check the form runs before it tries to write. */
export const validateObligation = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'An obligation needs a title.';
  if (!form.due_date && !form.expiry_date) {
    errors.due_date = 'Set a due date, an expiry date, or both. Without one, nothing can fall due.';
  }
  if (form.effective_date && form.expiry_date
      && toDateOnlyString(form.effective_date) > toDateOnlyString(form.expiry_date)) {
    errors.expiry_date = 'The expiry date is before the effective date.';
  }
  return errors;
};

export const validateAuthority = (form = {}) => {
  const errors = {};
  if (!String(form.name || '').trim()) errors.name = 'A regulator needs a name.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'That does not look like an email address.';
  }
  return errors;
};
