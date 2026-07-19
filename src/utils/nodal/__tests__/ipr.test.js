import { computeIpr, rateAtPwf, pwfAtRate, futureIpr } from '../ipr';

describe('oil IPR models', () => {
  test('PI model is a straight line with qmax = J pr', () => {
    const ipr = computeIpr({ model: 'pi', pr: 3000, pi: 1.5 });
    expect(ipr.qmax).toBeCloseTo(4500, 9);
    expect(rateAtPwf(ipr, 2000)).toBeCloseTo(1500, 9);
    expect(ipr.curve[0].pwf).toBe(3000);
    expect(ipr.curve[0].q).toBeCloseTo(0, 9);
  });

  test('Vogel reproduces the dimensionless equation', () => {
    const ipr = computeIpr({ model: 'vogel', pr: 2000, qmax: 1000 });
    // pwf/pr = 0.5 -> q/qmax = 1 - 0.1 - 0.2 = 0.7
    expect(rateAtPwf(ipr, 1000)).toBeCloseTo(700, 9);
    expect(rateAtPwf(ipr, 0)).toBeCloseTo(1000, 9);
  });

  test('Vogel calibrates qmax from a test point', () => {
    const ipr = computeIpr({ model: 'vogel', pr: 2000, testPoint: { q: 700, pwf: 1000 } });
    expect(ipr.qmax).toBeCloseTo(1000, 6);
  });

  test('composite is continuous at the bubble point and calibrates below pb', () => {
    const pr = 3200;
    const pb = 2400;
    const J = 1.2;
    const ipr = computeIpr({ model: 'composite', pr, pb, pi: J });
    const above = rateAtPwf(ipr, pb + 1e-9);
    const below = rateAtPwf(ipr, pb - 1e-9);
    expect(above).toBeCloseTo(J * (pr - pb), 5);
    expect(Math.abs(above - below)).toBeLessThan(1e-3);
    expect(ipr.qmax).toBeCloseTo(J * (pr - pb) + (J * pb) / 1.8, 9);

    // Calibration from a below-pb test point reproduces the point.
    const q = rateAtPwf(ipr, 1500);
    const cal = computeIpr({ model: 'composite', pr, pb, testPoint: { q, pwf: 1500 } });
    expect(cal.pi).toBeCloseTo(J, 6);
  });

  test('Fetkovich matches its closed form and calibrates C', () => {
    const ipr = computeIpr({ model: 'fetkovich', pr: 3000, c: 2e-5, n: 0.85 });
    const q = rateAtPwf(ipr, 1500);
    expect(q).toBeCloseTo(2e-5 * Math.pow(3000 ** 2 - 1500 ** 2, 0.85), 9);
    const cal = computeIpr({ model: 'fetkovich', pr: 3000, n: 0.85, testPoint: { q, pwf: 1500 } });
    expect(cal.c).toBeCloseTo(2e-5, 9);
  });

  test('Jones inverts its quadratic exactly', () => {
    const a = 0.5;
    const b = 2e-4;
    const ipr = computeIpr({ model: 'jones', pr: 3000, a, b });
    const q = rateAtPwf(ipr, 2000);
    expect(a * q + b * q * q).toBeCloseTo(1000, 6);
  });

  test('pwfAtRate inverts rateAtPwf', () => {
    const ipr = computeIpr({ model: 'vogel', pr: 2000, qmax: 1000 });
    const pwf = pwfAtRate(ipr, 700);
    expect(pwf).toBeCloseTo(1000, 4);
  });

  test('futureIpr applies the Vogel cube rule and Fetkovich C scaling', () => {
    const v = computeIpr({ model: 'vogel', pr: 2000, qmax: 1000 });
    const vf = futureIpr(v, { prFuture: 1000 });
    expect(vf.qmax).toBeCloseTo(1000 * 0.125, 9);

    const f = computeIpr({ model: 'fetkovich', pr: 2000, c: 1e-5, n: 1 });
    const ff = futureIpr(f, { prFuture: 1000 });
    expect(ff.c).toBeCloseTo(5e-6, 15);
  });

  test('degenerate inputs warn instead of throwing', () => {
    const bad = computeIpr({ model: 'vogel', pr: -5 });
    expect(bad.curve).toEqual([]);
    expect(bad.warnings.length).toBeGreaterThan(0);
    const noCal = computeIpr({ model: 'pi', pr: 3000 });
    expect(noCal.warnings.length).toBeGreaterThan(0);
  });
});
