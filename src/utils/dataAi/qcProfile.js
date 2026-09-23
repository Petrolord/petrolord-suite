// Data Quality Studio (Data & AI D1): the QC profile and its run.
//
// A profile is the user's choices (which checks, which channels, every method
// parameter) held as TEXT exactly as typed, so a blank stays blank and means
// "the engine's own default". runQcProfile hands each check to the vendored
// engine (packages/engines/engines/dataai/quality.js, via the shim) and only
// collects what comes back: every number, flag, rule and reason on screen is
// the engine's. An engine refusal is shown verbatim, never replaced by a
// guess.
//
// What this file adds, and states in SCORE_BASIS: how the engine's per-check
// counts become the five scorecard dimensions (distinct cells, so a value
// flagged by two rules counts once), and which results stay out of the score
// (coverage holes, Mahalanobis rows, control chart signals).

import {
  CONSTANTS, DEFINITIONAL_LIMITS, DIMENSIONS,
  completeness, coverage, rangeCheck, indexCheck, rateCheck,
  cumulativeCheck, waterCutCheck, phaseSumCheck, frozenRuns,
  duplicateIdentifiers,
  zScores, modifiedZScores, iqrFences, hampel, grubbsTest, mahalanobis,
  individualsChart, ewmaChart, cusumChart, scorecard,
} from '@/utils/dataAi/engine/quality';

export const PROFILE_SCHEMA = 1;

/**
 * Petrolord defaults. Each is a CHOICE, shown as one in the app and the help
 * guide. Where the engine has its own default the text here is that value, so
 * the screen shows the number that will be used. Blank means the engine
 * default (or, where the engine has none, that the check waits for a value).
 */
export const DEFAULTS = Object.freeze({
  zThreshold: '3',
  zSd: 'sample',
  modzThreshold: String(CONSTANTS.MODIFIED_Z_THRESHOLD),
  tukeyK: String(CONSTANTS.TUKEY_K),
  tukeyMethod: 'R7',
  hampelHalfWindow: '5',
  hampelNSigma: '3',
  grubbsAlpha: '0.05',
  grubbsSide: 'two-sided',
  mahalanobisAlpha: '0.025',
  frozenMinRun: '5',
  frozenTolerance: '0',
  phaseRelTolerance: '0.005',
  phaseAbsTolerance: '0',
  waterCutTolerance: '0.000001',
  cumulativeTolerance: '0',
  ewmaLambda: '0.2',
  ewmaL: '3',
  cusumK: '0.5',
  cusumH: '5',
  cusumUnits: 'sigma',
  maxDistance: '1',
});

/** Where each default comes from, printed beside the input. */
export const DEFAULT_SOURCES = Object.freeze({
  zThreshold: 'engine default; NIST 1.3.5.17 names |z| > 3 as a common rule',
  modzThreshold: 'Iglewicz and Hoaglin, as NIST 1.3.5.17 prints it',
  tukeyK: 'Tukey inner fence',
  tukeyMethod: 'engine default: R7 is the Excel, R and numpy quartile, so a spreadsheet reproduces the fences',
  hampelHalfWindow: 'Petrolord choice: the Petrophysics Studio despike default',
  hampelNSigma: 'Petrolord choice: the Petrophysics Studio despike default',
  grubbsAlpha: 'the significance level NIST 1.3.5.17.1 works at',
  mahalanobisAlpha: 'Petrolord choice (engine default); open to change',
  frozenMinRun: 'Petrolord choice (engine default); open to change',
  frozenTolerance: 'Petrolord choice (engine default): exactly equal values',
  phaseRelTolerance: 'Petrolord choice (engine default): 0.5 percent of the total',
  waterCutTolerance: 'engine default',
  cumulativeTolerance: 'engine default: any fall is flagged',
  ewmaLambda: 'Petrolord choice inside the 0.2 to 0.3 NIST 6.3.2.4 calls usual',
  ewmaL: 'engine default, 3 sigma limits',
  cusumK: 'the rule of thumb k = 0.5 sigma (NIST 6.3.2.3)',
  cusumH: 'the rule of thumb h = 4 or 5 sigma; 5 here is a Petrolord choice',
  maxDistance: 'engine default: one edit',
});

export const defaultProfile = () => ({
  schema: PROFILE_SCHEMA,
  channels: [],
  limits: {},
  completeness: { enabled: true, coverageMaxStep: '' },
  validity: {
    index: { enabled: true, direction: 'increasing', expectedStep: '', stepTolerance: '' },
    ranges: { enabled: true },
    rate: { enabled: false, rateKeys: [], hoursOnKey: '' },
  },
  consistency: {
    cumulative: { key: '', tolerance: DEFAULTS.cumulativeTolerance },
    waterCut: { wcKey: '', oilKey: '', waterKey: '', tolerance: DEFAULTS.waterCutTolerance },
    phaseSum: { partKeys: [], totalKey: '', relTolerance: DEFAULTS.phaseRelTolerance, absTolerance: DEFAULTS.phaseAbsTolerance },
    frozen: { enabled: true, minRun: DEFAULTS.frozenMinRun, tolerance: DEFAULTS.frozenTolerance },
  },
  uniqueness: { enabled: true, maxDistance: DEFAULTS.maxDistance, digitsMustMatch: true, stripLeadingZeros: true },
  outliers: {
    z: { enabled: true, threshold: DEFAULTS.zThreshold, sd: DEFAULTS.zSd },
    modz: { enabled: true, threshold: DEFAULTS.modzThreshold },
    tukey: { enabled: true, k: DEFAULTS.tukeyK, method: DEFAULTS.tukeyMethod },
    hampel: { enabled: true, halfWindow: DEFAULTS.hampelHalfWindow, nSigma: DEFAULTS.hampelNSigma },
    grubbs: { enabled: false, alpha: DEFAULTS.grubbsAlpha, side: DEFAULTS.grubbsSide },
  },
  mahalanobis: { enabled: false, keys: [], alpha: DEFAULTS.mahalanobisAlpha },
  charts: {
    key: '', from: '', to: '',
    target: '', sigma: '',
    individuals: { enabled: true, centre: '', mrBar: '' },
    ewma: { enabled: true, lambda: DEFAULTS.ewmaLambda, L: DEFAULTS.ewmaL, limits: 'asymptotic' },
    cusum: { enabled: true, k: DEFAULTS.cusumK, h: DEFAULTS.cusumH, units: DEFAULTS.cusumUnits },
  },
  scorecard: { weights: {} },
});

/** Merge a stored profile over the defaults so an older saved run still opens. */
export function profileFromPayload(p) {
  const base = defaultProfile();
  if (!p || typeof p !== 'object') return base;
  const merge = (a, b) => {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
    const out = { ...a };
    Object.keys(b).forEach((k) => {
      out[k] = a && typeof a[k] === 'object' && !Array.isArray(a[k]) && a[k] !== null ? merge(a[k], b[k]) : b[k];
    });
    return out;
  };
  return merge(base, p);
}

/**
 * Text to a number for the engine. Blank is undefined (the engine default);
 * anything else goes through Number, so a typo reaches the engine as NaN and
 * comes back as the engine's own refusal naming the field.
 */
export const num = (s) => {
  if (s === undefined || s === null) return undefined;
  const t = String(s).trim();
  if (t === '') return undefined;
  return Number(t);
};

const DIMENSION_LABEL = {
  completeness: 'Completeness',
  validity: 'Validity',
  consistency: 'Consistency',
  uniqueness: 'Uniqueness',
  plausibility: 'Plausibility (outliers)',
};
export const dimensionLabel = (d) => DIMENSION_LABEL[d] || d;

export const SCORE_BASIS = [
  'Each dimension scores 1 - failed / checked over distinct cells (one channel at one sample), so a value two rules flag counts once.',
  'Completeness: every sample of every selected channel is checked; a missing value fails.',
  'Validity: the index entries, and every present value a range or rate rule looked at.',
  'Consistency: the values a cumulative, water cut or phase sum rule compared, and every present value of a channel searched for frozen runs; a sample inside a frozen run fails.',
  'Uniqueness: the identifiers; the later member of a duplicate pair fails.',
  'Plausibility: every present value of a selected channel; a value any enabled univariate outlier test flags fails. An outlier is a value to look at, which may be real.',
  'Not scored: coverage holes, Mahalanobis rows and control chart signals. They are listed with their reasons.',
  'A dimension nothing checked is left out of the scorecard rather than scored as perfect.',
];

/** The label of sample i on the dataset's index (a depth, a date, or the row). */
export const indexLabel = (ds, i) => {
  if (i === null || i === undefined) return '';
  const idx = ds.index;
  if (!idx) return `row ${i + 1}`;
  if (idx.labels && idx.labels[i] !== undefined) return idx.labels[i];
  const v = idx.values[i];
  return v === null || v === undefined ? `row ${i + 1}` : String(Number(v.toPrecision(8)));
};

const cell = (key, i) => `${key}\u0000${i}`;

const presentCount = (values) => values.reduce((a, v) => a + (v === null || v === undefined ? 0 : 1), 0);

/** Channels the profile runs on: the selected ones, or every channel. */
export const selectedChannels = (ds, profile) => {
  const want = profile.channels || [];
  return want.length ? ds.channels.filter((c) => want.includes(c.key)) : ds.channels;
};

/** A range rule for a channel from the profile, or null for none. */
export const rangeArgs = (limit) => {
  if (!limit || limit.mode === 'none' || !limit.mode) return null;
  if (limit.mode === 'definitional') return { channel: limit.channel, unit: limit.unit === 'any' ? undefined : limit.unit };
  const min = String(limit.min ?? '').trim() === '' ? -Infinity : Number(limit.min);
  const max = String(limit.max ?? '').trim() === '' ? Infinity : Number(limit.max);
  return { min, max, minExclusive: !!limit.minExclusive, maxExclusive: !!limit.maxExclusive };
};

export const DEFINITIONAL_CHANNELS = Object.keys(DEFINITIONAL_LIMITS);
export const definitionalUnits = (channel) => Object.keys(DEFINITIONAL_LIMITS[channel] || {});

const sliceWindow = (values, from, to) => {
  const a = num(from);
  const b = num(to);
  const start = Number.isInteger(a) && a >= 1 ? a - 1 : 0;
  const end = Number.isInteger(b) && b >= 1 ? Math.min(b, values.length) : values.length;
  return { start, values: values.slice(start, end) };
};

/**
 * Run the profile on a dataset. Returns the engine results grouped by
 * dimension, one flag list, the scorecard and the chart data.
 */
export function runQcProfile(ds, profileIn) {
  const profile = profileFromPayload(profileIn);
  const chans = selectedChannels(ds, profile);
  const byKey = Object.fromEntries(ds.channels.map((c) => [c.key, c]));
  const results = [];
  const flags = [];
  const tally = Object.fromEntries(DIMENSIONS.map((d) => [d, { checked: new Set(), failed: new Set() }]));

  const push = (dimension, method, channel, result, { scoreChecked, scoreFailed } = {}) => {
    const entry = { dimension, method, channel: channel ? channel.name : null, channelKey: channel ? channel.key : null, result };
    results.push(entry);
    if (!result || result.error) return entry;
    (result.flags || []).forEach((f) => {
      flags.push({
        dimension, method,
        channel: channel ? channel.name : (f.channel || null),
        index: f.index,
        at: f.index === null || f.index === undefined ? (f.from !== undefined ? `${f.from} to ${f.to}` : '') : indexLabel(ds, f.index),
        rule: f.rule,
        reason: f.reason,
      });
    });
    if (scoreChecked) scoreChecked.forEach((c) => tally[dimension].checked.add(c));
    if (scoreFailed) scoreFailed.forEach((c) => tally[dimension].failed.add(c));
    return entry;
  };

  const presentCells = (ch) => ch.values.flatMap((v, i) => (v === null || v === undefined ? [] : [cell(ch.key, i)]));

  // ---------------------------------------------------------- completeness
  if (profile.completeness.enabled) {
    chans.forEach((ch) => {
      const r = completeness({ values: ch.values });
      push('completeness', 'completeness', ch, r, {
        scoreChecked: ch.values.map((_, i) => cell(ch.key, i)),
        scoreFailed: r.error ? [] : ch.values.flatMap((v, i) => (v === null || v === undefined ? [cell(ch.key, i)] : [])),
      });
    });
    const maxStep = num(profile.completeness.coverageMaxStep);
    if (maxStep !== undefined && ds.index) {
      const idx = ds.index.values;
      const present = idx.filter((v) => v !== null && v !== undefined);
      chans.forEach((ch) => {
        const r = coverage({ index: idx, values: ch.values, start: Math.min(...present), end: Math.max(...present), maxStep });
        push('completeness', 'coverage', ch, r);
      });
    }
  }

  // ---------------------------------------------------------- validity
  if (profile.validity.index.enabled && ds.index) {
    const v = profile.validity.index;
    const r = indexCheck({ index: ds.index.values, direction: v.direction, expectedStep: num(v.expectedStep), stepTolerance: num(v.stepTolerance) });
    push('validity', 'index', { key: '#index', name: `${ds.index.name} (index)` }, r, {
      scoreChecked: ds.index.values.map((_, i) => cell('#index', i)),
      scoreFailed: r.error ? [] : r.flags.map((f) => cell('#index', f.index)),
    });
  }
  if (profile.validity.ranges.enabled) {
    chans.forEach((ch) => {
      const args = rangeArgs(profile.limits?.[ch.key]);
      if (!args) return;
      const r = rangeCheck({ values: ch.values, ...args });
      push('validity', 'range', ch, r, {
        scoreChecked: presentCells(ch),
        scoreFailed: r.error ? [] : r.flags.map((f) => cell(ch.key, f.index)),
      });
    });
  }
  if (profile.validity.rate.enabled) {
    const rv = profile.validity.rate;
    const hours = rv.hoursOnKey ? byKey[rv.hoursOnKey] : null;
    (rv.rateKeys || []).map((k) => byKey[k]).filter(Boolean).forEach((ch) => {
      const r = rateCheck({ rates: ch.values, hoursOn: hours ? hours.values : undefined });
      push('validity', 'rate', ch, r, {
        scoreChecked: presentCells(ch),
        scoreFailed: r.error ? [] : r.flags.map((f) => cell(ch.key, f.index)),
      });
    });
  }

  // ---------------------------------------------------------- consistency
  const cons = profile.consistency;
  if (cons.cumulative.key && byKey[cons.cumulative.key]) {
    const ch = byKey[cons.cumulative.key];
    const r = cumulativeCheck({ cumulative: ch.values, tolerance: num(cons.cumulative.tolerance) });
    push('consistency', 'cumulative', ch, r, {
      scoreChecked: presentCells(ch).slice(1),
      scoreFailed: r.error ? [] : r.flags.map((f) => cell(ch.key, f.index)),
    });
  }
  const wc = cons.waterCut;
  if (wc.wcKey || (wc.oilKey && wc.waterKey)) {
    const wcCh = wc.wcKey ? byKey[wc.wcKey] : null;
    const oil = wc.oilKey ? byKey[wc.oilKey] : null;
    const water = wc.waterKey ? byKey[wc.waterKey] : null;
    const r = waterCutCheck({
      waterCut: wcCh ? wcCh.values : undefined,
      oil: oil ? oil.values : undefined,
      water: water ? water.values : undefined,
      tolerance: num(wc.tolerance),
    });
    const target = wcCh || { key: '#watercut', name: 'water cut (computed)' };
    push('consistency', 'water-cut', target, r, {
      scoreChecked: wcCh ? presentCells(wcCh) : [],
      scoreFailed: r.error || !wcCh ? [] : r.flags.map((f) => cell(wcCh.key, f.index)),
    });
  }
  const ps = cons.phaseSum;
  if (ps.totalKey && (ps.partKeys || []).length && byKey[ps.totalKey]) {
    const total = byKey[ps.totalKey];
    const parts = Object.fromEntries(ps.partKeys.filter((k) => byKey[k]).map((k) => [byKey[k].name, byKey[k].values]));
    const r = phaseSumCheck({ parts, total: total.values, relTolerance: num(ps.relTolerance), absTolerance: num(ps.absTolerance) });
    push('consistency', 'phase-sum', total, r, {
      scoreChecked: r.error ? [] : r.sums.flatMap((s, i) => (s === null ? [] : [cell(total.key, i)])),
      scoreFailed: r.error ? [] : r.flags.map((f) => cell(total.key, f.index)),
    });
  }
  if (cons.frozen.enabled) {
    chans.forEach((ch) => {
      const r = frozenRuns({ values: ch.values, minRun: num(cons.frozen.minRun), tolerance: num(cons.frozen.tolerance) });
      push('consistency', 'frozen', ch, r, {
        scoreChecked: presentCells(ch),
        scoreFailed: r.error ? [] : r.runs.flatMap((run) => Array.from({ length: run.length }, (_, j) => cell(ch.key, run.start + j))),
      });
    });
  }

  // ---------------------------------------------------------- uniqueness
  if (profile.uniqueness.enabled && ds.identifiers && ds.identifiers.values.length) {
    const u = profile.uniqueness;
    const r = duplicateIdentifiers({
      ids: ds.identifiers.values, maxDistance: num(u.maxDistance), digitsMustMatch: !!u.digitsMustMatch, stripLeadingZeros: !!u.stripLeadingZeros,
    });
    const idCh = { key: '#id', name: ds.identifiers.name };
    const entry = push('uniqueness', 'identifiers', idCh, r.error ? r : { ...r, flags: [] }, {
      scoreChecked: ds.identifiers.values.map((_, i) => cell('#id', i)),
      scoreFailed: r.error ? [] : r.flags.map((f) => cell('#id', f.index)),
    });
    entry.result = r;
    if (!r.error) {
      r.flags.forEach((f) => flags.push({
        dimension: 'uniqueness', method: 'identifiers', channel: ds.identifiers.name,
        index: f.index, at: ds.identifiers.values[f.index], rule: f.rule, reason: f.reason,
      }));
    }
  }

  // ---------------------------------------------------------- plausibility
  const o = profile.outliers;
  chans.forEach((ch) => {
    const checked = presentCells(ch);
    const run = (method, fn) => {
      const r = fn();
      push('plausibility', method, ch, r, { scoreChecked: checked, scoreFailed: r.error ? [] : r.flags.map((f) => cell(ch.key, f.index)) });
    };
    if (o.z.enabled) run('z-score', () => zScores({ values: ch.values, threshold: num(o.z.threshold), sd: o.z.sd || undefined }));
    if (o.modz.enabled) run('modified-z', () => modifiedZScores({ values: ch.values, threshold: num(o.modz.threshold) }));
    if (o.tukey.enabled) run('tukey', () => iqrFences({ values: ch.values, k: num(o.tukey.k), method: o.tukey.method || undefined }));
    if (o.hampel.enabled) run('hampel', () => hampel({ values: ch.values, halfWindow: num(o.hampel.halfWindow), nSigma: num(o.hampel.nSigma) }));
    if (o.grubbs.enabled) run('grubbs', () => grubbsTest({ values: ch.values, alpha: num(o.grubbs.alpha), side: o.grubbs.side || undefined }));
  });

  let mahal = null;
  const m = profile.mahalanobis;
  if (m.enabled && (m.keys || []).length) {
    const mc = m.keys.map((k) => byKey[k]).filter(Boolean);
    const n = Math.max(0, ...mc.map((c) => c.values.length));
    const rows = Array.from({ length: n }, (_, i) => mc.map((c) => (c.values[i] === undefined ? null : c.values[i])));
    const r = mahalanobis({ rows, alpha: num(m.alpha) });
    mahal = { channels: mc.map((c) => c.name), result: r };
    push('plausibility', 'mahalanobis', { key: '#mahal', name: mc.map((c) => c.name).join(' + ') }, r);
  }

  // ---------------------------------------------------------- control charts
  let charts = null;
  const cc = profile.charts;
  const chartCh = cc.key ? byKey[cc.key] : null;
  if (chartCh) {
    const { start, values } = sliceWindow(chartCh.values, cc.from, cc.to);
    const target = num(cc.target);
    const sigma = num(cc.sigma);
    const shift = (r) => (r && !r.error ? { ...r, flags: r.flags.map((f) => ({ ...f, index: f.index + start })) } : r);
    const one = (method, r) => {
      const s = shift(r);
      push('time series', method, chartCh, s);
      return s;
    };
    charts = {
      channel: chartCh.name, unit: chartCh.unit, start, values,
      labels: values.map((_, j) => indexLabel(ds, start + j)),
      individuals: cc.individuals.enabled ? one('individuals', individualsChart({ values, centre: num(cc.individuals.centre), mrBar: num(cc.individuals.mrBar) })) : null,
      ewma: cc.ewma.enabled ? one('ewma', ewmaChart({ values, lambda: num(cc.ewma.lambda), target, sigma, L: num(cc.ewma.L), limits: cc.ewma.limits || undefined })) : null,
      cusum: cc.cusum.enabled ? one('cusum', cusumChart({ values, target, k: num(cc.cusum.k), h: num(cc.cusum.h), units: cc.cusum.units, sigma })) : null,
    };
  }

  // ---------------------------------------------------------- scorecard
  const dimensions = DIMENSIONS
    .map((d) => ({ name: d, checked: tally[d].checked.size, failed: [...tally[d].failed].filter((c) => tally[d].checked.has(c)).length }))
    .filter((d) => d.checked > 0);
  const w = profile.scorecard?.weights || {};
  const typed = dimensions.filter((d) => String(w[d.name] ?? '').trim() !== '');
  const weights = typed.length ? Object.fromEntries(typed.map((d) => [d.name, Number(w[d.name])])) : undefined;
  const score = dimensions.length ? scorecard({ dimensions, weights }) : null;

  return {
    dataset: { label: ds.label, source: ds.source, n: Math.max(0, ...ds.channels.map((c) => c.values.length)), channels: chans.map((c) => c.name) },
    results,
    flags,
    scorecard: score,
    scoreInputs: dimensions,
    mahalanobis: mahal,
    charts,
    presentByChannel: Object.fromEntries(chans.map((c) => [c.key, presentCount(c.values)])),
  };
}

/**
 * In-control target and sigma from a baseline stretch of the chart channel,
 * by the engine's individuals chart on that stretch: target = its centre
 * line, sigma = MRbar / d2 (NIST 6.3.2.2). Samples are 1-based and inclusive.
 */
export function baselineFrom(values, from, to) {
  const a = num(from);
  const b = num(to);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > values.length || b - a + 1 < 2) {
    return { error: `baseline must be two or more whole sample numbers from 1 to ${values.length}`, field: 'baseline' };
  }
  const r = individualsChart({ values: values.slice(a - 1, b) });
  if (r.error) return r;
  return { target: r.centre, sigma: r.sigma, mrBar: r.mrBar, n: b - a + 1 };
}
