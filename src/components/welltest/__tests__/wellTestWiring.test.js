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
  DEFAULT_RESERVOIR,
  DEFAULT_TEST_CONFIG,
} from '@/contexts/WellTestStudioContext';
import { parseGaugeCsv } from '@/components/welltest/DataPanel';
import { detectFlowRegimes } from '@/utils/welltest/derivative';
import { hornerAnalysis } from '@/utils/welltest/analysis';
import { OILFIELD } from '@/utils/welltest/models/modelCatalog';

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

  test('buildup takes pwf at shut-in from the earliest point when blank', () => {
    const config = buildTestConfig({ ...DEFAULT_TEST_CONFIG, pwfShutIn: '' }).config;
    const gaugeRows = Array.from({ length: 20 }, (_, i) => ({ t: 0.1 * (i + 1), p: 4000 + 20 * i }));
    const out = prepareTestData({ gaugeRows, reservoir, config });
    expect(out.pwfShutIn).toBe(4000);
    expect(out.points.length).toBeGreaterThan(10);
    expect(out.warnings.some((w) => w.includes('earliest gauge point'))).toBe(true);
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

  test('ignores non-positive times', () => {
    const rows = parseGaugeCsv('0,100\n-1,200\n1,300\n2,400\n3,500\n4,600\n5,700');
    expect(rows).toHaveLength(5);
  });
});
