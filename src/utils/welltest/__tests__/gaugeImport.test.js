/**
 * Gauge CSV import (tester round 2026-09-28): header-driven column
 * detection in either order, unit detection, and conversion to oilfield
 * hours and absolute psi.
 */
import {
  readGaugeTable, detectGaugeMapping, convertGaugeRows, importGaugeCsv,
  pressureUnitFromHeader, timeUnitFromHeader, ATM_PSI, PRESSURE_UNITS,
} from '@/utils/welltest/gaugeImport';

const KPA_PER_PSI = 6.894757293168361;

describe('readGaugeTable', () => {
  test('recognises a header row', () => {
    const t = readGaugeTable('Time (hr),Pressure (psia)\n0.1,4000\n0.2,4010\n');
    expect(t.headers).toEqual(['Time (hr)', 'Pressure (psia)']);
    expect(t.rows).toHaveLength(2);
  });

  test('headerless files are all data', () => {
    const t = readGaugeTable('0.1,4000\n0.2,4010\n');
    expect(t.headers).toBeNull();
    expect(t.rows).toHaveLength(2);
  });
});

describe('detectGaugeMapping', () => {
  test('pressure column before the time column is read by its header', () => {
    const m = detectGaugeMapping(readGaugeTable('BHP (psig),Delta t (min)\n2880,0\n2900,5\n2920,10\n'));
    expect(m.pressureCol).toBe(0);
    expect(m.timeCol).toBe(1);
    expect(m.pressureUnit).toBe('psig');
    expect(m.timeUnit).toBe('min');
    expect(m.detectedFrom).toEqual({ time: true, pressure: true });
  });

  test('skips temperature and other columns wherever they sit', () => {
    const m = detectGaugeMapping(readGaugeTable('Index,Temperature (degF),Pws (kPa),Elapsed (hr)\n1,180,20000,0.1\n2,180,20100,0.2\n'));
    expect(m.pressureCol).toBe(2);
    expect(m.timeCol).toBe(3);
    expect(m.pressureUnit).toBe('kpaa');
    expect(m.timeUnit).toBe('hr');
  });

  test('headerless: first two numeric columns, time then pressure, default pressure unit', () => {
    const m = detectGaugeMapping(readGaugeTable('0.1,4000\n0.2,4010\n'), { defaultPressure: 'kpaa' });
    expect(m).toMatchObject({ timeCol: 0, pressureCol: 1, timeUnit: 'hr', pressureUnit: 'kpaa' });
    expect(m.detectedFrom).toEqual({ time: false, pressure: false });
  });

  test('date/time stamp columns are detected', () => {
    const m = detectGaugeMapping(readGaugeTable('Date Time,P (psia)\n2026-09-01 06:00:00,2880\n2026-09-01 06:30:00,2950\n'));
    expect(m.timeCol).toBe(0);
    expect(m.timeUnit).toBe('datetime');
    expect(m.pressureUnit).toBe('psia');
  });

  test('header unit words', () => {
    expect(pressureUnitFromHeader('Pressure (psig)')).toBe('psig');
    expect(pressureUnitFromHeader('P, bar(g)')).toBe('barg');
    expect(pressureUnitFromHeader('P MPa')).toBe('mpaa');
    expect(pressureUnitFromHeader('Pressure')).toBeNull();
    expect(timeUnitFromHeader('Time (s)')).toBe('sec');
    expect(timeUnitFromHeader('Elapsed days')).toBe('day');
    expect(timeUnitFromHeader('Time')).toBeNull();
  });
});

describe('convertGaugeRows', () => {
  const table = { rows: [['30', '100'], ['60', '200'], ['bad', '1'], ['90', '']] };

  test('time units convert to hours and bad rows are counted', () => {
    const { rows, skipped } = convertGaugeRows(table, { timeCol: 0, pressureCol: 1, timeUnit: 'min', pressureUnit: 'psia' });
    expect(rows).toEqual([{ t: 0.5, p: 100 }, { t: 1, p: 200 }]);
    expect(skipped).toBe(2);
  });

  test('gauge pressures become absolute psi (one standard atmosphere)', () => {
    const one = (unit) => convertGaugeRows({ rows: [['1', '100']] }, { timeCol: 0, pressureCol: 1, pressureUnit: unit }).rows[0].p;
    expect(one('psig')).toBeCloseTo(100 + ATM_PSI, 10);
    // 101.325 kPa is exactly one atmosphere
    expect(one('kpag') - one('kpaa')).toBeCloseTo(ATM_PSI, 10);
    expect(ATM_PSI * KPA_PER_PSI).toBeCloseTo(101.325, 9);
    expect(one('kpaa')).toBeCloseTo(100 / KPA_PER_PSI, 10);
    expect(one('bara')).toBeCloseTo(10000 / KPA_PER_PSI, 8);
    expect(one('mpag')).toBeCloseTo(100000 / KPA_PER_PSI + ATM_PSI, 6);
    expect(Object.keys(PRESSURE_UNITS)).toHaveLength(8);
  });

  test('date/time stamps count hours from the first reading', () => {
    const { rows } = convertGaugeRows(
      { rows: [['2026-09-01 06:00:00', '2880'], ['2026-09-01 07:30:00', '2950'], ['2026-09-02 06:00:00', '3000']] },
      { timeCol: 0, pressureCol: 1, timeUnit: 'datetime', pressureUnit: 'psia' },
    );
    expect(rows.map((r) => r.t)).toEqual([0, 1.5, 24]);
  });
});

test('importGaugeCsv end to end with a mapping override', () => {
  const text = 'Pressure (psia),Time (hr)\n4000,0.1\n4010,0.2\n';
  expect(importGaugeCsv(text).rows[0]).toEqual({ t: 0.1, p: 4000 });
  const swapped = importGaugeCsv(text, { mapping: { timeUnit: 'day' } });
  expect(swapped.rows[1].t).toBeCloseTo(4.8, 12);
});
