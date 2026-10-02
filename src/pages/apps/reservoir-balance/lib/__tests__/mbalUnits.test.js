/**
 * Material Balance display units (MBAL-U1, PL3). Each conversion the app
 * wires is held to a known value from the definition of the unit, because a
 * round trip cannot see a wrong factor (the Well Test SI wellbore storage
 * defect of 2026-10-02 passed every round trip while 47.5 times off).
 */
import {
  createMbalUnits, MBAL_OILFIELD_VIEW, MBAL_METRIC_VIEW, MBAL_UNIT_SPEC, OILFIELD_UNITS,
} from '../mbalUnits';
import { FAMILIES, unitInfo, convert } from '@/lib/units/registry';

const metric = createMbalUnits(MBAL_METRIC_VIEW);

describe('the oilfield view is the engine: nothing moves', () => {
  test.each(['pressure', 'dp', 'temperature', 'stockVolume', 'resVolume', 'gasVolume', 'fvfOil', 'fvfGas', 'expansionGas', 'gor', 'compressibility', 'depth', 'viscosity', 'permeability', 'area', 'aquiferIndex', 'oilRate', 'gasRate', 'resRate'])('%s', (q) => {
    expect(OILFIELD_UNITS.to(q, 123.456)).toBe(123.456);
    expect(OILFIELD_UNITS.from(q, 123.456)).toBe(123.456);
  });
  test('labels name the basis', () => {
    expect(OILFIELD_UNITS.label('pressure')).toBe('psia');
    expect(OILFIELD_UNITS.label('dp')).toBe('psi');
    expect(OILFIELD_UNITS.label('stockVolume')).toBe('STB');
    expect(OILFIELD_UNITS.label('resVolume')).toBe('RB');
    expect(OILFIELD_UNITS.label('fvfGas')).toBe('RB/Mscf');
    expect(OILFIELD_UNITS.label('expansionGas')).toBe('RB/scf');
    expect(OILFIELD_UNITS.displayUnits()).toBe('Oilfield (psia, degF, STB, RB, scf, ft)');
    expect(OILFIELD_UNITS.system).toBe('oilfield');
  });
});

describe('the metric view, against known values', () => {
  const known = [
    // quantity, engine value, display value, why
    ['pressure', 1000, 6894.757293168361, '1 psi = 6.894757 kPa'],
    ['dp', 100, 689.4757293168361, 'a difference converts by the same factor'],
    ['temperature', 212, 100, '212 degF = 100 degC'],
    ['temperature', 32, 0, '32 degF = 0 degC'],
    ['stockVolume', 1, 0.158987294928, '1 bbl = 0.158987 m3'],
    ['resVolume', 1e6, 158987.294928, '1 MMRB = 158,987 m3'],
    ['gasVolume', 1, 0.028316846592, '1 ft3 = 0.0283168 m3'],
    ['fvfOil', 1.25, 1.25, 'RB/STB and rm3/sm3 are the same ratio'],
    ['fvfGas', 1, 0.158987294928 / 28.316846592, '1 RB/Mscf = 0.00561458 rm3/sm3'],
    ['expansionGas', 0.001, 0.005614583333333334, '1 RB/scf = 5.614583 rm3/sm3'],
    ['gor', 1000, 178.10760667903525, '1 scf/STB = 0.1781076 sm3/sm3'],
    ['compressibility', 6e-6, 6e-6 / 6.894757293168361, '1/psi = 0.1450377 1/kPa'],
    ['depth', 1000, 304.8, '1 ft = 0.3048 m'],
    ['viscosity', 0.55, 0.55, '1 cP = 1 mPa.s'],
    ['permeability', 200, 200, 'mD in both systems'],
    ['area', 640, 2.589988110336, '640 acres = 1 square mile = 2.589988 km2'],
    ['aquiferIndex', 1, 0.158987294928 / 6.894757293168361, '1 RB/d/psi = 0.0230592 rm3/d/kPa'],
    ['oilRate', 1000, 158.987294928, '1,000 STB/d = 158.987 sm3/d'],
    ['gasRate', 1e6, 28316.846592, '1 MMscf/d = 28,316.8 sm3/d'],
    ['resVolumeMM', 633e6, 633 * 0.158987294928, '633 MMRB in millions of rm3'],
    ['stockVolumeMM', 312e6, 312 * 0.158987294928, '312 MMSTB in millions of sm3'],
    ['gasVolumeB', 100.8e9, 100.8 * 0.028316846592, '100.8 Bscf in billions of sm3'],
  ];
  test.each(known)('%s: %p is %p (%s)', (q, engine, display) => {
    expect(metric.to(q, engine)).toBeCloseTo(display, 9);
    expect(metric.from(q, display)).toBeCloseTo(engine, 6);
  });

  test('the conversions are the registry factors, with no factor of this app', () => {
    expect(metric.to('pressure', 1)).toBe(convert('pressure', 1, 'psi', 'kPa'));
    expect(metric.to('aquiferIndex', 1)).toBe(convert('productivityIndex', 1, 'RB/d/psi', 'm3/d/kPa'));
  });

  test('negative control: a wrong factor is caught by the known value, though it survives a round trip', () => {
    const wrong = { to: (v) => v * 6.894757 * 6.894757, from: (v) => v / (6.894757 * 6.894757) };
    expect(wrong.from(wrong.to(1000))).toBeCloseTo(1000, 9); // the round trip is blind
    expect(wrong.to(1000)).not.toBeCloseTo(6894.757, 0);
  });

  test('labels: sm3 against rm3, absolute pressure, and the header line', () => {
    expect(metric.label('pressure')).toBe('kPa abs');
    expect(metric.label('stockVolume')).toBe('sm3');
    expect(metric.label('resVolume')).toBe('rm3');
    expect(metric.label('gasVolume')).toBe('sm3');
    expect(metric.label('fvfOil')).toBe('rm3/sm3');
    expect(metric.label('gor')).toBe('sm3/sm3');
    expect(metric.label('aquiferIndex')).toBe('rm3/d/kPa');
    expect(metric.head('Initial pressure', 'pressure')).toBe('Initial pressure (kPa abs)');
    expect(metric.displayUnits()).toBe('SI / metric (kPa abs, degC, sm3, rm3, m)');
    expect(metric.system).toBe('metric');
    expect(createMbalUnits({ ...MBAL_OILFIELD_VIEW, pressure: 'bar' }).system).toBe('mixed');
    expect(createMbalUnits({ pressure: 'bar' }).label('pressure')).toBe('bara');
    expect(createMbalUnits({ pressure: 'bar', liquid: 'm3' }).unit('aquiferIndex')).toBe('m3/d/bar');
  });
});

describe('a volume column prints in the multiple that suits its size', () => {
  test('oilfield: STB, MSTB, MMSTB; RB, MRB, MMRB; scf to Bscf', () => {
    expect(OILFIELD_UNITS.scaled('stockVolume', 8000)).toMatchObject({ unit: 'MSTB', label: 'MSTB' });
    expect(OILFIELD_UNITS.scaled('stockVolume', 8000).to(8000)).toBe(8);
    expect(OILFIELD_UNITS.scaled('stockVolume', 500).unit).toBe('STB');
    expect(OILFIELD_UNITS.scaled('stockVolume', 291.3e6).to(291.3e6)).toBeCloseTo(291.3, 9);
    expect(OILFIELD_UNITS.scaled('resVolume', 88.065e6)).toMatchObject({ unit: 'MMRB' });
    expect(OILFIELD_UNITS.scaled('gasVolume', 54.75e9)).toMatchObject({ unit: 'Bscf' });
    expect(OILFIELD_UNITS.scaled('gasVolume', 54.75e9).to(54.75e9)).toBeCloseTo(54.75, 9);
    expect(OILFIELD_UNITS.scaled('gasVolume', 0).unit).toBe('scf');
  });
  test('metric: sm3 and rm3 in thousands and millions', () => {
    const s = metric.scaled('stockVolume', 307.221e6);
    expect(s).toMatchObject({ unit: '10^6 m3', label: '10^6 sm3' });
    expect(s.to(307.221e6)).toBeCloseTo(48.8443, 3);
    expect(metric.scaled('resVolume', 88.065e6).label).toBe('10^6 rm3');
    expect(metric.scaled('gasVolume', 100.99e9).label).toBe('10^9 sm3');
    expect(metric.scaled('gasVolume', 100.99e9).to(100.99e9)).toBeCloseTo(2.8597, 3);
  });
});

describe('the unit control', () => {
  test('every unit it offers is a registry unit of its family', () => {
    for (const [key, spec] of Object.entries(MBAL_UNIT_SPEC)) {
      expect(FAMILIES[spec.family]).toBeTruthy();
      for (const u of spec.allowed) expect(unitInfo(spec.family, u)).toBeTruthy();
      expect(spec.allowed).toContain(MBAL_OILFIELD_VIEW[key]);
      expect(spec.allowed).toContain(MBAL_METRIC_VIEW[key]);
    }
  });
  test('a missing or unknown choice falls back on the engine unit; a missing value is null', () => {
    expect(createMbalUnits({ pressure: 'furlongs' }).unit('pressure')).toBe('psi');
    expect(createMbalUnits().to('pressure', null)).toBeNull();
    expect(createMbalUnits().to('pressure', NaN)).toBeNull();
    expect(() => createMbalUnits().unit('nonsense')).toThrow(/unknown quantity/);
  });
  test('the reservoir-volume multiples the registry gained are the barrel times a thousand and a million', () => {
    expect(convert('liquidVolume', 1, 'MRB', 'RB')).toBe(1000);
    expect(convert('liquidVolume', 1, 'MMRB', 'RB')).toBe(1e6);
    expect(convert('liquidVolume', 1, '10^3 m3', 'm3')).toBe(1000);
    expect(convert('liquidVolume', 1, 'MMRB', 'm3')).toBeCloseTo(158987.294928, 6);
  });
});
