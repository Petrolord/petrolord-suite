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
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
  const s = Number(seconds);
  if (s < 90) return `${s.toFixed(0)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}
