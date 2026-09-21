/**
 * MB7 — generated tier matrix (engine resolveValidationTier dump consumed by
 * the Aquifer tab's pre-run badges). Regenerate via
 * npx tsx tools/validation/gen-tier-matrix-golden.ts after engine changes.
 */
import tierMatrixJson from '../tierMatrix.json';
import { resolveValidationTier } from '../../../../../../supabase/functions/_shared/mbal-engine.ts';

const TIERS = ['benchmark_verified', 'published_method', 'engineering_basis'];
const FLUIDS = ['gas', 'oil'];
const MODELS = ['none', 'pot', 'fetkovich', 'carter_tracy'];
const CAPS = ['no_gas_cap', 'with_gas_cap'];

describe('tierMatrix.json', () => {
  const matrix = tierMatrixJson.matrix;

  it('covers every fluid, aquifer model and gas-cap variant', () => {
    for (const fluid of FLUIDS) {
      for (const model of MODELS) {
        for (const cap of CAPS) {
          const entry = matrix?.[fluid]?.[model]?.[cap];
          expect(entry).toBeTruthy();
          expect(TIERS).toContain(entry.tier);
        }
      }
    }
  });

  it('benchmark-verified paths always name their reference', () => {
    for (const fluid of FLUIDS) {
      for (const model of MODELS) {
        for (const cap of CAPS) {
          const entry = matrix[fluid][model][cap];
          if (entry.tier === 'benchmark_verified') {
            expect(typeof entry.reference).toBe('string');
            expect(entry.reference.length).toBeGreaterThan(10);
          }
        }
      }
    }
  });

  // The whole point of generating this file was that a hand-maintained mirror
  // drifts. It drifted anyway: engines #168 re-measured the Carter-Tracy
  // provenance (OOIP 301.0 -> 307.2 MMSTB, tolerance 3.53 -> 1.53 pct) and
  // nobody re-ran the generator, so the Aquifer tab kept showing figures the
  // engine no longer produced — the exact defect #168 had just fixed inside the
  // engine. Generated-and-committed only works if something checks the commit.
  it('is not stale: every cell matches the engine right now', () => {
    for (const fluid of FLUIDS) {
      for (const model of MODELS) {
        for (const cap of CAPS) {
          expect({ at: `${fluid}/${model}/${cap}`, ...matrix[fluid][model][cap] })
            .toEqual({
              at: `${fluid}/${model}/${cap}`,
              ...resolveValidationTier(fluid, model, cap === 'with_gas_cap'),
            });
        }
      }
    }
  });

  it('carries the promotions the old hand-maintained mirror missed', () => {
    // The Capsule 4B mirror showed these as published_method; the engine
    // promoted them in the Phase 5 patch series (Dake 9.2 / Ex. 3.4 / Ahmed).
    expect(matrix.oil.carter_tracy.no_gas_cap.tier).toBe('benchmark_verified');
    expect(matrix.gas.carter_tracy.no_gas_cap.tier).toBe('benchmark_verified');
    expect(matrix.oil.none.no_gas_cap.tier).toBe('benchmark_verified');
    expect(matrix.gas.pot.no_gas_cap.tolerance_pct).toBeCloseTo(0.19, 6);
  });
});
