/**
 * Wiring tests for the pure glue between the studio UI and the WT1 engines:
 * input builders, data preparation, the log-log pipeline and the sample
 * generator. The physics itself is covered in src/utils/welltest/__tests__.
 */
import {
  buildReservoirInputs,
  buildTestConfig,
  prepareTestData,
  buildLoglog,
  generateSampleBuildup,
  resolveMatchMethod,
  DEFAULT_RESERVOIR,
  DEFAULT_TEST_CONFIG,
} from '@/contexts/WellTestStudioContext';
import { parseGaugeCsv } from '@/components/welltest/DataPanel';
import { detectFlowRegimes } from '@/utils/welltest/derivative';
import { hornerAnalysis } from '@/utils/welltest/analysis';
import { OILFIELD, getModel } from '@/utils/welltest/models/modelCatalog';
import { buildReportHeader } from '@/utils/wellTestReportExport';

describe('buildReservoirInputs', () => {
  test('accepts the defaults', () => {
    const { reservoir, error } = buildReservoirInputs(DEFAULT_RESERVOIR);
    expect(error).toBeNull();
    expect(reservoir.h).toBe(45);
    expect(reservoir.ct).toBeCloseTo(1.2e-5, 10);
  });

  test('rejects non-positive properties and out-of-range porosity', () => {
    expect(buildReservoirInputs({ ...DEFAULT_RESERVOIR, h: '0' }).reservoir).toBeNull();
    expect(buildReservoirInputs({ ...DEFAULT_RESERVOIR, phi: '1.2' }).reservoir).toBeNull();
    expect(buildReservoirInputs({ ...DEFAULT_RESERVOIR, pi: '' }).reservoir).toBeNull();
  });
});

describe('buildTestConfig', () => {
  test('buildup requires positive tp', () => {
    expect(buildTestConfig({ ...DEFAULT_TEST_CONFIG, tp: '' }).config).toBeNull();
    expect(buildTestConfig({ ...DEFAULT_TEST_CONFIG, tp: '36' }).config.tp).toBe(36);
  });

  test('drawdown does not require tp and clamps smoothing', () => {
    const { config } = buildTestConfig({ ...DEFAULT_TEST_CONFIG, testType: 'drawdown', tp: '', smoothingL: '0.9' });
    expect(config.testType).toBe('drawdown');
    expect(config.smoothingL).toBe(0.5);
  });
});

describe('prepareTestData', () => {
  const reservoir = buildReservoirInputs(DEFAULT_RESERVOIR).reservoir;

  describe('shut-in time on the gauge clock (tester round 2026-09-28)', () => {
    // 6 hr of flowing readings at 2880-ish psi, shut in at gauge time 6 hr
    const flowing = Array.from({ length: 12 }, (_, i) => ({ t: 0.5 * i, p: 2900 - 1.5 * i }));
    const buildup = Array.from({ length: 30 }, (_, i) => ({ t: 6 + 0.05 * 1.25 ** i, p: 2880 + 40 * Math.log10(1 + 20 * 1.25 ** i) }));

    test('elapsed time counts from the shut-in and the flowing period is set aside', () => {
      const config = buildTestConfig({ ...DEFAULT_TEST_CONFIG, testStartTime: '6', pwfShutIn: '' }).config;
      const out = prepareTestData({ gaugeRows: [...flowing, ...buildup], reservoir, config });
      expect(config.testStartTime).toBe(6);
      expect(out.testStartTime).toBe(6);
      expect(out.preTestPoints).toBe(12);
      expect(out.points[0].time).toBeCloseTo(0.05, 9);
      expect(out.points.every((p) => p.time > 0)).toBe(true);
      expect(out.info[0]).toMatch(/12 readings before the shut-in \(gauge time 6 hr\)/);
    });

    test('pwf at dt = 0 is the last flowing reading when there is no reading at the shut-in instant', () => {
      const config = buildTestConfig({ ...DEFAULT_TEST_CONFIG, testStartTime: '5.6', pwfShutIn: '' }).config;
      const out = prepareTestData({ gaugeRows: [...flowing, ...buildup], reservoir, config });
      // last flowing reading is at t = 5.5, 0.1 hr before the shut-in
      expect(out.pwfShutIn).toBeCloseTo(2900 - 1.5 * 11, 9);
      expect(out.pwfSource.kind).toBe('gauge-before');
      expect(out.skinWithheld).toBeNull();
    });

    test('a reading at the shut-in instant wins, an entered pwf wins over both', () => {
      const cfgAuto = buildTestConfig({ ...DEFAULT_TEST_CONFIG, testStartTime: '5.5', pwfShutIn: '' }).config;
      const auto = prepareTestData({ gaugeRows: [...flowing, ...buildup], reservoir, config: cfgAuto });
      expect(auto.pwfSource).toEqual({ kind: 'gauge', dt: 0 });
      expect(auto.pwfShutIn).toBeCloseTo(2883.5, 9);
      const cfgEntered = buildTestConfig({ ...DEFAULT_TEST_CONFIG, testStartTime: '6', pwfShutIn: '2880' }).config;
      const entered = prepareTestData({ gaugeRows: [...flowing, ...buildup], reservoir, config: cfgEntered });
      expect(entered.pwfShutIn).toBe(2880);
      expect(entered.pwfSource.kind).toBe('entered');
    });

    test('blank start time keeps the historical behaviour', () => {
      const config = buildTestConfig({ ...DEFAULT_TEST_CONFIG, pwfShutIn: '' }).config;
      expect(config.testStartTime).toBe(0);
      const rows = buildup.map((r) => ({ t: r.t - 6, p: r.p }));
      const out = prepareTestData({ gaugeRows: rows, reservoir, config });
      expect(out.preTestPoints).toBe(0);
      expect(out.info).toEqual([]);
      expect(out.pwfSource.kind).toBe('first-buildup');
    });
  });

  test('buildup anchors on the earliest point when blank and withholds skin', () => {
    const config = buildTestConfig({ ...DEFAULT_TEST_CONFIG, pwfShutIn: '' }).config;
    const gaugeRows = Array.from({ length: 20 }, (_, i) => ({ t: 0.1 * (i + 1), p: 4000 + 20 * i }));
    const out = prepareTestData({ gaugeRows, reservoir, config });
    expect(out.pwfShutIn).toBe(4000);
    expect(out.points.length).toBeGreaterThan(10);
    // the log-log baseline still anchors on the earliest point, but skin,
    // which needs the pressure at the instant of shut-in, is withheld
    expect(out.skinWithheld).toMatch(/Skin is withheld: enter the flowing pressure at shut-in/);
    expect(out.warnings).toContain(out.skinWithheld);
    // dp is pressure rise above pwf at shut-in
    expect(out.points[out.points.length - 1].dp).toBeCloseTo(4380 - 4000, 6);
  });

  test('drawdown drops points above initial pressure', () => {
    const config = buildTestConfig({ ...DEFAULT_TEST_CONFIG, testType: 'drawdown' }).config;
    const gaugeRows = [
      { t: 1, p: 4900 }, { t: 2, p: 4700 }, { t: 3, p: 4850 }, { t: 4, p: 4600 },
      { t: 5, p: 5000 }, { t: 6, p: 4500 },
    ];
    const out = prepareTestData({ gaugeRows, reservoir, config: { ...config, spikeTrimOn: false } });
    expect(out.points.every((p) => p.dp > 0)).toBe(true);
    // pi = 4800: the 4900, 4850 and 5000 psi points are at or above it
    expect(out.points.length).toBe(3);
  });

  test('needs at least 5 points', () => {
    const config = buildTestConfig(DEFAULT_TEST_CONFIG).config;
    const out = prepareTestData({ gaugeRows: [{ t: 1, p: 100 }], reservoir, config });
    expect(out.points).toEqual([]);
  });
});

describe('sample buildup through the full pipeline', () => {
  const sample = generateSampleBuildup();
  const reservoir = buildReservoirInputs(DEFAULT_RESERVOIR).reservoir;
  const config = buildTestConfig({
    ...DEFAULT_TEST_CONFIG,
    tp: String(sample.tp),
    pwfShutIn: sample.pwfShutIn.toFixed(1),
  }).config;
  const prepared = prepareTestData({ gaugeRows: sample.gaugeRows, reservoir, config });
  const loglog = buildLoglog({ points: prepared.points, config });

  test('produces a usable diagnostic series', () => {
    expect(loglog.length).toBeGreaterThan(30);
    expect(loglog.every((p) => p.x > 0 && p.dp > 0)).toBe(true);
  });

  test('detects wellbore storage and radial flow, plateau sets kh near truth', () => {
    const regimes = detectFlowRegimes(loglog);
    const kinds = regimes.map((r) => r.regime);
    expect(kinds).toContain('radial');
    const radial = regimes.find((r) => r.regime === 'radial');
    const inWindow = loglog.filter((p) => p.x >= radial.xStart && p.x <= radial.xEnd);
    const median = inWindow.map((p) => p.derivative).sort((a, b) => a - b)[Math.floor(inWindow.length / 2)];
    const khFromPlateau = (OILFIELD.DERIVATIVE_PLATEAU * reservoir.q * reservoir.B * reservoir.mu) / median;
    expect(Math.abs(khFromPlateau / reservoir.h - sample.truth.k) / sample.truth.k).toBeLessThan(0.1);
  });

  test('Horner analysis on the late-time window recovers the generating k', () => {
    const radialPts = prepared.points.filter((p) => p.time > 8 && p.time < sample.tp);
    const result = hornerAnalysis({
      points: radialPts.map((p) => ({ dt: p.time, pws: p.p })),
      tp: sample.tp,
      pwfShutIn: prepared.pwfShutIn,
      ...reservoir,
    });
    expect(Math.abs(result.k - sample.truth.k) / sample.truth.k).toBeLessThan(0.05);
    expect(Math.abs(result.skin - sample.truth.skin)).toBeLessThan(0.8);
  });
});

describe('parseGaugeCsv', () => {
  test('reads two numeric columns, skipping headers and junk', () => {
    const rows = parseGaugeCsv('time_hr,pressure_psi\n0.5,4531.2\n1.0,4600\nbad,row\n2.0,4650.5\n3,4680\n4,4700\n');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ t: 0.5, p: 4531.2 });
  });

  test('keeps the shut-in reading and earlier flowing readings for prepareTestData', () => {
    // t = 0 is the pressure at shut-in and negative times are the flowing
    // period before it (tester round 2026-09-28); prepareTestData splits them
    const rows = parseGaugeCsv('0,100\n-1,200\n1,300\n2,400\n3,500\n4,600\n5,700');
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ t: 0, p: 100 });
  });

  test('reads pressure-first files by their headers and converts psig and minutes', () => {
    const rows = parseGaugeCsv('Pressure (psig),Elapsed time (min)\n2865.3,0\n2900,30\n2950,60\n2980,90\n3000,120\n');
    expect(rows).toHaveLength(5);
    expect(rows[2].t).toBeCloseTo(1, 12);
    expect(rows[0].p).toBeCloseTo(2865.3 + 14.695948775513449, 9);
  });
});

describe('resolveMatchMethod (tester round 2026-09-28)', () => {
  const model = getModel('homogeneous');
  const appliedInputs = { k: '84.97', skin: '6.49', C: '0.01500' };
  const fitResult = { converged: true, modelId: 'homogeneous', appliedInputs };
  const inputs = { modelId: 'homogeneous', ...appliedInputs };

  test('no auto-fit run means a manual match, never "converged"', () => {
    expect(resolveMatchMethod({ source: 'match', fitResult: null, fitStale: false, model, matchInputs: inputs }).kind).toBe('manual');
    expect(resolveMatchMethod({ source: 'semilog', fitResult: null, fitStale: false, model, matchInputs: inputs }).kind).toBe('none');
  });

  test('regression only while the match holds the fitted values', () => {
    expect(resolveMatchMethod({ source: 'match', fitResult, fitStale: false, model, matchInputs: inputs }).kind).toBe('regression');
    const moved = resolveMatchMethod({ source: 'match', fitResult, fitStale: false, model, matchInputs: { ...inputs, skin: '5' } });
    expect(moved).toEqual({ kind: 'manual', note: 'Adjusted by hand after an auto-fit.' });
    const stale = resolveMatchMethod({ source: 'match', fitResult, fitStale: true, model, matchInputs: inputs });
    expect(stale.kind).toBe('manual');
    expect(stale.note).toMatch(/earlier inputs/);
    const otherModel = resolveMatchMethod({ source: 'match', fitResult, fitStale: false, model: getModel('homogeneous-sealing-fault'), matchInputs: inputs });
    expect(otherModel.kind).toBe('manual');
  });
});

describe('buildReportHeader (tester round 2026-09-28)', () => {
  const at = new Date('2026-09-28T10:00:00Z');
  test('carries field and analyst beside the well, and pwf with its shut-in time', () => {
    const config = buildTestConfig({ ...DEFAULT_TEST_CONFIG, testStartTime: '6', tp: '36' }).config;
    const rows = buildReportHeader({
      projectName: 'P1', wellName: 'W-7', fieldName: 'Obodo', analyst: 'A. Analyst', config, isGas: false,
      prepared: { pwfShutIn: 2880, pwfSource: { kind: 'entered' }, testStartTime: 6 }, generatedAt: at,
    });
    const cells = Object.fromEntries(rows.flatMap((r) => [[r[0], r[1]], [r[2], r[3]]]));
    expect(cells.Well).toBe('W-7');
    expect(cells.Field).toBe('Obodo');
    expect(cells.Analyst).toBe('A. Analyst');
    expect(cells['Shut-in time']).toBe('0 hr elapsed (gauge clock 6 hr)');
    expect(cells['pwf at shut-in']).toBe('2880.0 psi at shut-in time 0 hr (entered)');
    expect(cells.Generated).toBe('2026-09-28 10:00 UTC');
    // jsPDF standard fonts are Latin-1: no Greek delta in the PDF text
    expect(rows.flat().join(' ')).not.toMatch(/[^\x00-\xff]/);
  });

  test('blank field and analyst print as dashes, SI pressure converts', () => {
    const config = buildTestConfig({ ...DEFAULT_TEST_CONFIG }).config;
    const rows = buildReportHeader({
      wellName: 'W-7', config, isGas: false, unitSystem: 'si',
      prepared: { pwfShutIn: 1000, pwfSource: { kind: 'gauge' }, testStartTime: 0 }, generatedAt: at,
    });
    const cells = Object.fromEntries(rows.flatMap((r) => [[r[0], r[1]], [r[2], r[3]]]));
    expect(cells.Field).toBe('-');
    expect(cells.Analyst).toBe('-');
    expect(cells['pwf at shut-in']).toBe('6894.8 kPa at shut-in time 0 hr (gauge reading at the shut-in)');
  });
});
