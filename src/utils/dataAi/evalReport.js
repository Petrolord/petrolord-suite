// AI Evaluation Studio (Data & AI D5): the run report as CSV.
//
// Layout only. Every score, rank, metric, interval, claim, outcome, kappa and
// calibration figure is the engine's, taken from the results the workflows
// returned. The CSV keeps every number at full round-trip precision
// (String(x)); the screen rounds for reading, the export does not. Engine
// refusals, excluded queries with their reason, unsupported claims with
// their reason, and the conventions (tie rule, relevance threshold, bin edge
// rule, percentile labels) are written as the engine wrote them.
import { ENGINE_COMMIT, ENGINE_VERSION, collectRefusals } from '@/utils/dataAi/evalWorkflows';

const q = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_COLUMNS = ['record', 'section', 'system', 'query', 'passage', 'name', 'value', 'detail'];
const METRIC_FIELDS = ['precision', 'recall', 'hit', 'reciprocalRank', 'averagePrecision', 'ndcg', 'dcg', 'idcg', 'nRelevant', 'relevantRetrieved', 'unjudgedRetrieved', 'firstRelevantRank'];

const basisRows = (row, section, basis) => {
  Object.entries(basis || {}).forEach(([k, v]) => row({
    record: 'basis', section, name: k, detail: typeof v === 'string' ? v : JSON.stringify(v),
  }));
};

const evaluationRows = (row, section, system, e) => {
  if (e.error) { row({ record: 'refused', section, system, detail: e.error }); return; }
  row({
    record: 'meta', section, system, name: 'settings', detail: `k ${e.k}; relevant at grade ${e.relevantGrade} or more; gain ${e.gain}; no-relevant rule ${e.noRelevant}; ${e.nIncluded} of ${e.nQueries} queries in the means`,
  });
  Object.entries(e.mean).forEach(([k, v]) => row({
    record: 'mean', section, system, name: k, value: v,
  }));
  e.excluded.forEach((x) => row({
    record: 'excluded', section, system, query: x.query, detail: x.reason,
  }));
  e.zeroed.forEach((x) => row({
    record: 'zeroed', section, system, query: x.query, detail: x.reason,
  }));
  e.perQuery.forEach((r) => {
    METRIC_FIELDS.forEach((k) => row({
      record: 'query', section, system, query: r.query, name: k, value: r[k],
    }));
    Object.entries(r.notes || {}).forEach(([k, t]) => row({
      record: 'note', section, system, query: r.query, name: `${k} undefined`, detail: t,
    }));
  });
  basisRows(row, section, e.basis);
};

const bootRows = (row, section, system, b) => {
  if (!b) return;
  if (b.error) { row({ record: 'refused', section, system, detail: b.error }); return; }
  ['n', 'mean', 'meanA', 'meanB', 'difference', 'lower', 'upper', 'standardError', 'shareAtOrBelowZero', 'nBoot', 'seed', 'level', 'paired'].forEach((k) => {
    if (b[k] !== undefined) row({
      record: 'bootstrap', section, system, name: k, value: b[k],
    });
  });
  row({
    record: 'bootstrap', section, system, name: 'lower label', detail: b.labels.lower,
  });
  row({
    record: 'bootstrap', section, system, name: 'upper label', detail: b.labels.upper,
  });
  basisRows(row, section, b.basis);
};

/**
 * One CSV, one row per record under a shared header: meta (run, dataset,
 * engine, spec), refusals, the retrieval run with every query's ranking, the
 * retrieval metrics per query and averaged, the system comparison with its
 * bootstraps, the answers' claims, the extraction cells, the kappas and the
 * calibration table.
 */
export function buildEvalCsv({
  runName, dataset, spec, results,
}) {
  const lines = [CSV_COLUMNS.join(',')];
  const row = (cells) => lines.push(CSV_COLUMNS.map((c) => q(cells[c])).join(','));
  row({ record: 'meta', name: 'run', value: runName || 'Unsaved evaluation run' });
  row({ record: 'meta', name: 'dataset', value: dataset?.label || '' });
  if (dataset?.synthetic) row({ record: 'meta', name: 'synthetic', detail: dataset.notes[0] });
  row({ record: 'meta', name: 'engine', value: ENGINE_VERSION });
  row({ record: 'meta', name: 'engine commit', value: ENGINE_COMMIT });
  row({ record: 'meta', name: 'generated', value: new Date().toISOString() });
  if (spec) row({ record: 'meta', name: 'spec', detail: JSON.stringify(spec) });
  (dataset?.notes || []).slice(dataset?.synthetic ? 1 : 0).forEach((t) => row({ record: 'note', name: 'data', detail: t }));
  collectRefusals(results).forEach((r) => row({ record: 'refused', section: r.where, detail: r.text }));
  const R = (k) => results[k]?.result;

  const rt = R('retrieval');
  if (rt && !rt.result.error) {
    const r = rt.result;
    row({ record: 'meta', section: 'retrieval', name: 'settings', detail: JSON.stringify(rt.settings) });
    r.perQuery.forEach((p) => {
      p.ranking.forEach((x) => row({
        record: 'rank', section: 'retrieval', query: p.id, passage: x.id, name: `rank ${x.rank}`, value: x.score,
      }));
      p.ties.forEach((t) => row({
        record: 'tie', section: 'retrieval', query: p.id, detail: t.join(' = '),
      }));
      if (p.tieAtCutoff) row({
        record: 'tie', section: 'retrieval', query: p.id, name: 'tie at the cutoff', value: true, detail: 'the k-th and (k + 1)-th passages tie; the id decided the cut',
      });
    });
    basisRows(row, 'retrieval', r.basis);
  }

  const mt = R('metrics');
  if (mt) evaluationRows(row, 'metrics', mt.label, mt.evaluation);

  const cp = R('compare');
  if (cp) {
    evaluationRows(row, 'compare', `A: ${cp.a.label}`, cp.a.evaluation);
    evaluationRows(row, 'compare', `B: ${cp.b.label}`, cp.b.evaluation);
    if (cp.queries) {
      row({
        record: 'meta', section: 'compare', name: 'metric', value: cp.metric.label, detail: `${cp.queries.length} included queries: ${cp.queries.join(' ')}`,
      });
      cp.queries.forEach((qid, i) => row({
        record: 'value', section: 'compare', query: qid, name: cp.metric.value, value: cp.values.a[i], detail: `B ${cp.values.b[i]}`,
      }));
      bootRows(row, 'compare', 'A', cp.bootA);
      bootRows(row, 'compare', 'B', cp.bootB);
      bootRows(row, 'compare', 'A minus B', cp.paired);
    }
  }

  const an = R('answers');
  if (an && !an.check.error) {
    const c = an.check;
    ['nAnswers', 'nClaims', 'nSupported', 'supportedFraction', 'meanAnswerSupportedFraction', 'fullySupportedAnswers', 'answersWithClaims', 'unknownCitations', 'notRetrievedCitations', 'numericRelTol'].forEach((k) => row({
      record: 'groundedness', section: 'answers', system: an.system, name: k, value: c[k],
    }));
    c.perAnswer.forEach((a) => {
      a.citations.forEach((ct) => row({
        record: 'citation', section: 'answers', system: an.system, query: a.query, passage: ct.id, name: 'status', value: ct.status,
      }));
      a.claims.forEach((cl) => row({
        record: 'claim', section: 'answers', system: an.system, query: a.query, passage: cl.foundIn.join(' '), name: `${cl.kind} ${cl.text}`, value: cl.supported, detail: cl.reason || '',
      }));
    });
    an.short.rows.forEach((r) => row({
      record: 'short answer', section: 'answers', system: an.system, query: r.query, name: 'exact match', value: r.match.error ? '' : r.match.exactMatch, detail: r.match.error || `f1 ${r.match.f1}; "${r.prediction}" against "${r.truth}"`,
    }));
    basisRows(row, 'answers', c.basis);
  }

  const ex = R('extraction');
  if (ex && ex.result && !ex.result.error) {
    const x = ex.result;
    Object.entries(x.overall).forEach(([k, v]) => row({
      record: 'overall', section: 'extraction', system: ex.system, name: k, value: v,
    }));
    x.perField.forEach((f) => ['n', 'correct', 'wrong', 'missed', 'unsupported', 'correctEmpty', 'accuracy', 'precision', 'recall', 'f1', 'meanF1'].forEach((k) => {
      if (f[k] !== undefined) row({
        record: 'field', section: 'extraction', system: ex.system, name: `${f.field} ${k}`, value: f[k],
      });
    }));
    x.perRecord.forEach((r) => Object.entries(r.fields).forEach(([name, c]) => row({
      record: 'cell', section: 'extraction', system: ex.system, passage: r.id, name: `${name} ${c.outcome}`, value: c.prediction, detail: `label ${c.label === null ? 'empty' : c.label}${c.reason ? `; ${c.reason}` : ''}`,
    })));
    basisRows(row, 'extraction', x.basis);
  }

  const ag = R('agreement');
  if (ag && ag.results) {
    row({ record: 'meta', section: 'agreement', name: 'pairs', value: ag.pairs, detail: ag.labels ? `labels ${ag.labels.join(' ')}` : '' });
    Object.entries(ag.results).forEach(([w, r]) => {
      if (r.error) { row({ record: 'refused', section: 'agreement', name: w, detail: r.error }); return; }
      row({
        record: 'kappa', section: 'agreement', name: w, value: r.kappa, detail: r.note || '',
      });
      row({ record: 'agreement', section: 'agreement', name: `${w} observed agreement`, value: r.observedAgreement });
      row({ record: 'agreement', section: 'agreement', name: `${w} expected agreement`, value: r.expectedAgreement });
    });
  }

  const cl = R('calibration');
  if (cl && cl.result && !cl.result.error) {
    const c = cl.result;
    ['n', 'bins', 'baseRate', 'brier', 'ece', 'mce', 'logLoss', 'logLossEps', 'logLossClipped'].forEach((k) => row({
      record: 'calibration', section: 'calibration', name: k, value: c[k],
    }));
    Object.entries(c.murphy).forEach(([k, v]) => row({
      record: 'murphy', section: 'calibration', name: k, value: v,
    }));
    c.table.forEach((b) => row({
      record: 'bin', section: 'calibration', name: `bin ${b.bin} [${b.lower}, ${b.upper}${b.closedRight ? ']' : ')'}`, value: b.n, detail: `mean predicted ${b.meanPredicted ?? 'empty'}; observed ${b.observedFrequency ?? 'empty'}; gap ${b.gap ?? 'empty'}`,
    }));
    basisRows(row, 'calibration', c.basis);
  }
  return `${lines.join('\n')}\n`;
}
