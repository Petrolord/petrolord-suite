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

// Tester round 2 (2026-10-02, WTA-R2-006): the test overview plots
// temperature, so the import reads an optional temperature column.
describe('optional temperature column', () => {
  const { TEMPERATURE_UNITS, temperatureUnitFromHeader } = require('@/utils/welltest/gaugeImport');

  test('found from its header in any position, with its unit', () => {
    const csv = 'Index,Temperature (degC),Pws (kPa),Elapsed (hr)\n1,82,20000,0.1\n2,82.5,20100,0.2\n3,83,20150,0.3\n';
    const out = importGaugeCsv(csv);
    expect(out.mapping.temperatureCol).toBe(1);
    expect(out.mapping.temperatureUnit).toBe('degC');
    expect(out.mapping.unitsFromHeader.temperature).toBe(true);
    // rows carry T in degF beside oilfield time and pressure
    expect(out.rows[0].T).toBeCloseTo(82 * 1.8 + 32, 10);
    expect(out.rows[2].T).toBeCloseTo(83 * 1.8 + 32, 10);
    expect(out.temperatureCount).toBe(3);
    // and the pressure and time columns are still the ones their headers name
    expect(out.mapping.pressureCol).toBe(2);
    expect(out.mapping.timeCol).toBe(3);
  });

  test('degF passes through; the unit can be overridden after import', () => {
    const table = readGaugeTable('Time (hr),BHP (psia),BHT (degF)\n0.1,4000,180\n0.2,4010,181\n');
    const m = detectGaugeMapping(table);
    expect(m).toMatchObject({ temperatureCol: 2, temperatureUnit: 'degF' });
    expect(convertGaugeRows(table, m).rows.map((r) => r.T)).toEqual([180, 181]);
    expect(convertGaugeRows(table, { ...m, temperatureUnit: 'degC' }).rows[0].T).toBeCloseTo(356, 10);
    // un-mapping the column drops T and keeps the readings
    const none = convertGaugeRows(table, { ...m, temperatureCol: -1 });
    expect(none.rows).toEqual([{ t: 0.1, p: 4000 }, { t: 0.2, p: 4010 }]);
    expect(none.temperatureCount).toBe(0);
  });

  test('no temperature header, no temperature: nothing is guessed from position', () => {
    const three = importGaugeCsv('Time (hr),Pressure (psia),Rate (STB/D)\n0.1,4000,450\n0.2,4010,450\n');
    expect(three.mapping.temperatureCol).toBe(-1);
    expect(three.rows.every((r) => !('T' in r))).toBe(true);
    const headerless = importGaugeCsv('0.1,4000,180\n0.2,4010,181\n');
    expect(headerless.mapping.temperatureCol).toBe(-1);
    expect(headerless.rows.every((r) => !('T' in r))).toBe(true);
    expect(headerless.mapping.unitsFromHeader.temperature).toBe(false);
  });

  test('a header without a unit takes the default; a blank temperature keeps the pressure reading', () => {
    const csv = 'Time (hr),Pressure (psia),Temp\n0.1,4000,82\n0.2,4010,\n0.3,4020,83\n';
    const out = importGaugeCsv(csv, { defaultTemperature: 'degC' });
    expect(out.mapping).toMatchObject({ temperatureCol: 2, temperatureUnit: 'degC' });
    expect(out.mapping.unitsFromHeader.temperature).toBe(false);
    expect(out.rows).toHaveLength(3);
    expect(out.rows[1]).toEqual({ t: 0.2, p: 4010 });
    expect(out.temperatureCount).toBe(2);
    expect(out.skipped).toBe(0);
  });

  test('header unit words', () => {
    expect(temperatureUnitFromHeader('Temperature (degF)')).toBe('degF');
    expect(temperatureUnitFromHeader('BHT °C')).toBe('degC');
    expect(temperatureUnitFromHeader('Temp_C')).toBe('degC');
    expect(temperatureUnitFromHeader('Temp')).toBeNull();
    expect(Object.keys(TEMPERATURE_UNITS)).toEqual(['degF', 'degC']);
  });
});
