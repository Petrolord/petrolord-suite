/**
 * ML Workbench (D2): engine through the app, on Ekene data.
 *
 * The engine is gated against the stdlib oracle, the NIST StRD certified
 * values and the library pins in packages/engines/__tests__/dataai.ml.test.js.
 * These tests check the other half: that what the workbench shows IS the
 * engine's answer on the data a user brings. Every workflow result is
 * compared, whole, with direct calls to the vendored engine made here in
 * the order the conventions state (split from the engine, scaler fitted on
 * the training rows only, fit, predict the held-out wells, score).
 *
 * Fixtures (Ekene synthetic field, ours; kit ekene-demo-v1 as released in
 * ekene-demo-kit-20260923-359d56694): fixtures/ml/Ekene-N-ml.las are
 * 01-wells/Ekene-N.las with the header kept, samples 1450 to 1650 m MD
 * (the Ekene Sand is about 1541 to 1606 m), every 4th sample kept (step
 * 0.6096 m; STRT, STOP and STEP rewritten to match). Source sha256 (first
 * 12): Ekene-1 b6ad3977451d, Ekene-2 5c2cbdca2bc0, Ekene-3 33f6638ed13f,
 * Ekene-4 80add9fdd763, Ekene-5 58fe11cdb83c, Ekene-6 89eca89f579c,
 * Ekene-7 ec2cd2fc16dc, Ekene-8 20e2069238df, Ekene-9 1194672877de.
 * Ekene-9 has no RHOB, NPHI, SP, RXO or PEF: it is the well the headline
 * case predicts a density curve into. Each LAS goes through the Well Data
 * Manager's parser and import step, so the curves are the float32 arrays
 * the registry stores.
 */
import fs from 'fs';
import path from 'path';
import { parseLas } from '../../../../packages/engines/engines/welldata/lasParse';
import { prepareLogs } from '../../../../packages/engines/engines/welldata/lasImport';
import * as ML from '../../../../packages/engines/engines/dataai/ml.js';
import {
  wellBlock, tableFromBlocks, buildDesign, predictionRows, MAX_FIT_ROWS,
} from '@/utils/dataAi/mlData';
import {
  defaultSpec, parseSpec, evaluate, fitFinal, predictWith, importance, learning, leakage, leakageVerdict, slimFit, slimScaler,
} from '@/utils/dataAi/mlWorkflows';
import { buildPredictedLog, mlProvenance, suggestMnemonic, mnemonicProblem } from '@/utils/dataAi/mlWriteBack';

const FIX = path.join(__dirname, 'fixtures', 'ml');

function ekeneBlock(n) {
  const text = fs.readFileSync(path.join(FIX, `Ekene-${n}-ml.las`), 'utf8');
  const prepared = prepareLogs(parseLas(text), { sourceFile: `Ekene-${n}-ml.las` });
  const logs = prepared.logs.map((l, i) => ({
    id: `w${n}-log-${i}`, mnemonic: l.mnemonic, unit: l.unit, start_md_m: l.startMdM, step_m: l.stepM, n_samples: l.nSamples,
  }));
  const samples = Object.fromEntries(prepared.logs.map((l, i) => [`w${n}-log-${i}`, l.data]));
  const r = wellBlock({ well: { id: `well-${n}`, name: `Ekene-${n}` }, logs, samples });
  if (r.error) throw new Error(r.error);
  return r.block;
}

const TRAIN = [1, 2, 3, 4, 5, 6, 7, 8];
const blocks = TRAIN.map(ekeneBlock);
const table = tableFromBlocks(blocks);
const ekene9 = ekeneBlock(9);

const spec = (over = {}) => ({ ...defaultSpec(), ...over });
const pick = (a, idx) => idx.map((i) => a[i]);

const DT_SPEC = spec({
  target: 'DT',
  features: [{ name: 'GR', log: false }, { name: 'RHOB', log: false }, { name: 'NPHI', log: false }, { name: 'RT', log: true }],
});
const RHOB_SPEC = spec({
  target: 'RHOB',
  features: [{ name: 'GR', log: false }, { name: 'DT', log: false }, { name: 'RT', log: true }],
});

/** Direct engine replay of one validation, by the stated conventions. */
function direct({ design, parsed, task }) {
  const { X, y, groups, names } = design;
  const v = parsed.validation;
  const folds = v.scheme === 'kfold'
    ? ML.groupKFold({ groups, k: v.k, seed: v.seed }).folds
    : [(() => { const s = ML.groupSplit({ groups, testFraction: v.testFraction, seed: v.seed }); return { fold: 0, ...s }; })()];
  const oof = new Array(X.length).fill(null);
  const out = folds.map((f) => {
    let Xs = X;
    let scaler = null;
    if (parsed.standardise) {
      scaler = ML.fitStandardScaler({ X, trainIndices: f.trainIndices, names });
      Xs = ML.applyScaler({ scaler, X }).X;
    }
    const Xtr = pick(Xs, f.trainIndices);
    const ytr = pick(y, f.trainIndices);
    const m = parsed.model;
    const fit = m.kind === 'ols' ? ML.ols({ X: Xtr, y: ytr, names })
      : m.kind === 'ridge' ? ML.ridge({ X: Xtr, y: ytr, lambda: m.lambda, names })
        : ML.logistic({ X: Xtr, y: ytr, names, l2: m.l2 });
    if (fit.error) return { fold: f.fold, error: fit.error };
    const pr = ML.predict({ model: fit, X: pick(Xs, f.testIndices) });
    f.testIndices.forEach((r, j) => { oof[r] = pr.values[j]; });
    const yte = pick(y, f.testIndices);
    const test = task === 'classification'
      ? {
        report: ML.classificationReport({ yTrue: yte, yPred: pr.classes, labels: [0, 1] }),
        roc: ML.rocCurve({ yTrue: yte, scores: pr.values }),
        logLoss: ML.logLoss({ yTrue: yte, probabilities: pr.values }),
      }
      : ML.regressionMetrics({ yTrue: yte, yPred: pr.values });
    return {
      fold: f.fold, scaler, fit, test, testGroups: f.testGroups, trainGroups: f.trainGroups,
    };
  });
  return { folds: out, oof };
}

describe('the Ekene wells read the way the registry stores them', () => {
  it('joins the curves of eight wells sample by sample, well by well', () => {
    expect(table.wells.map((w) => w.name)).toEqual(TRAIN.map((n) => `Ekene-${n}`));
    expect(table.wells.map((w) => w.rows)).toEqual(TRAIN.map(() => 328));
    expect(table.group).toHaveLength(8 * 328);
    expect(Object.keys(table.columns)).toEqual(['CALI', 'DT', 'GR', 'NPHI', 'PEF', 'RHOB', 'RT', 'RXO', 'SP']);
    expect(table.depth[0]).toBeCloseTo(1450.5432, 3);
    // the importer converts sonic to the SI-internal unit; the workbench keeps that label
    expect(table.units.DT).toBe('US/M');
  });

  it('builds the design from the stored values, with log10 where it is stated', () => {
    const d = buildDesign(table, DT_SPEC);
    expect(d.error).toBeUndefined();
    expect(d.names).toEqual(['GR', 'RHOB', 'NPHI', 'log10(RT)']);
    expect(d.X).toHaveLength(8 * 328);
    expect(d.X[0]).toEqual([table.columns.GR[0], table.columns.RHOB[0], table.columns.NPHI[0], Math.log10(table.columns.RT[0])]);
    expect(d.y[5]).toBe(table.columns.DT[5]);
    expect(d.groups[328]).toBe('Ekene-2');
    expect(d.counts).toEqual({ total: 2624, outsideWindow: 0, thinned: 0, missing: 0, nonPositiveLog: 0, badLabel: 0 });
  });

  it('applies the depth window and the thinning with entries counted from 0 in each well', () => {
    const d = buildDesign(table, { ...DT_SPEC, depthMin: '1500', depthMax: '1600', every: '2' });
    const inWindow = table.depth.filter((z) => z >= 1500 && z <= 1600).length;
    expect(d.counts.outsideWindow).toBe(2624 - inWindow);
    expect(d.counts.thinned + d.X.length).toBe(inWindow);
    // entry 0 of each well is kept, then every 2nd: every kept row sits at an even entry of its well
    d.rows.forEach((r) => { expect((r % 328) % 2).toBe(0); });
  });

  it('refuses a target that is also a feature, and a fit above the row cap', () => {
    expect(buildDesign(table, { ...DT_SPEC, features: [...DT_SPEC.features, { name: 'DT', log: false }] }).error)
      .toBe('The target DT is also a feature; remove it from the features.');
    const capped = buildDesign(table, DT_SPEC, { maxRows: 1000 });
    expect(capped.error).toBe('2,624 rows are more than the 1,000 the workbench fits on. Narrow the depth window, or keep every 3rd sample.');
    expect(MAX_FIT_ROWS).toBe(150000);
  });
});

describe('the design rules at their boundaries', () => {
  const tiny = {
    source: 'upload', label: 't', ref: {}, wells: [], group: ['A', 'A', 'A', 'B', 'B', 'B'], depth: [1, 2, 3, 1, 2, 3], depthUnit: 'm',
    columns: { C: [1, 2, 3, 2, 2, 5], F: [0.5, 0.1, 0.9, 0.3, 0.7, 0.2] }, units: {}, notes: [],
  };
  const lab = (op) => buildDesign(tiny, {
    ...defaultSpec(), task: 'classification', features: [{ name: 'F', log: false }], label: { mode: 'cutoff', curve: 'C', op, cutoff: '2' },
  }).y;

  it('applies each cutoff comparison exactly, strict or inclusive as written', () => {
    expect(lab('>')).toEqual([0, 0, 1, 0, 0, 1]);
    expect(lab('>=')).toEqual([0, 1, 1, 1, 1, 1]);
    expect(lab('<')).toEqual([1, 0, 0, 0, 0, 0]);
    expect(lab('<=')).toEqual([1, 1, 0, 1, 1, 0]);
  });

  it('predicts only samples with every feature present (and positive where logged), aligned to depth', () => {
    const b = ekeneBlock(9);
    const curves = { ...b.curves, GR: b.curves.GR.slice(), RT: b.curves.RT.slice() };
    curves.GR[3] = null;
    curves.RT[10] = 0;
    curves.RT[11] = -1;
    const rows = predictionRows({ ...b, curves }, [{ name: 'GR', log: false }, { name: 'RT', log: true }]);
    expect(rows.skipped).toBe(3);
    expect(rows.at).toHaveLength(325);
    expect(rows.at.slice(0, 5)).toEqual([0, 1, 2, 4, 5]);
    expect(rows.X[3]).toEqual([curves.GR[4], Math.log10(curves.RT[4])]);
    // without a log the zero and negative values are fine
    expect(predictionRows({ ...b, curves }, [{ name: 'GR', log: false }, { name: 'RT', log: false }]).skipped).toBe(1);
  });
});

describe('(a) missing-log prediction: group k-fold OLS equals the engine, fold by fold', () => {
  const design = buildDesign(table, DT_SPEC);
  const parsed = parseSpec(DT_SPEC);
  const app = evaluate({ design, parsed, task: 'regression' });
  const ref = direct({ design, parsed, task: 'regression' });

  it('uses the engine k-fold and holds out whole wells', () => {
    expect(parsed.validation).toEqual({ scheme: 'kfold', seed: 42, k: 5 });
    const cv = ML.groupKFold({ groups: design.groups, k: 5, seed: 42 });
    expect(app.order).toEqual(cv.order);
    expect(app.folds.map((f) => f.testGroups)).toEqual(cv.folds.map((f) => f.testGroups));
    app.folds.forEach((f) => f.testGroups.forEach((g) => expect(f.trainGroups).not.toContain(g)));
  });

  it('fits each fold scaler on that fold\'s training rows only', () => {
    app.folds.forEach((f, q) => expect(f.scaler).toEqual(slimScaler(ref.folds[q].scaler)));
    // and that is not the scaler on every row
    const all = ML.fitStandardScaler({ X: design.X, names: design.names });
    expect(app.folds[0].scaler.centre).not.toEqual(all.centre);
  });

  it('returns the engine fit and the engine test metrics for every fold', () => {
    app.folds.forEach((f, q) => {
      expect(f.error).toBeUndefined();
      expect(f.fit).toEqual(slimFit(ref.folds[q].fit));
      expect(f.test).toEqual(ref.folds[q].test);
    });
  });

  it('pools the held-out predictions row by row and scores them with the engine', () => {
    expect(app.oof).toEqual(ref.oof);
    expect(app.tested).toEqual(design.X.map((_, i) => i));
    expect(app.pooled).toEqual(ML.regressionMetrics({ yTrue: design.y, yPred: ref.oof }));
    expect(app.pooled.r2).toBeGreaterThan(0.5);
  });

  it('fits the final model on every row with the scaler of every row, and predicts with it', () => {
    const final = fitFinal({ design, parsed });
    const scaler = ML.fitStandardScaler({ X: design.X, trainIndices: design.X.map((_, i) => i), names: design.names });
    expect(final.scaler).toEqual(slimScaler(scaler));
    const Z = ML.applyScaler({ scaler, X: design.X }).X;
    const fit = ML.ols({ X: Z, y: design.y, names: design.names });
    expect(final.fit).toEqual(slimFit(fit));
    expect(final.fit.standardErrors).toHaveLength(5);
    const rows = design.X.slice(0, 7);
    expect(predictWith(final, rows)).toEqual(ML.predict({ model: fit, X: ML.applyScaler({ scaler, X: rows }).X }));
  });

  it('fits on the raw features when standardising is turned off', () => {
    const p2 = { ...parsed, standardise: false };
    const a2 = evaluate({ design, parsed: p2, task: 'regression' });
    const r2 = direct({ design, parsed: p2, task: 'regression' });
    a2.folds.forEach((f, q) => {
      expect(f.scaler).toBeNull();
      expect(f.fit).toEqual(slimFit(r2.folds[q].fit));
    });
    // OLS predictions do not depend on a linear rescaling of the features
    a2.oof.forEach((v, i) => expect(Math.abs(v - app.oof[i])).toBeLessThan(1e-9 * Math.abs(v)));
  });
});

describe('(a) ridge and the single group split equal the engine', () => {
  it('ridge under group k-fold', () => {
    const s = { ...DT_SPEC, model: { kind: 'ridge', lambda: '10', l2: '0' } };
    const design = buildDesign(table, s);
    const parsed = parseSpec(s);
    expect(parsed.model).toEqual({ kind: 'ridge', lambda: 10 });
    const app = evaluate({ design, parsed, task: 'regression' });
    const ref = direct({ design, parsed, task: 'regression' });
    app.folds.forEach((f, q) => {
      expect(f.fit).toEqual(slimFit(ref.folds[q].fit));
      expect(f.test).toEqual(ref.folds[q].test);
    });
    expect(app.pooled).toEqual(ML.regressionMetrics({ yTrue: design.y, yPred: ref.oof }));
  });

  it('a group split scores only the held-out wells', () => {
    const s = { ...RHOB_SPEC, validation: { scheme: 'split', k: '5', testFraction: '0.25', seed: '7' } };
    const design = buildDesign(table, s);
    const parsed = parseSpec(s);
    const app = evaluate({ design, parsed, task: 'regression' });
    const ref = direct({ design, parsed, task: 'regression' });
    expect(app.folds).toHaveLength(1);
    expect(app.folds[0].testGroups).toEqual(ref.folds[0].testGroups);
    expect(app.folds[0].testGroups).toHaveLength(2);
    expect(app.folds[0].fit).toEqual(slimFit(ref.folds[0].fit));
    const tested = ref.oof.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
    expect(app.tested).toEqual(tested);
    expect(app.pooled).toEqual(ML.regressionMetrics({ yTrue: pick(design.y, tested), yPred: pick(ref.oof, tested) }));
    expect(app.pooled).toEqual(app.folds[0].test);
  });

  it('shows an engine refusal verbatim, fold by fold, and then gives no pooled score', () => {
    const design = buildDesign(table, RHOB_SPEC);
    const parsed = parseSpec({ ...RHOB_SPEC, validation: { scheme: 'kfold', k: '9', testFraction: '', seed: '1' } });
    const app = evaluate({ design, parsed, task: 'regression' });
    expect(app.error).toBe(ML.groupKFold({ groups: design.groups, k: 9, seed: 1 }).error);
    expect(app.error).toBe('k must be a whole number from 2 to 8 (the number of distinct groups)');
  });
});

describe('(a) the predicted curve goes to a well as a new curve with its provenance', () => {
  const design = buildDesign(table, RHOB_SPEC);
  const parsed = parseSpec(RHOB_SPEC);
  const evaluation = evaluate({ design, parsed, task: 'regression' });
  const final = fitFinal({ design, parsed });
  const rows = predictionRows(ekene9, design.features);
  const pred = predictWith(final, rows.X);

  it('predicts Ekene-9, which has no density curve, from the features it does have', () => {
    expect(ekene9.curves.RHOB).toBeUndefined();
    expect(rows.X).toHaveLength(328);
    expect(rows.skipped).toBe(0);
    expect(pred).toEqual(ML.predict({
      model: final.fit,
      X: ML.applyScaler({ scaler: final.scaler, X: rows.X }).X,
    }));
  });

  it('never takes the measured name, nor any name the well already has', () => {
    expect(suggestMnemonic('RHOB', ['DEPT', 'GR', 'DT', 'RT'])).toBe('RHOB_ML');
    expect(suggestMnemonic('RHOB', ['RHOB_ML'])).toBe('RHOB_ML2');
    expect(mnemonicProblem('RHOB', 'RHOB', [])).toMatch(/cannot be named RHOB/);
    expect(mnemonicProblem('GR', 'RHOB', ['GR'])).toMatch(/already has a curve named GR/);
    expect(mnemonicProblem('RHOB_ML', 'RHOB', ['GR'])).toBeNull();
  });

  it('builds a full-length float32 curve on the well\'s grid with a null where no prediction was made', () => {
    const at = rows.at.slice(1);
    const log = buildPredictedLog({
      block: ekene9, values: pred.values.slice(1), at, mnemonic: 'RHOB_ML', unit: 'G/C3', description: 'd',
      provenance: mlProvenance({ design, parsed, evaluation, final, target: 'RHOB', table, wellName: 'Ekene-9' }),
    });
    expect(log.data).toHaveLength(328);
    expect(Number.isNaN(log.data[0])).toBe(true);
    expect(log.data[5]).toBe(Math.fround(pred.values[5]));
    expect(log.nullCount).toBe(1);
    expect(log.startMdM).toBeCloseTo(1450.5432, 3);
    expect(log.stepM).toBeCloseTo(0.6096, 4);
    const p = log.provenance;
    expect(p).toMatchObject({
      computed: true, engine: 'ml-workbench', method: 'ols', standardised: true, target: 'RHOB',
      features: ['GR', 'DT', 'log10(RT)'], training_wells: TRAIN.map((n) => `Ekene-${n}`), training_rows: 2624,
      predicted_well: 'Ekene-9', engine_commit: 'ec89b6b957746d34ad405a9abb81497ab28debc0',
    });
    expect(p.validation.pooled_r2).toBe(evaluation.pooled.r2);
    expect(p.validation.scheme).toBe('group k-fold, k = 5');
    expect(p.coefficients).toEqual(final.fit.coefficients);
    expect(p.input_log_ids).toEqual(Object.values(ekene9.logIds));
  });
});

// ---------------------------------------------------------------- (b)
const PAY = spec({
  task: 'classification',
  features: [{ name: 'GR', log: false }, { name: 'RHOB', log: false }, { name: 'NPHI', log: false }],
  label: { mode: 'cutoff', curve: 'RT', op: '>=', cutoff: '3', column: '' },
});

describe('(b) classification: logistic regression equals the engine', () => {
  const design = buildDesign(table, PAY);
  const parsed = parseSpec(PAY);
  const app = evaluate({ design, parsed, task: 'classification' });
  const ref = direct({ design, parsed, task: 'classification' });

  it('labels by the cutoff exactly as stated, missing values aside', () => {
    expect(design.targetText).toBe('RT >= 3');
    design.rows.forEach((r, i) => expect(design.y[i]).toBe(table.columns.RT[r] >= 3 ? 1 : 0));
    expect(design.y.filter((v) => v === 1).length).toBeGreaterThan(50);
  });

  it('gives each fold the engine fit, confusion matrix, report, ROC and log loss', () => {
    app.folds.forEach((f, q) => {
      expect(f.error).toBeUndefined();
      expect(f.fit).toEqual(slimFit(ref.folds[q].fit));
      expect(f.fit.converged).toBe(true);
      expect(f.test.report).toEqual(ref.folds[q].test.report);
      expect(f.test.roc).toEqual(ref.folds[q].test.roc);
      expect(f.test.logLoss).toEqual(ref.folds[q].test.logLoss);
    });
  });

  it('pools the held-out probabilities and classes (0.5 is class 0) and scores them with the engine', () => {
    expect(app.oof).toEqual(ref.oof);
    expect(app.oofClass).toEqual(ref.oof.map((p) => (p > 0.5 ? 1 : 0)));
    expect(app.pooled.report).toEqual(ML.classificationReport({ yTrue: design.y, yPred: app.oofClass, labels: [0, 1] }));
    expect(app.pooled.roc).toEqual(ML.rocCurve({ yTrue: design.y, scores: ref.oof }));
    expect(app.pooled.logLoss).toEqual(ML.logLoss({ yTrue: design.y, probabilities: ref.oof }));
  });

  it('shows the engine separation refusal verbatim, and fits with an L2 penalty', () => {
    // the label cut from RT, with log10(RT) a feature: a threshold on one feature separates it
    const sep = { ...PAY, features: [...PAY.features, { name: 'RT', log: true }] };
    const d2 = buildDesign(table, sep);
    const a2 = evaluate({ design: d2, parsed: parseSpec(sep), task: 'classification' });
    const r2 = direct({ design: d2, parsed: parseSpec(sep), task: 'classification' });
    a2.folds.forEach((f, q) => expect(f.error).toBe(r2.folds[q].error));
    expect(a2.folds[0].error).toMatch(/^y is completely separated by a linear combination of the features/);
    expect(a2.pooled).toBeNull();
    expect(a2.pooledRefusal).toMatch(/^No pooled score: the engine refused folds 0, 1, 2, 3, 4/);
    const pen = { ...sep, model: { kind: 'ols', lambda: '1', l2: '1' } };
    const a3 = evaluate({ design: d2, parsed: parseSpec(pen), task: 'classification' });
    const r3 = direct({ design: d2, parsed: parseSpec(pen), task: 'classification' });
    a3.folds.forEach((f, q) => {
      expect(f.fit).toEqual(slimFit(r3.folds[q].fit));
      expect(f.fit.separation.detected).toBe(true);
      expect(f.fit.separation.type).toBe('complete');
    });
  });

  it('refuses a label column holding anything but 0 and 1', () => {
    const t2 = { ...table, columns: { ...table.columns, LAB: table.columns.GR.map((v) => (v > 80 ? 1 : 2)) } };
    const r = buildDesign(t2, { ...PAY, label: { mode: 'column', column: 'LAB' } });
    expect(r.error).toMatch(/^The label column LAB holds \d+ values other than 0 and 1/);
  });
});

// ---------------------------------------------------------------- (c), (d)
describe('(c) the leakage demo is the engine leakage demo', () => {
  it('on the log data, with the verdict read from the engine optimism and no claim that random always flatters', () => {
    const design = buildDesign(table, DT_SPEC);
    const parsed = parseSpec(DT_SPEC);
    const app = leakage({ design, parsed });
    const ref = ML.leakageDemo({
      X: design.X, y: design.y, groups: design.groups, model: { kind: 'ols' }, testFraction: 0.25, seed: 42, metric: 'r2',
    });
    const slim = ({ trainIndices, testIndices, ...rest }) => rest;
    expect(app).toEqual({ ...ref, randomRow: slim(ref.randomRow), group: slim(ref.group) });
    expect(app.randomRow.sharedGroups.length).toBeGreaterThan(0);
    expect(app.group.sharedGroups).toEqual([]);
    const verdict = leakageVerdict(app);
    expect(verdict).toBe(app.optimism > 0
      ? 'On this data the random row split scored better than the group split: rows from the held-out wells leaked into training and flattered the test score.'
      : 'On this data the random row split scored worse than the group split. A random split does not always flatter: the leak needs features that identify the well, and these wells may be alike enough that it does not show.');
    expect(leakageVerdict({ optimism: -0.1 })).toMatch(/does not always flatter/);
  });
});

describe('(d) permutation importance and the learning curve are the engine\'s', () => {
  const design = buildDesign(table, DT_SPEC);
  const parsed = parseSpec(DT_SPEC);

  it('permutation importance on the held-out wells of one group split, scaler and fit on its training wells', () => {
    const app = importance({ design, parsed });
    const s = ML.groupSplit({ groups: design.groups, testFraction: 0.25, seed: 42 });
    const scaler = ML.fitStandardScaler({ X: design.X, trainIndices: s.trainIndices, names: design.names });
    const Z = ML.applyScaler({ scaler, X: design.X }).X;
    const fit = ML.ols({ X: pick(Z, s.trainIndices), y: pick(design.y, s.trainIndices), names: design.names });
    const ref = ML.permutationImportance({
      model: fit, X: pick(Z, s.testIndices), y: pick(design.y, s.testIndices), metric: 'r2', nRepeats: 5, seed: 42,
    });
    expect(app).toEqual({ ...ref, trainGroups: s.trainGroups, testGroups: s.testGroups, nTest: s.testIndices.length });
    expect(app.ranking).toHaveLength(4);
  });

  it('refuses above the held-out row cap and says why', () => {
    const r = importance({ design, parsed, maxRows: 100 });
    expect(r.error).toBe('The held-out wells have 656 rows, more than the 100 permutation importance scores. Each feature and repeat re-scores every held-out row; keep every nth sample or narrow the depth window.');
  });

  it('the learning curve counts training wells from 1 to all of them', () => {
    const app = learning({ design, parsed });
    const ref = ML.learningCurve({
      X: design.X, y: design.y, groups: design.groups, model: { kind: 'ols' }, trainGroupCounts: [1, 2, 3, 4, 5, 6], testFraction: 0.25, seed: 42, metric: 'r2',
    });
    const { testIndices, ...rest } = ref;
    expect(app).toEqual({ ...rest, nTest: testIndices.length, skipped: [] });
    expect(app.points.map((p) => p.nGroups)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('classification tools default to AUC, and a training size the engine cannot fit is left out with its reason', () => {
    const d = buildDesign(table, PAY);
    const p = parseSpec(PAY);
    expect(p.tools.metric).toBe('auc');
    const app = learning({ design: d, parsed: p });
    // with one training well there is only one class: the engine refuses that size
    const one = ML.learningCurve({
      X: d.X, y: d.y, groups: d.groups, model: { kind: 'logistic', l2: 0 }, trainGroupCounts: [1, 2, 3, 4, 5, 6], testFraction: 0.25, seed: 42, metric: 'auc',
    });
    expect(one.error).toMatch(/^trainGroupCounts\[0\] \(1 groups, \d+ rows\) could not be fitted: y must contain both classes, 0 and 1$/);
    expect(app.skipped[0]).toEqual({ nGroups: 1, reason: one.error });
    const start = app.points[0].nGroups;
    const counts = [];
    for (let c = start; c <= 6; c += 1) counts.push(c);
    const ref = ML.learningCurve({
      X: d.X, y: d.y, groups: d.groups, model: { kind: 'logistic', l2: 0 }, trainGroupCounts: counts, testFraction: 0.25, seed: 42, metric: 'auc',
    });
    const { testIndices, ...rest } = ref;
    expect(app).toEqual({ ...rest, nTest: testIndices.length, skipped: app.skipped });
    expect(app.skipped).toHaveLength(start - 1);
    expect(app.metric).toBe('auc');
  });
});
