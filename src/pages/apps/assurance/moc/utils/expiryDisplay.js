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
 * This file only decides the words, and which changes the expiry
 * report lists. It never changes which changes are expired.
 *
 * AS13 hardening: a closed temporary change reads EXPIRY.CLOSED_OUT
 * ('Closed out') in the engine. The register and the detail page show
 * that state, but the expiry report is about changes still to be
 * reverted, so expiryReportRows leaves closed-out changes out.
 */
import { format } from 'date-fns';
import {
  EXPIRING_TYPES,
  EXPIRY,
  EXPIRY_TOKENS,
  IN_EFFECT_STAGES,
  TERMINAL_STAGES,
  daysUntil,
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
 * say: a permanent change, and a rejected or cancelled one, which never
 * went in. A closed temporary change returns the 'Closed out' state so
 * the register and detail can show it; the expiry report drops it (see
 * expiryReportRows).
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

  if (state === EXPIRY.CLOSED_OUT) {
    return {
      state,
      label: state,
      token: EXPIRY_TOKENS[state] || '--muted-foreground',
      title: `This ${String(moc.type).toLowerCase()} change was closed out through its MOC. It is no longer tracked against its expiry date.`,
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

/**
 * The temporary-change expiry report: temporary and emergency changes
 * still to be reverted, in effect or on their way in, soonest first.
 * Rejected and cancelled changes never went in, and closed-out ones have
 * already been reverted or made permanent, so neither is listed.
 */
export const expiryReportRows = (records = [], today = new Date()) => records
  .filter((m) => EXPIRING_TYPES.includes(m.type))
  .map((m) => ({ ...m, shown: expiryDisplay(m, today), days: daysUntil(m.expiry_date, today) }))
  .filter((m) => m.shown && m.shown.state !== EXPIRY.CLOSED_OUT)
  .map((m) => ({ ...m, state: m.shown.state }))
  .sort((a, b) => {
    if (a.days === null) return 1;
    if (b.days === null) return -1;
    return a.days - b.days;
  });
