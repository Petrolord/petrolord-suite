/**
 * Behavior gates for the Cullender-Smith gas column (NA2). Oracle route
 * gates live in goldens.test.js and harness CASE 11.
 */
import { cullenderSmithBhp, gasReynolds } from '../cullenderSmith.js';

const base = {
  ptf: 2000,
  gasSg: 0.75,
  mdFt: 10000,
  whtF: 80,
  bhtF: 220,
  idIn: 2.441,
};

describe('Cullender-Smith gas column', () => {
  test('static column converges and sits near the 0.06-0.07 psi/ft band', () => {
    const res = cullenderSmithBhp(base);
    expect(res.converged).toBe(true);
    const grad = (res.pwf - base.ptf) / base.mdFt;
    expect(grad).toBeGreaterThan(0.05);
    expect(grad).toBeLessThan(0.08);
  });

  test('friction only adds pressure: flowing BHP exceeds static BHP', () => {
    const stat = cullenderSmithBhp(base);
    const flow = cullenderSmithBhp({ ...base, qMmscfd: 5 });
    expect(flow.pwf).toBeGreaterThan(stat.pwf);
  });

  test('flowing BHP is monotone in rate', () => {
    const p1 = cullenderSmithBhp({ ...base, qMmscfd: 2 }).pwf;
    const p2 = cullenderSmithBhp({ ...base, qMmscfd: 8 }).pwf;
    const p3 = cullenderSmithBhp({ ...base, qMmscfd: 16 }).pwf;
    expect(p2).toBeGreaterThan(p1);
    expect(p3).toBeGreaterThan(p2);
  });

  test('bigger tubing cuts the friction penalty', () => {
    const small = cullenderSmithBhp({ ...base, qMmscfd: 10, idIn: 1.995 }).pwf;
    const big = cullenderSmithBhp({ ...base, qMmscfd: 10, idIn: 3.958 }).pwf;
    expect(big).toBeLessThan(small);
  });

  test('deviated well (same TVD, longer MD) adds friction but same head direction', () => {
    const vertical = cullenderSmithBhp({ ...base, qMmscfd: 6, tvdFt: 10000 }).pwf;
    const deviated = cullenderSmithBhp({ ...base, qMmscfd: 6, mdFt: 13000, tvdFt: 10000 }).pwf;
    expect(deviated).toBeGreaterThan(vertical);
  });

  test('static midpoint pressure lies between wellhead and bottom', () => {
    const res = cullenderSmithBhp(base);
    expect(res.pmf).toBeGreaterThan(base.ptf);
    expect(res.pmf).toBeLessThan(res.pwf);
  });

  test('gas Reynolds number follows the field form', () => {
    expect(gasReynolds(5, 0.75, 0.012, 2.441)).toBeCloseTo((20011 * 0.75 * 5) / (0.012 * 2.441), 9);
  });
});
