/**
 * One series builder for the Results tab and the report (SIM-U1, RL12): a
 * vector of a run's summary.json in the display units, on the calendar
 * (the run's start date plus the simulator's elapsed days), with its
 * observed (H) twin when the deck asked for one.
 *
 * summary.json holds the simulator's numbers in the deck's unit system
 * (`unit_system`, written by the worker since SIM-U1; an older summary has
 * none, and the deck text read in the app decides, FIELD when nothing says).
 *
 * Pure.
 */
import { vectorView } from './simUnits.js';

const DAY_MS = 86400000;

/** The run's start as milliseconds since 1970 (UTC), or null. */
export function startMs(summary) {
  const t = Date.parse(String(summary?.start_date || '').slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(t) ? t : null;
}

/** Calendar time of a simulator day. */
export const dayToMs = (summary, day) => {
  const s = startMs(summary);
  return s == null || !Number.isFinite(day) ? null : s + day * DAY_MS;
};

/** ISO date (YYYY-MM-DD) of a simulator day. */
export function dayToIso(summary, day) {
  const t = dayToMs(summary, day);
  return t == null ? null : new Date(t).toISOString().slice(0, 10);
}

/**
 * The deck unit system the summary's numbers are in, and how sure we are.
 * @param {object} summary summary.json
 * @param {?string} deckSystem the system read from the deck text in the app (deckSummary), if any
 * @returns {{system: string, basis: string}}
 */
export function summaryUnitSystem(summary, deckSystem = null) {
  const w = summary?.unit_system;
  if (w && w !== 'unstated') return { system: w, basis: 'stated by the deck (recorded by the worker)' };
  if (w === 'unstated') return { system: 'METRIC', basis: 'the deck states no unit keyword; the simulator reads METRIC' };
  if (deckSystem) return { system: deckSystem, basis: 'read from the case deck in the app (the run was made before the worker recorded it)' };
  return { system: 'FIELD', basis: 'assumed: the run predates the recorded unit system and the deck was not read' };
}

/**
 * Rows of one field vector: [{ day, t, value, observed? }], display units.
 */
export function fieldRows(summary, key, { deckSystem = 'FIELD', system = 'oilfield' } = {}) {
  const days = summary?.days || [];
  const v = vectorView(key, deckSystem, system);
  const values = summary?.field?.[key] || [];
  const observed = summary?.field?.[`${key}H`];
  return days.map((day, i) => ({
    day,
    t: dayToMs(summary, day),
    value: values[i] == null ? null : v.convert(values[i]),
    ...(Array.isArray(observed) ? { observed: observed[i] == null ? null : v.convert(observed[i]) } : {}),
  }));
}

/**
 * Rows of a well vector across wells: [{ day, t, <well>: value, '<well> obs': value }].
 */
export function wellRows(summary, base, { deckSystem = 'FIELD', system = 'oilfield' } = {}) {
  const days = summary?.days || [];
  const v = vectorView(base, deckSystem, system);
  const wells = summary?.wells || {};
  return days.map((day, i) => {
    const row = { day, t: dayToMs(summary, day) };
    for (const [name, entry] of Object.entries(wells)) {
      if (Array.isArray(entry[base])) row[name] = entry[base][i] == null ? null : v.convert(entry[base][i]);
      if (Array.isArray(entry[`${base}H`])) row[`${name} obs`] = entry[`${base}H`][i] == null ? null : v.convert(entry[`${base}H`][i]);
    }
    return row;
  });
}

/** The last finite value of a field vector, in display units, with its day. */
export function lastValue(summary, key, opts) {
  const rows = fieldRows(summary, key, opts);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(rows[i].value)) return { value: rows[i].value, day: rows[i].day, t: rows[i].t };
  }
  return null;
}

/** [[t, y]] pairs of a row set's column, finite only (report figures). */
export const pairs = (rows, key) => rows.filter((r) => Number.isFinite(r.t) && Number.isFinite(r[key])).map((r) => [r.t, r[key]]);
