// ML Workbench (Data & AI D2): what a saved ML run holds.
//
// A run stores its INPUTS (where the data came from and the spec as typed)
// and a SUMMARY of what the run found when it was saved: the pooled
// held-out scores, the per-fold scores, the rows and wells used and a
// fingerprint of the exact numbers fitted. Everything on screen is
// recomputed by the engine when a run opens; if the data has changed since,
// the fingerprints differ and the app says so.
//
// Registry wells are referenced by id and read again on open. An uploaded
// table is not stored anywhere else, so its columns are kept in the run (up
// to MAX_SAVED_UPLOAD_VALUES numbers); beyond that the run keeps the spec
// only and asks for the file again.
import { snapshotTable } from '@/utils/dataAi/mlData';
import { defaultSpec, ENGINE_VERSION } from '@/utils/dataAi/mlWorkflows';

export const STUDY_SCHEMA = 1;
export const ML_WORKBENCH_ROUTE = '/dashboard/apps/data-ai/ml-workbench';
export const SOURCES = ['wells', 'upload'];
export const TASKS = ['regression', 'classification'];

/** FNV-1a (32 bit) over the fitted numbers: X, y and the groups, as hex. */
export function fingerprint(design) {
  if (!design || !Array.isArray(design.X)) return null;
  let h = 0x811c9dc5;
  const feed = (s) => {
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  feed(JSON.stringify(design.names));
  for (let i = 0; i < design.X.length; i += 1) {
    feed(design.groups[i]);
    feed(JSON.stringify(design.X[i]));
    feed(String(design.y[i]));
  }
  return h.toString(16).padStart(8, '0');
}

const pooledOf = (task, e) => {
  if (!e || e.error || !e.pooled) return null;
  if (task === 'classification') {
    const { report, roc, logLoss } = e.pooled;
    return {
      accuracy: report.error ? null : report.accuracy,
      f1Class1: report.error ? null : report.perClass[1].f1,
      auc: roc.error ? null : roc.auc,
      logLoss: logLoss.error ? null : logLoss.logLoss,
    };
  }
  const { rmse, mae, r2, n } = e.pooled;
  return { rmse, mae, r2, n };
};

/** The part of an evaluation worth keeping as the record of the run. */
export function summarise({ task, design, parsed, evaluation }) {
  if (!evaluation || !design) return null;
  return {
    task,
    target: design.targetText,
    features: design.names,
    model: parsed.model,
    standardised: parsed.standardise,
    validation: evaluation.error ? null : { scheme: evaluation.scheme, k: evaluation.k ?? null, testFraction: evaluation.testFraction ?? null, seed: evaluation.seed },
    refused: evaluation.error || evaluation.pooledRefusal || null,
    pooled: pooledOf(task, evaluation),
    folds: evaluation.error ? [] : evaluation.folds.map((f) => ({
      fold: f.fold,
      testGroups: f.testGroups,
      nTest: f.nTest,
      error: f.error || null,
      score: f.error ? null : (task === 'classification'
        ? { auc: f.test.roc.error ? null : f.test.roc.auc, accuracy: f.test.report.error ? null : f.test.report.accuracy, converged: f.fit.converged }
        : { rmse: f.test.rmse, mae: f.test.mae, r2: f.test.r2 }),
    })),
    rows: design.X.length,
    wells: design.wells,
    fingerprint: fingerprint(design),
    engine: ENGINE_VERSION,
    ranAt: new Date().toISOString(),
  };
}

/** The payload a save writes. */
export function serializeStudy({
  name, source, dataRef, table, spec, task, design, parsed, evaluation,
}) {
  const snap = source === 'upload' && table ? snapshotTable(table) : null;
  return {
    name,
    schema: STUDY_SCHEMA,
    source: SOURCES.includes(source) ? source : null,
    dataRef: dataRef || null,
    snapshot: snap,
    snapshotOmitted: source === 'upload' && table && !snap ? true : undefined,
    spec,
    summary: summarise({
      task, design, parsed, evaluation,
    }),
    modified: new Date().toISOString(),
  };
}

/** A stored spec merged over the defaults, so an older save still opens. */
export function specFromPayload(spec) {
  const d = defaultSpec();
  if (!spec || typeof spec !== 'object') return d;
  return {
    ...d,
    ...spec,
    task: TASKS.includes(spec.task) ? spec.task : d.task,
    features: Array.isArray(spec.features) ? spec.features.filter((f) => f && typeof f.name === 'string').map((f) => ({ name: f.name, log: !!f.log })) : [],
    label: { ...d.label, ...(spec.label || {}) },
    model: { ...d.model, ...(spec.model || {}) },
    validation: { ...d.validation, ...(spec.validation || {}) },
    tools: { ...d.tools, ...(spec.tools || {}) },
    standardise: spec.standardise !== false,
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
    summary: payload.summary || null,
  };
}
