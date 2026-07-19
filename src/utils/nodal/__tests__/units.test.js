import { UNIT_KINDS, fromOilfield, toOilfield, unitLabel } from '../units';

describe('nodal units', () => {
  test('every kind round-trips to machine precision', () => {
    Object.keys(UNIT_KINDS).forEach((kind) => {
      const v = 1234.5678;
      const there = fromOilfield(kind, v, 'si');
      const back = toOilfield(kind, there, 'si');
      expect(back).toBeCloseTo(v, 9);
    });
  });

  test('oilfield system is identity', () => {
    expect(fromOilfield('pressure', 3000, 'oilfield')).toBe(3000);
  });

  test('anchor conversions', () => {
    expect(fromOilfield('pressure', 1000, 'si')).toBeCloseTo(6894.757293168361, 6);
    expect(fromOilfield('length', 1000, 'si')).toBeCloseTo(304.8, 9);
    expect(fromOilfield('temperature', 212, 'si')).toBeCloseTo(100, 12);
    expect(fromOilfield('gasLiquidRatio', 1000, 'si')).toBeCloseTo(178.1076, 3);
    expect(unitLabel('oilRate', 'oilfield')).toBe('STB/D');
    expect(unitLabel('diameter', 'si')).toBe('mm');
  });
});
