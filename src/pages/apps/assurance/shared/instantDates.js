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
 * The rule is the engine's calendar.localDateOf (engines #212): a string
 * with a time part is read as the instant it names, and a bare
 * YYYY-MM-DD stays that calendar date (`new Date('2026-09-18')` would be
 * UTC midnight, 17 September west of Greenwich). This only formats it.
 */
import { localDateOf, toDateOnlyString } from '@/lib/assuranceCalendar';

/** YYYY-MM-DD in local time for an instant, or '' when there is none. */
export const localDateOfInstant = (value) => {
  if (!value) return '';
  return toDateOnlyString(localDateOf(value)) || '';
};
