/**
 * AS4 — what may actually be written to `documents` and its children.
 *
 * The AS2/AS3 payload precedent. Here it has one extra job, because the
 * old create path wrote a `category` string and a `description` into a
 * table whose column is `category_id` and which, before this wave, had
 * no description column at all. PostgREST rejects an insert naming a
 * column that does not exist, so every attempt to register a document
 * failed at the database.
 *
 * And then `DocumentControlService.saveDocument()` caught that error
 * and returned `{ success: true, data: [{ id: 'new-id', ...docData }] }`
 * with the comment "Mock success". The user was shown "Document saved
 * as draft" and navigated to a library the document was not in. The
 * one write path in a controlled-document system reported success on
 * every failure.
 */
import {
  DEFAULT_REVIEW_PERIOD_MONTHS,
  documentPrefix,
  nextReviewDate,
  toDateOnlyString,
} from '@/lib/documentControl';

/**
 * Every column a client may write on `documents`. `org_id`,
 * `document_number` and `created_by` are set by the hook, not the form.
 */
export const DOCUMENT_WRITABLE_COLUMNS = Object.freeze([
  'title',
  'description',
  'category_id',
  'department',
  'owner_id',
  'status',
  'confidentiality',
  'current_revision',
  'issue_date',
  'next_review_date',
  'review_period_months',
  'superseded_by',
]);

/**
 * Columns added by migration 20260917200000, omitted while it is
 * unapplied. Production applies are owner-run and held, so this is the
 * state the front end ships in.
 */
export const AS4_DOCUMENT_COLUMNS = Object.freeze([
  'description',
  'review_period_months',
  'superseded_by',
]);

export const REVISION_WRITABLE_COLUMNS = Object.freeze([
  'document_id',
  'revision_number',
  'changes_description',
  'file_url',
  'file_name',
  'file_size',
  'file_type',
  'storage_path',
  'status',
  'is_current',
  'created_by',
]);

export const AS4_REVISION_COLUMNS = Object.freeze([
  'storage_path', 'file_type', 'is_current',
]);

const DATE_COLUMNS = ['issue_date', 'next_review_date'];

/** Fields the hook or the database owns, never reported as dropped. */
const HOUSEKEEPING = [
  'id', 'org_id', 'document_number', 'created_by', 'created_at', 'updated_at',
  'category', 'owner', 'revisions', 'doc_categories', 'project_id', 'asset_id',
  'file',
];

const pick = (source, allowed) => {
  const row = {};
  allowed.forEach((col) => {
    let value = source[col];
    if (value === undefined) return;
    // An empty field means "not set", which is null. '' into a date
    // column is a Postgres error, and into a checked text column it
    // fails the vocabulary constraint added in AS4.
    if (value === '') value = null;
    if (value !== null && DATE_COLUMNS.includes(col)) value = toDateOnlyString(value);
    if (value !== null && col === 'review_period_months') {
      const n = Number(value);
      value = Number.isFinite(n) ? Math.round(n) : null;
    }
    row[col] = value;
  });
  return row;
};

/**
 * Build the document row from a form payload.
 *
 * `next_review_date` is DERIVED from the issue date and the review
 * period rather than typed, which is what stops a controlled document
 * going years past review because nobody updated a field.
 */
export const buildDocumentWrite = (form = {}, { hasAs4Columns = true } = {}) => {
  const allowed = hasAs4Columns
    ? DOCUMENT_WRITABLE_COLUMNS
    : DOCUMENT_WRITABLE_COLUMNS.filter((c) => !AS4_DOCUMENT_COLUMNS.includes(c));

  const source = { ...form };
  if (source.issue_date) {
    const derived = nextReviewDate(
      source.issue_date,
      source.review_period_months || DEFAULT_REVIEW_PERIOD_MONTHS,
    );
    if (derived) source.next_review_date = toDateOnlyString(derived);
  }

  return {
    row: pick(source, allowed),
    // Anything the form collected that has no home. `category` is the
    // one that used to be here: the form collected a category NAME and
    // the column is `category_id`, a foreign key into doc_categories.
    dropped: Object.keys(form).filter(
      (k) => !allowed.includes(k) && !HOUSEKEEPING.includes(k),
    ),
  };
};

export const buildRevisionWrite = (form = {}, { hasAs4Columns = true } = {}) => {
  const allowed = hasAs4Columns
    ? REVISION_WRITABLE_COLUMNS
    : REVISION_WRITABLE_COLUMNS.filter((c) => !AS4_REVISION_COLUMNS.includes(c));
  return { row: pick({ ...form }, allowed) };
};

/** The prefix a new document's number is issued under. */
export const prefixFor = (form = {}) => documentPrefix(form.department, form.categoryName);

export const validateDocument = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'A document needs a title.';
  if (!String(form.department || '').trim()) errors.department = 'Pick the owning department.';
  if (!String(form.categoryName || '').trim() && !form.category_id) {
    errors.categoryName = 'Pick a category. It sets the document number prefix.';
  }
  const months = Number(form.review_period_months);
  if (form.review_period_months !== '' && form.review_period_months != null
      && (!Number.isFinite(months) || months < 1 || months > 120)) {
    errors.review_period_months = 'A review period is between 1 and 120 months.';
  }
  return errors;
};

/**
 * Files a controlled document may carry. The old upload box advertised
 * "PDF, DOCX, XLSX up to 50MB" and accepted nothing at all, having no
 * input element behind it. These are the limits actually enforced.
 */
export const ACCEPTED_FILE_TYPES = Object.freeze([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
]);

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const validateFile = (file) => {
  if (!file) return null;
  if (file.size > MAX_FILE_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 50 MB.`;
  }
  if (file.type && !ACCEPTED_FILE_TYPES.includes(file.type)) {
    return 'That file type is not accepted. Use PDF, Word, Excel, PNG or JPEG.';
  }
  return null;
};

/**
 * Where a revision's file lives in the bucket.
 * The leading segment is the org id, so a storage policy can scope on
 * it exactly as every table policy in AS1 scopes on org_id.
 */
export const storagePathFor = (orgId, documentId, revisionId, fileName) => {
  const safe = String(fileName || 'file').replace(/[^A-Za-z0-9._-]/g, '_').slice(-120);
  return `${orgId}/${documentId}/${revisionId}-${safe}`;
};
