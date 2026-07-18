/**
 * MB7 — tier-matrix generator (the Phase 7 "tier consolidation" carry-over).
 *
 * The engine's resolveValidationTier() is the single source of truth for the
 * validation tier of every (fluid_system, aquifer_model, has_gas_cap) path.
 * The Aquifer tab shows the tier BEFORE a run, which historically meant a
 * hand-maintained mirror in AquiferModel.jsx — a mirror that drifted (it
 * still showed Carter-Tracy as published_method after the Phase 5 benchmark
 * promotion). This script dumps the engine mapping into
 * src/pages/apps/reservoir-balance/lib/tierMatrix.json; the UI imports that
 * file, so refreshing the mapping is one command instead of a copy-edit.
 *
 * Regenerate after ANY resolveValidationTier change:
 *   npx tsx tools/validation/gen-tier-matrix-golden.ts
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveValidationTier } from '../../supabase/functions/_shared/mbal-engine.ts';

const FLUIDS = ['gas', 'oil'] as const;
const MODELS = ['none', 'pot', 'fetkovich', 'carter_tracy'] as const;

const matrix: Record<string, Record<string, Record<string, unknown>>> = {};
for (const fluid of FLUIDS) {
  matrix[fluid] = {};
  for (const model of MODELS) {
    matrix[fluid][model] = {
      no_gas_cap: resolveValidationTier(fluid, model, false),
      with_gas_cap: resolveValidationTier(fluid, model, true),
    };
  }
}

const out = {
  generated_by: 'tools/validation/gen-tier-matrix-golden.ts',
  source: 'supabase/functions/_shared/mbal-engine.ts resolveValidationTier()',
  matrix,
};

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/pages/apps/reservoir-balance/lib/tierMatrix.json',
);
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
for (const fluid of FLUIDS) {
  for (const model of MODELS) {
    const t = (matrix[fluid][model] as any).no_gas_cap;
    console.log(`  ${fluid} + ${model}: ${t.tier}`);
  }
}
