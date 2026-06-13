#!/usr/bin/env node
/**
 * Petrolord Suite — CASE 2C Layer B fix
 * =========================================================================
 *
 * File: tools/patches/2026-05-17_mbal_engine_oil_we_population_fix.cjs
 *
 * Purpose
 *   In computeOilMBE, the result field aquifer_cumulative_we_rb is gated
 *   on W_rb !== null. W_rb is the aquifer original water volume derived
 *   from regression slope, which only the pot-aquifer code path computes.
 *
 *   For Carter-Tracy and Fetkovich aquifer models, W_rb is null because
 *   those models specify aquifer geometry differently (radius_ratio +
 *   r_R + θ + k + φ + h + μw + ct for CT; J + Wei for Fetkovich) — not
 *   via the regression slope.
 *
 *   But the per-timestep We array (last.We_rb) IS computed correctly for
 *   all aquifer models. It's the W_rb guard that's wrong, not the math.
 *
 *   This patch widens the condition so the field is populated for CT and
 *   Fetkovich too. Pot-aquifer behavior is unchanged.
 *
 * Why the additive formulation (rather than removing the W_rb guard)
 *   The safest change preserves all existing behavior for cases the guard
 *   was correctly handling. There's a hypothetical edge case where
 *   pot-aquifer regression fails and W_rb ends up null even when
 *   aquiferModel === 'pot' — in that case the existing code returns
 *   undefined (sensible: "we couldn't compute W"). An additive
 *   formulation preserves that behavior while fixing the CT/Fetkovich
 *   case.
 *
 * Backward compatibility
 *   - Pot aquifer (oil + pot, with or without gas cap): unchanged
 *     (W_rb !== null branch still taken first)
 *   - No aquifer (oil + none): unchanged (still undefined)
 *   - Carter-Tracy and Fetkovich (oil): NEW — now populated with the
 *     final We value from the time-marched array
 *
 * Run
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-17_mbal_engine_oil_we_population_fix.cjs
 *
 * Then verify
 *   npx tsx tools/validation/mbal-validation.ts
 *   # Expected: CASE 2C "Cumulative We (final): ~88-89 MM rb"
 *   # (was 0.00 MM rb before; now reads correctly from time-marched We)
 *
 * Then redeploy
 *   supabase functions deploy calculate-mbal --project-ref ssyckywijlrkgcwvkwlr
 *
 * Safety
 *   - Single sentinel-based str_replace
 *   - Sentinel uses the exact line from the engine source as pasted
 *   - Idempotent (detects 'aquiferModel ===' in the renamed condition)
 *   - Backs up to .bak-{timestamp}
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TARGET    = path.join(REPO_ROOT, 'supabase/functions/_shared/mbal-engine.ts');

function md5(buf) { return crypto.createHash('md5').update(buf).digest('hex'); }

// ──────────────────────────────────────────────────────────────────────────
// Edit: widen the aquifer_cumulative_we_rb conditional in computeOilMBE
// to include carter_tracy and fetkovich aquifer models.
//
// Sentinel matches the exact line as it appears in the engine source.
// ──────────────────────────────────────────────────────────────────────────

const OLD = "    aquifer_cumulative_we_rb: W_rb !== null ? (last.We_rb ?? 0) : undefined,";

const NEW = [
  "    // 2026-05-17: widened condition so Carter-Tracy and Fetkovich oil cases",
  "    // also expose final We. Previously gated on W_rb !== null, which was only",
  "    // true for the pot-aquifer regression path. The per-timestep last.We_rb",
  "    // is computed correctly for all aquifer models; only this guard was wrong.",
  "    aquifer_cumulative_we_rb: (",
  "      W_rb !== null",
  "      || aquiferModel === 'carter_tracy'",
  "      || aquiferModel === 'fetkovich'",
  "    ) ? (last.We_rb ?? 0) : undefined,",
].join('\n');

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Layer B fix: populate aquifer_cumulative_we_rb for CT + Fetkovich');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Target: ' + TARGET);
  console.log('');

  if (!fs.existsSync(TARGET)) {
    console.error('✗ File not found: ' + TARGET);
    process.exit(1);
  }

  const original = fs.readFileSync(TARGET, 'utf8');
  console.log('Pre-fix MD5: ' + md5(original));

  // Idempotency: detect the widened condition
  if (original.includes("aquiferModel === 'carter_tracy'") &&
      original.includes('aquifer_cumulative_we_rb: (')) {
    console.log('');
    console.log('✓ Already patched (widened condition present).');
    console.log('  No changes made.');
    process.exit(0);
  }

  // Sentinel uniqueness
  const occurrences = original.split(OLD).length - 1;
  if (occurrences === 0) {
    console.error('');
    console.error('✗ Sentinel not found. Check actual line with:');
    console.error('  grep -n "aquifer_cumulative_we_rb: W_rb" supabase/functions/_shared/mbal-engine.ts');
    process.exit(1);
  }
  if (occurrences > 1) {
    console.error('');
    console.error('✗ Sentinel matched ' + occurrences + ' times. Aborting.');
    console.error('  Two oil-side return statements detected; manual review needed.');
    process.exit(1);
  }

  const patched = original.replace(OLD, NEW);

  // Backup
  const stamp = Date.now();
  const backupPath = TARGET + '.bak-' + stamp;
  fs.writeFileSync(backupPath, original);
  console.log('Backup written: ' + path.basename(backupPath));

  fs.writeFileSync(TARGET, patched);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Patch applied. One condition widened.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Post-fix MD5: ' + md5(patched));
  console.log('');
  console.log('Behavior change:');
  console.log('  - Oil + pot aquifer:      unchanged (still gated on W_rb !== null)');
  console.log('  - Oil + Carter-Tracy:     NEW — now populated with last.We_rb');
  console.log('  - Oil + Fetkovich:        NEW — now populated with last.We_rb');
  console.log('  - Oil + no aquifer:       unchanged (still undefined)');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Verify in harness (CASE 2C We should now show ~88-89 MM rb):');
  console.log('       npx tsx tools/validation/mbal-validation.ts');
  console.log('  2. Redeploy:');
  console.log('       supabase functions deploy calculate-mbal \\');
  console.log('         --project-ref ssyckywijlrkgcwvkwlr');
  console.log('');
  console.log('Rollback: cp ' + backupPath + ' ' + TARGET);
}

try {
  main();
} catch (err) {
  console.error('');
  console.error('✗ Patch failed: ' + err.message);
  console.error(err.stack);
  process.exit(1);
}
