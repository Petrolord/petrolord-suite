/**
 * AS9 — what may actually be written to the lesson_* tables.
 *
 * There was nothing to unpick. `NewLesson.jsx` had no state at all:
 * not one of its six fields carried a `value` or an `onChange`, and
 * there was no `useState` anywhere in the file. Its handler was
 *
 *   const handleSave = () => {
 *     toast({ title: "Draft Saved",
 *             description: "Lesson draft has been saved successfully." });
 *     navigate('/dashboard/apps/assurance/lessons-learned');
 *   };
 *
 * so a user could write out an incident, its root cause and its
 * recommendation, press Save Draft, be told the draft had been saved
 * successfully, and land on a dashboard of five invented lessons.
 */
import { toDateOnlyString } from '@/lib/lessonsLearned';

/** `org_id`, `lesson_code` and `created_by` are set by the hook. */
export const LESSON_WRITABLE_COLUMNS = Object.freeze([
  'title',
  'description',
  'root_cause',
  'root_cause_category',
  'recommendation',
  'consequence',
  'category',
  'discipline',
  'department',
  'project_ref',
  'asset_id',
  'event_date',
  'source_type',
  'source_reference',
  'applicability_scope',
  'status',
  'author_id',
  'author_name',
  'owner_id',
  'validated_by',
  'validator_name',
  'validated_at',
  'published_at',
  'review_due',
  'archive_reason',
  'superseded_by',
  'keywords',
]);

export const APPLICATION_WRITABLE_COLUMNS = Object.freeze([
  'lesson_id',
  'target_type',
  'target_risk_id',
  'target_moc_id',
  'reference',
  'outcome',
  'notes',
  'applied_by',
  'applied_by_name',
  'applied_on',
]);

const DATE_COLUMNS = [
  'event_date', 'validated_at', 'published_at', 'review_due', 'applied_on',
];

const HOUSEKEEPING = [
  'id', 'org_id', 'lesson_code', 'created_by', 'created_at', 'updated_at',
  'applications', 'reuse',
];

const pick = (source, allowed) => {
  const row = {};
  allowed.forEach((col) => {
    let value = source[col];
    if (value === undefined) return;
    if (typeof value === 'string' && value.trim() === '') value = null;
    if (value !== null && DATE_COLUMNS.includes(col)) value = toDateOnlyString(value);
    row[col] = value;
  });
  return row;
};

const build = (allowed) => (form = {}) => ({
  row: pick({ ...form }, allowed),
  dropped: Object.keys(form).filter(
    (k) => !allowed.includes(k) && !HOUSEKEEPING.includes(k)),
});

export const buildLessonWrite = build(LESSON_WRITABLE_COLUMNS);
export const buildApplicationWrite = build(APPLICATION_WRITABLE_COLUMNS);

/** Used only when `next_lesson_code` is not deployed yet. */
export const nextLessonCodeFromExisting = (lessons = [], year = new Date().getFullYear()) => {
  const re = new RegExp(`^LL-${year}-(\\d+)$`);
  const max = lessons.reduce((acc, l) => {
    const m = re.exec(l?.lesson_code || '');
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `LL-${year}-${String(max + 1).padStart(3, '0')}`;
};

/* ------------------------------------------------------------------ */
/* Validation: what a form must carry before the database sees it      */
/* ------------------------------------------------------------------ */

export const validateLesson = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) {
    errors.title = 'What is this lesson called? One line somebody searching would recognise.';
  }
  if (!String(form.description || '').trim()) {
    errors.description = 'What happened?';
  }
  if (form.applicability_scope === 'Industry-wide'
      && !String(form.recommendation || '').trim()) {
    errors.recommendation = 'A lesson offered to the whole industry needs a recommendation.';
  }
  return errors;
};

export const validateApplication = (form = {}) => {
  const errors = {};
  if (!form.target_type) errors.target_type = 'What was this lesson applied to?';
  if (form.target_type === 'Risk register' && !form.target_risk_id) {
    errors.target_risk_id = 'Pick the risk, or raise a new one from this lesson.';
  }
  if (form.target_type === 'Management of change' && !form.target_moc_id) {
    errors.target_moc_id = 'Pick the change record, or raise a new one from this lesson.';
  }
  if (!['Risk register', 'Management of change'].includes(form.target_type)
      && !String(form.reference || '').trim()) {
    errors.reference = 'Name what changed, so somebody can go and look at it.';
  }
  if (form.outcome === 'Rejected' && !String(form.notes || '').trim()) {
    errors.notes = 'Say why it was not adopted.';
  }
  if (!form.applied_on) errors.applied_on = 'When was this done?';
  return errors;
};

/** The form that raises a risk on the register FROM a lesson. */
export const validateRiskPush = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'Name the risk.';
  if (!String(form.category || '').trim()) errors.category = 'Which category?';
  const scaled = (v) => Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 5;
  if (!scaled(form.likelihood)) errors.likelihood = 'Likelihood is 1 to 5.';
  if (!scaled(form.impact)) errors.impact = 'Impact is 1 to 5.';
  return errors;
};

/** The form that raises a change request FROM a lesson. */
export const validateMocPush = (form = {}) => {
  const errors = {};
  if (!String(form.title || '').trim()) errors.title = 'Name the change.';
  if (!String(form.category || '').trim()) errors.category = 'Which category?';
  if (!String(form.type || '').trim()) errors.type = 'Permanent, temporary or emergency?';
  if (!String(form.justification || '').trim()) {
    errors.justification = 'Why is this change needed? The lesson is the answer; write it here.';
  }
  return errors;
};

/* ------------------------------------------------------------------ */
/* AS13: what the pages and the hook check before a write              */
/* ------------------------------------------------------------------ */

/**
 * Who wrote this lesson.
 *
 * "Author (leave blank to record yourself)": a blank author is the
 * signed-in user, by id AND by name, so the lesson page and the exports
 * name them (AS9 stored the id only and showed "Not set"). A picked
 * Suite member is that member. A typed name is somebody without an
 * account, and the capturing user is not recorded as its author: AS9
 * set author_id to the capturing user whatever was typed, so the
 * independence check guarded the wrong person.
 */
export const withAuthor = (form = {}, userId = null, selfName = null) => {
  const typed = String(form.author_name || '').trim();
  if (form.author_id) return { ...form, author_name: typed || null };
  if (typed) return { ...form, author_id: null, author_name: typed };
  return { ...form, author_id: userId || null, author_name: selfName || null };
};

/**
 * Lessons that may replace this one: any other lesson in the register
 * that is not itself retired, and not one this lesson already replaces.
 */
export const successorCandidates = (lesson = {}, lessons = []) => lessons.filter((l) =>
  l.id !== lesson.id
  && !['Archived', 'Superseded'].includes(l.status)
  && l.superseded_by !== lesson.id);

/**
 * Editing what a lesson says.
 *
 * A Validated lesson that is edited goes back to Submitted with its
 * validation cleared: the validator accepted the words that were there,
 * not the new ones. A Published or Embedded lesson is not edited in
 * place, because the workflow has no way back from Published; it is
 * replaced by a new lesson and marked Superseded. AS9 let any of them
 * be rewritten and kept the validation.
 */
export const LESSON_EDIT_LOCKED_STATUSES = Object.freeze(['Published', 'Embedded', 'Archived', 'Superseded']);

export const canEditLesson = (lesson = {}) => {
  if (LESSON_EDIT_LOCKED_STATUSES.includes(lesson.status)) {
    return {
      ok: false,
      reason: ['Archived', 'Superseded'].includes(lesson.status)
        ? `A ${String(lesson.status).toLowerCase()} lesson is final.`
        : `This lesson is ${String(lesson.status).toLowerCase()}, so everyone may already be working from it. To change what it says, capture a new lesson and mark this one Superseded by it.`,
    };
  }
  return { ok: true };
};

export const editedLesson = (lesson = {}, edits = {}) => {
  const next = { ...lesson, ...edits };
  if (lesson.status !== 'Validated') return next;
  return {
    ...next,
    status: 'Submitted',
    validated_at: null,
    validated_by: null,
    validator_name: null,
  };
};

/**
 * May this lesson be deleted?
 *
 * Only one that was never accepted and never applied: a Draft or a
 * Submitted lesson with no validation and no applications. Anything
 * else is archived with a reason, which is the rule AS9 states and its
 * one-click delete went round.
 */
export const canDeleteLesson = (lesson = {}, applications = []) => {
  const code = lesson.lesson_code || 'This lesson';
  if (!['Draft', 'Submitted'].includes(lesson.status) || lesson.validated_at) {
    return {
      ok: false,
      reason: `${code} is ${String(lesson.status).toLowerCase()}. Only a draft or submitted lesson that was never validated can be deleted. Archive it with a reason instead.`,
    };
  }
  if (applications.length) {
    return {
      ok: false,
      reason: `${code} has ${applications.length} application${applications.length === 1 ? '' : 's'} recorded, and deleting it would delete them. Archive it with a reason instead.`,
    };
  }
  return { ok: true };
};
