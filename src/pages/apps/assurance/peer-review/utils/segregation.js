/**
 * ASC-0: segregation of duties for peer review (owner decision D1,
 * 2026-09-18), the AS15 MOC pattern.
 *
 * The rules are the engine's (engines #212): canAssignPeerReviewer says
 * the author of the work under review (peer_reviews.author_id) is never
 * its Lead Reviewer or a Reviewer, and canActOnComment says the author
 * never verifies, rejects or withdraws a comment on it. This file only
 * asks them about a whole roster, and hands the engine a stand-in key
 * where the form holds a typed name, so the sentence the user reads is
 * the engine's, word for word. The database holds the same rules for
 * stored ids (migration 20260919100000).
 */
import { canAssignPeerReviewer } from '@/lib/peerReview';
import { nameKey } from '../../shared/people';

/** The lead reviewer's user id: the first Lead Reviewer row with an account. */
export const leadReviewerIdOf = (roster = []) =>
  roster.find((p) => p.role === 'Lead Reviewer' && p.user_id)?.user_id || null;

/**
 * The first refusal for this review's lead reviewer and roster, or null.
 * `review` carries author_id (and lead_reviewer_id when set).
 */
export const rosterRefusal = (review = {}, roster = []) => {
  if (review.lead_reviewer_id) {
    const lead = canAssignPeerReviewer(review, { user_id: review.lead_reviewer_id, role: 'Lead Reviewer' });
    if (!lead.ok) return lead.reason;
  }
  for (const p of roster) {
    if (!p.user_id && !String(p.display_name || '').trim()) continue;
    const verdict = canAssignPeerReviewer(review, p);
    if (!verdict.ok) return verdict.reason;
  }
  return null;
};

/**
 * The same question on the create form, where the author and a reviewer
 * may both be typed names (people without a Suite account). Two typed
 * names that are the same name are the same person, as elsewhere in the
 * Assurance apps (shared/people.js).
 */
export const formRosterRefusal = (author = {}, roster = []) => {
  const key = (id, name) => id || (String(name || '').trim() ? nameKey(name) : null);
  const authorKey = key(author.id, author.name);
  if (!authorKey) return null;
  return rosterRefusal({ author_id: authorKey }, roster
    .filter((p) => p.role !== 'Author')
    .map((p) => ({ ...p, user_id: key(p.user_id, p.display_name) })));
};
