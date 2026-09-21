/**
 * ASC-0 (engines #212): the comments summarise() counts, one review or
 * one comment at a time.
 *
 * summarise() no longer counts open or blocking comments on a Closed or
 * Cancelled review (the AS14 rule MOC and QA follow): the review is
 * locked, so nobody can resolve them. The register's per-review column
 * and the dashboard's blocking list ask the same function, so they agree
 * with the dashboard tiles.
 */
import { summarise } from '@/lib/peerReview';

/** Open comments on this review, as the dashboard counts them. */
export const openCommentsOf = (review = {}, today = new Date()) => {
  const comments = (review.comments || []).map((c) => ({ ...c, review_id: review.id }));
  return summarise([review], comments, today).openComments;
};

/** Is this comment one the 'Blocking closure' tile counts? */
export const countsAsBlocking = (comment, reviewById = new Map(), today = new Date()) => {
  const review = reviewById.get(comment.review_id);
  return summarise(review ? [review] : [], [comment], today).blockingComments === 1;
};
