import { reynoldsNumber, colebrookFrictionFactor, moodyFrictionFactor } from '../friction';

describe('nodal friction', () => {
  test('laminar branch is 64/Re', () => {
    expect(moodyFrictionFactor(1000, 0)).toBeCloseTo(0.064, 12);
  });

  test('Colebrook satisfies its own implicit equation', () => {
    const re = 1e5;
    const rel = 1e-4;
    const f = colebrookFrictionFactor(re, rel);
    const lhs = 1 / Math.sqrt(f);
    const rhs = -2 * Math.log10(rel / 3.7 + 2.51 / (re * Math.sqrt(f)));
    expect(lhs).toBeCloseTo(rhs, 9);
  });

  test('smooth pipe at Re 1e5 is near the textbook 0.018', () => {
    const f = colebrookFrictionFactor(1e5, 0);
    expect(f).toBeGreaterThan(0.0175);
    expect(f).toBeLessThan(0.0185);
  });

  test('critical zone blends continuously', () => {
    const fLam = moodyFrictionFactor(1999.9, 1e-4);
    const fLo = moodyFrictionFactor(2000.1, 1e-4);
    const fHi = moodyFrictionFactor(3999.9, 1e-4);
    const fTurb = moodyFrictionFactor(4000.1, 1e-4);
    expect(Math.abs(fLo - fLam)).toBeLessThan(1e-3);
    expect(Math.abs(fHi - fTurb)).toBeLessThan(1e-3);
  });

  test('reynoldsNumber in field units', () => {
    // rho 62.4 lbm/ft3, v 5 ft/s, d 0.5 ft, mu 1 cp -> Re = 1488*62.4*5*0.5
    expect(reynoldsNumber(62.4, 5, 0.5, 1)).toBeCloseTo(1488 * 62.4 * 5 * 0.5, 6);
  });
});
