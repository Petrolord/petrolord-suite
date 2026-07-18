/**
 * WT8: unit-system registry round trips and the pseudo-time abscissa wiring.
 * State and engines are oilfield always; SI is a display-layer conversion.
 */
import {
  UNIT_KINDS, unitLabel, fromOilfield, toOilfield,
  displayInputString, storeInputString, kindForCatalogUnit,
} from '../units.js';
import {
  buildTestConfig, buildReservoirInputs, buildLoglog, DEFAULT_RESERVOIR,
} from '@/contexts/WellTestStudioContext';
import { normalizedPseudoTime } from '../gas.js';

describe('WT8 unit registry', () => {
  test('every kind round-trips oilfield -> si -> oilfield to machine precision', () => {
    for (const kind of Object.keys(UNIT_KINDS)) {
      for (const v of [0.001, 1, 42.5, 98765]) {
        const back = toOilfield(kind, fromOilfield(kind, v, 'si'), 'si');
        expect(Math.abs(back - v) / v).toBeLessThan(1e-11);
      }
    }
  });

  test('exact anchor conversions', () => {
    expect(fromOilfield('pressure', 100, 'si')).toBeCloseTo(689.4757, 3);
    expect(fromOilfield('length', 100, 'si')).toBeCloseTo(30.48, 10);
    expect(fromOilfield('oilRate', 1000, 'si')).toBeCloseTo(158.987, 2);
    expect(fromOilfield('gasRate', 1000, 'si')).toBeCloseTo(28.3168, 3); // 1 Mscf = 28.3168 m3
    expect(fromOilfield('temperature', 180, 'si')).toBeCloseTo(82.222, 3);
    expect(fromOilfield('viscosity', 0.9, 'si')).toBe(0.9); // cp = mPa s
    expect(fromOilfield('permeability', 85, 'si')).toBe(85); // md stays md
    // pseudo-pressure converts with the psi->kPa factor squared
    expect(fromOilfield('pseudoPressure', 1, 'si')).toBeCloseTo(6.894757 ** 2, 4);
  });

  test('oilfield system is the identity everywhere', () => {
    for (const kind of Object.keys(UNIT_KINDS)) {
      expect(fromOilfield(kind, 12.34, 'oilfield')).toBe(12.34);
      expect(unitLabel(kind, 'oilfield')).toBe(UNIT_KINDS[kind].oil);
    }
  });

  test('input strings stay stable through the SI display round trip', () => {
    // user types 30 (m) -> stored oilfield -> redisplayed as 30
    const stored = storeInputString('length', '30', 'si');
    expect(parseFloat(stored)).toBeCloseTo(98.4252, 3);
    expect(displayInputString('length', stored, 'si')).toBe('30');
    // non-numeric text passes through untouched
    expect(storeInputString('length', 'abc', 'si')).toBe('abc');
    expect(displayInputString('length', '', 'si')).toBe('');
  });

  test('catalog units map to the right kinds', () => {
    expect(kindForCatalogUnit('ft')).toBe('length');
    expect(kindForCatalogUnit('bbl/psi')).toBe('storage');
    expect(kindForCatalogUnit('md')).toBe('permeability');
    expect(kindForCatalogUnit('dimensionless')).toBe('dimensionless');
  });
});

describe('WT8 pseudo-time abscissa wiring', () => {
  test('buildTestConfig validates the abscissa choice', () => {
    expect(buildTestConfig({ testType: 'drawdown', abscissa: 'pseudo-time' }).config.abscissa).toBe('pseudo-time');
    expect(buildTestConfig({ testType: 'drawdown', abscissa: 'nonsense' }).config.abscissa).toBe('time');
    expect(buildTestConfig({ testType: 'drawdown' }).config.abscissa).toBe('time');
  });

  test('gas reservoir exposes the mu ct integrand for pseudo-time', () => {
    const { reservoir, error } = buildReservoirInputs({ ...DEFAULT_RESERVOIR, fluid: 'gas', ct: '' });
    expect(error).toBeNull();
    expect(typeof reservoir.muCtOf).toBe('function');
    // at initial pressure the integrand matches the initial product
    expect(reservoir.muCtOf(reservoir.pi)).toBeCloseTo(reservoir.muCtInitial, 10);
    // and the pseudo-time transform is then the identity at pi
    const map = normalizedPseudoTime(
      [{ t: 1, p: reservoir.pi }, { t: 2, p: reservoir.pi }, { t: 4, p: reservoir.pi }],
      { muCtOf: reservoir.muCtOf, muCtInitial: reservoir.muCtInitial },
    );
    for (const row of map) expect(row.ta).toBeCloseTo(row.t, 10);
    // gas cg ~ 1/p dominates mu(p): mu*ct RISES as pressure falls, so
    // pseudo-time runs slower than elapsed time during a deep drawdown
    expect(reservoir.muCtOf(reservoir.pi / 2)).toBeGreaterThan(reservoir.muCtInitial);
  });

  test('buildLoglog applies the taOf map to the abscissa', () => {
    const points = Array.from({ length: 12 }, (_, i) => ({ time: i + 1, dp: 10 + i, p: 4000 - i }));
    const config = { family: 'drawdown', tp: NaN, smoothingL: 0.1 };
    const plain = buildLoglog({ points, config });
    const stretched = buildLoglog({ points, config, taOf: (t) => 2 * t });
    expect(stretched.length).toBe(plain.length);
    for (let i = 0; i < plain.length; i += 1) {
      expect(stretched[i].x).toBeCloseTo(2 * plain[i].x, 12);
      expect(stretched[i].dp).toBeCloseTo(plain[i].dp, 12); // ordinate untouched
    }
  });
});
