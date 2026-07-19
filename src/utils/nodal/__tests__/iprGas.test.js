import { darcyGasIpr, backPressureIpr, litIpr } from '../iprGas';

describe('gas IPR', () => {
  const base = { pr: 3000, tempF: 200, gasGravity: 0.65, k: 5, h: 50, re: 1490, rw: 0.354, skin: 2 };

  test('darcy pseudo-pressure IPR is monotone with a positive AOF', () => {
    const ipr = darcyGasIpr(base);
    expect(ipr.aof).toBeGreaterThan(0);
    for (let i = 1; i < ipr.curve.length; i += 1) {
      expect(ipr.curve[i].q).toBeGreaterThanOrEqual(ipr.curve[i - 1].q);
      expect(ipr.curve[i].pwf).toBeLessThan(ipr.curve[i - 1].pwf);
    }
  });

  test('non-Darcy D reduces deliverability', () => {
    const clean = darcyGasIpr(base);
    const turbulent = darcyGasIpr({ ...base, dNonDarcy: 5e-4 });
    expect(turbulent.aof).toBeLessThan(clean.aof);
  });

  test('skin reduces deliverability', () => {
    const s0 = darcyGasIpr({ ...base, skin: 0 });
    const s10 = darcyGasIpr({ ...base, skin: 10 });
    expect(s10.aof).toBeLessThan(s0.aof);
  });

  test('back-pressure IPR matches its closed form', () => {
    const ipr = backPressureIpr({ pr: 3000, c: 2e-4, n: 0.85 });
    const at1500 = ipr.curve.find((p) => Math.abs(p.pwf - 1500) < 40);
    expect(ipr.aof).toBeCloseTo(2e-4 * Math.pow(3000 ** 2, 0.85), 6);
    expect(at1500.q).toBeGreaterThan(0);
  });

  test('LIT IPR inverts its quadratic', () => {
    const a = 0.05;
    const b = 5e-6;
    const ipr = litIpr({ pr: 3000, a, b });
    const q = ipr.aof;
    expect(a * q + b * q * q).toBeCloseTo(3000 ** 2, 4);
  });

  test('bad inputs return warnings, not throws', () => {
    const bad = darcyGasIpr({ pr: -1 });
    expect(bad.curve).toEqual([]);
    expect(bad.warnings.length).toBeGreaterThan(0);
  });
});
