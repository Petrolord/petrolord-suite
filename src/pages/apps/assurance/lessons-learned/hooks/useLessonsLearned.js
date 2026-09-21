import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  canAdvanceLesson,
  canRecordApplication,
  canValidate,
  toDateOnlyString,
} from '@/lib/lessonsLearned';
// Reuse, not restatement: these two modules are the only places that
// know what may be written to risk_register and moc_records, and AS9
// writes to both when a lesson is pushed into them.
import { buildRiskWrite } from '@/pages/apps/risk-register/utils/riskPayload';
import { buildMocWrite } from '@/pages/apps/assurance/moc/utils/mocPayload';
import {
  buildApplicationWrite,
  buildLessonWrite,
  nextLessonCodeFromExisting,
  canDeleteLesson,
  canEditLesson,
  canRemoveApplication,
  editedLesson,
  withAuthor,
} from '../utils/lessonPayload';

const UNKNOWN_RELATION = 'PGRST200';
const UNDEFINED_TABLE = '42P01';
const UNDEFINED_FUNCTION = '42883';
const UNKNOWN_COLUMN = 'PGRST204';
const UNIQUE_VIOLATION = '23505';
/** Postgres: check constraint violated — what the two AS9 triggers raise. */
const CHECK_VIOLATION = '23514';
/** Postgres: insufficient privilege — what the cross-tenant trigger raises. */
const INSUFFICIENT_PRIVILEGE = '42501';

const CODE_RETRIES = 3;

/**
 * AS9 — the one place this app reads and writes.
 *
 * There was nothing to replace: Lessons Learned issued no queries at
 * all. Every page imported `MOCK_LESSONS` and `METRICS` from
 * src/utils/lessons-learned/mockData.js, five lessons and seven
 * literal numbers, so an organization with no lessons, an organization
 * with a full register and a database that was down all rendered the
 * same five lessons by the same five invented authors.
 *
 * `hasAs9Schema` is false while migration 20260917700000 is unapplied.
 * The app then says so.
 */
export const useLessonsLearned = () => {
  const { organization, user } = useAuth();
  const orgId = organization?.id || null;

  const [lessons, setLessons] = useState([]);
  const [applications, setApplications] = useState([]);
  const [activity, setActivity] = useState([]);
  const [risks, setRisks] = useState([]);
  const [mocs, setMocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasAs9Schema, setHasAs9Schema] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const lessonRes = await supabase
        .from('lesson_records')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (lessonRes.error) {
        if (lessonRes.error.code === UNDEFINED_TABLE
            || lessonRes.error.code === UNKNOWN_RELATION) {
          setHasAs9Schema(false);
          setLessons([]); setApplications([]); setActivity([]); setRisks([]); setMocs([]);
          setLoading(false);
          return;
        }
        throw lessonRes.error;
      }
      setHasAs9Schema(true);
      const lessonRows = lessonRes.data || [];

      let applicationRows = [];
      if (lessonRows.length) {
        const res = await supabase.from('lesson_applications').select('*')
          .in('lesson_id', lessonRows.map((l) => l.id))
          .order('applied_on', { ascending: false });
        if (res.error) throw res.error;
        applicationRows = res.data || [];
      }

      const logRes = await supabase.from('lesson_activity_log').select('*')
        .eq('org_id', orgId).order('created_at', { ascending: false }).limit(300);
      if (logRes.error) throw logRes.error;

      // The two registers a lesson can be pushed into. A failure here
      // is not fatal to the lessons register: the push forms say the
      // register could not be read, rather than the page refusing to
      // load. Neither list is ever invented.
      const [riskRes, mocRes] = await Promise.all([
        supabase.from('risk_register').select('id, risk_id, title, status')
          .eq('org_id', orgId).order('risk_id', { ascending: false }).limit(500),
        supabase.from('moc_records').select('id, moc_code, title, stage')
          .eq('org_id', orgId).order('moc_code', { ascending: false }).limit(500),
      ]);

      setLessons(lessonRows);
      setApplications(applicationRows);
      setActivity(logRes.data || []);
      setRisks(riskRes.error ? [] : (riskRes.data || []));
      setMocs(mocRes.error ? [] : (mocRes.data || []));
    } catch (err) {
      setError(err.message || 'Could not load the lessons register.');
      setLessons([]); setApplications([]); setActivity([]); setRisks([]); setMocs([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const applicationsFor = useCallback(
    (lessonId) => applications.filter((a) => a.lesson_id === lessonId), [applications]);
  const activityFor = useCallback(
    (entityId) => activity.filter(
      (a) => a.entity_id === entityId || a.lesson_id === entityId), [activity]);

  const applicationsByLesson = useMemo(() => {
    const map = new Map();
    applications.forEach((a) => {
      if (!map.has(a.lesson_id)) map.set(a.lesson_id, []);
      map.get(a.lesson_id).push(a);
    });
    return map;
  }, [applications]);

  const lessonsWithApplications = useMemo(
    () => lessons.map((l) => ({ ...l, applications: applicationsByLesson.get(l.id) || [] })),
    [lessons, applicationsByLesson]);

  const logActivity = async (entityType, entityId, action, details, keys = {}) => {
    if (!orgId) return;
    await supabase.from('lesson_activity_log').insert([{
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      lesson_id: keys.lesson_id || null,
      actor_id: user?.id || null,
      action,
      details: details || null,
    }]);
  };

  /**
   * A constraint or trigger failure means the database refused
   * something the form should have caught first. Naming it beats
   * showing a user a constraint name.
   */
  const explainWriteError = (err) => {
    if (err.code === INSUFFICIENT_PRIVILEGE) {
      return err.message || 'That record belongs to another organization.';
    }
    if (err.code === CHECK_VIOLATION && /author|embedded/.test(err.message)) {
      return err.message;
    }
    if (err.code !== CHECK_VIOLATION) return err.message;
    if (/publishable_needs_substance/.test(err.message)) {
      return 'A lesson needs what happened, why it happened and what to do about it '
        + 'before it can be validated or published.';
    }
    if (/validation_needs_record/.test(err.message)) {
      return 'A validation is a date and a name.';
    }
    if (/published_needs_date/.test(err.message)) {
      return 'Record the date this was published.';
    }
    if (/archive_needs_reason/.test(err.message)) {
      return 'Say why this lesson is being archived.';
    }
    if (/superseded_needs_successor|not_its_own_successor/.test(err.message)) {
      return 'Name the lesson that replaces this one.';
    }
    if (/risk_needs_target|moc_needs_target|other_needs_reference/.test(err.message)) {
      return 'An application names what it changed: the risk, the change record, or a '
        + 'reference somebody can go and look at.';
    }
    if (/rejection_needs_note/.test(err.message)) {
      return 'Say why the lesson was not adopted.';
    }
    if (/_check$|_check"/.test(err.message)) {
      return 'One of the values on this record is not one the register accepts.';
    }
    return err.message;
  };

  const issueCode = async (attempt) => {
    const year = new Date().getFullYear();
    const { data, error: err } = await supabase.rpc('next_lesson_code', {
      p_org: orgId, p_year: year,
    });
    if (!err && data) return data;
    if (err && err.code !== UNDEFINED_FUNCTION) throw err;
    const fallback = nextLessonCodeFromExisting(lessons, year);
    if (attempt === 0) return fallback;
    const m = /^(LL)-(\d+)-(\d+)$/.exec(fallback);
    return `${m[1]}-${m[2]}-${String(Number(m[3]) + attempt).padStart(3, '0')}`;
  };

  /* ---------------------------------------------------------------- */
  /* Lessons                                                          */
  /* ---------------------------------------------------------------- */

  const createLesson = async (form) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };

    for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
      let code;
      try {
        code = await issueCode(attempt);
      } catch (err) {
        return { success: false, error: explainWriteError(err) };
      }
      // A blank author is the user by id and by name; a typed author is
      // that person, not the user who captured it (AS13).
      const { row } = buildLessonWrite(withAuthor(form, user?.id || null,
        user?.user_metadata?.full_name || user?.email || null));
      const { data, error: err } = await supabase
        .from('lesson_records')
        .insert([{
          ...row,
          org_id: orgId,
          lesson_code: code,
          created_by: user?.id || null,
          status: row.status || 'Draft',
        }])
        .select().single();
      if (err) {
        if (err.code === UNIQUE_VIOLATION && attempt < CODE_RETRIES - 1) continue;
        return { success: false, error: explainWriteError(err) };
      }
      await logActivity('lesson', data.id, `${code} captured`, null, { lesson_id: data.id });
      await fetchAll();
      return { success: true, data };
    }
    return { success: false, error: 'Could not allocate a lesson number. Try again in a moment.' };
  };

  const updateLesson = async (id, form) => {
    const { row } = buildLessonWrite(form);
    const { data, error: err } = await supabase.from('lesson_records')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true, data };
  };

  /**
   * Validate a lesson, through the gate.
   *
   * canValidate refuses the author, and refuses a lesson that is still
   * a story rather than a lesson.
   */
  const validateLesson = async (lesson, { validator_name } = {}) => {
    const asSelf = !String(validator_name || '').trim();
    // AS15: the actor is always the signed-in user, whoever they name. It
    // used to be null when a name was typed, so an author could validate
    // their own lesson by typing somebody else's name. The database
    // refuses the same (lesson_records_validation_actor).
    const verdict = canValidate(lesson, user?.id || null);
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const result = await updateLesson(lesson.id, {
      ...lesson,
      status: 'Validated',
      validated_at: toDateOnlyString(new Date()),
      validated_by: asSelf ? (user?.id || null) : null,
      validator_name: asSelf ? null : validator_name,
    });
    if (result.success) {
      await logActivity('lesson', lesson.id,
        `${lesson.lesson_code} validated${asSelf ? '' : ` by ${validator_name}`}`,
        null, { lesson_id: lesson.id });
      await fetchAll();
    }
    return result;
  };

  /**
   * Move a lesson, through the gate.
   *
   * canAdvanceLesson refuses a jump the workflow does not allow; for
   * Published it refuses one nobody validated, for Embedded one that
   * has been applied nowhere, for Archived one with no reason, and for
   * Superseded one with no successor.
   */
  const advanceLesson = async (lesson, to, patch = {}) => {
    const verdict = canAdvanceLesson(lesson, to, {
      validatorId: user?.id || null,
      applications: applicationsFor(lesson.id),
      patch,
    });
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const next = { ...lesson, ...patch, status: to };
    const todayIso = toDateOnlyString(new Date());
    if (to === 'Published' && !next.published_at) next.published_at = todayIso;

    const result = await updateLesson(lesson.id, next);
    if (result.success) {
      await logActivity('lesson', lesson.id, `${lesson.lesson_code} moved to ${to}`,
        patch.archive_reason ? { reason: patch.archive_reason } : null,
        { lesson_id: lesson.id });
      await fetchAll();
    }
    return result;
  };

  /**
   * Change what a lesson says. A Validated lesson goes back to Submitted
   * with its validation cleared; a Published or Embedded one is replaced
   * by a new lesson rather than rewritten (AS13).
   */
  const editLesson = async (lesson, edits) => {
    const verdict = canEditLesson(lesson);
    if (!verdict.ok) return { success: false, error: verdict.reason };
    const next = editedLesson(lesson, edits);
    const result = await updateLesson(lesson.id, next);
    if (result.success) {
      await logActivity('lesson', lesson.id,
        next.status !== lesson.status
          ? `${lesson.lesson_code} edited after validation and returned to Submitted`
          : `${lesson.lesson_code} edited`,
        null, { lesson_id: lesson.id });
      await fetchAll();
    }
    return result;
  };

  /**
   * Only a lesson that was never validated and never applied. Anything
   * else is archived with a reason (AS13: AS9 deleted Published and
   * Embedded lessons on one click, cascading their applications).
   */
  const deleteLesson = async (id) => {
    const lesson = lessons.find((l) => l.id === id);
    if (!lesson) return { success: false, error: 'That lesson is not in this register.' };
    const verdict = canDeleteLesson(lesson, applicationsFor(id));
    if (!verdict.ok) return { success: false, error: verdict.reason };
    const { error: err } = await supabase.from('lesson_records').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /* ---------------------------------------------------------------- */
  /* Applications: where the lesson actually went                     */
  /* ---------------------------------------------------------------- */

  const recordApplication = async (lesson, form) => {
    const verdict = canRecordApplication(form);
    if (!verdict.ok) return { success: false, error: verdict.reason };

    const { row } = buildApplicationWrite({
      ...form,
      lesson_id: lesson.id,
      applied_by: form.applied_by || user?.id || null,
      applied_on: form.applied_on || toDateOnlyString(new Date()),
    });
    const { data, error: err } = await supabase
      .from('lesson_applications').insert([row]).select().single();
    if (err) return { success: false, error: explainWriteError(err) };

    await logActivity('application', data.id,
      `${lesson.lesson_code} ${String(data.outcome).toLowerCase()} into ${data.target_type}`,
      data.reference ? { reference: data.reference } : null, { lesson_id: lesson.id });
    await fetchAll();
    return { success: true, data };
  };

  /**
   * Remove an application record. Refused for the last Adopted or
   * Adapted application of an Embedded lesson (canRemoveApplication):
   * the database checks Embedded only when the status changes.
   */
  const deleteApplication = async (id) => {
    const application = applications.find((a) => a.id === id);
    if (application) {
      const lesson = lessons.find((l) => l.id === application.lesson_id);
      const verdict = canRemoveApplication(lesson, application,
        applications.filter((a) => a.lesson_id === application.lesson_id));
      if (!verdict.ok) return { success: false, error: verdict.reason };
    }
    const { error: err } = await supabase.from('lesson_applications').delete().eq('id', id);
    if (err) return { success: false, error: explainWriteError(err) };
    await fetchAll();
    return { success: true };
  };

  /* ---------------------------------------------------------------- */
  /* The push: a lesson into the register it belongs in               */
  /* ---------------------------------------------------------------- */

  /**
   * Raise a risk on the register FROM this lesson, and record the
   * application in one go.
   *
   * This is the part of the app the roadmap kept it for. The write
   * goes through `buildRiskWrite`, which is the one module that knows
   * what may be written to `risk_register` — including that
   * `risk_score` is generated and that the AS2 columns may not be
   * applied yet.
   */
  const raiseRiskFromLesson = async (lesson, form) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };

    let hasAs2Columns = true;
    for (let guard = 0; guard < CODE_RETRIES + 1; guard += 1) {
      let code;
      const { data: rpcCode, error: codeErr } = await supabase.rpc('next_risk_code', {
        p_org: orgId,
      });
      if (codeErr && codeErr.code !== UNDEFINED_FUNCTION) {
        return { success: false, error: explainWriteError(codeErr) };
      }
      code = rpcCode;
      if (!code) {
        return {
          success: false,
          error: 'The risk register cannot issue a number yet. Raise the risk in the Risk '
            + 'Register app and link it here instead.',
        };
      }

      const { row } = buildRiskWrite({
        ...form,
        description: form.description
          || `Raised from lesson ${lesson.lesson_code}: ${lesson.title}`,
        root_cause: form.root_cause || lesson.root_cause || null,
        mitigation_summary: form.mitigation_summary || lesson.recommendation || null,
      }, { hasAs2Columns });

      const { data, error: err } = await supabase
        .from('risk_register')
        .insert([{ ...row, org_id: orgId, created_by: user?.id || null, risk_id: code }])
        .select().single();

      if (err) {
        if (err.code === UNKNOWN_COLUMN && hasAs2Columns) { hasAs2Columns = false; continue; }
        if (err.code === UNIQUE_VIOLATION && guard < CODE_RETRIES) continue;
        return { success: false, error: explainWriteError(err) };
      }

      const applied = await recordApplication(lesson, {
        target_type: 'Risk register',
        target_risk_id: data.id,
        reference: data.risk_id,
        outcome: form.outcome || 'Adopted',
        notes: form.notes || null,
        applied_on: toDateOnlyString(new Date()),
      });
      if (!applied.success) {
        // The risk exists. Say so rather than implying nothing happened.
        return {
          success: false,
          error: `Risk ${data.risk_id} was raised, but the link back to this lesson was not `
            + `saved: ${applied.error}`,
        };
      }
      return { success: true, data, code: data.risk_id };
    }
    return { success: false, error: 'Could not allocate a risk number. Try again in a moment.' };
  };

  /** The same, into Management of Change. */
  const raiseMocFromLesson = async (lesson, form) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };

    let hasAs6Columns = true;
    for (let guard = 0; guard < CODE_RETRIES + 1; guard += 1) {
      const year = new Date().getFullYear();
      const { data: code, error: codeErr } = await supabase.rpc('next_moc_code', {
        p_org: orgId, p_year: year,
      });
      if (codeErr && codeErr.code !== UNDEFINED_FUNCTION) {
        return { success: false, error: explainWriteError(codeErr) };
      }
      if (!code) {
        return {
          success: false,
          error: 'Management of Change cannot issue a number yet. Raise the change there and '
            + 'link it here instead.',
        };
      }

      const { row } = buildMocWrite({
        ...form,
        description: form.description
          || `Raised from lesson ${lesson.lesson_code}: ${lesson.title}`,
        justification: form.justification || lesson.recommendation || null,
        current_situation: form.current_situation || lesson.description || null,
      }, { hasAs6Columns });

      const { data, error: err } = await supabase
        .from('moc_records')
        .insert([{
          ...row,
          org_id: orgId,
          moc_code: code,
          created_by: user?.id || null,
          originator_id: row.originator_id || user?.id || null,
          stage: row.stage || 'Draft',
        }])
        .select().single();

      if (err) {
        if (err.code === UNKNOWN_COLUMN && hasAs6Columns) { hasAs6Columns = false; continue; }
        if (err.code === UNIQUE_VIOLATION && guard < CODE_RETRIES) continue;
        return { success: false, error: explainWriteError(err) };
      }

      const applied = await recordApplication(lesson, {
        target_type: 'Management of change',
        target_moc_id: data.id,
        reference: data.moc_code,
        outcome: form.outcome || 'Adopted',
        notes: form.notes || null,
        applied_on: toDateOnlyString(new Date()),
      });
      if (!applied.success) {
        return {
          success: false,
          error: `Change ${data.moc_code} was raised, but the link back to this lesson was not `
            + `saved: ${applied.error}`,
        };
      }
      return { success: true, data, code: data.moc_code };
    }
    return { success: false, error: 'Could not allocate a change number. Try again in a moment.' };
  };

  return {
    orgId,
    userId: user?.id || null,
    lessons: lessonsWithApplications,
    rawLessons: lessons,
    applications,
    applicationsByLesson,
    activity,
    risks,
    mocs,
    loading,
    error,
    hasAs9Schema,
    refresh: fetchAll,
    applicationsFor,
    activityFor,
    createLesson,
    editLesson,
    validateLesson,
    advanceLesson,
    deleteLesson,
    recordApplication,
    deleteApplication,
    raiseRiskFromLesson,
    raiseMocFromLesson,
  };
};

export default useLessonsLearned;
