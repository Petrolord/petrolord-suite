/**
 * AI Evaluation Studio (Data & AI D5): the workflow layer against the
 * engine's oracle goldens.
 *
 * The engine itself is gated in packages/engines/__tests__/dataai.evaluate.test.js
 * (2,707 tests against a stdlib oracle and scikit-learn pins). These tests run
 * the STUDIO's workflows (the dataset loader, the spec parser, the arguments
 * each workflow passes, the source runs, the included-query values and the
 * seeds) on the Ekene synthetic documents and compare what comes out with the
 * values the independent oracle wrote into
 * packages/engines/test-data/dataai/goldens/evaluate_cases.json. A workflow
 * that passed the wrong k, grade, seed or run lists would differ from the
 * oracle, so these fail. No expected value here is computed by restating a
 * formula.
 */
import fs from 'fs';
import path from 'path';
import {
  ekeneDataset, uploadDataset, passagesFromCsv, queriesFromCsv, judgmentsFromCsv, calibrationFromCsv, datasetFromJson,
  datasetCounts, snapshotDataset, datasetFromSnapshot, APP_CAPS,
} from '@/utils/dataAi/evalData';
import {
  defaultSpec, parseSpec, runRetrieval, runMetrics, runCompare, runAnswers, runExtraction, runAgreement, runCalibration,
  assistContext, assistCheck, retrievalArgs, collectRefusals, ENGINE_COMMIT, DEFAULT_SEED,
} from '@/utils/dataAi/evalWorkflows';

const ROOT = path.resolve(__dirname, '../../../..');
const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/engines/test-data/dataai/goldens/evaluate_cases.json'), 'utf8'));
const FLOOR = G.tolerance.absoluteFloor;
const golden = (id) => {
  const c = G.cases.find((x) => x.id === id);
  if (!c) throw new Error(`golden case ${id} is missing from evaluate_cases.json`);
  return c;
};

/** The engine test's comparison: numbers within the case tolerance, everything else exactly; basis is not compared. */
const diff = (actual, expected, tol, where = '') => {
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || !Number.isFinite(actual)) return [`${where}: ${actual} is not a finite number (expected ${expected})`];
    const d = Math.abs(actual - expected);
    return d <= FLOOR || d <= tol * Math.abs(expected) ? [] : [`${where}: ${actual} vs ${expected}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return [`${where}: array length ${actual && actual.length} vs ${expected.length}`];
    return expected.flatMap((e, i) => diff(actual[i], e, tol, `${where}[${i}]`));
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') return [`${where}: ${actual} is not an object`];
    const extra = Object.keys(actual).filter((k) => !(k in expected) && k !== 'basis');
    const missing = Object.keys(expected).filter((k) => !(k in actual));
    const keyErr = extra.length || missing.length ? [`${where}: keys differ (app only: ${extra.join(', ')}; oracle only: ${missing.join(', ')})`] : [];
    return keyErr.concat(Object.keys(expected).filter((k) => k !== 'basis').flatMap((k) => diff(actual[k], expected[k], tol, `${where}.${k}`)));
  }
  return actual === expected ? [] : [`${where}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`];
};
const expectGolden = (actual, id) => {
  const c = golden(id);
  expect(diff(actual, c.expected, c.tol ?? 1e-10)).toEqual([]);
};

const D = ekeneDataset();
const specWith = (patch) => {
  const s = defaultSpec();
  Object.entries(patch).forEach(([k, v]) => { s[k] = { ...s[k], ...v }; });
  return parseSpec(s);
};

describe('the Ekene synthetic documents dataset', () => {
  it('is the fixture the engine gate and the course read, whole', () => {
    expect(datasetCounts(D)).toEqual({
      passages: 60, queries: 24, judgedQueries: 24, judgedPairs: 183, secondGrades: 183, systems: 2, extractionRecords: 30, calibrationRows: 200,
    });
    expect(D.synthetic).toBe(true);
    expect(D.notes[0]).toMatch(/^Synthetic teaching data for the Ekene field/);
    expect(D.systems.map((s) => s.name)).toEqual(['System A', 'System B']);
    expect(D.systems[0].retriever).toEqual({
      method: 'bm25', k: 5, k1: 1.2, b: 0.75, stopWords: false,
    });
  });

  it('carries the same passages and queries the engine goldens were written from', () => {
    const r = golden('retrieve-bm25-k5').args;
    expect(D.documents.map((d) => ({ id: d.id, text: d.text }))).toEqual(r.documents);
    expect(D.queries.map((q) => ({ id: q.id, text: q.text }))).toEqual(r.queries);
  });

  it('is referenced, never copied, by a saved run', () => {
    expect(snapshotDataset(D)).toBeNull();
  });
});

describe('the spec', () => {
  it('reads a blank as the engine default and passes anything else as a number, NaN included', () => {
    const p = specWith({ retrieval: { k: '', k1: ' ', b: 'x' } }).retrieval;
    expect(p.k).toBeUndefined();
    expect(p.k1).toBeUndefined();
    expect(Number.isNaN(p.b)).toBe(true);
  });

  it('passes only the arguments the method takes', () => {
    expect(retrievalArgs(specWith({ retrieval: { method: 'tfidf', k1: '2', b: '0.5' } }).retrieval)).toEqual({
      method: 'tfidf', stopWords: false, k: 5, sublinearTf: false,
    });
    expect(retrievalArgs(specWith({ retrieval: { method: 'bm25', k1: '2', sublinearTf: true } }).retrieval)).toEqual({
      method: 'bm25', stopWords: false, k: 5, k1: 2,
    });
  });

  it('defaults to top 5, grade 1, linear gain, exclude, 2,000 replicates, seed 20260925 and 95 percent', () => {
    const p = parseSpec(defaultSpec());
    expect(p.metrics).toEqual({
      source: 'retrieval', k: 5, relevantGrade: 1, gain: 'linear', noRelevant: 'exclude',
    });
    expect(p.compare).toEqual({
      a: 'A', b: 'B', metric: 'ndcg', nBoot: 2000, seed: DEFAULT_SEED, level: 0.95, paired: true,
    });
    expect(DEFAULT_SEED).toBe(20260925);
  });

  it('names the vendored engine pin', () => {
    const vendor = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/engines/VENDOR.json'), 'utf8'));
    expect(ENGINE_COMMIT).toBe(vendor.canonical.commit);
  });
});

describe('retrieval', () => {
  it.each([
    ['retrieve-bm25-k5', { method: 'bm25', k: '5' }],
    ['retrieve-tfidf-k5', { method: 'tfidf', k: '5' }],
    ['retrieve-bm25-k10', { method: 'bm25', k: '10' }],
    ['retrieve-tfidf-k10', { method: 'tfidf', k: '10' }],
    ['retrieve-bm25-b04-stop', { method: 'bm25', k: '10', b: '0.4', stopWords: true }],
    ['retrieve-tfidf-sublinear', { method: 'tfidf', k: '10', sublinearTf: true }],
  ])('runs every query as the oracle did (%s)', (id, r) => {
    expectGolden(runRetrieval({ dataset: D, parsed: specWith({ retrieval: r }) }).result, id);
  });

  it.each([
    'bm25-ekene-Q01', 'bm25-ekene-Q10', 'bm25-ekene-Q14', 'bm25-ekene-Q10-k1-tie-at-cutoff', 'bm25-ekene-Q11-stop',
    'bm25-ekene-Q06-b0', 'bm25-ekene-Q13-k1-2', 'bm25-ekene-Q12-k1-0',
    'tfidf-ekene-Q01', 'tfidf-ekene-Q10', 'tfidf-ekene-Q13-sublinear', 'tfidf-ekene-Q11-stop',
  ])('explains the chosen query term by term with ties shown (%s)', (id) => {
    const a = golden(id).args;
    const q = D.queries.find((x) => x.text === a.query);
    const r = {
      method: id.startsWith('bm25') ? 'bm25' : 'tfidf',
      k: String(a.k),
      k1: a.k1 === undefined ? '' : String(a.k1),
      b: a.b === undefined ? '' : String(a.b),
      stopWords: !!a.stopWords,
      sublinearTf: !!a.sublinearTf,
      query: q.id,
    };
    const out = runRetrieval({ dataset: D, parsed: specWith({ retrieval: r }) });
    expect(out.explain.query).toBe(q.id);
    expectGolden(out.explain.rank, id);
  });

  it('passes an engine refusal through verbatim', () => {
    const out = runRetrieval({ dataset: D, parsed: specWith({ retrieval: { k: '0' } }) });
    expect(out.result.error).toBe('k must be a whole number from 1 to 1000');
    expect(collectRefusals({ retrieval: { result: out } })).toEqual([{ where: 'retrieval', text: 'k must be a whole number from 1 to 1000' }]);
  });
});

describe('retrieval metrics', () => {
  it.each([
    ['eval-A-k5', { source: 'A' }],
    ['eval-B-k5', { source: 'B' }],
    ['eval-A-k5-zero', { source: 'A', noRelevant: 'zero' }],
    ['eval-B-k3-grade2', { source: 'B', k: '3', relevantGrade: '2' }],
    ['eval-A-k5-exponential', { source: 'A', gain: 'exponential' }],
  ])('scores a system\'s retrieved lists as the oracle did (%s)', (id, m) => {
    expectGolden(runMetrics({ dataset: D, parsed: specWith({ metrics: m }) }).evaluation, id);
  });

  it('reproduces system A from the current retrieval settings (BM25 top 5), because that is system A\'s retriever', () => {
    const out = runMetrics({ dataset: D, parsed: specWith({ metrics: { source: 'retrieval' } }) });
    expect(out.label).toBe('current retrieval settings (BM25, top 5)');
    expectGolden(out.evaluation, 'eval-A-k5');
  });

  it('lists Q24 as excluded with the engine reason under the default rule', () => {
    const out = runMetrics({ dataset: D, parsed: parseSpec(defaultSpec()) });
    expect(out.evaluation.excluded).toEqual([{ query: 'Q24', reason: 'no judged document has grade 1 or more' }]);
    expect(out.evaluation.nIncluded).toBe(23);
  });

  it('refuses an unknown system by name', () => {
    expect(runMetrics({ dataset: D, parsed: specWith({ metrics: { source: 'Z' } }) }).evaluation.error).toBe('system Z is not in this dataset');
  });
});

describe('compare systems', () => {
  it('bootstraps each mean and the paired difference from the same seed, as the oracle did', () => {
    const out = runCompare({ dataset: D, parsed: parseSpec(defaultSpec()) });
    // the oracle's exact per-query values, printed to the double nearest
    expect(diff(out.values.a, golden('paired-ndcg5-A-B').args.a, 1e-12)).toEqual([]);
    expect(diff(out.values.b, golden('paired-ndcg5-A-B').args.b, 1e-12)).toEqual([]);
    expect(out.queries).toHaveLength(23);
    expect(out.queries).not.toContain('Q24');
    expectGolden(out.bootA, 'boot-A-ndcg5');
    expectGolden(out.bootB, 'boot-B-ndcg5');
    expectGolden(out.paired, 'paired-ndcg5-A-B');
  });

  it('resamples the two systems independently when pairing is off', () => {
    const out = runCompare({ dataset: D, parsed: specWith({ compare: { paired: false } }) });
    expectGolden(out.paired, 'unpaired-ndcg5-A-B');
  });

  it('compares on average precision with another seed', () => {
    const out = runCompare({ dataset: D, parsed: specWith({ compare: { metric: 'map', seed: '11' } }) });
    expectGolden(out.paired, 'paired-ap5-A-B');
  });

  it('refuses more replicates than the studio runs, and names the engine limit', () => {
    const out = runCompare({ dataset: D, parsed: specWith({ compare: { nBoot: '10001' } }) });
    expect(out.refused).toEqual({ error: 'nBoot is 10001; this studio runs up to 10,000 bootstrap replicates (the engine accepts 100,000)', field: 'nBoot' });
    expect(out.paired).toBeUndefined();
    const ok = runCompare({ dataset: D, parsed: specWith({ compare: { nBoot: String(APP_CAPS.BOOT_MAX) } }) });
    expect(ok.paired.nBoot).toBe(10000);
  });

  it('passes the engine refusal of a missing seed through', () => {
    const out = runCompare({ dataset: D, parsed: specWith({ compare: { seed: '' } }) });
    expect(out.paired.error).toBe('seed must be a whole number from 0 to 4294967295');
  });
});

describe('answers and groundedness', () => {
  it.each([
    ['answers-A', { system: 'A' }],
    ['answers-B', { system: 'B' }],
    ['answers-B-reltol', { system: 'B', numericRelTol: '0.002' }],
  ])('checks every claim against the cited and retrieved passages (%s)', (id, a) => {
    const out = runAnswers({ dataset: D, parsed: specWith({ answers: a }) });
    expect(out.withRuns).toBe(true);
    expectGolden(out.check, id);
  });

  it.each(['A', 'B'])('scores system %s\'s short answers against the references by SQuAD match', (sys) => {
    const out = runAnswers({ dataset: D, parsed: specWith({ answers: { system: sys } }) });
    expect(out.short.rows).toHaveLength(24);
    out.short.rows.forEach((r) => expectGolden(r.match, `match-${sys}-${r.query}`));
    const exact = out.short.rows.filter((r) => golden(`match-${sys}-${r.query}`).expected.exactMatch).length;
    expect(out.short.exact).toBe(exact);
    expect(out.short.exact).toBe(sys === 'A' ? 20 : 13);
  });
});

describe('extraction', () => {
  it.each([['ext-A', 'A'], ['ext-B', 'B']])('scores the fields as the oracle did (%s)', (id, system) => {
    expectGolden(runExtraction({ dataset: D, parsed: specWith({ extraction: { system } }) }).result, id);
  });
});

describe('agreement', () => {
  it('pairs the two graders on every judged pair and weights over the grades 0 to 3', () => {
    const out = runAgreement({ dataset: D });
    expect(out.pairs).toBe(183);
    expect(out.missingSecond).toBe(0);
    expect(out.labels).toEqual([0, 1, 2, 3]);
    expectGolden(out.results.none, 'kappa-ekene-none');
    expectGolden(out.results.linear, 'kappa-ekene-linear');
    expectGolden(out.results.quadratic, 'kappa-ekene-quadratic');
  });
});

describe('calibration', () => {
  it.each([['cal-ekene-10', '10'], ['cal-ekene-5', '5'], ['cal-ekene-15', '15']])('builds the reliability table and the Murphy decomposition as the oracle did (%s)', (id, bins) => {
    expectGolden(runCalibration({ dataset: D, parsed: specWith({ calibration: { bins } }) }).result, id);
  });
});

describe('the optional helper, scored by the deterministic check', () => {
  it('sends the top of the current retrieval settings, at most ten passages', () => {
    const ctx = assistContext({ dataset: D, parsed: specWith({ retrieval: { k: '20' } }), queryId: 'Q01' });
    expect(ctx.passages).toHaveLength(10);
    expect(ctx.trimmed).toBe(true);
    const five = assistContext({ dataset: D, parsed: parseSpec(defaultSpec()), queryId: 'Q01' });
    expect(five.retrieved).toEqual(D.systems[0].answers[0].retrieved);
    expect(five.passages.map((p) => p.id)).toEqual(five.retrieved);
    expect(five.passages[0].text).toBe(D.documents.find((d) => d.id === five.retrieved[0]).text);
  });

  it('checks a model answer exactly as it checks a fixture answer', () => {
    const a = D.systems[1].answers[0];
    const parsed = parseSpec(defaultSpec());
    const one = assistCheck({
      dataset: D, parsed, answer: a.text, citations: a.citations, retrieved: a.retrieved,
    });
    const all = runAnswers({ dataset: D, parsed: specWith({ answers: { system: 'B' } }) }).check.perAnswer[0];
    expect(one.claims).toEqual(all.claims);
    expect(one.supportedFraction).toBe(all.supportedFraction);
    expect(one.citations).toEqual(all.citations);
  });
});

describe('uploads', () => {
  const passages = 'id,title,text\nP1,First,"The oil rate was 120 bopd, stable."\nP2,Second,"Water cut rose to 45%\nafter the flood."\n';
  const queries = 'id,text,reference\nq1,oil rate,120 bopd\nq2,water cut,45%\nq3,unjudged query,\n';
  const judgments = 'query,passage,grade,grade2\nq1,P1,3,2\nq1,P2,0,0\nq2,P2,2,2\n';

  it('reads RFC 4180 CSV (quoted commas and line breaks) and keeps the unjudged query out of the metrics with a note', () => {
    const docs = passagesFromCsv(passages);
    expect(docs).toEqual([
      { id: 'P1', title: 'First', text: 'The oil rate was 120 bopd, stable.' },
      { id: 'P2', title: 'Second', text: 'Water cut rose to 45%\nafter the flood.' },
    ]);
    const qs = queriesFromCsv(queries);
    expect(qs[2]).toEqual({ id: 'q3', text: 'unjudged query' });
    const j = judgmentsFromCsv(judgments);
    expect(j.judgments).toEqual({ q1: { P1: 3, P2: 0 }, q2: { P2: 2 } });
    expect(j.second).toEqual({ q1: { P1: 2, P2: 0 }, q2: { P2: 2 } });
    const d = uploadDataset({
      label: 'x', documents: docs, queries: qs, ...j,
    });
    expect(d.notes[0]).toBe('1 of 3 queries have no judgments and are left out of the retrieval metrics: q3.');
    const m = runMetrics({ dataset: d, parsed: specWith({ metrics: { source: 'retrieval' } }) });
    expect(m.evaluation.nQueries).toBe(2);
    expect(runAgreement({ dataset: d }).labels).toEqual([0, 1, 2, 3]);
    expect(datasetFromSnapshot(snapshotDataset(d))).toEqual(d);
  });

  it('refuses what it cannot read, naming the row or the column', () => {
    expect(() => passagesFromCsv('name,body\nx,y\n', 'c.csv')).toThrow('c.csv needs a column named "id" or "passage" or "passage_id" or "document" or "doc_id" (the passage id); its header row has "name", "body".');
    expect(() => passagesFromCsv('id,text\nP1,a\nP1,b\n', 'c.csv')).toThrow('c.csv row 3: passage id P1 repeats row 2.');
    expect(() => judgmentsFromCsv('query,passage,grade\nq1,P1,2.5\n', 'j.csv')).toThrow('j.csv row 2: the grade "2.5" is not a whole number of 0 or more.');
    expect(() => judgmentsFromCsv('query,passage,grade\nq1,P1,1\nq1,P1,2\n', 'j.csv')).toThrow('j.csv row 3: query q1 and passage P1 are judged twice.');
    expect(() => uploadDataset({ documents: [{ id: 'a', text: 'x' }], queries: [{ id: 'q', text: 'x' }], judgments: { z: {} } })).toThrow('The judgments name a query not in the queries file: z.');
  });

  it('holds the studio caps of 2,000 passages and 200 queries', () => {
    const docs = Array.from({ length: 2001 }, (_, i) => ({ id: `d${i}`, text: 'oil' }));
    const qs = [{ id: 'q', text: 'oil' }];
    expect(() => uploadDataset({ documents: docs, queries: qs })).toThrow('The corpus has 2,001 passages; this studio takes up to 2,000.');
    expect(() => uploadDataset({ documents: docs.slice(0, 2000), queries: qs })).not.toThrow();
    const many = Array.from({ length: 201 }, (_, i) => ({ id: `q${i}`, text: 'oil' }));
    expect(() => uploadDataset({ documents: docs.slice(0, 5), queries: many })).toThrow('There are 201 queries; this studio evaluates up to 200 at a time.');
  });

  it('reads a whole dataset in the fixture JSON shape and scores it the same way', () => {
    const dir = path.join(ROOT, 'packages/engines/test-data/dataai/ekene-docs');
    const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const json = JSON.stringify({
      passages: read('corpus.json').passages,
      queries: read('queries.json').queries,
      systems: read('systems.json').systems,
      extraction: read('extraction.json'),
      calibration: read('calibration.json'),
    });
    const d = uploadDataset({ label: 'ekene.json', ...datasetFromJson(json, 'ekene.json') });
    expectGolden(runMetrics({ dataset: d, parsed: specWith({ metrics: { source: 'B' } }) }).evaluation, 'eval-B-k5');
    expectGolden(runAnswers({ dataset: d, parsed: specWith({ answers: { system: 'A' } }) }).check, 'answers-A');
    expectGolden(runCalibration({ dataset: d, parsed: parseSpec(defaultSpec()) }).result, 'cal-ekene-10');
    expectGolden(runAgreement({ dataset: d }).results.quadratic, 'kappa-ekene-quadratic');
  });

  it('passes calibration values that are not numbers to the engine, which names the row', () => {
    const cal = calibrationFromCsv('probability,outcome\n0.2,0\nhigh,1\n');
    const d = uploadDataset({
      documents: [{ id: 'a', text: 'x' }], queries: [{ id: 'q', text: 'x' }], calibration: cal,
    });
    expect(runCalibration({ dataset: d, parsed: parseSpec(defaultSpec()) }).result.error).toBe('probabilities[1] must be a number from 0 to 1');
  });
});
