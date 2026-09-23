/**
 * Data Quality Studio (D1): engine through the app, on Ekene data.
 *
 * The engine is gated against the stdlib oracle and the NIST worked examples
 * in packages/engines/__tests__/dataai.quality.test.js. These tests check the
 * other half: that what the studio shows IS the engine's answer on the data
 * a user brings. Every result the profile run returns is compared, whole,
 * with a direct call to the vendored engine on the same values and
 * parameters; planted defects must come back with the engine's rule and
 * reason; the scorecard must equal the engine's scorecard on hand-counted
 * dimension totals.
 *
 * Fixtures (Ekene synthetic field, ours; kit ekene-demo-v1 as released in
 * ekene-demo-kit-20260923-359d56694):
 *   fixtures/ekene-3-excerpt.las        01-wells/Ekene-3.las, header kept,
 *                                       samples 1500 to 1620 m MD (the Ekene
 *                                       Sand is 1541 to 1570 m). Source sha256
 *                                       33f6638e...0da07.
 *   fixtures/ekene-daily-production.csv 11-production-engineering/, as is.
 *                                       sha256 9be73719...f353.
 * The LAS goes through the Well Data Manager's own parser and import step,
 * so the curves are the float32 arrays the registry stores.
 */
import fs from 'fs';
import path from 'path';
import { parseLas } from '../../../../packages/engines/engines/welldata/lasParse';
import { prepareLogs } from '../../../../packages/engines/engines/welldata/lasImport';
import * as Q from '../../../../packages/engines/engines/dataai/quality.js';
import { parseDelimitedText } from '@/lib/tabularFile';
import {
  datasetFromWellLogs, datasetFromProduction, datasetFromTable, describeColumns, suggestLimit,
} from '@/utils/dataAi/qcDatasets';
import {
  runQcProfile, defaultProfile, baselineFrom, rangeArgs, num,
} from '@/utils/dataAi/qcProfile';

const FIX = path.join(__dirname, 'fixtures');
const lasText = fs.readFileSync(path.join(FIX, 'ekene-3-excerpt.las'), 'utf8');
const csvText = fs.readFileSync(path.join(FIX, 'ekene-daily-production.csv'), 'utf8');

/** The registry view of the excerpt: log rows plus float32 samples. */
function ekeneWell() {
  const prepared = prepareLogs(parseLas(lasText), { sourceFile: 'ekene-3-excerpt.las' });
  const logs = prepared.logs.map((l, i) => ({
    id: `log-${i}`, mnemonic: l.mnemonic, unit: l.unit, start_md_m: l.startMdM, step_m: l.stepM, n_samples: l.nSamples,
  }));
  const samples = Object.fromEntries(prepared.logs.map((l, i) => [`log-${i}`, l.data]));
  return { logs, samples };
}

const wellDataset = (mutate) => {
  const { logs, samples } = ekeneWell();
  const copy = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, Float32Array.from(v)]));
  if (mutate) mutate(copy, logs);
  return datasetFromWellLogs({
    well: { id: 'w3', name: 'Ekene-3' }, logs, samples: copy,
    wellNames: ['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4', 'Ekene-5', 'Ekene-6', 'EKENE 3', 'Ekene-03', 'Ekne-4'],
  });
};

const idOf = (logs, m) => logs.find((l) => l.mnemonic === m).id;

describe('the Ekene-3 excerpt reads the way the registry stores it', () => {
  const ds = wellDataset();

  it('takes the stored depth curve as the index and every other curve as a channel', () => {
    expect(ds.index.name).toBe('DEPT');
    expect(ds.index.kind).toBe('depth');
    expect(ds.index.values[0]).toBeCloseTo(1500.0, 0);
    expect(ds.channels.map((c) => c.name)).toEqual(['CALI', 'GR', 'SP', 'RHOB', 'NPHI', 'DT', 'RT', 'RXO', 'PEF']);
    // The importer converts sonic to the SI-internal unit; the app keeps that label.
    expect(ds.channels.find((c) => c.name === 'DT').unit).toBe('US/M');
    ds.channels.forEach((c) => expect(c.values).toHaveLength(ds.index.values.length));
  });

  it('suggests only definitional limits, and none for neutron porosity', () => {
    const lim = Object.fromEntries(ds.channels.map((c) => [c.name, suggestLimit(c)]));
    expect(lim.RHOB).toEqual({ mode: 'definitional', channel: 'bulkDensity', unit: 'g/cm3' });
    expect(lim.GR).toEqual({ mode: 'definitional', channel: 'gammaRay', unit: 'gAPI' });
    expect(lim.RT).toEqual({ mode: 'definitional', channel: 'resistivity', unit: 'ohm.m' });
    expect(lim.DT).toEqual({ mode: 'definitional', channel: 'sonic', unit: 'us/m' });
    expect(lim.CALI).toEqual({ mode: 'definitional', channel: 'caliper', unit: 'in' });
    expect(lim.NPHI).toEqual({ mode: 'none' });
    expect(lim.SP).toEqual({ mode: 'none' });
  });
});

// ------------------------------------------------------------------ planted
const GAP = [100, 101, 102, 103, 104];
const SPIKE_AT = 200;
const FROZEN = { from: 300, length: 9 };
const ZERO_RT_AT = 400;

const planted = () => wellDataset((s, logs) => {
  const gr = s[idOf(logs, 'GR')];
  GAP.forEach((i) => { gr[i] = NaN; });
  s[idOf(logs, 'RHOB')][SPIKE_AT] = 3.9;
  const rt = s[idOf(logs, 'RT')];
  for (let i = 0; i < FROZEN.length; i += 1) rt[FROZEN.from + i] = rt[FROZEN.from];
  rt[ZERO_RT_AT] = 0;
});

const profileFor = (ds) => {
  const p = defaultProfile();
  const key = (name) => ds.channels.find((c) => c.name === name).key;
  p.channels = ['GR', 'RHOB', 'RT'].map(key);
  ds.channels.forEach((c) => { p.limits[c.key] = suggestLimit(c); });
  p.outliers.grubbs.enabled = true;
  p.mahalanobis = { enabled: true, keys: [key('RHOB'), key('NPHI')], alpha: '0.025' };
  p.charts.key = key('RHOB');
  p.charts.from = '1';
  p.charts.to = '99';
  p.charts.target = '2.3';
  p.charts.sigma = '0.05';
  return p;
};

/** The direct engine call the app should have made for one result entry. */
function directCall(ds, p, entry) {
  const ch = ds.channels.find((c) => c.key === entry.channelKey);
  const v = ch ? ch.values : null;
  switch (entry.method) {
    case 'completeness': return Q.completeness({ values: v });
    case 'index': return Q.indexCheck({ index: ds.index.values, direction: 'increasing', expectedStep: undefined, stepTolerance: undefined });
    case 'range': return Q.rangeCheck({ values: v, ...rangeArgs(p.limits[ch.key]) });
    case 'frozen': return Q.frozenRuns({ values: v, minRun: 5, tolerance: 0 });
    case 'identifiers': return Q.duplicateIdentifiers({ ids: ds.identifiers.values, maxDistance: 1, digitsMustMatch: true, stripLeadingZeros: true });
    case 'z-score': return Q.zScores({ values: v, threshold: 3, sd: 'sample' });
    case 'modified-z': return Q.modifiedZScores({ values: v, threshold: 3.5 });
    case 'tukey': return Q.iqrFences({ values: v, k: 1.5, method: 'R7' });
    case 'hampel': return Q.hampel({ values: v, halfWindow: 5, nSigma: 3 });
    case 'grubbs': return Q.grubbsTest({ values: v, alpha: 0.05, side: 'two-sided' });
    case 'mahalanobis': {
      const cols = p.mahalanobis.keys.map((k) => ds.channels.find((c) => c.key === k).values);
      return Q.mahalanobis({ rows: cols[0].map((_, i) => cols.map((c) => c[i])), alpha: 0.025 });
    }
    default: return undefined;
  }
}

describe('a QC profile on the planted Ekene-3 excerpt', () => {
  const ds = planted();
  const p = profileFor(ds);
  const run = runQcProfile(ds, p);

  it('returns, for every check, exactly what the engine returns on the same values', () => {
    const compared = run.results.filter((e) => e.dimension !== 'time series');
    expect(compared.length).toBeGreaterThan(15);
    compared.forEach((e) => {
      const direct = directCall(ds, p, e);
      expect({ method: e.method, channel: e.channel, result: direct }).toEqual({ method: e.method, channel: e.channel, result: e.result });
    });
  });

  it('charts the chosen window with the engine, on the target and sigma typed', () => {
    const rhob = ds.channels.find((c) => c.name === 'RHOB').values.slice(0, 99);
    expect(run.charts.values).toEqual(rhob);
    expect(run.charts.individuals).toEqual(Q.individualsChart({ values: rhob, centre: undefined, mrBar: undefined }));
    expect(run.charts.ewma).toEqual(Q.ewmaChart({ values: rhob, lambda: 0.2, target: 2.3, sigma: 0.05, L: 3, limits: 'asymptotic' }));
    expect(run.charts.cusum).toEqual(Q.cusumChart({ values: rhob, target: 2.3, k: 0.5, h: 5, units: 'sigma', sigma: 0.05 }));
  });

  it('finds every planted defect, with the rule and the reason the engine gives', () => {
    const at = (method, channel, rule) => run.flags.filter((f) => f.method === method && f.channel === channel && f.rule === rule);
    const gap = at('completeness', 'GR', 'missing-run');
    expect(gap).toHaveLength(1);
    expect(gap[0].reason).toBe('samples 100 to 104 are missing (5 in a row)');
    expect(gap[0].at).toBe(String(Number(ds.index.values[100].toPrecision(8))));

    const spike = run.flags.filter((f) => f.channel === 'RHOB' && f.index === SPIKE_AT).map((f) => f.method);
    expect(spike).toEqual(expect.arrayContaining(['z-score', 'modified-z', 'tukey', 'hampel', 'grubbs']));

    const frozen = at('frozen', 'RT', 'frozen-run');
    expect(frozen.map((f) => f.index)).toContain(FROZEN.from);

    const zero = at('range', 'RT', 'below-minimum');
    expect(zero.map((f) => f.index)).toEqual([ZERO_RT_AT]);
    expect(zero[0].reason).toBe('value 0 is below the minimum 0 (the minimum itself is not allowed)');
  });

  it('finds the near and normalised duplicates among the well names, and leaves Ekene-1 and Ekene-2 alone', () => {
    const u = run.flags.filter((f) => f.dimension === 'uniqueness');
    // (i, j) order, each pair reported at its later member j.
    expect(u.map((f) => [f.at, f.rule])).toEqual([
      ['EKENE 3', 'duplicate-normalised'],
      ['Ekene-03', 'duplicate-normalised'],
      ['Ekne-4', 'duplicate-near'],
      ['Ekene-03', 'duplicate-normalised'],
    ]);
    expect(u.every((f) => !['Ekene-1', 'Ekene-2'].includes(f.at))).toBe(true);
  });

  it('scores the engine scorecard on dimension counts made from distinct cells', () => {
    const n = ds.index.values.length;
    const sel = ['GR', 'RHOB', 'RT'].map((m) => ds.channels.find((c) => c.name === m));
    const missing = sel.reduce((a, c) => a + c.values.filter((v) => v === null).length, 0);
    const present = sel.reduce((a, c) => a + c.values.filter((v) => v !== null).length, 0);
    const idx = Q.indexCheck({ index: ds.index.values });
    const idxFailed = new Set(idx.flags.map((f) => f.index)).size;
    const rangeFailed = sel.reduce((a, c) => a + Q.rangeCheck({ values: c.values, ...rangeArgs(suggestLimit(c)) }).failed, 0);
    const frozenFailed = sel.reduce((a, c) => a + Q.frozenRuns({ values: c.values }).runs.reduce((s, r) => s + r.length, 0), 0);
    const ids = ds.identifiers.values;
    const dup = new Set(Q.duplicateIdentifiers({ ids }).flags.map((f) => f.index)).size;
    const outlierCells = new Set();
    sel.forEach((c) => {
      [Q.zScores({ values: c.values }), Q.modifiedZScores({ values: c.values }), Q.iqrFences({ values: c.values }),
        Q.hampel({ values: c.values, halfWindow: 5, nSigma: 3 }), Q.grubbsTest({ values: c.values })]
        .forEach((r) => (r.flags || []).forEach((f) => outlierCells.add(`${c.name}:${f.index}`)));
    });
    const expected = Q.scorecard({
      dimensions: [
        { name: 'completeness', checked: 3 * n, failed: missing },
        { name: 'validity', checked: n + present, failed: idxFailed + rangeFailed },
        { name: 'consistency', checked: present, failed: frozenFailed },
        { name: 'uniqueness', checked: ids.length, failed: dup },
        { name: 'plausibility', checked: present, failed: outlierCells.size },
      ],
    });
    expect(missing).toBeGreaterThanOrEqual(GAP.length);
    expect(frozenFailed).toBeGreaterThanOrEqual(FROZEN.length);
    expect(run.scorecard).toEqual(expected);
    expect(run.scorecard.total).toBeLessThan(1);
  });
});

describe('the Ekene daily production ledger as an uploaded CSV', () => {
  const table = parseDelimitedText(csvText);
  const cols = describeColumns(table);
  const c = (name) => cols.find((x) => x.name === name).index;

  it('recognises the date, well and number columns the kit writes', () => {
    expect(cols.map((x) => [x.name, x.kind])).toEqual([
      ['date', 'date'], ['well', 'text'], ['oil_stb', 'number'], ['water_stb', 'number'],
      ['gas_mscf', 'number'], ['winj_stb', 'number'], ['hours_on', 'number'],
    ]);
  });

  const ds = datasetFromTable(table, {
    label: 'ekene-daily-production.csv',
    indexColumn: c('date'), idColumn: c('well'), filterValue: 'Ekene-1',
    channelColumns: ['oil_stb', 'water_stb', 'gas_mscf', 'hours_on'].map(c),
  });

  it('keeps one well, indexed by date, and checks the distinct well names', () => {
    expect(ds.index.kind).toBe('time');
    expect(ds.index.labels[0]).toBe('2020-01-01');
    expect(ds.channels[0].values[0]).toBe(120);
    const wells = [...new Set(table.rows.map((r) => r[c('well')]))];
    expect(ds.identifiers.values).toEqual(wells);
  });

  it('reads the same numbers through the production spine path', () => {
    const rows = table.rows.filter((r) => r[c('well')] === 'Ekene-1').map((r) => ({
      prod_date: r[c('date')], oil_stb: Number(r[c('oil_stb')]), water_stb: Number(r[c('water_stb')]),
      gas_mscf: Number(r[c('gas_mscf')]), winj_stb: Number(r[c('winj_stb')]), ginj_mscf: null, hours_on: Number(r[c('hours_on')]),
    }));
    const spine = datasetFromProduction({ field: { id: 'f', name: 'Ekene' }, well: { id: 'w', name: 'Ekene-1' }, rows });
    const byName = (d, n) => d.channels.find((x) => x.name === n).values;
    ['oil_stb', 'water_stb', 'gas_mscf', 'hours_on'].forEach((n) => expect(byName(spine, n)).toEqual(byName(ds, n)));
    expect(spine.index.values).toEqual(ds.index.values);
  });

  it('runs rate, water cut and the charts through the engine, the baseline included', () => {
    const p = defaultProfile();
    const key = (n) => ds.channels.find((x) => x.name === n).key;
    ds.channels.forEach((ch) => { p.limits[ch.key] = suggestLimit(ch); });
    p.validity.rate = { enabled: true, rateKeys: [key('oil_stb'), key('water_stb')], hoursOnKey: key('hours_on') };
    p.consistency.waterCut = { wcKey: '', oilKey: key('oil_stb'), waterKey: key('water_stb'), tolerance: '0.000001' };
    const oil = ds.channels.find((x) => x.name === 'oil_stb').values;
    const base = baselineFrom(oil, '1', '12');
    const ic = Q.individualsChart({ values: oil.slice(0, 12) });
    expect(base).toEqual({ target: ic.centre, sigma: ic.sigma, mrBar: ic.mrBar, n: 12 });
    p.charts = { ...p.charts, key: key('oil_stb'), target: String(base.target), sigma: String(base.sigma) };
    const run = runQcProfile(ds, p);
    const rate = run.results.filter((e) => e.method === 'rate');
    const hours = ds.channels.find((x) => x.name === 'hours_on').values;
    expect(rate.map((e) => e.result)).toEqual([
      Q.rateCheck({ rates: oil, hoursOn: hours }),
      Q.rateCheck({ rates: ds.channels.find((x) => x.name === 'water_stb').values, hoursOn: hours }),
    ]);
    const wc = run.results.find((e) => e.method === 'water-cut');
    expect(wc.result).toEqual(Q.waterCutCheck({ oil, water: ds.channels.find((x) => x.name === 'water_stb').values, tolerance: 1e-6 }));
    const target = num(String(base.target));
    const sigma = num(String(base.sigma));
    expect(run.charts.ewma).toEqual(Q.ewmaChart({ values: oil, lambda: 0.2, target, sigma, L: 3, limits: 'asymptotic' }));
    expect(run.charts.cusum).toEqual(Q.cusumChart({ values: oil, target, k: 0.5, h: 5, units: 'sigma', sigma }));
    // A declining well is not in control against its first year: the engine says so.
    expect(run.charts.cusum.firstSignalLow).not.toBeNull();
  });

  it('flags the monthly steps as irregular at the default tolerance, and not once a tolerance is typed', () => {
    const p = defaultProfile();
    const idx = runQcProfile(ds, p).results.find((e) => e.method === 'index').result;
    expect(idx).toEqual(Q.indexCheck({ index: ds.index.values }));
    expect(idx.irregularSteps).toBeGreaterThan(0);
    p.validity.index.stepTolerance = '3';
    const loose = runQcProfile(ds, p).results.find((e) => e.method === 'index').result;
    expect(loose.irregularSteps).toBe(0);
  });

  it('shows the engine refusal verbatim when a chart meets a gap', () => {
    const gappy = { ...ds, channels: ds.channels.map((ch, i) => (i === 0 ? { ...ch, values: ch.values.map((v, j) => (j === 5 ? null : v)) } : ch)) };
    const p = defaultProfile();
    p.charts = { ...p.charts, key: gappy.channels[0].key, target: '100', sigma: '5' };
    const run = runQcProfile(gappy, p);
    expect(run.charts.individuals).toEqual(Q.individualsChart({ values: gappy.channels[0].values }));
    expect(run.charts.individuals.error).toMatch(/^values\[5\] is missing: a control chart needs a complete series/);
    expect(run.flags.filter((f) => f.dimension === 'time series')).toEqual([]);
  });

  it('waits for a target and sigma instead of estimating them from the data it monitors', () => {
    const p = defaultProfile();
    p.charts = { ...p.charts, key: ds.channels[0].key };
    const run = runQcProfile(ds, p);
    expect(run.charts.ewma.error).toMatch(/^target is required/);
    expect(run.charts.cusum.error).toMatch(/^target is required/);
    expect(run.charts.individuals.error).toBeUndefined();
  });
});
