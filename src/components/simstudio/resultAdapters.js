import { EMPTY_VALUE } from '../../lib/emptyValue.js';
// summary.json (worker output) -> chart-ready series. Pure + jest-tested.
// Shape: { opm_version, deck_sha256, start_date, days: [], field: {KEY: []},
//          wells: {NAME: {WOPR: [], ...}} }
//
// S4: decks generated with a production history also carry observed-rate
// vectors (FOPRH, WOPRH, ...). Those never chart standalone — they ride
// their simulated twin as a dashed "observed" overlay, which is the
// history-match view.

export const VECTOR_META = {
  FOPR: { label: 'Field oil rate', unit: 'STB/d' },
  FOPT: { label: 'Field oil total', unit: 'STB' },
  FWPR: { label: 'Field water rate', unit: 'STB/d' },
  FWCT: { label: 'Field water cut', unit: 'frac' },
  FGPR: { label: 'Field gas rate', unit: 'Mscf/d' },
  FGOR: { label: 'Field GOR', unit: 'Mscf/STB' },
  FPR: { label: 'Field pressure', unit: 'psia' },
  FWIR: { label: 'Field water injection', unit: 'STB/d' },
  FGIR: { label: 'Field gas injection', unit: 'Mscf/d' },
  FWIT: { label: 'Water injection total', unit: 'STB' },
  FGIT: { label: 'Gas injection total', unit: 'Mscf' },
  WOPR: { label: 'Well oil rate', unit: 'STB/d' },
  WWPR: { label: 'Well water rate', unit: 'STB/d' },
  WGPR: { label: 'Well gas rate', unit: 'Mscf/d' },
  WBHP: { label: 'Well BHP', unit: 'psia' },
  WWCT: { label: 'Well water cut', unit: 'frac' },
  WWIR: { label: 'Well water injection', unit: 'STB/d' },
  WGIR: { label: 'Well gas injection', unit: 'Mscf/d' },
};

const isObservedKey = (k) => k.endsWith('H');

/** Field vectors present in the summary, in a stable display order.
 *  Observed (H) vectors are overlays, never standalone charts. */
export function availableFieldVectors(summary) {
  if (!summary?.field) return [];
  return Object.keys(VECTOR_META)
    .filter((k) => !isObservedKey(k) && Array.isArray(summary.field[k]));
}

/** Well vector bases present on at least one well. */
export function availableWellVectors(summary) {
  if (!summary?.wells) return [];
  const bases = new Set();
  Object.values(summary.wells).forEach((entry) => {
    Object.keys(entry).forEach((b) => bases.add(b));
  });
  return ['WOPR', 'WWPR', 'WGPR', 'WBHP', 'WWCT', 'WWIR', 'WGIR']
    .filter((b) => bases.has(b));
}

export function wellNames(summary) {
  return Object.keys(summary?.wells || {});
}

/** True when the run carries an observed twin for this field vector. */
export function hasObservedField(summary, key) {
  return Array.isArray(summary?.field?.[`${key}H`]);
}

/** Rows for a single field vector: [{day, value, observed?}] — observed
 *  filled from the H twin when the deck requested it. */
export function fieldSeries(summary, key) {
  const days = summary?.days || [];
  const values = summary?.field?.[key] || [];
  const observed = summary?.field?.[`${key}H`];
  return days.map((day, i) => ({
    day,
    value: values[i] ?? null,
    ...(Array.isArray(observed) ? { observed: observed[i] ?? null } : {}),
  }));
}

/** Rows for one well-vector base across wells: [{day, <well>: v, ...}],
 *  plus dashed "<well> obs" columns when the H twin exists. */
export function wellSeries(summary, base) {
  const days = summary?.days || [];
  const wells = summary?.wells || {};
  return days.map((day, i) => {
    const row = { day };
    Object.entries(wells).forEach(([name, entry]) => {
      if (Array.isArray(entry[base])) row[name] = entry[base][i] ?? null;
      if (Array.isArray(entry[`${base}H`])) row[`${name} obs`] = entry[`${base}H`][i] ?? null;
    });
    return row;
  });
}

/** Series keys for a well chart, observed twins included (dashed). */
export function wellSeriesKeys(summary, base) {
  const keys = [];
  Object.entries(summary?.wells || {}).forEach(([name, entry]) => {
    if (Array.isArray(entry[base])) keys.push(name);
    if (Array.isArray(entry[`${base}H`])) keys.push(`${name} obs`);
  });
  return keys;
}

/** Elapsed pretty-printer for the runs table. */
export function fmtElapsed(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return EMPTY_VALUE;
  const s = Number(seconds);
  if (s < 90) return `${s.toFixed(0)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

// ---- Step counts (H13) ------------------------------------------------------
// The worker thins the summary to at most SUMMARY_MAX_POINTS rows
// (worker/sim-worker/simworker/config.py), and each row is a simulator time
// step, of which a report step can hold several. The Results tab used to
// print `days.length` as "report steps". Since the fix the worker writes the
// real counts in `summary.steps`; a summary from an older build has none.
export const SUMMARY_MAX_POINTS = 5000;

const count = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

/**
 * @returns {{ reportSteps: number|null, timeSteps: number|null, stride: number|null, points: number, recorded: boolean }}
 *   timeSteps is null when an older summary may have been thinned.
 */
export function summaryStepCount(summary) {
  const points = Array.isArray(summary?.days) ? summary.days.length : 0;
  const st = summary?.steps;
  if (st && count(st.time_steps) != null) {
    return {
      reportSteps: count(st.report_steps),
      timeSteps: count(st.time_steps),
      stride: count(st.stride) ?? 1,
      points,
      recorded: true,
    };
  }
  // Older worker: a series of at most half the cap cannot have been thinned
  // (thinning starts above the cap and leaves more than half of it).
  const unthinned = points <= SUMMARY_MAX_POINTS / 2;
  return { reportSteps: null, timeSteps: unthinned ? points : null, stride: unthinned ? 1 : null, points, recorded: false };
}

const n = (v) => Number(v).toLocaleString('en-US');

/** The step sentence of the Results tab. */
export function summaryStepText(summary) {
  const c = summaryStepCount(summary);
  if (c.recorded) {
    const head = `${c.reportSteps != null ? `${n(c.reportSteps)} report steps, ` : ''}${n(c.timeSteps)} simulator time steps`;
    return c.stride > 1
      ? `${head}; 1 time step in ${c.stride} is plotted and exported (${n(c.points)} points)`
      : head;
  }
  if (c.timeSteps != null) {
    return `${n(c.timeSteps)} simulator time steps (the report step count was not recorded by the worker build that ran this)`;
  }
  return `${n(c.points)} plotted points (the run may hold more time steps; the worker build that ran this did not record the count)`;
}

/** Tooltip for the stored step number of a run row. */
export const RUN_STEPS_TITLE = 'Report steps of the run. A run made before the worker recorded them (October 2026) stored the number of plotted points here.';
