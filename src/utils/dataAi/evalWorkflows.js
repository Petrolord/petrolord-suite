// AI Evaluation Studio (Data & AI D5): the workflows, every number from the engine.
//
// Each function takes the dataset (evalData.js) and the parsed spec and calls
// the vendored engine (packages/engines/engines/dataai/evaluate.js through its
// one-line shim): retrieve, rankBm25, rankTfidf, evaluateRetrieval,
// bootstrapMean, pairedBootstrap, checkAnswers, answerMatch, checkGroundedness,
// scoreExtraction, cohenKappa and calibration. The engine imports its seeded
// sampling and quantiles from lib/stats and its log loss from ml.js; this
// layer computes none of them. No language model runs here: the optional
// helper's answer (evalAssist.js) is scored by the same deterministic checks.
//
// Conventions this layer adds (stated on screen and in the help guide):
//   - A setting left blank is the engine default; a number typed is passed
//     as typed. Text that is not a number is passed on as NaN and the engine
//     refuses it with its own message.
//   - Retrieval metrics score only the judged queries (a query with a
//     judgments entry, even an empty one). The runs are either the current
//     retrieval settings run over those queries, or a system's own retrieved
//     lists.
//   - Compare systems scores both runs with the same metric settings, takes
//     the per-query values of the chosen metric over the included queries
//     (the no-relevant rule decides which: excluded queries are left out;
//     with 'zero' every query stays and an undefined value counts 0, as the
//     engine's means do), and bootstraps each mean and the paired difference
//     A minus B from the same seed.
//   - Agreement pairs the first and second grade of every judged pair that
//     has both, queries in load order and passages by id, and weights over
//     every whole grade from the lowest to the highest seen.
//   - The app caps bootstrap replicates at APP_CAPS.BOOT_MAX (the engine
//     accepts more); the refusal says so.
import * as EV from '@/utils/dataAi/engine/evaluate';
import { APP_CAPS, cmpId, judgedQueryIds } from '@/utils/dataAi/evalData';

/** The engine build the studio runs: petrolord-engines at the VENDOR.json pin. */
export const ENGINE_VERSION = 'petrolord-engines 3061acc (engines/dataai/evaluate.js, PR #257; PR #258 note and basis wording, no numeric change)';
export const ENGINE_COMMIT = '3061acc000ede031cb15d7d113f0fccc47e7765d';

export const ENGINE_DEFAULTS = EV.DEFAULTS;
export const DEFAULT_SEED = 20260925;
export const ASSIST_MAX_PASSAGES = 10;

export const METHODS = [
  { value: 'bm25', label: 'BM25 (Okapi, Lucene idf)' },
  { value: 'tfidf', label: 'TF-IDF cosine (scikit-learn defaults)' },
];
export const GAINS = [
  { value: 'linear', label: 'Linear (the grade)' },
  { value: 'exponential', label: 'Exponential (2^grade - 1)' },
];
export const NO_RELEVANT = [
  { value: 'exclude', label: 'Exclude and list (trec_eval default)' },
  { value: 'zero', label: 'Keep, undefined metrics scored 0' },
];
/** Compare metric choice to the engine's per-query field. */
export const COMPARE_METRICS = [
  { value: 'ndcg', label: 'nDCG@k', key: 'ndcg' },
  { value: 'map', label: 'Average precision@k (MAP)', key: 'averagePrecision' },
  { value: 'mrr', label: 'Reciprocal rank@k (MRR)', key: 'reciprocalRank' },
  { value: 'precision', label: 'Precision@k', key: 'precision' },
  { value: 'recall', label: 'Recall@k', key: 'recall' },
  { value: 'hit', label: 'Hit@k', key: 'hit' },
];
export const LEVELS = EV.DEFAULTS.LEVELS.map((l) => ({ value: String(l), label: `${l * 100} percent` }));

/** A fresh spec: every field as typed text, read by parseSpec. */
export const defaultSpec = () => ({
  retrieval: {
    method: 'bm25', k: '5', k1: '', b: '', stopWords: false, sublinearTf: false, query: '',
  },
  metrics: {
    source: 'retrieval', k: '5', relevantGrade: '1', gain: 'linear', noRelevant: 'exclude',
  },
  compare: {
    a: 'A', b: 'B', metric: 'ndcg', nBoot: String(APP_CAPS.BOOT_DEFAULT), seed: String(DEFAULT_SEED), level: '0.95', paired: true,
  },
  answers: { system: 'A', numericRelTol: '0' },
  extraction: { system: 'A' },
  calibration: { bins: '10' },
});

/** Blank is the engine default (undefined); anything else is Number(text), NaN included. */
export const readNumber = (s) => {
  const t = String(s ?? '').trim();
  return t === '' ? undefined : Number(t);
};

export function parseSpec(spec) {
  const r = spec.retrieval; const m = spec.metrics; const c = spec.compare;
  return {
    retrieval: {
      method: r.method,
      k: readNumber(r.k),
      k1: readNumber(r.k1),
      b: readNumber(r.b),
      stopWords: !!r.stopWords,
      sublinearTf: !!r.sublinearTf,
      query: r.query || '',
    },
    metrics: {
      source: m.source || 'retrieval',
      k: readNumber(m.k),
      relevantGrade: readNumber(m.relevantGrade),
      gain: m.gain,
      noRelevant: m.noRelevant,
    },
    compare: {
      a: c.a, b: c.b, metric: c.metric, nBoot: readNumber(c.nBoot), seed: readNumber(c.seed), level: readNumber(c.level), paired: !!c.paired,
    },
    answers: { system: spec.answers.system, numericRelTol: readNumber(spec.answers.numericRelTol) },
    extraction: { system: spec.extraction.system },
    calibration: { bins: readNumber(spec.calibration.bins) },
  };
}

/** Only the arguments the engine takes for the method (it refuses the others by name). */
export function retrievalArgs(p) {
  const args = { method: p.method, stopWords: p.stopWords };
  if (p.k !== undefined) args.k = p.k;
  if (p.method === 'bm25') {
    if (p.k1 !== undefined) args.k1 = p.k1;
    if (p.b !== undefined) args.b = p.b;
  } else {
    args.sublinearTf = p.sublinearTf;
  }
  return args;
}

const metricArgs = (p) => {
  const a = { noRelevant: p.noRelevant, gain: p.gain };
  if (p.k !== undefined) a.k = p.k;
  if (p.relevantGrade !== undefined) a.relevantGrade = p.relevantGrade;
  return a;
};

const qText = (q) => ({ id: q.id, text: q.text });

/** The engine's ranking and term contributions for one query at the retrieval settings. */
export function rankOne(dataset, p, query) {
  const common = { documents: dataset.documents, query: query.text, stopWords: p.stopWords };
  if (p.k !== undefined) common.k = p.k;
  if (p.method === 'bm25') {
    return EV.rankBm25({
      ...common, ...(p.k1 !== undefined ? { k1: p.k1 } : {}), ...(p.b !== undefined ? { b: p.b } : {}),
    });
  }
  if (p.method === 'tfidf') return EV.rankTfidf({ ...common, sublinearTf: p.sublinearTf });
  return { error: "method must be 'bm25' or 'tfidf'", field: 'method' };
}

/** Retrieval over every query, and the chosen query explained term by term. */
export function runRetrieval({ dataset, parsed }) {
  const p = parsed.retrieval;
  const result = EV.retrieve({ documents: dataset.documents, queries: dataset.queries.map(qText), ...retrievalArgs(p) });
  if (result.error) return { settings: retrievalArgs(p), result };
  const q = dataset.queries.find((x) => x.id === p.query) || dataset.queries[0];
  const explain = rankOne(dataset, p, q);
  return {
    settings: retrievalArgs(p),
    result,
    explain: {
      query: q.id, text: q.text, rank: explain, judgments: dataset.judgments[q.id] || null,
    },
  };
}

/** The label of a run source. */
export function sourceLabel(dataset, source, p) {
  if (source === 'retrieval') {
    const r = p.retrieval;
    const k = r.k === undefined ? EV.DEFAULTS.K : r.k;
    return `current retrieval settings (${r.method === 'bm25' ? 'BM25' : 'TF-IDF'}, top ${k})`;
  }
  const s = dataset.systems.find((x) => x.id === source);
  return s ? `${s.name} (its retrieved lists)` : `unknown system ${source}`;
}

/**
 * The ranked lists of one source for the judged queries: the retrieval
 * settings run over them, or a system's retrieved lists. Returns { runs } or
 * { error, field } (the engine's, or the app's when a system is unknown).
 */
export function runsFor(dataset, parsed, source) {
  const judged = judgedQueryIds(dataset);
  if (source === 'retrieval') {
    const queries = dataset.queries.filter((q) => dataset.judgments[q.id]).map(qText);
    if (!queries.length) return { error: 'judgments must be a non-empty object mapping query id to { document id: grade }: no query is judged', field: 'judgments' };
    const r = EV.retrieve({ documents: dataset.documents, queries, ...retrievalArgs(parsed.retrieval) });
    if (r.error) return r;
    return { runs: r.runs, retrieval: { basis: r.basis, settings: retrievalArgs(parsed.retrieval) } };
  }
  const s = dataset.systems.find((x) => x.id === source);
  if (!s) return { error: `system ${source} is not in this dataset`, field: 'source' };
  const runs = {};
  s.answers.forEach((a) => { if (judged.includes(a.query) && Array.isArray(a.retrieved)) runs[a.query] = a.retrieved; });
  return { runs };
}

const judgedOnly = (dataset) => Object.fromEntries(judgedQueryIds(dataset).map((q) => [q, dataset.judgments[q]]));

/** Per-query retrieval metrics and their means for one source. */
export function runMetrics({ dataset, parsed }) {
  const source = parsed.metrics.source;
  const label = sourceLabel(dataset, source, parsed);
  const r = runsFor(dataset, parsed, source);
  if (r.error) return { source, label, evaluation: r };
  const evaluation = EV.evaluateRetrieval({ runs: r.runs, judgments: judgedOnly(dataset), ...metricArgs(parsed.metrics) });
  return {
    source, label, retrieval: r.retrieval || null, evaluation,
  };
}

const capBoot = (nBoot) => (typeof nBoot === 'number' && Number.isFinite(nBoot) && nBoot > APP_CAPS.BOOT_MAX
  ? { error: `nBoot is ${nBoot}; this studio runs up to ${APP_CAPS.BOOT_MAX.toLocaleString('en-US')} bootstrap replicates (the engine accepts ${EV.DEFAULTS.MAX_BOOT.toLocaleString('en-US')})`, field: 'nBoot' }
  : null);

const bootArgs = (c) => {
  const a = {};
  if (c.nBoot !== undefined) a.nBoot = c.nBoot;
  if (c.seed !== undefined) a.seed = c.seed;
  if (c.level !== undefined) a.level = c.level;
  return a;
};

/** The per-query values of one metric over the included queries, in query id order. */
export function includedValues(evaluation, key) {
  const excluded = new Set((evaluation.excluded || []).map((e) => e.query));
  const rows = evaluation.perQuery.filter((r) => !excluded.has(r.query));
  return { queries: rows.map((r) => r.query), values: rows.map((r) => (r[key] === null ? 0 : r[key])) };
}

/**
 * System A against system B on one metric: each system's mean with its
 * percentile bootstrap interval, and the bootstrap of A minus B (paired by
 * query unless turned off), all from the same seed.
 */
export function runCompare({ dataset, parsed }) {
  const c = parsed.compare;
  const metric = COMPARE_METRICS.find((m) => m.value === c.metric) || COMPARE_METRICS[0];
  const settings = { ...metricArgs(parsed.metrics), metric: metric.value, ...bootArgs(c), paired: c.paired };
  const side = (source) => {
    const label = sourceLabel(dataset, source, parsed);
    const r = runsFor(dataset, parsed, source);
    if (r.error) return { source, label, evaluation: r };
    return { source, label, evaluation: EV.evaluateRetrieval({ runs: r.runs, judgments: judgedOnly(dataset), ...metricArgs(parsed.metrics) }) };
  };
  const A = side(c.a);
  const B = side(c.b);
  const out = { settings, metric, a: A, b: B };
  if (A.evaluation.error || B.evaluation.error) return out;
  const va = includedValues(A.evaluation, metric.key);
  const vb = includedValues(B.evaluation, metric.key);
  // same judgments, same rule: the two included sets are the same queries
  out.queries = va.queries;
  out.values = { a: va.values, b: vb.values };
  const cap = capBoot(c.nBoot);
  if (cap) { out.refused = cap; return out; }
  out.bootA = EV.bootstrapMean({ values: va.values, ...bootArgs(c) });
  out.bootB = EV.bootstrapMean({ values: vb.values, ...bootArgs(c) });
  out.paired = EV.pairedBootstrap({
    a: va.values, b: vb.values, ...bootArgs(c), paired: c.paired,
  });
  return out;
}

/** A system's answers: groundedness of every claim, and SQuAD match of its short answers. */
export function runAnswers({ dataset, parsed }) {
  const p = parsed.answers;
  const s = dataset.systems.find((x) => x.id === p.system);
  if (!s) return { system: p.system, check: { error: `system ${p.system} is not in this dataset`, field: 'system' } };
  const answers = s.answers.map((a) => ({ query: a.query, text: a.text, citations: a.citations }));
  const withRuns = s.answers.length > 0 && s.answers.every((a) => Array.isArray(a.retrieved));
  const args = { answers, documents: dataset.documents };
  if (withRuns) args.runs = Object.fromEntries(s.answers.map((a) => [a.query, a.retrieved]));
  if (p.numericRelTol !== undefined) args.numericRelTol = p.numericRelTol;
  const check = EV.checkAnswers(args);
  const refs = new Map(dataset.queries.map((q) => [q.id, q.reference]));
  const rows = s.answers
    .filter((a) => typeof a.short === 'string' && typeof refs.get(a.query) === 'string')
    .map((a) => ({ query: a.query, prediction: a.short, truth: refs.get(a.query), match: EV.answerMatch({ prediction: a.short, truth: refs.get(a.query) }) }));
  const ok = rows.filter((r) => !r.match.error);
  return {
    system: s.id,
    name: s.name,
    withRuns,
    check,
    short: {
      rows,
      n: ok.length,
      exact: ok.filter((r) => r.match.exactMatch).length,
      meanF1: ok.length ? ok.reduce((t, r) => t + r.match.f1, 0) / ok.length : null,
    },
  };
}

/** A system's extracted fields scored against the labels. */
export function runExtraction({ dataset, parsed }) {
  const ex = dataset.extraction;
  const system = parsed.extraction.system;
  if (!ex) return { system, result: null };
  const predictions = ex.predictions?.[system];
  if (!predictions) return { system, result: { error: `predictions has no records for system ${system}`, field: 'predictions' } };
  return { system, result: EV.scoreExtraction({ labels: ex.labels, predictions, fields: ex.fields }) };
}

/** Cohen's kappa between the two graders, unweighted, linear and quadratic. */
export function runAgreement({ dataset }) {
  if (!dataset.second) return { pairs: 0, missingSecond: 0, results: null };
  const a = []; const b = []; let missing = 0;
  judgedQueryIds(dataset).forEach((q) => {
    Object.keys(dataset.judgments[q]).sort(cmpId).forEach((d) => {
      const g2 = dataset.second[q]?.[d];
      if (g2 === undefined) { missing += 1; return; }
      a.push(dataset.judgments[q][d]);
      b.push(g2);
    });
  });
  const nums = a.concat(b).filter((v) => Number.isInteger(v));
  const labels = nums.length === a.length + b.length && nums.length
    ? Array.from({ length: Math.max(...nums) - Math.min(...nums) + 1 }, (_, i) => Math.min(...nums) + i)
    : undefined;
  const call = (weights) => EV.cohenKappa({
    a, b, weights, ...(labels && labels.length <= EV.DEFAULTS.MAX_LABELS ? { labels } : {}),
  });
  return {
    pairs: a.length,
    missingSecond: missing,
    labels: labels || null,
    results: { none: call('none'), linear: call('linear'), quadratic: call('quadratic') },
  };
}

/** Reliability table, ECE, MCE, Brier with the Murphy decomposition and log loss. */
export function runCalibration({ dataset, parsed }) {
  if (!dataset.calibration) return { result: null };
  const rows = dataset.calibration.rows;
  const args = { yTrue: rows.map((r) => r.outcome), probabilities: rows.map((r) => r.probability) };
  if (parsed.calibration.bins !== undefined) args.bins = parsed.calibration.bins;
  return { result: EV.calibration(args) };
}

/**
 * The passages the optional helper is given for one query: the top of the
 * current retrieval settings, at most ASSIST_MAX_PASSAGES.
 */
export function assistContext({ dataset, parsed, queryId }) {
  const q = dataset.queries.find((x) => x.id === queryId);
  if (!q) return { error: `query ${queryId} is not in this dataset`, field: 'query' };
  const rank = rankOne(dataset, parsed.retrieval, q);
  if (rank.error) return { query: q.id, text: q.text, rank };
  const ids = rank.ranking.slice(0, ASSIST_MAX_PASSAGES).map((r) => r.id);
  const byId = new Map(dataset.documents.map((d) => [d.id, d]));
  return {
    query: q.id,
    text: q.text,
    rank,
    retrieved: ids,
    trimmed: rank.ranking.length > ASSIST_MAX_PASSAGES,
    passages: ids.map((id) => ({ id, text: byId.get(id).text })),
  };
}

/** The helper's answer scored by the deterministic groundedness check. */
export function assistCheck({
  dataset, parsed, answer, citations, retrieved,
}) {
  const args = {
    answer, citations, documents: dataset.documents, retrieved,
  };
  if (parsed.answers.numericRelTol !== undefined) args.numericRelTol = parsed.answers.numericRelTol;
  return EV.checkGroundedness(args);
}

/** Every engine refusal in a set of results, for the report. */
export function collectRefusals(results) {
  const out = [];
  const add = (where, r) => { if (r && r.error) out.push({ where, text: r.error }); };
  const R = (k) => results[k]?.result;
  add('retrieval', R('retrieval')?.result);
  add('retrieval explain', R('retrieval')?.explain?.rank);
  add('metrics', R('metrics')?.evaluation);
  add('compare A', R('compare')?.a?.evaluation);
  add('compare B', R('compare')?.b?.evaluation);
  add('compare', R('compare')?.refused);
  add('compare bootstrap A', R('compare')?.bootA);
  add('compare bootstrap B', R('compare')?.bootB);
  add('compare paired', R('compare')?.paired);
  add('answers', R('answers')?.check);
  add('extraction', R('extraction')?.result);
  const ag = R('agreement')?.results;
  if (ag) Object.entries(ag).forEach(([w, r]) => add(`kappa ${w}`, r));
  add('calibration', R('calibration')?.result);
  return out;
}
