// Gate for the Suite unit registry: every factor against an authoritative
// derivation (not a restatement of the same literal), round trips to
// machine precision through every unit pair, agreement with the
// converters apps already ship, and negative controls that show each
// check can fail.
import {
  FAMILIES, FAMILY_KEYS, convert, toBase, fromBase, toDisplay, fromDisplay, unitsOf, isKnownUnit,
  M_PER_FT, M_PER_FTUS, PA_PER_PSI, M3_PER_BBL, M3_PER_FT3, M2_PER_ACRE, M3_PER_ACRE_FT, KG_PER_LB, M2_PER_DARCY,
} from '../registry';
import { M_PER_FT as DEPTHMODES_M_PER_FT, toDisplay as dmToDisplay } from '@/components/wells/depthModes';
import { UNIT_KINDS as WT } from '@/utils/welltest/units';
import { M3_PER_ACRE_FT as EM_ACRE_FT, M3_PER_BBL as EM_BBL } from '@/pages/apps/EarthModeling/services/units';
import { PA_PER_PSI as PP_PA_PER_PSI, M_PER_FT as PP_M_PER_FT } from '@/pages/apps/PorePressureStudio/engine/constants';
import { M_PER_FT as WS_M_PER_FT } from '@/lib/wellsite/depth';

// Independent first principles (SI brochure, NIST SP 811, 1959 agreement)
const INCH = 0.0254;                 // m, exact
const FOOT = 12 * INCH;              // m, exact
const LB = 0.45359237;               // kg, exact
const G0 = 9.80665;                  // m/s2, exact (standard gravity)
const US_GAL = 231 * INCH ** 3;      // m3, exact
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const EPS = 4 * Number.EPSILON;

describe('factors against authoritative derivations', () => {
  const cases = [
    ['international foot', M_PER_FT, FOOT],
    ['US survey foot', M_PER_FTUS, 1200 / 3937],
    ['psi (lbf/in2)', PA_PER_PSI, (LB * G0) / INCH ** 2],
    ['oil barrel (42 US gal)', M3_PER_BBL, 42 * US_GAL],
    ['cubic foot', M3_PER_FT3, FOOT ** 3],
    ['acre (43560 ft2)', M2_PER_ACRE, 43560 * FOOT ** 2],
    ['acre-foot', M3_PER_ACRE_FT, 43560 * FOOT ** 3],
    ['pound', KG_PER_LB, 0.45359237],
    ['darcy (0.9869233 um2)', M2_PER_DARCY, 0.9869233e-12],
  ];
  test.each(cases)('%s', (_n, got, want) => { expect(rel(got, want)).toBeLessThan(1e-15); });

  test('derived family factors', () => {
    expect(rel(convert('pressure', 1, 'psi', 'kPa'), 6.894757293168361)).toBeLessThan(1e-15);
    expect(rel(convert('pressure', 1, 'bar', 'kPa'), 100)).toBeLessThan(1e-15);
    expect(rel(convert('gasVolume', 1, 'Mscf', 'm3'), 1000 * FOOT ** 3)).toBeLessThan(1e-15);
    expect(rel(convert('gasVolume', 1, 'Bscf', '10^3 m3'), 1e6 * FOOT ** 3)).toBeLessThan(1e-14);
    // 1 bbl = 5.614583333... ft3, so 1 RB/Mscf = 5.6145833e-3 rcf/scf
    expect(rel(convert('fvfGas', 1, 'RB/Mscf', 'rcf/scf'), (42 * 231) / 1728 / 1000)).toBeLessThan(1e-14);
    expect(rel(convert('gor', 1, 'scf/STB', 'm3/m3'), FOOT ** 3 / (42 * US_GAL))).toBeLessThan(1e-15);
    expect(rel(convert('gor', 1000, 'scf/STB', 'm3/m3'), 178.1076066790352)).toBeLessThan(1e-12);
    expect(rel(convert('density', 1, 'lb/ft3', 'kg/m3'), LB / FOOT ** 3)).toBeLessThan(1e-15);
    expect(rel(convert('density', 1, 'g/cc', 'kg/m3'), 1000)).toBeLessThan(1e-15);
    expect(rel(convert('sonic', 100, 'us/ft', 'us/m'), 100 / FOOT)).toBeLessThan(1e-15);
    expect(rel(convert('velocity', 10000, 'ft/s', 'm/s'), 3048)).toBeLessThan(1e-15);
    expect(rel(convert('permeability', 1000, 'mD', 'D'), 1)).toBeLessThan(1e-15);
    expect(rel(convert('viscosity', 1, 'cP', 'mPa.s'), 1)).toBeLessThan(1e-15);
    expect(rel(convert('compressibility', 1e-6, '1/psi', '1/kPa'), 1e-6 / 6.894757293168361)).toBeLessThan(1e-15);
    expect(rel(convert('compressibility', 1, '1/bar', '1/kPa'), 0.01)).toBeLessThan(1e-15);
    expect(rel(convert('area', 1, 'km2', 'acre'), 1e6 / (43560 * FOOT ** 2))).toBeLessThan(1e-15);
    expect(rel(convert('area', 1, 'ha', 'm2'), 1e4)).toBeLessThan(1e-15);
    expect(rel(convert('liquidRate', 1000, 'STB/d', 'm3/d'), 158.987294928)).toBeLessThan(1e-15);
    expect(rel(convert('gasRate', 1, 'MMscf/d', '10^3 m3/d'), 28.316846592)).toBeLessThan(1e-15);
    expect(rel(convert('timeSeismic', 2500, 'ms', 's'), 2.5)).toBeLessThan(1e-15);
  });

  test('temperature fixed points', () => {
    expect(convert('temperature', 212, 'degF', 'degC')).toBeCloseTo(100, 12);
    expect(convert('temperature', 32, 'degF', 'degC')).toBeCloseTo(0, 12);
    expect(convert('temperature', -40, 'degF', 'degC')).toBeCloseTo(-40, 12);
    expect(convert('temperature', 0, 'degC', 'K')).toBe(273.15);
    expect(convert('temperature', 491.67 - 459.67, 'degF', 'K')).toBeCloseTo(273.15, 12);
  });
});

describe('round trips to machine precision', () => {
  const values = [1e-9, 0.37, 1, 42, 3048.5, 7.25e6, -1234.5];
  for (const fam of FAMILY_KEYS) {
    const keys = unitsOf(fam);
    test(`${fam}: every unit pair`, () => {
      for (const a of keys) for (const b of keys) for (const v of values) {
        if (fam === 'temperature' && v === 1e-9) continue;
        const back = convert(fam, convert(fam, v, a, b), b, a);
        // affine temperature: absolute tolerance scaled to the offsets
        const tol = fam === 'temperature' ? 1e-12 * Math.max(1, Math.abs(v), 460) : EPS * Math.abs(v);
        expect(Math.abs(back - v)).toBeLessThanOrEqual(tol);
      }
    });
  }
  test('same unit is bit for bit and canonical display is identity', () => {
    expect(convert('depth', 0.1 + 0.2, 'ft', 'ft')).toBe(0.1 + 0.2);
    expect(toDisplay('depth', 1234.567, 'm')).toBe(1234.567);
    expect(fromDisplay('pressure', 101.325, 'kPa')).toBe(101.325);
  });
  test('m to ft matches depthModes exactly (no ulp drift between displays)', () => {
    for (const m of [0.1, 1, 1234.567, 3048.0001, 9999.99]) {
      expect(convert('depth', m, 'm', 'ft')).toBe(dmToDisplay(m, 'ft'));
    }
  });
});

describe('agreement with converters apps already ship', () => {
  test('shared and engine constants equal the registry', () => {
    expect(DEPTHMODES_M_PER_FT).toBe(M_PER_FT);
    expect(PP_M_PER_FT).toBe(M_PER_FT);
    expect(WS_M_PER_FT).toBe(M_PER_FT);
    expect(rel(PP_PA_PER_PSI, PA_PER_PSI)).toBeLessThan(1e-15);
    expect(EM_ACRE_FT).toBe(M3_PER_ACRE_FT);
    expect(EM_BBL).toBe(M3_PER_BBL);
  });
  test('Well Test oilfield to SI kinds match the registry', () => {
    expect(rel(WT.length.fromOil(1000), convert('depth', 1000, 'ft', 'm'))).toBeLessThan(1e-15);
    expect(rel(WT.pressure.fromOil(3000), convert('pressure', 3000, 'psi', 'kPa'))).toBeLessThan(1e-15);
    expect(rel(WT.oilRate.fromOil(500), convert('liquidRate', 500, 'STB/d', 'm3/d'))).toBeLessThan(1e-15);
    expect(rel(WT.gasRate.fromOil(2500), convert('gasRate', 2500, 'Mscf/d', '10^3 m3/d'))).toBeLessThan(1e-14);
    expect(rel(WT.compressibility.fromOil(3e-6), convert('compressibility', 3e-6, '1/psi', '1/kPa'))).toBeLessThan(1e-15);
    expect(WT.temperature.fromOil(212)).toBeCloseTo(convert('temperature', 212, 'degF', 'degC'), 12);
  });
});

describe('negative controls', () => {
  test('an unknown unit or family throws; non-finite input gives NaN', () => {
    expect(() => convert('depth', 1, 'm', 'yard')).toThrow(/Unknown unit/);
    expect(() => convert('mass', 1, 'kg', 'lb')).toThrow(/Unknown unit/);
    expect(() => toBase('pressure', 1, 'atm')).toThrow();
    expect(Number.isNaN(convert('depth', NaN, 'm', 'ft'))).toBe(true);
    expect(Number.isNaN(fromBase('depth', Infinity, 'ft'))).toBe(true);
    expect(isKnownUnit('depth', 'yard')).toBe(false);
  });
  test('the factor gate catches a rounded constant', () => {
    // 6894.76 is the common rounded psi; the 1e-15 gate above must reject it
    expect(rel(6894.76, (LB * G0) / INCH ** 2)).toBeGreaterThan(1e-15);
    // 0.159 m3/bbl, the usual rounding, fails too
    expect(rel(0.159, 42 * US_GAL)).toBeGreaterThan(1e-15);
    // survey foot is not the international foot
    expect(rel(M_PER_FTUS, FOOT)).toBeGreaterThan(1e-7);
  });
  test('the round-trip gate catches a mismatched pair', () => {
    const bad = (v) => (v * 0.3048) / 0.30480061; // foot in, survey foot out
    expect(Math.abs(bad(1000) - 1000)).toBeGreaterThan(EPS * 1000);
  });
  test('every family has a canonical unit it offers', () => {
    for (const fam of FAMILY_KEYS) expect(unitsOf(fam)).toContain(FAMILIES[fam].canonical);
  });
});
