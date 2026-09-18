/**
 * ASC-0: the calendar date an INSTANT fell on, for the person reading it.
 *
 * A timestamptz audit stamp (created_at, responded_at, decision_date)
 * comes back from Postgres as an ISO instant in UTC. Its leading
 * YYYY-MM-DD is the UTC date, which for a user in Lagos is the day
 * before anything done between midnight and one in the morning. Where
 * a page or an export prints such a stamp as a date, it prints the local
 * calendar date the instant fell on.
 *
 * A bare YYYY-MM-DD is already a calendar date and is returned as it
 * is: `new Date('2026-09-18')` is UTC midnight, which is 17 September
 * west of Greenwich.
 */
import { toDateOnlyString } from '@/lib/peerReview';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD in local time for an instant, or '' when there is none. */
export const localDateOfInstant = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && DATE_ONLY.test(value)) return toDateOnlyString(value) || '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return toDateOnlyString(d) || '';
};
