// AI Evaluation Studio (Data & AI D5): what a saved evaluation run holds.
//
// A run stores its INPUTS (the dataset it used and the spec as typed, the
// bootstrap seed included), the ENGINE it ran on (the petrolord-engines commit
// pinned in packages/engines/VENDOR.json) and a SUMMARY of what the runs found
// when it was saved: the retrieval metric means with the excluded queries,
// the system comparison with its interval and seed, the groundedness and
// extraction scores, the three kappas and the calibration scores, and a
// fingerprint of the exact dataset used. With the same dataset, spec, seed and
// engine every number is reproduced exactly; everything on screen is
// recomputed by the engine when a run is rerun, and if the dataset has
// changed since, the fingerprints differ and the page says so.
//
// The Ekene synthetic documents are part of the build and are referenced by
// name. An uploaded dataset is kept in the run up to MAX_SAVED_UPLOAD_CHARS;
// beyond that the run keeps the spec only and asks for the files again.
// Output of the optional language-model helper is never saved as a result.
import { snapshotDataset } from '@/utils/dataAi/evalData';
import { defaultSpec, ENGINE_COMMIT, ENGINE_VERSION } from '@/utils/dataAi/evalWorkflows';

export const STUDY_SCHEMA = 1;
export const EVAL_ROUTE = '/dashboard/apps/data-ai/ai-evaluation-studio';
export const SOURCES = ['ekene', 'upload'];

/** FNV-1a (32 bit) over the dataset's passages, queries, judgments, systems, labels and calibration rows, as hex. */
export function fingerprint(dataset) {
  if (!dataset || !Array.isArray(dataset.documents)) return null;
  let h = 0x811c9dc5;
  const feed = (s) => {
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  dataset.documents.forEach((d) => { feed(d.id); feed('\u0000'); feed(d.text); feed('\u0001'); });
  feed(JSON.stringify(dataset.queries));
  feed(JSON.stringify(dataset.judgments));
  feed(JSON.stringify(dataset.second || null));
  feed(JSON.stringify(dataset.systems || []));
  feed(JSON.stringify(dataset.extraction || null));
  feed(JSON.stringify(dataset.calibration || null));
  return h.toString(16).padStart(8, '0');
}

/** The part of each input a job's result depends on, as a stamp. */
export function stampFor(job, datasetPrint, spec) {
  const r = spec.retrieval;
  const retrieval = {
    method: r.method, k: r.k, k1: r.k1, b: r.b, stopWords: r.stopWords, sublinearTf: r.sublinearTf,
  };
  const usesRetrieval = (src) => src === 'retrieval';
  const params = {
    retrieval: { ...retrieval, query: r.query },
    metrics: { m: spec.metrics, r: usesRetrieval(spec.metrics.source) ? retrieval : null },
    compare: {
      m: { ...spec.metrics, source: undefined }, c: spec.compare, r: usesRetrieval(spec.compare.a) || usesRetrieval(spec.compare.b) ? retrieval : null,
    },
    answers: spec.answers,
    extraction: spec.extraction,
    agreement: {},
    calibration: spec.calibration,
  }[job];
  return JSON.stringify({ d: datasetPrint || '', params });
}

const err = (r) => (r && r.error ? { refused: r.error } : null);

/** The part of each result worth keeping as the record of the run. */
export function summarise({ dataset, datasetPrint, results }) {
  if (!dataset) return null;
  const out = {
    dataset: dataset.label,
    source: dataset.source,
    passages: dataset.documents.length,
    queries: dataset.queries.length,
    fingerprint: datasetPrint || fingerprint(dataset),
    engine: ENGINE_VERSION,
    engineCommit: ENGINE_COMMIT,
    ranAt: new Date().toISOString(),
  };
  const R = (k) => results[k]?.result;
  const rt = R('retrieval');
  if (rt) out.retrieval = err(rt.result) || { settings: rt.settings, queries: rt.result.perQuery.length };
  const mt = R('metrics');
  if (mt) {
    const e = mt.evaluation;
    out.metrics = err(e) || {
      source: mt.source, k: e.k, relevantGrade: e.relevantGrade, gain: e.gain, noRelevant: e.noRelevant, nIncluded: e.nIncluded, mean: e.mean, excluded: e.excluded, zeroed: e.zeroed,
    };
  }
  const cp = R('compare');
  if (cp) {
    const c = err(cp.a.evaluation) || err(cp.b.evaluation) || err(cp.refused) || err(cp.paired);
    out.compare = c || {
      a: cp.a.source,
      b: cp.b.source,
      metric: cp.metric.value,
      queries: cp.queries.length,
      meanA: cp.paired.meanA,
      meanB: cp.paired.meanB,
      difference: cp.paired.difference,
      lower: cp.paired.lower,
      upper: cp.paired.upper,
      labels: cp.paired.labels,
      shareAtOrBelowZero: cp.paired.shareAtOrBelowZero,
      paired: cp.paired.paired,
      nBoot: cp.paired.nBoot,
      seed: cp.paired.seed,
      level: cp.paired.level,
    };
  }
  const an = R('answers');
  if (an) {
    out.answers = err(an.check) || {
      system: an.system, nClaims: an.check.nClaims, nSupported: an.check.nSupported, supportedFraction: an.check.supportedFraction, unknownCitations: an.check.unknownCitations, notRetrievedCitations: an.check.notRetrievedCitations, numericRelTol: an.check.numericRelTol, shortExact: an.short.exact, shortN: an.short.n,
    };
  }
  const ex = R('extraction');
  if (ex && ex.result) {
    const o = ex.result.overall;
    out.extraction = err(ex.result) || {
      system: ex.system, microAccuracy: o.microAccuracy, macroAccuracy: o.macroAccuracy, microF1: o.microF1, macroF1: o.macroF1, correct: o.correct, wrong: o.wrong, missed: o.missed, unsupported: o.unsupported,
    };
  }
  const ag = R('agreement');
  if (ag && ag.results) {
    out.agreement = { pairs: ag.pairs, ...Object.fromEntries(Object.entries(ag.results).map(([w, r]) => [w, r.error ? { refused: r.error } : r.kappa])) };
  }
  const cl = R('calibration');
  if (cl && cl.result) {
    const c = cl.result;
    out.calibration = err(c) || {
      n: c.n, bins: c.bins, brier: c.brier, ece: c.ece, mce: c.mce, logLoss: c.logLoss, closure: c.murphy.closure,
    };
  }
  return out;
}

/** The payload a save writes. */
export function serializeStudy({
  name, dataset, datasetPrint, spec, results,
}) {
  const snap = dataset && dataset.source === 'upload' ? snapshotDataset(dataset) : null;
  return {
    name,
    schema: STUDY_SCHEMA,
    source: dataset && SOURCES.includes(dataset.source) ? dataset.source : null,
    dataRef: dataset?.source === 'ekene' ? { fixture: 'ekene-docs', commit: ENGINE_COMMIT } : null,
    snapshot: snap,
    snapshotOmitted: dataset?.source === 'upload' && !snap ? true : undefined,
    spec,
    engine: { commit: ENGINE_COMMIT, version: ENGINE_VERSION },
    summary: summarise({ dataset, datasetPrint, results: results || {} }),
    modified: new Date().toISOString(),
  };
}

/** A stored spec merged over the defaults, so an older save still opens. */
export function specFromPayload(spec) {
  const d = defaultSpec();
  if (!spec || typeof spec !== 'object') return d;
  const out = {};
  Object.keys(d).forEach((k) => { out[k] = { ...d[k], ...(spec[k] && typeof spec[k] === 'object' ? spec[k] : {}) }; });
  return out;
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
