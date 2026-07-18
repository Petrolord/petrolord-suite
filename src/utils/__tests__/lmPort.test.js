/**
 * MB5 — pin the server Levenberg-Marquardt port against the client kernel.
 *
 * supabase/functions/_shared/lm.ts is a TypeScript port of
 * src/utils/welltest/lmFit.js (the WTA auto-match kernel), made for the
 * material-balance pressure history match, which runs in a Deno edge
 * function. jest can't import .ts, so the committed golden
 * (goldens/lm-port.json, regenerate via
 * npx tsx tools/validation/gen-lm-port-golden.ts) carries the SERVER port's
 * outputs on deterministic fixtures; this test runs the CLIENT kernel on the
 * same fixtures. The two files are the same algorithm line for line, so the
 * comparison tolerance is near machine precision: if either kernel drifts,
 * this pin breaks and the two engines stop being comparable.
 */
import fs from 'fs';
import path from 'path';
import {
  levenbergMarquardt,
  solveLinear,
  invertMatrix,
} from '../welltest/lmFit.js';

const golden = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'goldens', 'lm-port.json'), 'utf8'),
);

// Fixture definitions — MUST stay in sync with gen-lm-port-golden.ts.
const TRUTH = { a: 120, b: 0.35, c: 8 };
const T = Array.from({ length: 20 }, (_, i) => i);
const THETA0 = [80, 0.1, 20];
const BOUNDS_A = [
  [1, 1e4],
  [1e-4, 10],
  [0, 1e3],
];
const BOUNDS_B = [
  [1, 1e4],
  [1e-4, 10],
  [20, 1e3],
];

const yObs = T.map(
  (t, i) =>
    TRUTH.a * Math.exp(-TRUTH.b * t) + TRUTH.c + 0.5 * Math.sin(3.7 * i + 1.3),
);

const residuals = (theta) =>
  T.map((t, i) => theta[0] * Math.exp(-theta[1] * t) + theta[2] - yObs[i]);

// Same-algorithm, same-order float ops: agreement should be essentially
// exact. 1e-9 relative absorbs nothing but transform-level noise.
const expectClose = (actual, expected, relTol = 1e-9) => {
  const scale = Math.max(Math.abs(expected), 1);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(relTol * scale);
};

describe('LM port pin (client lmFit.js vs committed server lm.ts golden)', () => {
  test('fixture inputs match the golden (generator and test in sync)', () => {
    expect(golden.fixture_a.y_obs).toHaveLength(yObs.length);
    yObs.forEach((y, i) => expectClose(y, golden.fixture_a.y_obs[i], 1e-12));
  });

  test('fixture A: full fit agrees (theta, ssr, iterations, CIs)', () => {
    const r = levenbergMarquardt(residuals, THETA0, { bounds: BOUNDS_A });
    expect(r.converged).toBe(golden.fixture_a.converged);
    expect(r.iterations).toBe(golden.fixture_a.iterations);
    r.theta.forEach((v, i) => expectClose(v, golden.fixture_a.theta[i]));
    expectClose(r.ssr, golden.fixture_a.ssr);
    r.standardErrors.forEach((v, i) =>
      expectClose(v, golden.fixture_a.standardErrors[i], 1e-7),
    );
    r.confidence95.forEach(([lo, hi], i) => {
      expectClose(lo, golden.fixture_a.confidence95[i][0], 1e-7);
      expectClose(hi, golden.fixture_a.confidence95[i][1], 1e-7);
    });
  });

  test('fixture A: recovers the synthetic truth', () => {
    const r = levenbergMarquardt(residuals, THETA0, { bounds: BOUNDS_A });
    expect(Math.abs(r.theta[0] - TRUTH.a) / TRUTH.a).toBeLessThan(0.02);
    expect(Math.abs(r.theta[1] - TRUTH.b) / TRUTH.b).toBeLessThan(0.02);
    expect(Math.abs(r.theta[2] - TRUTH.c)).toBeLessThan(0.5);
  });

  test('fixture B: bound projection pins c at its lower bound of 20', () => {
    const r = levenbergMarquardt(residuals, THETA0, { bounds: BOUNDS_B });
    expect(r.theta[2]).toBe(20);
    r.theta.forEach((v, i) => expectClose(v, golden.fixture_b.theta[i]));
    expectClose(r.ssr, golden.fixture_b.ssr);
    expect(r.converged).toBe(golden.fixture_b.converged);
  });

  test('fixture C: solveLinear and invertMatrix agree with the port', () => {
    const { A, b, x, A_inv } = golden.fixture_c;
    const xClient = solveLinear(A, b);
    x.forEach((v, i) => expectClose(xClient[i], v, 1e-12));
    const invClient = invertMatrix(A);
    A_inv.forEach((row, i) =>
      row.forEach((v, j) => expectClose(invClient[i][j], v, 1e-12)),
    );
  });
});
