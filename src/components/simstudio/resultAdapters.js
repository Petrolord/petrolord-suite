// summary.json (worker output) -> chart-ready series. Pure + jest-tested.
// Shape: { opm_version, deck_sha256, start_date, days: [], field: {KEY: []},
//          wells: {NAME: {WOPR: [], ...}} }

export const VECTOR_META = {
  FOPR: { label: 'Field oil rate', unit: 'STB/d' },
  FOPT: { label: 'Field oil total', unit: 'STB' },
  FWPR: { label: 'Field water rate', unit: 'STB/d' },
  FWCT: { label: 'Field water cut', unit: 'frac' },
  FGPR: { label: 'Field gas rate', unit: 'Mscf/d' },
  FGOR: { label: 'Field GOR', unit: 'Mscf/STB' },
  FPR: { label: 'Field pressure', unit: 'psia' },
  WOPR: { label: 'Well oil rate', unit: 'STB/d' },
  WWPR: { label: 'Well water rate', unit: 'STB/d' },
  WGPR: { label: 'Well gas rate', unit: 'Mscf/d' },
  WBHP: { label: 'Well BHP', unit: 'psia' },
  WWCT: { label: 'Well water cut', unit: 'frac' },
};

/** Field vectors present in the summary, in a stable display order. */
export function availableFieldVectors(summary) {
  if (!summary?.field) return [];
  return Object.keys(VECTOR_META).filter((k) => Array.isArray(summary.field[k]));
}

/** Well vector bases present on at least one well. */
export function availableWellVectors(summary) {
  if (!summary?.wells) return [];
  const bases = new Set();
  Object.values(summary.wells).forEach((entry) => {
    Object.keys(entry).forEach((b) => bases.add(b));
  });
  return ['WOPR', 'WWPR', 'WGPR', 'WBHP', 'WWCT'].filter((b) => bases.has(b));
}

export function wellNames(summary) {
  return Object.keys(summary?.wells || {});
}

/** Rows for a single field vector: [{day, value}]. */
export function fieldSeries(summary, key) {
  const days = summary?.days || [];
  const values = summary?.field?.[key] || [];
  return days.map((day, i) => ({ day, value: values[i] ?? null }));
}

/** Rows for one well-vector base across wells: [{day, <well>: v, ...}]. */
export function wellSeries(summary, base) {
  const days = summary?.days || [];
  const wells = summary?.wells || {};
  return days.map((day, i) => {
    const row = { day };
    Object.entries(wells).forEach(([name, entry]) => {
      if (Array.isArray(entry[base])) row[name] = entry[base][i] ?? null;
    });
    return row;
  });
}

/** Elapsed pretty-printer for the runs table. */
export function fmtElapsed(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—';
  const s = Number(seconds);
  if (s < 90) return `${s.toFixed(0)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}
