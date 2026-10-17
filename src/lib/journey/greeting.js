// Guided Journey: the greeting by name, on every login (owner 2026-10-17:
// "not for the first time alone but always"). Pure.

const DAY = 24 * 60 * 60 * 1000;
export const LONG_ABSENCE_DAYS = 14;

/** The name to greet: display name, else the first word of the full name, else the email's local part. */
export function greetingName({ display_name: display, full_name: full, email } = {}) {
  const d = String(display || '').trim();
  if (d) return d;
  const f = String(full || '').trim().split(/\s+/)[0];
  if (f) return f;
  const e = String(email || '').split('@')[0].trim();
  return e || 'there';
}

/** 'morning' (05:00 to 11:59), 'afternoon' (12:00 to 16:59) or 'evening', in the person's own time zone. */
export function partOfDay(now = new Date(), timeZone) {
  let hour;
  try {
    hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
  } catch {
    hour = now.getHours();
  }
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * The greeting line.
 * @param {Object} p
 * @param {Object} p.user {display_name, full_name, email, created_at, last_sign_in_at}
 * @param {?string} [p.lastGreetedAt] when the person was last greeted
 * @param {Date} [p.now]
 * @param {string} [p.timeZone]
 * @returns {{name: string, line: string, kind: 'first'|'back'|'day'}}
 */
export function greeting({ user = {}, lastGreetedAt = null, now = new Date(), timeZone } = {}) {
  const name = greetingName(user);
  if (!lastGreetedAt) {
    // never greeted: a brand-new account is welcomed to Petrolord; anyone
    // older is simply greeted (the journey record is newer than they are)
    const created = user.created_at ? new Date(user.created_at).getTime() : null;
    if (created == null || now.getTime() - created < 2 * DAY) {
      return { name, line: `Welcome to Petrolord, ${name}.`, kind: 'first' };
    }
  }
  const words = `Good ${partOfDay(now, timeZone)}, ${name}.`;
  const last = lastGreetedAt ? new Date(lastGreetedAt).getTime() : null;
  if (last != null && now.getTime() - last >= LONG_ABSENCE_DAYS * DAY) {
    return { name, line: `${words} Welcome back, it has been a while.`, kind: 'back' };
  }
  return { name, line: words, kind: 'day' };
}
