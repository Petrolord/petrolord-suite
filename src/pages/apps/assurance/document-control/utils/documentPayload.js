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
  // Derived from the document's OWN review period. With no period on
  // the row (a document published before migration 20260917200000, or
  // one whose period was never recorded) the review date already on it
  // is kept: re-deriving it on the 24-month default is how Edit details
  // used to move a 12-month document's review date a year later (AS13).
  // The default applies only when there is neither a period nor a date.
  if (source.issue_date) {
    const own = Number(source.review_period_months);
    const hasOwnPeriod = source.review_period_months !== '' && source.review_period_months != null
      && Number.isFinite(own) && own > 0;
    if (hasOwnPeriod || !source.next_review_date) {
      const derived = nextReviewDate(
        source.issue_date,
        hasOwnPeriod ? own : DEFAULT_REVIEW_PERIOD_MONTHS,
      );
      if (derived) source.next_review_date = toDateOnlyString(derived);
    }
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

/**
 * AS4 values a form actually carries, by label, for the message a save
 * returns when it went through without migration 20260917200000. A
 * review period left at the default is not counted: without the column
 * the default is what the app uses anyway.
 */
export const as4ValuesEntered = (form = {}) => {
  const labels = [];
  if (String(form.description ?? '').trim()) labels.push('purpose');
  const months = form.review_period_months;
  if (months !== '' && months != null && Number(months) !== DEFAULT_REVIEW_PERIOD_MONTHS) {
    labels.push('review period');
  }
  if (form.superseded_by) labels.push('superseding document');
  return labels;
};

/** Said on a save that could not store AS4 values. Never a plain success. */
export const as4SchemaMessage = (labels = []) => {
  const list = labels.length > 1
    ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
    : labels[0];
  return `Saved without the ${list}: this database does not have the document control update yet (migration 20260917200000), so ${labels.length > 1 ? 'they were' : 'it was'} not stored. Ask your administrator to apply it.`;
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

/*
 * AS13 — the review workflow.
 *
 * Nothing in the app could put a revision in the approval queue:
 * `doc_workflows` was read and updated and never inserted into, and
 * "Submit for review" only set the document's status to In Review. A
 * decision in the queue then changed the workflow row and nothing else,
 * so an approved document stayed In Review; Publish was offered on a
 * Draft, In Review or Rejected document alike; and a Published document
 * could never be published again, so a revision could never reset its
 * issue and review dates.
 *
 * The rules below are the whole workflow:
 *
 *   A review is requested against the CURRENT revision, with one or more
 *   named reviewers. Each reviewer gets a Pending row in doc_workflows.
 *   Any rejection rejects the revision. The revision is approved when
 *   every reviewer has approved it. Publish is offered only for an
 *   approved revision, and publishing it re-issues the document, which
 *   resets the issue date and the review date. A revision of a document
 *   already Published goes through the same review while the issued
 *   revision stays in force: the document's own status stays Published
 *   until the new revision is published.
 */

/** Suggested roles; the column is free text and any role is accepted. */
export const REVIEW_ROLES = Object.freeze(['Reviewer', 'Approver', 'Technical Authority']);

/** Document statuses that end a document's life. */
export const WITHDRAWN_STATUSES = Object.freeze(['Superseded', 'Obsolete']);

/** The revision a review or a publish acts on. */
export const currentRevisionOf = (doc = {}) => {
  const revs = doc.revisions || [];
  if (!revs.length) return null;
  const flagged = revs.find((r) => r.is_current);
  if (flagged) return flagged;
  const byNumber = revs.find((r) => r.revision_number === doc.current_revision);
  if (byNumber) return byNumber;
  return [...revs].sort((a, b) => String(b.revision_number).localeCompare(String(a.revision_number)))[0];
};

export const validateReviewers = (reviewers = []) => {
  const chosen = reviewers.filter((r) => r && r.reviewer_id);
  if (!chosen.length) return 'Choose at least one reviewer.';
  if (chosen.some((r) => !String(r.role || '').trim())) return 'Give every reviewer a role.';
  const ids = chosen.map((r) => r.reviewer_id);
  if (new Set(ids).size !== ids.length) return 'Each person can be a reviewer once.';
  return null;
};

/** One Pending doc_workflows row per reviewer. */
export const buildWorkflowRows = (revisionId, reviewers = [], dueDate = null) => reviewers
  .filter((r) => r && r.reviewer_id)
  .map((r) => ({
    revision_id: revisionId,
    reviewer_id: r.reviewer_id,
    role: String(r.role).trim(),
    status: 'Pending',
    due_date: dueDate ? toDateOnlyString(dueDate) : null,
  }));

/**
 * AS13 hardening: review ROUNDS.
 *
 * Every Submit for review is a new round: one insert of one Pending
 * task per reviewer, so every task in a round carries the same
 * created_at (Postgres's now() is the transaction time). A revision can
 * be reviewed more than once, most often when it was rejected and is
 * sent again, and the outcome of a round is decided by that round's
 * tasks alone. Computing it over every task ever raised on the
 * revision meant one old rejection rejected every later round: a
 * rejected revision could never be approved.
 *
 * Tasks still Pending when their round is decided are set to Closed,
 * which doc_workflows.status (free text, no check constraint) allows.
 * A Closed task records that no decision was needed from that reviewer.
 */
export const CLOSED_TASK_STATUS = 'Closed';

const roundKey = (w) => {
  const t = Date.parse(w?.created_at);
  return Number.isFinite(t) ? t : String(w?.created_at ?? '');
};

const later = (a, b) => (typeof a === 'number' && typeof b === 'number'
  ? a > b
  : String(a) > String(b));

/** The tasks raised in the same Submit for review as `task`. */
export const roundOf = (workflows = [], task) => {
  if (!task) return [];
  const key = roundKey(task);
  return workflows.filter((w) => w.revision_id === task.revision_id && roundKey(w) === key);
};

/** The tasks of the latest review round on a revision. */
export const currentRoundOf = (workflows = [], revisionId) => {
  const mine = workflows.filter((w) => w.revision_id === revisionId);
  if (!mine.length) return [];
  const latest = mine.reduce((best, w) => (later(roundKey(w), roundKey(best)) ? w : best));
  return roundOf(mine, latest);
};

/**
 * Where a round stands once its reviewers have spoken. Any rejection
 * rejects it; it is approved only when every reviewer approved; anything
 * else is still in review. Closed tasks carry no decision and are left
 * out. Pass ONE round's tasks (roundOf or currentRoundOf).
 */
export const reviewOutcome = (workflows = []) => {
  const live = workflows.filter((w) => w.status !== CLOSED_TASK_STATUS);
  if (!live.length) return 'In Review';
  if (live.some((w) => w.status === 'Rejected')) return 'Rejected';
  if (live.every((w) => w.status === 'Approved')) return 'Approved';
  return 'In Review';
};

/** The Pending tasks a decided round leaves behind, to be closed. */
export const tasksToClose = (round = [], outcome) => (outcome === 'In Review'
  ? []
  : round.filter((w) => w.status === 'Pending'));

/**
 * The document's status after a review outcome on its current revision.
 * A Published document keeps its status: the issued revision is still
 * the one in force until the new one is published.
 */
export const documentStatusAfterReview = (doc = {}, outcome) =>
  (doc.status === 'Published' ? 'Published' : outcome);

/**
 * The Pending tasks of the current revision's latest round, while that
 * round is undecided. Pending tasks left over in a decided round (from
 * before a decided round closed its own tasks) do not hold the document
 * up.
 */
export const pendingReviewTasks = (revision, workflows = []) => {
  if (!revision) return [];
  const round = currentRoundOf(workflows, revision.id);
  if (reviewOutcome(round) !== 'In Review') return [];
  return round.filter((w) => w.status === 'Pending');
};

const hasPendingReview = (revision, workflows = []) =>
  pendingReviewTasks(revision, workflows).length > 0;

/** Can the current revision be sent for review? */
export const canSubmitForReview = (doc = {}, workflows = []) => {
  if (WITHDRAWN_STATUSES.includes(doc.status)) return false;
  const rev = currentRevisionOf(doc);
  if (!rev) return false;
  if (hasPendingReview(rev, workflows)) return false;
  return !['Approved', 'Published'].includes(rev.status);
};

/**
 * Can the document be published? Only with a review decision behind it:
 * the current revision approved (or, for a document with no revision
 * rows at all, the document itself Approved).
 */
export const canPublish = (doc = {}) => {
  if (WITHDRAWN_STATUSES.includes(doc.status)) return false;
  const rev = currentRevisionOf(doc);
  if (rev) return rev.status === 'Approved';
  return doc.status === 'Approved';
};

/** A new revision cannot start while the current one is out for review. */
export const canStartRevision = (doc = {}, workflows = []) => {
  if (WITHDRAWN_STATUSES.includes(doc.status)) return false;
  return !hasPendingReview(currentRevisionOf(doc), workflows);
};

export const validateRetirement = ({ status, superseded_by } = {}, doc = {}) => {
  if (!WITHDRAWN_STATUSES.includes(status)) return 'Choose Superseded or Obsolete.';
  if (status === 'Superseded') {
    if (!superseded_by) return 'Choose the document that supersedes this one.';
    if (superseded_by === doc.id) return 'A document cannot supersede itself.';
  }
  return null;
};
