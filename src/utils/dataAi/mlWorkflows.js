// ML Workbench (Data & AI D2): the workflows, every number from the engine.
//
// Each function takes the design buildDesign made (X, y, groups, names) and
// a model spec, and calls the vendored engine
// (packages/engines/engines/dataai/ml.js, through the one-line shim). The
// app adds only bookkeeping: which rows a fold trains and tests on, where
// each held-out prediction goes, and which engine refusal to show.
//
// Conventions this layer adds (stated in the help guide):
//   - Scaling is fitted on the TRAINING rows of each fold only, with the
//     engine's fitStandardScaler (population SD), and applied unchanged to
//     that fold's test rows with applyScaler. It is on by default.
//   - Every row index here counts from 0, as the engine's do.
//   - A held-out prediction is written back to the row it came from, so the
//     pooled scores are the engine's metrics on every row a fold held out.
//   - The leakage demo and the learning curve are engine functions that fit
//     on the features as given; ridge standardises inside them on each
//     training set, and OLS and unpenalised logistic predictions do not
//     change under a linear rescaling of the features.
import * as ML from '@/utils/dataAi/engine/ml';
import { MAX_IMPORTANCE_ROWS } from '@/utils/dataAi/mlData';

/** The engine build the studio runs: petrolord-engines at the VENDOR.json pin. */
export const ENGINE_VERSION = 'petrolord-engines f50251d (engines/dataai/ml.js, PR #252; PR #254 added the rowNoun option, default messages unchanged; ml.js unchanged since ef4058f)';
export const ENGINE_COMMIT = 'f50251d88d3a7d88e381b62cd77c59d5fb3fcb05';

export const DEFAULT_SEED = 42;

export const MODEL_KINDS = {
  regression: [
    { value: 'ols', label: 'Ordinary least squares (OLS)' },
    { value: 'ridge', label: 'Ridge regression' },
  ],
  classification: [
    { value: 'logistic', label: 'Logistic regression' },
  ],
};

export const METRIC_OPTIONS = {
  regression: [
    { value: 'r2', label: 'R-squared' },
    { value: 'rmse', label: 'RMSE' },
    { value: 'mae', label: 'MAE' },
  ],
  classification: [
    { value: 'auc', label: 'ROC AUC' },
    { value: 'accuracy', label: 'Accuracy' },
    { value: 'logLoss', label: 'Log loss' },
  ],
};

/** A fresh spec: everything as typed text, read by parseSpec. */
export const defaultSpec = () => ({
  task: 'regression',
  target: '',
  features: [],
  label: { mode: 'cutoff', curve: '', op: '>=', cutoff: '', column: '' },
  depthMin: '',
  depthMax: '',
  every: '1',
  model: { kind: 'ols', lambda: '1', l2: '0' },
  standardise: true,
  validation: { scheme: 'kfold', k: '5', testFraction: '0.25', seed: String(DEFAULT_SEED) },
  tools: { metric: '', nRepeats: '5', testFraction: '0.25', seed: String(DEFAULT_SEED) },
});

const num = (s) => {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
};

/**
 * The typed spec to engine arguments, or { error }. Engine refusals on the
 * values themselves (k too large, a fraction of 1) come from the engine.
 */
export function parseSpec(spec) {
  const kind = spec.task === 'classification' ? 'logistic' : (spec.model?.kind === 'ridge' ? 'ridge' : 'ols');
  const model = { kind };
  if (kind === 'ridge') {
    const l = num(spec.model.lambda);
    if (l === null || Number.isNaN(l)) return { error: 'Ridge lambda must be a number (0 or more).' };
    model.lambda = l;
  }
  if (kind === 'logistic') {
    const l2 = num(spec.model?.l2);
    model.l2 = l2 === null ? 0 : l2;
    if (Number.isNaN(model.l2)) return { error: 'The L2 penalty must be a number (0 or more).' };
  }
  const v = spec.validation || {};
  const seed = num(v.seed);
  if (seed === null || Number.isNaN(seed)) return { error: 'The seed must be a whole number.' };
  const validation = { scheme: v.scheme === 'split' ? 'split' : 'kfold', seed };
  if (validation.scheme === 'kfold') {
    const k = num(v.k);
    if (k === null || Number.isNaN(k)) return { error: 'The number of folds k must be a whole number.' };
    validation.k = k;
  } else {
    const f = num(v.testFraction);
    if (f === null || Number.isNaN(f)) return { error: 'The test fraction must be a number between 0 and 1.' };
    validation.testFraction = f;
  }
  const t = spec.tools || {};
  const toolSeed = num(t.seed);
  const toolFraction = num(t.testFraction);
  const nRepeats = num(t.nRepeats);
  if (toolSeed === null || Number.isNaN(toolSeed)) return { error: 'The diagnostics seed must be a whole number.' };
  if (toolFraction === null || Number.isNaN(toolFraction)) return { error: 'The diagnostics test fraction must be a number between 0 and 1.' };
  if (nRepeats === null || Number.isNaN(nRepeats)) return { error: 'The number of repeats must be a whole number.' };
  const metric = t.metric || (kind === 'logistic' ? 'auc' : 'r2');
  return {
    model,
    validation,
    standardise: spec.standardise !== false,
    tools: { seed: toolSeed, testFraction: toolFraction, nRepeats, metric },
  };
}

const pick = (arr, idx) => idx.map((i) => arr[i]);

/** Fits the model spec with the engine. */
export function fitModel(model, X, y, names) {
  if (model.kind === 'ols') return ML.ols({ X, y, names });
  if (model.kind === 'ridge') return ML.ridge({ X, y, lambda: model.lambda, names });
  return ML.logistic({ X, y, names, l2: model.l2 ?? 0 });
}

/** A fit without its per-row arrays: what the screen, a message and a save need. */
export function slimFit(fit) {
  if (!fit || fit.error) return fit;
  const {
    fitted, residuals, probabilities, trace, ...rest
  } = fit;
  return { ...rest, traceLength: Array.isArray(trace) ? trace.length : undefined };
}

/** A fitted scaler without its copy of the training row list. */
export const slimScaler = (scaler) => {
  if (!scaler || scaler.error) return scaler;
  const { fitIndices, ...rest } = scaler;
  return rest;
};

/**
 * The scaler for one fold: fitted on trainIndices only (engine
 * fitStandardScaler), applied unchanged to every row (applyScaler). With
 * standardise off the rows pass through.
 */
export function scaleFold(X, trainIndices, names, standardise) {
  if (!standardise) return { scaler: null, X };
  const scaler = ML.fitStandardScaler({ X, trainIndices, names });
  if (scaler.error) return { error: scaler.error };
  const applied = ML.applyScaler({ scaler, X });
  if (applied.error) return { error: applied.error };
  return { scaler: slimScaler(scaler), X: applied.X };
}

/** Group split or group k-fold, from the engine, as a list of folds. */
export function makeFolds(groups, validation) {
  if (validation.scheme === 'kfold') {
    const cv = ML.groupKFold({ groups, k: validation.k, seed: validation.seed });
    if (cv.error) return { error: cv.error };
    return {
      scheme: 'kfold', k: cv.k, seed: cv.seed, order: cv.order, basis: cv.basis,
      folds: cv.folds.map((f) => ({ fold: f.fold, trainIndices: f.trainIndices, testIndices: f.testIndices, trainGroups: f.trainGroups, testGroups: f.testGroups })),
    };
  }
  const s = ML.groupSplit({ groups, testFraction: validation.testFraction, seed: validation.seed });
  if (s.error) return { error: s.error };
  return {
    scheme: 'split', testFraction: validation.testFraction, seed: s.seed, order: s.order, basis: s.basis,
    folds: [{ fold: 0, trainIndices: s.trainIndices, testIndices: s.testIndices, trainGroups: s.trainGroups, testGroups: s.testGroups }],
  };
}

const classificationScores = (yTrue, probabilities, classes) => ({
  report: ML.classificationReport({ yTrue, yPred: classes, labels: [0, 1] }),
  roc: ML.rocCurve({ yTrue, scores: probabilities }),
  logLoss: ML.logLoss({ yTrue, probabilities }),
});

/**
 * Validation by whole wells: per fold the scaler is fitted on the training
 * rows, the model is fitted on them, and the held-out wells are predicted
 * and scored. Pooled scores are the engine's metrics over every held-out
 * row, each predicted by the fold that held it out.
 *
 * @returns {{ task, scheme, folds, pooled, oof, oofClass, tested, error? }}
 */
export function evaluate({ design, parsed, task, onProgress }) {
  const { X, y, groups, names } = design;
  const { model, validation, standardise } = parsed;
  const cv = makeFolds(groups, validation);
  if (cv.error) return { error: cv.error };
  const n = X.length;
  const oof = new Array(n).fill(null);
  const oofClass = task === 'classification' ? new Array(n).fill(null) : null;
  const folds = [];
  cv.folds.forEach((f, q) => {
    onProgress?.({ phase: 'fold', done: q, total: cv.folds.length });
    const base = {
      fold: f.fold, trainGroups: f.trainGroups, testGroups: f.testGroups,
      nTrain: f.trainIndices.length, nTest: f.testIndices.length,
    };
    const sc = scaleFold(X, f.trainIndices, names, standardise);
    if (sc.error) { folds.push({ ...base, error: sc.error, stage: 'scaler' }); return; }
    const Xtr = pick(sc.X, f.trainIndices);
    const ytr = pick(y, f.trainIndices);
    const fit = fitModel(model, Xtr, ytr, names);
    if (fit.error) { folds.push({ ...base, error: fit.error, stage: 'fit', scaler: sc.scaler }); return; }
    const Xte = pick(sc.X, f.testIndices);
    const yte = pick(y, f.testIndices);
    const pr = ML.predict({ model: fit, X: Xte });
    if (pr.error) { folds.push({ ...base, error: pr.error, stage: 'predict' }); return; }
    f.testIndices.forEach((row, j) => {
      oof[row] = pr.values[j];
      if (oofClass) oofClass[row] = pr.classes[j];
    });
    const out = { ...base, scaler: sc.scaler, fit: slimFit(fit) };
    if (task === 'classification') {
      out.test = classificationScores(yte, pr.values, pr.classes);
      out.train = { accuracy: ML.classificationReport({ yTrue: ytr, yPred: ML.predict({ model: fit, X: Xtr }).classes, labels: [0, 1] }).accuracy };
    } else {
      out.test = ML.regressionMetrics({ yTrue: yte, yPred: pr.values });
      out.train = ML.regressionMetrics({ yTrue: ytr, yPred: ML.predict({ model: fit, X: Xtr }).values });
    }
    folds.push(out);
  });
  onProgress?.({ phase: 'fold', done: cv.folds.length, total: cv.folds.length });
  const refused = folds.filter((f) => f.error);
  const tested = [];
  for (let i = 0; i < n; i += 1) if (oof[i] !== null) tested.push(i);
  let pooled = null;
  let pooledRefusal = null;
  if (refused.length) {
    pooledRefusal = `No pooled score: the engine refused fold${refused.length === 1 ? '' : 's'} ${refused.map((f) => f.fold).join(', ')}, so ${refused.length === 1 ? 'its' : 'their'} wells have no held-out prediction.`;
  } else if (task === 'classification') {
    pooled = classificationScores(pick(y, tested), pick(oof, tested), pick(oofClass, tested));
  } else {
    pooled = ML.regressionMetrics({ yTrue: pick(y, tested), yPred: pick(oof, tested) });
  }
  return {
    task,
    scheme: cv.scheme,
    k: cv.k,
    testFraction: cv.testFraction,
    seed: cv.seed,
    order: cv.order,
    splitBasis: cv.basis,
    folds,
    pooled,
    pooledRefusal,
    oof,
    oofClass,
    tested,
  };
}

/**
 * The model on every row (the scaler fitted on all of them, since all are
 * training rows here): the coefficients shown and the model used to
 * predict a curve into another well.
 */
export function fitFinal({ design, parsed }) {
  const { X, y, names } = design;
  const all = X.map((_, i) => i);
  const sc = scaleFold(X, all, names, parsed.standardise);
  if (sc.error) return { error: sc.error };
  const fit = fitModel(parsed.model, sc.X, y, names);
  if (fit.error) return { error: fit.error, scaler: sc.scaler };
  return { scaler: sc.scaler, fit: slimFit(fit), names, standardise: parsed.standardise };
}

/** Predictions of a final fit on new feature rows (scaled with its scaler). */
export function predictWith(final, Xnew) {
  if (!final || final.error) return { error: 'No fitted model.' };
  if (!Xnew.length) return { values: [] };
  let Xs = Xnew;
  if (final.scaler) {
    const a = ML.applyScaler({ scaler: final.scaler, X: Xnew });
    if (a.error) return a;
    Xs = a.X;
  }
  return ML.predict({ model: final.fit, X: Xs });
}

/**
 * Seeded permutation importance on held-out wells: one engine group split,
 * the scaler and the model fitted on its training wells, then the engine's
 * permutationImportance on the test wells.
 */
export function importance({ design, parsed, maxRows = MAX_IMPORTANCE_ROWS }) {
  const { X, y, groups, names } = design;
  const { model, standardise, tools } = parsed;
  const s = ML.groupSplit({ groups, testFraction: tools.testFraction, seed: tools.seed });
  if (s.error) return { error: s.error };
  if (s.testIndices.length > maxRows) {
    return {
      error: `The held-out wells have ${s.testIndices.length.toLocaleString('en-US')} rows, more than the ${maxRows.toLocaleString('en-US')} permutation importance scores. Each feature and repeat re-scores every held-out row; keep every nth sample or narrow the depth window.`,
    };
  }
  const sc = scaleFold(X, s.trainIndices, names, standardise);
  if (sc.error) return { error: sc.error };
  const fit = fitModel(model, pick(sc.X, s.trainIndices), pick(y, s.trainIndices), names);
  if (fit.error) return { error: fit.error };
  const r = ML.permutationImportance({
    model: fit, X: pick(sc.X, s.testIndices), y: pick(y, s.testIndices), metric: tools.metric, nRepeats: tools.nRepeats, seed: tools.seed,
  });
  if (r.error) return { error: r.error };
  return { ...r, trainGroups: s.trainGroups, testGroups: s.testGroups, nTest: s.testIndices.length };
}

/** The engine's model spec for learningCurve and leakageDemo. */
export const engineModelSpec = (model) => (model.kind === 'ridge'
  ? { kind: 'ridge', lambda: model.lambda }
  : model.kind === 'logistic' ? { kind: 'logistic', l2: model.l2 ?? 0 } : { kind: 'ols' });

/**
 * The engine's learning curve: one group split fixes the test wells, the
 * model trains on the first 1, 2, ... training wells of the split's order.
 * When the engine cannot fit the smallest count (one well may hold only
 * one class, for example), the curve starts at the next count, and the
 * engine's refusal for the count left out is returned as `skipped`.
 */
export function learning({ design, parsed }) {
  const { X, y, groups } = design;
  const { model, tools } = parsed;
  const s = ML.groupSplit({ groups, testFraction: tools.testFraction, seed: tools.seed });
  if (s.error) return { error: s.error };
  const nTrain = s.trainGroups.length;
  const skipped = [];
  for (let start = 1; start <= nTrain; start += 1) {
    const counts = [];
    for (let c = start; c <= nTrain; c += 1) counts.push(c);
    const r = ML.learningCurve({
      X, y, groups, model: engineModelSpec(model), trainGroupCounts: counts, testFraction: tools.testFraction, seed: tools.seed, metric: tools.metric,
    });
    if (!r.error) {
      const { testIndices, ...rest } = r;
      return { ...rest, nTest: testIndices.length, skipped };
    }
    if (!r.error.startsWith('trainGroupCounts[0] ')) return { error: r.error, skipped };
    skipped.push({ nGroups: start, reason: r.error });
  }
  return { error: `No training size from 1 to ${nTrain} wells could be fitted; the last refusal: ${skipped[skipped.length - 1].reason}`, skipped };
}

/**
 * The engine's leakage demo: the same model scored under a random row
 * split and under a group split, same fraction and seed.
 */
export function leakage({ design, parsed }) {
  const { X, y, groups } = design;
  const { model, tools } = parsed;
  const r = ML.leakageDemo({
    X, y, groups, model: engineModelSpec(model), testFraction: tools.testFraction, seed: tools.seed, metric: tools.metric,
  });
  if (r.error) return { error: r.error };
  const slim = ({ trainIndices, testIndices, ...rest }) => rest;
  return { ...r, randomRow: slim(r.randomRow), group: slim(r.group) };
}

/** Which way the leakage demo came out, in words, from the engine's optimism. */
export function leakageVerdict(r) {
  if (!r || r.error) return '';
  if (r.optimism > 0) return 'On this data the random row split scored better than the group split: rows from the held-out wells leaked into training and flattered the test score.';
  if (r.optimism < 0) return 'On this data the random row split scored worse than the group split. A random split does not always flatter: the leak needs features that identify the well, and these wells may be alike enough that it does not show.';
  return 'On this data the two splits scored the same.';
}

/** Stride for plotting at most maxPoints of n (every stride-th row from row 0). */
export const plotStride = (n, maxPoints = 4000) => Math.max(1, Math.ceil(n / maxPoints));
