// Production Forecasting ML Workbench (Data & AI D4): what a saved forecast
// run holds.
//
// A run stores its INPUTS (where the series came from and the spec as typed,
// the bootstrap seed and the number of paths included), the ENGINE it ran on
// (the petrolord-engines commit pinned in packages/engines/VENDOR.json) and a
// SUMMARY of what the runs found when it was saved: the fitted parameters
// with the optimiser's record, the Arps fit, the backtest ranking and the
// field-wide counts, and a fingerprint of the exact series used. With the
// same series, spec, seed and engine every number is reproduced exactly;
// everything on screen is recomputed by the engine when a run is rerun, and
// if the series has changed since, the fingerprints differ and the page says
// so.
//
// Spine wells are referenced by id and read again on open. An uploaded
// table is kept in the run (up to MAX_SAVED_UPLOAD_VALUES values); beyond
// that the run keeps the spec only and asks for the file again.
import { snapshotForecastTable } from '@/utils/dataAi/forecastData';
import { defaultSpec, ENGINE_COMMIT, ENGINE_VERSION } from '@/utils/dataAi/forecastWorkflows';

export const STUDY_SCHEMA = 1;
export const FORECASTING_ROUTE = '/dashboard/apps/data-ai/forecasting-ml-workbench';
export const SOURCES = ['upload', 'spine'];

/** FNV-1a (32 bit) over every well's name and values, as hex. */
export function fingerprint(table) {
  if (!table || !Array.isArray(table.wells)) return null;
  let h = 0x811c9dc5;
  const feed = (s) => {
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  table.wells.forEach((w) => { feed(w.name); feed(JSON.stringify(w.values)); });
  return h.toString(16).padStart(8, '0');
}

const fitSummary = (r) => (r.error ? { refused: r.error } : {
  params: r.params,
  fixed: r.fixed,
  sse: r.sse,
  mse: r.mse,
  converged: r.optimiser ? r.optimiser.converged : null,
  atBounds: r.optimiser ? r.optimiser.atBounds : [],
  evaluations: r.optimiser ? r.optimiser.evaluations : 0,
});

/** The part of each result worth keeping as the record of the run. */
export function summarise({ table, results }) {
  if (!table) return null;
  const out = {
    wells: table.wells.length,
    steps: table.wells.reduce((s, w) => s + w.values.length, 0),
    fingerprint: fingerprint(table),
    engine: ENGINE_VERSION,
    engineCommit: ENGINE_COMMIT,
    ranAt: new Date().toISOString(),
  };
  const fit = results.fit?.result;
  if (fit) {
    out.fit = {
      well: fit.well, n: fit.n, h: fit.h, methods: Object.fromEntries(Object.entries(fit.fits).map(([m, r]) => [m, fitSummary(r)])),
    };
    out.fit.arps = fit.arps.error ? { refused: fit.arps.error } : {
      modelType: fit.arps.modelType, qi: fit.arps.qi, Di: fit.arps.Di, b: fit.arps.b,
    };
  }
  const pi = results.intervals?.result;
  if (pi) {
    out.intervals = pi.result.error ? { well: pi.well, method: pi.method, refused: pi.result.error } : {
      well: pi.well, method: pi.method, seed: pi.result.seed, nSims: pi.result.nSims, h: pi.result.forecast.length, clippedToZero: pi.result.clippedToZero,
    };
  }
  const cmp = results.compare?.result;
  if (cmp) {
    const c = cmp.result;
    out.compare = c.error ? { well: cmp.well, refused: c.error } : {
      well: cmp.well,
      firstOrigin: c.firstOrigin,
      horizon: c.horizon,
      step: c.step,
      refit: c.refit,
      rankBy: c.rankBy,
      m: cmp.m,
      origins: c.origins,
      ranking: c.ranking,
      best: c.best,
      metrics: Object.fromEntries(c.rows.map((r) => [r.method, r.error ? { refused: r.error } : { mase: r.mase, mae: r.mae, rmse: r.rmse, smape: r.smape, mape: r.mape }])),
    };
  }
  const field = results.field?.result;
  if (field) {
    out.field = {
      wells: field.wells.length, refused: field.refused, rankBy: field.rankBy, m: field.m, summary: field.summary,
    };
  }
  return out;
}

/** The payload a save writes. */
export function serializeStudy({
  name, source, dataRef, table, spec, results,
}) {
  const snap = source === 'upload' && table ? snapshotForecastTable(table) : null;
  return {
    name,
    schema: STUDY_SCHEMA,
    source: SOURCES.includes(source) ? source : null,
    dataRef: dataRef || null,
    snapshot: snap,
    snapshotOmitted: source === 'upload' && table && !snap ? true : undefined,
    spec,
    engine: { commit: ENGINE_COMMIT, version: ENGINE_VERSION },
    summary: summarise({ table, results: results || {} }),
    modified: new Date().toISOString(),
  };
}

/** A stored spec merged over the defaults, so an older save still opens. */
export function specFromPayload(spec) {
  const d = defaultSpec();
  if (!spec || typeof spec !== 'object') return d;
  const params = {};
  Object.keys(d.params).forEach((m) => { params[m] = { ...d.params[m], ...(spec.params?.[m] || {}) }; });
  return {
    ...d,
    ...spec,
    methods: { ...d.methods, ...(spec.methods || {}) },
    params,
    intervals: { ...d.intervals, ...(spec.intervals || {}) },
    backtest: { ...d.backtest, ...(spec.backtest || {}) },
  };
}

/** A stored payload back to inputs, or null when it cannot be read. */
export function studyFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || payload.schema !== STUDY_SCHEMA) return null;
  return {
    name: payload.name || '',
    source: SOURCES.includes(payload.source) ? payload.source : null,
    dataRef: payload.dataRef || null,
    snapshot: payload.snapshot || null,
    snapshotOmitted: !!payload.snapshotOmitted,
    spec: specFromPayload(payload.spec),
    engine: payload.engine || null,
    summary: payload.summary || null,
  };
}
