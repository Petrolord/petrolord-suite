/**
 * MB5 — golden generator for the Levenberg-Marquardt port pin test.
 *
 * The server-side LM kernel (supabase/functions/_shared/lm.ts) is a
 * TypeScript port of the client kernel (src/utils/welltest/lmFit.js). jest
 * cannot import .ts modules (transform is js/jsx only, by design), so the
 * cross-check follows the MB2 golden pattern (gen-dake92-client-golden.ts):
 * this script runs the SERVER port on deterministic fixtures and commits the
 * outputs; src/utils/__tests__/lmPort.test.js runs the CLIENT kernel on the
 * same fixtures and asserts agreement. The two kernels are line-for-line the
 * same algorithm, so tolerance is near machine precision — any drift in
 * either file breaks the pin.
 *
 * Regenerate: npx tsx tools/validation/gen-lm-port-golden.ts
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  levenbergMarquardt,
  solveLinear,
  invertMatrix,
} from '../../supabase/functions/_shared/lm.ts';

// ─── Fixture A: 3-parameter exponential decay with deterministic noise ──────
// y = a·exp(−b·t) + c, truth a=120, b=0.35, c=8. Noise is a fixed sinusoid
// (never Math.random — goldens must be reproducible).
export const FIXTURE_A = {
  truth: { a: 120, b: 0.35, c: 8 },
  t: Array.from({ length: 20 }, (_, i) => i),
  theta0: [80, 0.1, 20],
  bounds: [
    [1, 1e4],
    [1e-4, 10],
    [0, 1e3],
  ] as Array<[number, number]>,
};

const yObsA = FIXTURE_A.t.map(
  (t, i) =>
    FIXTURE_A.truth.a * Math.exp(-FIXTURE_A.truth.b * t) +
    FIXTURE_A.truth.c +
    0.5 * Math.sin(3.7 * i + 1.3),
);

const residualsA = (theta: number[]) =>
  FIXTURE_A.t.map(
    (t, i) => theta[0] * Math.exp(-theta[1] * t) + theta[2] - yObsA[i],
  );

// ─── Fixture B: bounds projection — same model, c bounded away from truth ───
// The lower bound c ≥ 20 excludes the true c=8, so the fit must pin c at the
// bound. Exercises applyBounds inside the step loop.
const FIXTURE_B_BOUNDS: Array<[number, number]> = [
  [1, 1e4],
  [1e-4, 10],
  [20, 1e3],
];

// ─── Fixture C: linear algebra pins (solveLinear / invertMatrix) ────────────
const MATRIX_C = [
  [4, 1, 2],
  [1, 5, 1],
  [2, 1, 6],
];
const RHS_C = [7, 8, 9];

const resultA = levenbergMarquardt(residualsA, FIXTURE_A.theta0, {
  bounds: FIXTURE_A.bounds,
});
const resultB = levenbergMarquardt(residualsA, FIXTURE_A.theta0, {
  bounds: FIXTURE_B_BOUNDS,
});

const golden = {
  generated_by: 'tools/validation/gen-lm-port-golden.ts',
  source: 'supabase/functions/_shared/lm.ts',
  fixture_a: {
    y_obs: yObsA,
    theta: resultA.theta,
    ssr: resultA.ssr,
    iterations: resultA.iterations,
    converged: resultA.converged,
    standardErrors: resultA.standardErrors,
    confidence95: resultA.confidence95,
  },
  fixture_b: {
    theta: resultB.theta,
    ssr: resultB.ssr,
    converged: resultB.converged,
  },
  fixture_c: {
    A: MATRIX_C,
    b: RHS_C,
    x: solveLinear(MATRIX_C, RHS_C),
    A_inv: invertMatrix(MATRIX_C),
  },
};

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/utils/__tests__/goldens/lm-port.json',
);
writeFileSync(outPath, `${JSON.stringify(golden, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
console.log(
  `Fixture A: theta=[${resultA.theta.map((v) => v.toPrecision(8)).join(', ')}] ` +
    `ssr=${resultA.ssr.toPrecision(8)} iters=${resultA.iterations} converged=${resultA.converged}`,
);
console.log(
  `Fixture B (c pinned at 20): theta=[${resultB.theta.map((v) => v.toPrecision(8)).join(', ')}]`,
);
