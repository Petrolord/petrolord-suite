/**
 * ML Workbench (D2): the CSV report keeps every engine number at full
 * precision and in the right record; the PDF is built from the same run.
 */
import { buildMlCsv, CSV_COLUMNS, modelText, validationText } from '@/utils/dataAi/mlReport';
import {
  defaultSpec, parseSpec, evaluate, fitFinal,
} from '@/utils/dataAi/mlWorkflows';
import { buildDesign } from '@/utils/dataAi/mlData';

const NOISE = [0.3, -0.2, 0.1, -0.4, 0.25, -0.15, 0.05, 0.35, -0.3, 0.2];
const table = (() => {
  const group = []; const depth = []; const A = []; const T = []; const L = [];
  ['W-1', 'W-2', 'W-3'].forEach((w, k) => {
    for (let i = 0; i < 12; i += 1) {
      group.push(w); depth.push(1000.1524 * (i + 1)); A.push(i + k / 3); T.push(1 / 3 + 2 * (i + k) + NOISE[(i + k) % 10]); L.push((i + 2 * k) % 3 === 0 ? 1 : 0);
    }
  });
  return {
    source: 'upload', label: 'wells, "quoted".csv', ref: {}, wells: [], group, depth, depthUnit: 'm', columns: { A, T, L }, units: {}, notes: [],
  };
})();

const parseCsv = (text) => text.trim().split('\n').map((line) => {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return Object.fromEntries(CSV_COLUMNS.map((k, j) => [k, out[j]]));
});

describe('regression CSV', () => {
  const spec = { ...defaultSpec(), target: 'T', features: [{ name: 'A', log: false }], validation: { scheme: 'kfold', k: '3', testFraction: '', seed: '11' } };
  const design = buildDesign(table, spec);
  const parsed = parseSpec(spec);
  const evaluation = evaluate({ design, parsed, task: 'regression' });
  const final = fitFinal({ design, parsed });
  const rows = parseCsv(buildMlCsv({
    runName: 'r', table, spec, design, parsed, evaluation, final,
  }));

  it('has one header and the stated records, quoting cells with commas and quotes', () => {
    expect(Object.values(rows[0])).toEqual(CSV_COLUMNS);
    expect(rows.find((r) => r.name === 'data').value).toBe('wells, "quoted".csv');
    expect(rows.find((r) => r.name === 'model').value).toBe('ordinary least squares');
    expect(rows.find((r) => r.name === 'validation').value).toBe('group k-fold, k = 3, seed 11');
    expect(rows.find((r) => r.name === 'engine').value).toMatch(/^petrolord-engines ef4058f/);
  });

  it('writes fold, pooled and coefficient figures at full round-trip precision', () => {
    evaluation.folds.forEach((f) => {
      const r2 = rows.find((r) => r.record === 'fold' && r.fold === String(f.fold) && r.name === 'r2');
      expect(r2.value).toBe(String(f.test.r2));
      expect(Number(r2.value)).toBe(f.test.r2);
    });
    expect(Number(rows.find((r) => r.record === 'pooled' && r.name === 'rmse').value)).toBe(evaluation.pooled.rmse);
    final.fit.names.forEach((nm, j) => {
      const c = rows.find((r) => r.record === 'coefficient' && r.name === nm);
      expect(Number(c.value)).toBe(final.fit.coefficients[j]);
      expect(c.detail).toBe(`se ${final.fit.standardErrors[j]}`);
    });
  });

  it('writes every held-out prediction with its fold, well and depth', () => {
    const preds = rows.filter((r) => r.record === 'prediction');
    expect(preds).toHaveLength(design.X.length);
    preds.forEach((p, j) => {
      const i = evaluation.tested[j];
      expect(Number(p.value)).toBe(evaluation.oof[i]);
      expect(p.well).toBe(design.groups[i]);
      expect(Number(p.depth)).toBe(design.depth[i]);
      const fold = evaluation.folds.find((f) => f.testGroups.includes(design.groups[i])).fold;
      expect(p.fold).toBe(String(fold));
    });
  });
});

describe('classification CSV', () => {
  const spec = {
    ...defaultSpec(), task: 'classification', features: [{ name: 'A', log: false }], label: { mode: 'column', column: 'L', curve: '', op: '>=', cutoff: '' }, validation: { scheme: 'kfold', k: '3', testFraction: '', seed: '2' },
  };
  const design = buildDesign(table, spec);
  const parsed = parseSpec(spec);
  const evaluation = evaluate({ design, parsed, task: 'classification' });
  const final = fitFinal({ design, parsed });
  const rows = parseCsv(buildMlCsv({
    runName: '', table, spec, design, parsed, evaluation, final,
  }));

  it('writes the confusion matrix rows true by predicted, the ROC points and the convergence', () => {
    expect(modelText(parsed)).toBe('logistic regression, unpenalised');
    expect(validationText(evaluation)).toBe('group k-fold, k = 3, seed 2');
    const m = evaluation.pooled.report.matrix;
    expect(Number(rows.find((r) => r.name === 'true 1 predicted 0').value)).toBe(m[1][0]);
    expect(Number(rows.find((r) => r.name === 'true 0 predicted 1').value)).toBe(m[0][1]);
    expect(rows.filter((r) => r.record === 'roc')).toHaveLength(evaluation.pooled.roc.fpr.length);
    expect(rows.find((r) => r.record === 'roc').detail).toBe('start (no row called positive)');
    expect(rows.filter((r) => r.name === 'converged')).toHaveLength(3);
    expect(Number(rows.find((r) => r.record === 'pooled' && r.name === 'log loss').value)).toBe(evaluation.pooled.logLoss.logLoss);
  });
});
