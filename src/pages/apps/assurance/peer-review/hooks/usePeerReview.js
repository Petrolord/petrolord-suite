import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  canClose, canTransition, explainRefusal, nextStages,
} from '@/lib/peerReview';
import {
  buildCommentWrite,
  buildParticipantWrite,
  buildReviewWrite,
  nextCodeFromExisting,
  reviewLockReason,
} from '../utils/reviewPayload';

const UNKNOWN_COLUMN = 'PGRST204';
const UNKNOWN_RELATION = 'PGRST200';
const UNDEFINED_TABLE = '42P01';
const UNDEFINED_FUNCTION = '42883';
const UNIQUE_VIOLATION = '23505';

const CODE_RETRIES = 3;

/**
 * AS5 — the one place this app reads and writes.
 *
 * It replaces `PeerReviewService`, which did not write to a database at
 * all. Every write went to one of three module-level arrays:
 *
 *   let localReviews  = [...MOCK_REVIEWS];
 *   let localComments = [...MOCK_COMMENTS];
 *   let localAudit    = [...MOCK_AUDIT];
 *
 * saveReview() pushed onto localReviews. addComment() pushed onto
 * localComments. updateCommentStatus(), updateReviewStage() and
 * logAudit() mutated them in place. The UI reported "Review initiated",
 * "Your comment has been successfully registered" and "Action recorded.
 * Backend process triggered."
 *
 * There was no backend process. Every review raised, every technical
 * comment written against a deliverable, every disposition, every stage
 * change and the whole audit trail survived until the page reloaded and
 * were then gone, with no error at any point. For a technical assurance
 * app, where the audit trail IS the deliverable, that is the worst
 * failure mode in the module.
 *
 * `getDashboardStats()` never queried at all, so every KPI on the
 * dashboard was computed from MOCK_REVIEWS: a customer's peer review
 * dashboard was a picture of somebody else's invented project,
 * permanently.
 */
export const usePeerReview = () => {
  const { organization, user } = useAuth();
  const orgId = organization?.id || null;

  const [reviews, setReviews] = useState([]);
  const [comments, setComments] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasAs5Schema, setHasAs5Schema] = useState(true);

  const optional = async (promise) => {
    const res = await promise;
    if (res.error) {
      if (res.error.code === UNDEFINED_TABLE || res.error.code === UNKNOWN_RELATION) {
        return { data: [], missing: true };
      }
      throw res.error;
    }
    return { data: res.data || [], missing: false };
  };

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await supabase
        .from('peer_reviews')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      const rows = res.data || [];

      let as5 = rows.length === 0 || 'closed_at' in rows[0];
      const ids = rows.map((r) => r.id);

      let commentRows = [];
      let participantRows = [];
      let auditRows = [];
      if (ids.length) {
        const c = await optional(supabase
          .from('peer_review_comments').select('*').in('review_id', ids)
          .order('created_at', { ascending: false }));
        commentRows = c.data;

        const p = await optional(supabase
          .from('peer_review_participants').select('*').in('review_id', ids));
        participantRows = p.data;
        if (p.missing) as5 = false;

        const a = await optional(supabase
          .from('peer_review_audit').select('*').in('review_id', ids)
          .order('created_at', { ascending: false }).limit(200));
        auditRows = a.data;
      }

      setReviews(rows);
      setComments(commentRows);
      setParticipants(participantRows);
      setAudit(auditRows);
      setHasAs5Schema(as5);
    } catch (err) {
      // An empty register is empty. A broken one says so.
      setError(err.message || 'Could not load the review register.');
      setReviews([]);
      setComments([]);
      setParticipants([]);
      setAudit([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const commentsFor = useCallback(
    (reviewId) => comments.filter((c) => c.review_id === reviewId),
    [comments],
  );
  const participantsFor = useCallback(
    (reviewId) => participants.filter((p) => p.review_id === reviewId),
    [participants],
  );
  const auditFor = useCallback(
    (reviewId) => audit.filter((a) => a.review_id === reviewId),
    [audit],
  );

  const reviewsWithChildren = useMemo(
    () => reviews.map((r) => ({
      ...r,
      comments: commentsFor(r.id),
      participants: participantsFor(r.id),
    })),
    [reviews, commentsFor, participantsFor],
  );

  /**
   * The audit trail, written for real.
   *
   * Best effort on purpose: a failure to log must never be the reason a
   * genuine write is reported as failed. But unlike the old logAudit(),
   * which pushed onto an array, this one actually goes to a table, and
   * the detail page reads it back.
   */
  const logAudit = async (reviewId, action, details) => {
    await supabase.from('peer_review_audit').insert([{
      review_id: reviewId,
      actor_id: user?.id || null,
      action,
      details: details || null,
    }]);
  };

  const issueCode = async (attempt) => {
    const year = new Date().getFullYear();
    const { data, error: err } = await supabase.rpc('next_peer_review_code', {
      p_org: orgId, p_year: year,
    });
    if (!err && data) return data;
    if (err && err.code !== UNDEFINED_FUNCTION) throw err;
    const fallback = nextCodeFromExisting(reviews, year);
    if (attempt === 0) return fallback;
    const m = /^PR-(\d+)-(\d+)$/.exec(fallback);
    return `PR-${m[1]}-${String(Number(m[2]) + attempt).padStart(3, '0')}`;
  };

  const createReview = async (form, roster = []) => {
    if (!orgId) return { success: false, error: 'No organization is selected.' };
    let as5 = hasAs5Schema;

    for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
      let code;
      try {
        code = await issueCode(attempt);
      } catch (err) {
        return { success: false, error: err.message };
      }

      const { row } = buildReviewWrite(form, { hasAs5Columns: as5 });
      const { data, error: err } = await supabase
        .from('peer_reviews')
        .insert([{
          ...row,
          org_id: orgId,
          review_code: code,
          created_by: user?.id || null,
          stage: row.stage || 'Draft',
          decision: row.decision || 'Pending',
        }])
        .select()
        .single();

      if (err) {
        if (err.code === UNKNOWN_COLUMN && as5) {
          as5 = false; setHasAs5Schema(false); continue;
        }
        if (err.code === UNIQUE_VIOLATION && attempt < CODE_RETRIES - 1) continue;
        return { success: false, error: err.message };
      }

      let warning = null;
      if (roster.length) {
        const rosterResult = await setRoster(data.id, roster, { skipRefresh: true });
        if (!rosterResult.success) warning = rosterResult.error;
      }

      await logAudit(data.id, 'Review raised', { review_code: code });
      await fetchAll();
      return { success: true, data, warning };
    }
    return { success: false, error: 'Could not allocate a review code. Try again in a moment.' };
  };

  const updateReview = async (id, form) => {
    let as5 = hasAs5Schema;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { row } = buildReviewWrite(form, { hasAs5Columns: as5 });
      const { data, error: err } = await supabase
        .from('peer_reviews')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', id).select().single();
      if (!err) {
        await fetchAll();
        return { success: true, data };
      }
      if (err.code === UNKNOWN_COLUMN && as5) {
        as5 = false; setHasAs5Schema(false); continue;
      }
      return { success: false, error: err.message };
    }
    return { success: false, error: 'Could not save the review.' };
  };

  /**
   * Move a review to a new stage.
   *
   * Closing is refused while a Critical or Major comment is unresolved.
   * The old app moved the stage from a dropdown with no check at all,
   * so a review could be Closed with showstoppers open against it and
   * a decision recorded beside them.
   */
  const changeStage = async (review, stage, decision) => {
    // AS13: the page only offers nextStages, but nothing here checked
    // it, so any caller could reopen a Closed or Cancelled review.
    if (!nextStages(review.stage).includes(stage)) {
      const allowed = nextStages(review.stage);
      return {
        success: false,
        error: allowed.length
          ? `A review in ${review.stage} can only move to ${allowed.join(', ')}.`
          : `A ${String(review.stage).toLowerCase()} review is final.`,
      };
    }
    if (stage === 'Closed') {
      const verdict = canClose(commentsFor(review.id));
      if (!verdict.ok) return { success: false, error: verdict.reason };
    }
    const patch = { ...review, stage };
    if (stage === 'Closed') {
      patch.closed_at = new Date().toISOString();
      if (decision) {
        patch.decision = decision;
        patch.decided_at = new Date().toISOString();
        patch.decided_by = user?.id || null;
      }
    }
    const result = await updateReview(review.id, patch);
    if (result.success) {
      await logAudit(review.id, `Stage changed to ${stage}`,
        decision ? { decision } : null);
      await fetchAll();
    }
    return result;
  };

  /**
   * AS13: a Closed or Cancelled review is a record. The page hides the
   * controls; the writes below refuse whatever calls them.
   */
  const lockedReview = (reviewId) => reviewLockReason(reviews.find((r) => r.id === reviewId));

  const addComment = async (reviewId, form) => {
    const locked = lockedReview(reviewId);
    if (locked) return { success: false, error: locked };
    const { row } = buildCommentWrite({
      ...form,
      review_id: reviewId,
      author_id: user?.id || null,
      status: 'Open',
    });
    const { data, error: err } = await supabase
      .from('peer_review_comments').insert([row]).select().single();
    if (err) return { success: false, error: err.message };
    await logAudit(reviewId, `${data.severity} comment raised`);
    await fetchAll();
    return { success: true, data };
  };

  /**
   * Move a comment along its disposition.
   *
   * Every transition goes through the authority. The old
   * updateCommentStatus() took whatever the UI handed it and assigned
   * it, so a comment could be marked Verified without a response.
   */
  const disposeComment = async (comment, to, { text } = {}) => {
    const locked = lockedReview(comment.review_id);
    if (locked) return { success: false, error: locked };
    const refusal = explainRefusal(
      { ...comment, response_text: to === 'Verified' ? comment.response_text : text },
      to,
    );
    if (refusal) return { success: false, error: refusal };
    if (!canTransition(comment.status || 'Open', to)) {
      return { success: false, error: `A comment cannot go from ${comment.status} to ${to}.` };
    }

    const patch = { status: to, updated_at: new Date().toISOString() };
    if (to === 'Responded') {
      patch.response_text = text || comment.response_text;
      patch.responded_by = user?.id || null;
      patch.responded_at = new Date().toISOString();
    }
    if (to === 'Verified') {
      patch.verified_by = user?.id || null;
      patch.verified_at = new Date().toISOString();
    }
    if (to === 'Rejected') {
      // The reviewer's reason for rejecting joins the response rather
      // than replacing it, so the exchange stays readable.
      patch.response_text = [comment.response_text, text && `Rejected: ${text}`]
        .filter(Boolean).join('\n\n');
    }

    const { error: err } = await supabase
      .from('peer_review_comments').update(patch).eq('id', comment.id);
    if (err) return { success: false, error: err.message };
    await logAudit(comment.review_id, `Comment ${to.toLowerCase()}`);
    await fetchAll();
    return { success: true };
  };

  /** Replace a review's roster. */
  const setRoster = async (reviewId, roster, { skipRefresh = false } = {}) => {
    const { error: delErr } = await supabase
      .from('peer_review_participants').delete().eq('review_id', reviewId);
    if (delErr) {
      if (delErr.code === UNDEFINED_TABLE || delErr.code === UNKNOWN_RELATION) {
        setHasAs5Schema(false);
        return {
          success: false,
          error: 'The review was saved, but the roster could not be: this database does not have the participants table yet.',
        };
      }
      return { success: false, error: delErr.message };
    }

    const rows = roster
      .filter((p) => p.role && (p.user_id || p.display_name))
      .map((p) => buildParticipantWrite({ ...p, review_id: reviewId }).row);

    if (rows.length) {
      const { error: err } = await supabase.from('peer_review_participants').insert(rows);
      if (err) return { success: false, error: err.message };
    }
    if (!skipRefresh) await fetchAll();
    return { success: true };
  };

  // AS13: only a draft can be deleted. Past Draft a review has comments
  // and an audit trail that are its record; Cancel ends it and keeps them.
  const deleteReview = async (id) => {
    const review = reviews.find((r) => r.id === id);
    if (review && review.stage !== 'Draft') {
      return {
        success: false,
        error: `Only a draft review can be deleted. ${review.review_code} is ${String(review.stage).toLowerCase()}, so its record stays. A review that should not go ahead is cancelled instead.`,
      };
    }
    const { error: err } = await supabase.from('peer_reviews').delete().eq('id', id);
    if (err) return { success: false, error: err.message };
    await fetchAll();
    return { success: true };
  };

  return {
    orgId,
    reviews: reviewsWithChildren,
    comments,
    participants,
    audit,
    loading,
    error,
    hasAs5Schema,
    refresh: fetchAll,
    commentsFor,
    participantsFor,
    auditFor,
    createReview,
    updateReview,
    changeStage,
    addComment,
    disposeComment,
    setRoster,
    deleteReview,
  };
};

export default usePeerReview;
