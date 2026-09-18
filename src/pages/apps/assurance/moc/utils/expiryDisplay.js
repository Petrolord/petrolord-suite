/**
 * AS13: what the app SAYS about a change's expiry.
 *
 * The rule (expiryState, in the vendored engine) is unchanged: only a
 * change that is on the facility can expire, so a temporary change not
 * yet in effect reads EXPIRY.NONE. The defect was the wording. The
 * badge printed that state as "No expiry" beside a real expiry date,
 * and the Reports expiry table listed Rejected and Cancelled changes,
 * which never went in at all, as "No expiry" too.
 *
 * This file only decides the words. It never changes which changes are
 * expired.
 */
import { format } from 'date-fns';
import {
  EXPIRY,
  EXPIRY_TOKENS,
  IN_EFFECT_STAGES,
  TERMINAL_STAGES,
  expiryState,
  parseDateOnly,
} from '@/lib/managementOfChange';

/** The state shown for a temporary change that has not gone in yet. */
export const NOT_YET_IN_EFFECT = 'Not yet in effect';

const showDate = (value) => {
  const d = parseDateOnly(value);
  return d ? format(d, 'd MMM yyyy') : null;
};

/**
 * `{ state, label, token, title }`, or null when there is nothing to
 * say: a permanent change, a closed one (see the AS13 report on the
 * closed-temporary rule) and a rejected or cancelled one, which never
 * went in.
 *
 * `state` is short, for a table column or a CSV. `label` is the badge,
 * and carries the date when the change is not yet in effect.
 */
export const expiryDisplay = (moc = {}, today = new Date()) => {
  const state = expiryState(moc, today);
  if (state === EXPIRY.NOT_APPLICABLE) return null;

  if (state === EXPIRY.NONE && !IN_EFFECT_STAGES.includes(moc.stage)) {
    if (TERMINAL_STAGES.includes(moc.stage)) return null;
    const date = showDate(moc.expiry_date);
    return date
      ? {
        state: NOT_YET_IN_EFFECT,
        label: `Expires ${date} once in effect`,
        token: '--muted-foreground',
        title: `This ${String(moc.type).toLowerCase()} change is not on the facility yet. Its expiry date applies once it is implemented.`,
      }
      : {
        state: NOT_YET_IN_EFFECT,
        label: 'Expiry date not set',
        token: '--warning',
        title: `A ${String(moc.type).toLowerCase()} change needs an expiry date before it can leave Draft.`,
      };
  }

  const date = showDate(moc.expiry_date);
  return {
    state,
    label: state,
    token: EXPIRY_TOKENS[state] || '--muted-foreground',
    title: date
      ? `This ${String(moc.type).toLowerCase()} change expires ${date}.`
      : 'This change is in effect with no readable expiry date.',
  };
};
