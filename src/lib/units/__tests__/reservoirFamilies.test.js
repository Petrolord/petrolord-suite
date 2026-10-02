// Gate for the unit families added for the Reservoir round (Step 0a).
// Each factor is checked against a derivation from first principles or a
// published factor (SPE Metric Standard, 1984 printing), never against the
// registry's own literal; each family round-trips; negative controls show
// the checks can fail. The generic every-pair round trip in
// registry.test.js covers these families too (it walks FAMILY_KEYS).
import { FAMILIES, convert, unitsOf, toDisplay, fromDisplay, DAYS_PER_YEAR, DAYS_PER_MONTH } from '../registry';
import { PRESETS } from '../presets';
import { resolveProfile } from '../profile';
import { appUnitFor, UNIT_ALIASES } from '../vocabulary';
import { effectiveFromNominal, nominalFromEffective } from '../decline';
import { UNIT_KINDS as WT } from '@/utils/welltest/units';

const INCH = 0.0254; const FOOT = 12 * INCH; const LB = 0.45359237; const G0 = 9.80665;
const PSI = (LB * G0) / INCH ** 2;          // Pa
const BBL = 42 * 231 * INCH ** 3;           // m3
const FT3 = FOOT ** 3;                      // m3
const DARCY = 0.9869233e-12;                // m2
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

const NEW_FAMILIES = ['declineRate', 'productivityIndex', 'pseudoPressure', 'gasProductivityIndex',
  'capillaryPressure', 'interfacialTension', 'wellboreStorage', 'flowCapacity', 'diameter'];

describe('the families exist, with a member in each system', () => {
  test.each(NEW_FAMILIES)('%s', (fam) => {
    expect(FAMILIES[fam]).toBeTruthy();
    expect(unitsOf(fam)).toContain(FAMILIES[fam].canonical);
    const systems = FAMILIES[fam].units.map((u) => u.system);
    const both = systems.includes('both');
    expect(both || systems.includes('oilfield')).toBe(true);
    expect(both || systems.includes('metric')).toBe(true);
    expect(unitsOf(fam)).toContain(PRESETS.oilfield[fam]);
    expect(unitsOf(fam)).toContain(PRESETS.metric[fam]);
    expect(resolveProfile({}).units[fam]).toBe(PRESETS.oilfield[fam]);
  });
});

describe('decline rate: the time basis', () => {
  test('a year is the Julian year and a month is one twelfth of it', () => {
    expect(DAYS_PER_YEAR).toBe(365.25);
    expect(DAYS_PER_YEAR * 86400).toBe(3.15576e7);   // SPE Metric Standard: yr = 3.155 76 E+07 s
    expect(DAYS_PER_MONTH).toBe(30.4375);
  });
  test('known values', () => {
    expect(rel(convert('declineRate', 0.001, '1/d', '1/yr'), 0.36525)).toBeLessThan(1e-15);
    expect(rel(convert('declineRate', 0.001, '1/d', '%/yr'), 36.525)).toBeLessThan(1e-15);
    expect(rel(convert('declineRate', 1, '1/month', '1/yr'), 12)).toBeLessThan(1e-15);
    expect(rel(convert('declineRate', 25, '%/yr', '1/yr'), 0.25)).toBeLessThan(1e-15);
    expect(rel(convert('declineRate', 25, '%/yr', '1/d'), 0.25 / 365.25)).toBeLessThan(1e-15);
    expect(rel(convert('declineRate', 0.03, '1/month', '1/d'), 0.03 / 30.4375)).toBeLessThan(1e-15);
  });
  test('round trip', () => {
    for (const a of unitsOf('declineRate')) for (const b of unitsOf('declineRate')) {
      expect(rel(convert('declineRate', convert('declineRate', 0.37, a, b), b, a), 0.37)).toBeLessThan(1e-15);
    }
  });
  test('negative control: a 365-day year is caught', () => {
    expect(rel(0.001 * 365, convert('declineRate', 0.001, '1/d', '1/yr'))).toBeGreaterThan(5e-4);
  });
  test('nominal and effective are a labelled step, never a unit', () => {
    // Arps: De = 1 - exp(-Dn). Dn = 0.25 /yr gives De = 22.1199 percent per year.
    expect(effectiveFromNominal(0.25)).toBeCloseTo(0.2211992169, 10);
    expect(nominalFromEffective(0.2211992169285951)).toBeCloseTo(0.25, 12);
    for (const d of [1e-6, 0.05, 0.25, 0.9, 3]) expect(rel(nominalFromEffective(effectiveFromNominal(d)), d)).toBeLessThan(1e-12);
    expect(Number.isNaN(nominalFromEffective(1))).toBe(true);
    expect(Number.isNaN(nominalFromEffective(-0.1))).toBe(true);
    expect(Number.isNaN(effectiveFromNominal(NaN))).toBe(true);
    // the two differ, so showing one under the other's label is wrong
    expect(Math.abs(effectiveFromNominal(0.25) - 0.25)).toBeGreaterThan(0.02);
    // and the registry does not offer the step as a unit
    expect(unitsOf('declineRate').some((u) => /nominal|effective/i.test(u))).toBe(false);
  });
});

describe('gas formation volume factor', () => {
  test('RB/scf, RB/Mscf, rcf/scf and m3/m3', () => {
    expect(rel(convert('fvfGas', 1, 'RB/scf', 'RB/Mscf'), 1000)).toBeLessThan(1e-15);
    // one barrel is 9702/1728 = 5.614583... cubic feet
    expect(rel(convert('fvfGas', 1, 'RB/scf', 'rcf/scf'), 9702 / 1728)).toBeLessThan(1e-14);
    expect(rel(convert('fvfGas', 1, 'RB/scf', 'm3/m3'), BBL / FT3)).toBeLessThan(1e-15);
    expect(rel(convert('fvfGas', 0.005, 'm3/m3', 'RB/Mscf'), 0.005 * 1000 * (1728 / 9702))).toBeLessThan(1e-14);
    expect(rel(convert('fvfGas', convert('fvfGas', 0.00084, 'RB/scf', 'm3/m3'), 'm3/m3', 'RB/scf'), 0.00084)).toBeLessThan(1e-15);
  });
  test('negative control: reading RB/Mscf as RB/scf is a factor of 1000', () => {
    expect(convert('fvfGas', 0.84, 'RB/Mscf', 'm3/m3') / convert('fvfGas', 0.84, 'RB/scf', 'm3/m3')).toBeCloseTo(1e-3, 15);
  });
});

describe('productivity and injectivity index', () => {
  test('known values', () => {
    expect(rel(convert('productivityIndex', 1, 'STB/d/psi', 'm3/d/kPa'), (BBL / PSI) * 1000)).toBeLessThan(1e-15);
    // SPE Metric Standard: B/(D.psi) = 2.305 916 E-02 m3/(d.kPa)
    expect(convert('productivityIndex', 1, 'STB/d/psi', 'm3/d/kPa')).toBeCloseTo(2.305916e-2, 8);
    expect(rel(convert('productivityIndex', 1, 'm3/d/kPa', 'm3/d/bar'), 100)).toBeLessThan(1e-15);
    expect(rel(convert('productivityIndex', 2, 'STB/d/psi', 'm3/d/bar'), 2 * (BBL / PSI) * 1e5)).toBeLessThan(1e-15);
    expect(convert('productivityIndex', 3.5, 'RB/d/psi', 'STB/d/psi')).toBe(3.5);
  });
  test('round trip', () => {
    for (const a of unitsOf('productivityIndex')) for (const b of unitsOf('productivityIndex')) {
      expect(rel(convert('productivityIndex', convert('productivityIndex', 4.2, a, b), b, a), 4.2)).toBeLessThan(1e-15);
    }
    expect(fromDisplay('productivityIndex', toDisplay('productivityIndex', 0.05, 'STB/d/psi'), 'STB/d/psi')).toBeCloseTo(0.05, 15);
  });
});

describe('gas pseudo-pressure and the gas productivity index', () => {
  test('pseudo-pressure is the psi to kPa factor squared, as Well Test has it', () => {
    expect(rel(convert('pseudoPressure', 1, 'psi2/cP', 'kPa2/mPa.s'), (PSI / 1000) ** 2)).toBeLessThan(1e-15);
    expect(rel(convert('pseudoPressure', 2.5e8, 'psi2/cP', 'kPa2/mPa.s'), WT.pseudoPressure.fromOil(2.5e8))).toBeLessThan(1e-14);
  });
  test('gas productivity index', () => {
    const want = (1000 * FT3 / 1000) / ((PSI / 1000) ** 2);   // 10^3 m3/d per kPa2/mPa.s, for 1 Mscf/d per psi2/cP
    expect(rel(convert('gasProductivityIndex', 1, 'Mscf/d/(psi2/cP)', '10^3 m3/d/(kPa2/mPa.s)'), want)).toBeLessThan(1e-14);
    const back = convert('gasProductivityIndex', convert('gasProductivityIndex', 7e-6, 'Mscf/d/(psi2/cP)', '10^3 m3/d/(kPa2/mPa.s)'), '10^3 m3/d/(kPa2/mPa.s)', 'Mscf/d/(psi2/cP)');
    expect(rel(back, 7e-6)).toBeLessThan(1e-15);
    // agrees with Well Test's own rate and pseudo-pressure twins
    expect(rel(want, WT.gasRate.fromOil(1) / WT.pseudoPressure.fromOil(1))).toBeLessThan(1e-13);
  });
});

describe('capillary pressure and interfacial tension', () => {
  test('capillary pressure', () => {
    expect(rel(convert('capillaryPressure', 1, 'psi', 'kPa'), PSI / 1000)).toBeLessThan(1e-15);
    expect(rel(convert('capillaryPressure', 1, 'bar', 'psi'), 1e5 / PSI)).toBeLessThan(1e-15);
    expect(convert('capillaryPressure', 1, 'bar', 'psi')).toBeCloseTo(14.5037738, 6);
    expect(rel(convert('capillaryPressure', convert('capillaryPressure', 12.5, 'psi', 'bar'), 'bar', 'psi'), 12.5)).toBeLessThan(1e-15);
    // the same factors as reservoir pressure
    expect(convert('capillaryPressure', 3, 'psi', 'kPa')).toBe(convert('pressure', 3, 'psi', 'kPa'));
  });
  test('interfacial tension: dyne/cm equals mN/m', () => {
    // 1 dyne = 1e-5 N and 1 cm = 1e-2 m
    expect(rel(FAMILIES.interfacialTension.units.find((u) => u.key === 'dyne/cm').factor, 1e-5 / 1e-2)).toBeLessThan(1e-15);
    expect(convert('interfacialTension', 30, 'dyne/cm', 'mN/m')).toBeCloseTo(30, 12);
    expect(rel(convert('interfacialTension', convert('interfacialTension', 72.8, 'mN/m', 'dyne/cm'), 'dyne/cm', 'mN/m'), 72.8)).toBeLessThan(1e-15);
  });
});

describe('wellbore storage, flow capacity and diameter', () => {
  test('wellbore storage', () => {
    expect(rel(convert('wellboreStorage', 1, 'bbl/psi', 'm3/kPa'), (BBL / PSI) * 1000)).toBeLessThan(1e-15);
    // SPE Metric Standard: bbl/psi = 2.305 916 E-02 m3/kPa
    expect(convert('wellboreStorage', 1, 'bbl/psi', 'm3/kPa')).toBeCloseTo(2.305916e-2, 8);
    // No cross-check against Well Test here: its `storage` twin multiplies by
    // kPa per psi where it should divide (1.096 against 0.02306, finding
    // recorded in docs/upgrade/Reservoir-Step0a-Foundations.md for the Well
    // Test round). The registry value is the derived one.
    expect(rel(convert('wellboreStorage', convert('wellboreStorage', 0.01, 'bbl/psi', 'm3/kPa'), 'm3/kPa', 'bbl/psi'), 0.01)).toBeLessThan(1e-15);
  });
  test('flow capacity', () => {
    expect(rel(convert('flowCapacity', 1, 'mD.ft', 'mD.m'), FOOT)).toBeLessThan(1e-15);
    // SPE Metric Standard: md.ft = 3.008 142 E-04 um2.m = 3.008 142 E-16 m3
    expect(rel(FAMILIES.flowCapacity.units.find((u) => u.key === 'mD.ft').factor, (DARCY / 1000) * FOOT)).toBeLessThan(1e-15);
    expect(FAMILIES.flowCapacity.units.find((u) => u.key === 'mD.ft').factor / 1e-16).toBeCloseTo(3.008142, 6);
    expect(rel(convert('flowCapacity', convert('flowCapacity', 1500, 'mD.ft', 'mD.m'), 'mD.m', 'mD.ft'), 1500)).toBeLessThan(1e-15);
  });
  test('diameter', () => {
    expect(rel(convert('diameter', 1, 'in', 'mm'), 25.4)).toBeLessThan(1e-15);
    expect(rel(convert('diameter', 32, '1/64 in', 'mm'), 12.7)).toBeLessThan(1e-15);
    expect(rel(convert('diameter', 48, '1/64 in', 'mm'), WT.choke.fromOil(48))).toBeLessThan(1e-15);
    expect(rel(convert('diameter', 64, '1/64 in', 'in'), 1)).toBeLessThan(1e-15);
  });
});

describe('units added to families that already existed', () => {
  test('liquid and gas multiples, the reservoir barrel, gas rate and GOR', () => {
    expect(rel(convert('liquidVolume', 1, 'MMSTB', 'm3'), 1e6 * BBL)).toBeLessThan(1e-15);
    expect(rel(convert('liquidVolume', 1, 'MMSTB', 'MSTB'), 1000)).toBeLessThan(1e-15);
    expect(convert('liquidVolume', 2, 'MMbbl', 'MMSTB')).toBe(2);
    expect(convert('liquidVolume', 7, 'RB', 'bbl')).toBe(7);
    expect(rel(convert('liquidVolume', 3, '10^6 m3', 'MMSTB'), 3 / BBL)).toBeLessThan(1e-15);
    expect(rel(convert('gasVolume', 1, '10^9 m3', 'Bscf'), 1 / FT3)).toBeLessThan(1e-15);
    expect(convert('liquidRate', 250, 'RB/d', 'bbl/d')).toBe(250);
    expect(rel(convert('gasRate', 1e6, 'scf/d', 'MMscf/d'), 1)).toBeLessThan(1e-15);
    expect(rel(convert('gor', 1.2, 'Mscf/STB', 'scf/STB'), 1200)).toBeLessThan(1e-15);
  });
  test('the presets of the families that existed are unchanged', () => {
    expect(PRESETS.oilfield).toMatchObject({ liquidVolume: 'bbl', gasVolume: 'MMscf', liquidRate: 'STB/d', gasRate: 'Mscf/d', fvfGas: 'RB/Mscf', gor: 'scf/STB' });
    expect(PRESETS.metric).toMatchObject({ liquidVolume: 'm3', gasVolume: '10^3 m3', liquidRate: 'm3/d', gasRate: '10^3 m3/d', fvfGas: 'm3/m3', gor: 'm3/m3' });
  });
});

describe('the spellings the Reservoir apps print resolve to registry units', () => {
  const cases = [
    ['fvfGas', 'RB/scf', ['rb/scf', 'rm3/sm3'], 'rb/scf'],
    ['fvfGas', 'm3/m3', ['rb/scf', 'rm3/sm3'], 'rm3/sm3'],
    ['productivityIndex', 'STB/d/psi', ['STB/D/psi', 'sm3/d/bar'], 'STB/D/psi'],
    ['productivityIndex', 'm3/d/bar', ['STB/D/psi', 'sm3/d/bar'], 'sm3/d/bar'],
    ['interfacialTension', 'dyne/cm', ['dyn/cm', 'mN/m'], 'dyn/cm'],
    ['gasVolume', 'Bscf', ['Bcf', '10^3 m3'], 'Bcf'],
    ['flowCapacity', 'mD.ft', ['md-ft', 'mD.m'], 'md-ft'],
    ['declineRate', '1/yr', ['/yr', '1/day'], '/yr'],
  ];
  test.each(cases)('%s %s', (fam, profileUnit, allowed, want) => {
    expect(appUnitFor(fam, profileUnit, allowed)).toEqual({ unit: want, exact: true });
  });
  test('every alias points at a unit its family offers', () => {
    for (const [fam, map] of Object.entries(UNIT_ALIASES)) {
      if (fam === 'rockVolume') continue;   // Earth Modeling's set names, mapped the same way
      for (const target of Object.values(map)) expect(unitsOf(fam)).toContain(target);
    }
  });
});
