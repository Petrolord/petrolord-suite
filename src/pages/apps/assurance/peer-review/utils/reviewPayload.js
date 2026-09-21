/**
 * AS5 — what may actually be written to the peer review tables.
 *
 * The AS2/AS3/AS4 payload precedent, and here it also has to unpick a
 * shape that was never a database row at all. `PeerReviewService.
 * saveReview()` built an object carrying `team`, `deliverables` and
 * `attachments` arrays and `coordinator`, `lead_reviewer` and `author`
 * as free-text names, and pushed it onto a module-level array. None of
 * those are columns: the table has `coordinator_id`, `lead_reviewer_id`
 * and `author_id`, all uuids, and the roster only got a table in AS5.
 *
 * So had that write ever reached PostgREST it would have been rejected
 * outright. It never did, which is why nobody noticed.
 */
import { ACTIVE_STAGES, STAGES, toDateOnlyString } from '@/lib/peerReview';

/**
 * Every column a client may write on `peer_reviews`. `org_id`,
 * `review_code` and `created_by` are set by the hook.
 */
export const REVIEW_WRITABLE_COLUMNS = Object.freeze([
  'title',
  'review_type',
  'project_asset',
  'department',
  'discipline',
  'coordinator_id',
  'lead_reviewer_id',
  'author_id',
  'stage',
  'priority',
  'due_date',
  'decision',
  'scope_description',
  'closed_at',
  'decided_at',
  'decided_by',
]);

/** Columns added by migration 20260917300000. */
export const AS5_REVIEW_COLUMNS = Object.freeze(['closed_at', 'decided_at', 'decided_by']);

export const COMMENT_WRITABLE_COLUMNS = Object.freeze([
  'review_id',
  'author_id',
  'comment_text',
  'severity',
  'status',
  'discipline',
  'response_text',
  'responded_by',
  'responded_at',
  'verified_by',
  'verified_at',
]);

export const PARTICIPANT_WRITABLE_COLUMNS = Object.freeze([
  'review_id',
  'user_id',
  'display_name',
  'role',
  'discipline',
]);

const DATE_COLUMNS = ['due_date'];

/**
 * Fields the form carries that are not columns. Named rather than
 * silently dropped, so the next one somebody adds shows up in a test.
 */
const HOUSEKEEPING = [
  'id', 'org_id', 'review_code', 'created_by', 'created_at', 'updated_at',
  'comments', 'participants', 'audit',
];

const pick = (source, allowed) => {
  const row = {};
  allowed.forEach((col) => {
    let value = source[col];
    if (value === undefined) return;
    if (value === '') value = null;
    if (value !== null && DATE_COLUMNS.includes(col)) value = toDateOnlyString(value);
    row[col] = value;
  });
  return row;
};

export const buildReviewWrite = (form = {}, { hasAs5Columns = true } = {}) => {
  const allowed = hasAs5Columns
    ? REVIEW_WRITABLE_COLUMNS
    : REVIEW_WRITABLE_COLUMNS.filter((c) => !AS5_REVIEW_COLUMNS.includes(c));
  return {
    row: pick({ ...form }, allowed),
    dropped: Object.keys(form).filter(
      (k) => !allowed.includes(k) && !HOUSEKEEPING.includes(k)),
  };
};

export const buildCommentWrite = (form = {}) => ({
  row: pick({ ...form }, COMMENT_WRITABLE_COLUMNS),
});

export const buildParticipantWrite = (form = {}) => ({
  row: pick({ ...form }, PARTICIPANT_WRITABLE_COLUMNS),
});

/** Fallback code while next_peer_review_code is not deployed yet. */
export const nextCodeFromExisting = (reviews = [], year = new Date().getFullYear()) => {
  const prefix = `PR-${year}`;
  const used = reviews
    .map((r) => new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(String(r.review_code || '')))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
};

export const validateReview = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'A review needs a title.';
  if (!String(form.review_type || '').trim()) errors.review_type = 'Pick what kind of review this is.';
  if (!String(form.project_asset || '').trim()) {
    errors.project_asset = 'Name the project or asset being reviewed.';
  }
  if (!form.due_date) {
    errors.due_date = 'Set a target date, or nothing can ever be reported as overdue.';
  }
  return errors;
};

export const validateComment = (form = {}) => {
  const errors = {};
  if (!String(form.comment_text || '').trim()) {
    errors.comment_text = 'A comment needs its text.';
  }
  return errors;
};

/**
 * AS13: why a review may no longer be changed, or null while it may.
 * A Closed or Cancelled review is the record of what was raised and how
 * it was answered: new comments and dispositions on it rewrote that
 * record after the fact.
 */
const FINAL_STAGES = STAGES.filter((s) => !ACTIVE_STAGES.includes(s));

export const reviewLockReason = (review) => {
  if (!review || !FINAL_STAGES.includes(review.stage)) return null;
  return `This review is ${String(review.stage).toLowerCase()}. Its comments and their `
    + 'dispositions are the record it finished on and can no longer be changed.';
};
