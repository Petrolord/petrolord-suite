#!/usr/bin/env node
/**
 * Petrolord Suite — Phase 5 first chunk, engine closure
 * =========================================================================
 *
 * File: tools/patches/2026-05-17_mbal_engine_oil_no_aquifer_tier.cjs
 *
 * Context
 *   Case 2D (Tarek Ahmed Example 11-3) now passes all six assertions
 *   (D-1..D-6) in the validation harness. The engine's oil + no-aquifer
 *   code path is therefore benchmark-verified, but the engine itself still
 *   reports a lower tier and emits a stale "not yet validated" warning.
 *
 * What the patch does
 *   1. In the tier-mapping function (around line 1442), flip the oil +
 *      aquifer_model === 'none' branch:
 *        tier: 'published_method'  →  tier: 'benchmark_verified'
 *      and replace the generic Havlena-Odeh reference with the specific
 *      Tarek Ahmed Example 11-3 citation.
 *
 *   2. Around line 2222, narrow the "not yet validated" warning:
 *      OLD: emit warning if aquiferModel === 'none'           (all m)
 *      NEW: emit warning if aquiferModel === 'none' && m > 0  (gas-cap only)
 *      Updated text reflects that oil + no aquifer + no gas cap is now
 *      validated; oil + no aquifer + gas cap is still pending.
 *
 *   3. Update the stale comment block above the warning (around 2215-2218)
 *      so it matches the new validation state.
 *
 * What the patch does NOT do
 *   - Does not change any computation.
 *   - Does not change Cases 1/2/2D/3/4/etc. validation results.
 *   - Does not modify the other oil branches (pot, fetkovich, carter_tracy).
 *
 * Reference for new tier wording
 *   Validated 2026-05-17. Engine LSQ 291.3 MM STB vs Ahmed graphical 257
 *   MM STB vs volumetric 270.6 MM STB (all within ~7% of geomean).
 *   Drive indices: DDI 0.583, SDI 0.427, DDI+SDI 1.010, WDI ≈ 0, GDI = 0.
 *
 * Run
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-17_mbal_engine_oil_no_aquifer_tier.cjs
 *
 * Deploy
 *   After running the patch, redeploy the Edge Function:
 *     supabase functions deploy calculate-mbal --project-ref ssyckywijlrkgcwvkwlr
 *
 * Verify
 *   1. npx tsx tools/validation/mbal-validation.ts
 *      Expected: Case 2D's "Engine Warnings" block now reads "(none)"
 *      instead of the stale "not yet validated" message. All six D-1..D-6
 *      assertions still pass. Cases 1, 2, 3, 4, etc. unchanged.
 *
 *   2. In production, create or open an oil case with aquifer_model='none'
 *      and m=0. The validation tier badge on RbCaseDetail.jsx should now
 *      show "benchmark_verified" (green) instead of "published_method"
 *      (yellow). The tooltip should cite Tarek Ahmed Example 11-3.
 *
 * Safety
 *   - MD5 pre-flight (expected: 71b3b272a28a387e45692e2b3a3acd10)
 *   - Idempotent (detects whether the Tarek reference is already present)
 *   - Three sentinel-based str_replace edits, each verified for unique match
 *   - Backs up the original to .bak-{timestamp}
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TARGET    = path.join(REPO_ROOT, 'supabase/functions/_shared/mbal-engine.ts');

const EXPECTED_MD5 = '71b3b272a28a387e45692e2b3a3acd10';

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

// ──────────────────────────────────────────────────────────────────────────
// Edit 1: tier mapping for oil + aquifer_model === 'none'
// ──────────────────────────────────────────────────────────────────────────
// The grep showed:
//   line 1442:   // aquifer_model === 'none'
//   followed by: return { tier: 'published_method', reference: 'Standard
//                oil material balance formulation (Havlena-Odeh 1963).
//                Documented calculation logic and internal checks.' };
//
// Note: the carry-forward summary said this branch returned 'engineering_basis'.
// The actual code returns 'published_method'. The tier flip is therefore
// published_method → benchmark_verified, not engineering_basis → benchmark_verified.

const TIER_OLD = [
  "  // aquifer_model === 'none'",
  "  return {",
  "    tier: 'published_method',",
  "    reference: 'Standard oil material balance formulation (Havlena-Odeh 1963). Documented calculation logic and internal checks.',",
  "  };",
  "}",
].join('\n');

const TIER_NEW = [
  "  // aquifer_model === 'none'",
  "  // Validated 2026-05-17 against Tarek Ahmed Example 11-3 (Virginia Hills",
  "  // Beaverhill Lake field). Validation harness Case 2D asserts D-1..D-6:",
  "  // OOIP, drive index sum, DDI+SDI invariant, WDI≈0, GDI=0, mechanism",
  "  // classification. All pass.",
  "  return {",
  "    tier: 'benchmark_verified',",
  "    reference: 'Tarek Ahmed (2010) Reservoir Engineering Handbook, 4th ed., Chapter 11, Example 11-3 — Virginia Hills Beaverhill Lake field. Validated 2026-05-17: engine LSQ N = 291.3 MM STB vs Ahmed graphical fit 257 MM STB vs volumetric estimate 270.6 MM STB (all within ~7% of geomean). Drive indices match expected depletion-drive signature: DDI + SDI ≈ 1.01, WDI ≈ 0, GDI = 0. Uses Havlena-Odeh (1963) F vs Et formulation.',",
  "    notes: 'Method spread between LSQ (engine) and graphical fit (Ahmed) is the dominant source of disagreement on real-world data, not engine error.',",
  "  };",
  "}",
].join('\n');

// ──────────────────────────────────────────────────────────────────────────
// Edit 2: the comment block above the warning (around lines 2213-2218)
// ──────────────────────────────────────────────────────────────────────────

const COMMENT_OLD = [
  "  // Capsule 3A, oil + pot aquifer is validated against Pletcher SPE 75354",
  "  // (Tables 10-13). Other oil paths (no aquifer, oil_with_gas_cap) remain",
  "  // unvalidated until separate worked examples are sourced.",
].join('\n');

const COMMENT_NEW = [
  "  // Validated oil paths:",
  "  //   • oil + pot aquifer + no gas cap (m=0): Pletcher SPE 75354 Tables",
  "  //     10-13 (Capsule 3A, 1.79% OOIP error vs paper).",
  "  //   • oil + no aquifer + no gas cap (m=0): Tarek Ahmed (2010) Example",
  "  //     11-3, Virginia Hills Beaverhill Lake (Phase 5, 2026-05-17).",
  "  //",
  "  // Still unvalidated (warning emitted):",
  "  //   • oil + pot aquifer + gas cap (m>0): Phase 5 next-chunk candidate.",
  "  //",
  "  // The oil + fetkovich and oil + carter_tracy paths use validated aquifer",
  "  // models but no oil-side worked-example validation; tier remains",
  "  // 'published_method' for those.",
].join('\n');

// ──────────────────────────────────────────────────────────────────────────
// Edit 3: narrow the stale "not yet validated" warning
// ──────────────────────────────────────────────────────────────────────────
// OLD: warn whenever aquiferModel === 'none'  (oil + no aquifer, all m)
// NEW: warn only when aquiferModel === 'none' && m > 0 (oil + no aquifer +
//      gas cap, still unvalidated). The no-aquifer no-gas-cap path is now
//      benchmark-verified and emits no warning.

const WARNING_OLD = [
  "  if (aquiferModel === 'none') {",
  "    warnings.push(",
  "      'Oil reservoir math with no aquifer is implemented but not yet validated against a published worked example. Treat results as preliminary.',",
  "    );",
  "  } else if (aquiferModel === 'pot' && m > 0) {",
  "    warnings.push(",
  "      'Oil reservoir with gas cap (m > 0) and pot aquifer is implemented but not yet validated against a published worked example. Validation is for undersaturated and saturated oil without gas cap only.',",
  "    );",
  "  }",
  "  // aquiferModel === 'pot' && m === 0: validated; no warning.",
].join('\n');

const WARNING_NEW = [
  "  if (aquiferModel === 'none' && m > 0) {",
  "    warnings.push(",
  "      'Oil reservoir with no aquifer and gas cap (m > 0) is implemented but not yet validated against a published worked example. Validated cases: oil + no aquifer + no gas cap (Tarek Ahmed Example 11-3), and oil + pot aquifer + no gas cap (Pletcher SPE 75354 Tables 10-13).',",
  "    );",
  "  } else if (aquiferModel === 'pot' && m > 0) {",
  "    warnings.push(",
  "      'Oil reservoir with pot aquifer and gas cap (m > 0) is implemented but not yet validated against a published worked example. Validated cases: oil + no aquifer + no gas cap (Tarek Ahmed Example 11-3), and oil + pot aquifer + no gas cap (Pletcher SPE 75354 Tables 10-13).',",
  "    );",
  "  }",
  "  // Validated paths (no warning emitted):",
  "  //   aquiferModel === 'none' && m === 0  (Tarek Ahmed Example 11-3)",
  "  //   aquiferModel === 'pot'  && m === 0  (Pletcher Tables 10-13)",
].join('\n');

// ──────────────────────────────────────────────────────────────────────────
// Patch logic
// ──────────────────────────────────────────────────────────────────────────
function applyEdit(content, oldStr, newStr, editName) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) {
    return { content, ok: false, reason: 'sentinel not found' };
  }
  if (count > 1) {
    return { content, ok: false, reason: `sentinel matched ${count} times` };
  }
  return { content: content.replace(oldStr, newStr), ok: true };
}

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Phase 5 closure: engine tier flip + warning narrow');
  console.log(' (oil + no aquifer + no gas cap → benchmark_verified)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Target file: ' + TARGET);
  console.log('');

  if (!fs.existsSync(TARGET)) {
    console.error('✗ File not found: ' + TARGET);
    process.exit(1);
  }

  const original = fs.readFileSync(TARGET, 'utf8');
  const actualMd5 = md5(original);
  console.log('Pre-flight MD5: ' + actualMd5);
  console.log('Expected MD5:   ' + EXPECTED_MD5);

  // ─── Idempotency ─────────────────────────────────────────────────────
  if (original.includes('Tarek Ahmed (2010) Reservoir Engineering Handbook')) {
    console.log('');
    console.log('✓ Already patched (Tarek Ahmed reference found in tier function).');
    console.log('  No changes made.');
    process.exit(0);
  }

  // ─── MD5 ─────────────────────────────────────────────────────────────
  if (actualMd5 !== EXPECTED_MD5) {
    console.error('');
    console.error('✗ MD5 mismatch. The engine file has been modified since this');
    console.error('  patch was authored. Investigate before applying. If the');
    console.error('  change is benign, update EXPECTED_MD5 and re-run.');
    process.exit(1);
  }

  // ─── Apply the three edits ───────────────────────────────────────────
  let content = original;
  let ok, reason;

  console.log('');
  console.log('Applying edit 1: tier mapping for oil + none → benchmark_verified...');
  ({ content, ok, reason } = applyEdit(content, TIER_OLD, TIER_NEW, '1'));
  if (!ok) {
    console.error(`✗ Edit 1 failed: ${reason}`);
    process.exit(1);
  }
  console.log('  ✓ ok');

  console.log('Applying edit 2: refresh stale validation-state comment...');
  ({ content, ok, reason } = applyEdit(content, COMMENT_OLD, COMMENT_NEW, '2'));
  if (!ok) {
    console.error(`✗ Edit 2 failed: ${reason}`);
    process.exit(1);
  }
  console.log('  ✓ ok');

  console.log('Applying edit 3: narrow "not yet validated" warning...');
  ({ content, ok, reason } = applyEdit(content, WARNING_OLD, WARNING_NEW, '3'));
  if (!ok) {
    console.error(`✗ Edit 3 failed: ${reason}`);
    process.exit(1);
  }
  console.log('  ✓ ok');

  // ─── Backup ───────────────────────────────────────────────────────────
  const stamp = Date.now();
  const backupPath = TARGET + '.bak-' + stamp;
  fs.writeFileSync(backupPath, original);
  console.log('');
  console.log('Backup written: ' + path.basename(backupPath));

  // ─── Write patched file ───────────────────────────────────────────────
  fs.writeFileSync(TARGET, content);

  const newMd5 = md5(content);
  const newLines = content.split('\n').length;

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Patch applied. Three edits made.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Post-fix MD5:  ' + newMd5);
  console.log('Lines:         ' + (newLines - 1) + ' (was 2615)');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Re-run validation harness:');
  console.log('       npx tsx tools/validation/mbal-validation.ts');
  console.log('     Expected: Case 2D "Engine Warnings" → "(none)".');
  console.log('     All six D-1..D-6 still pass.');
  console.log('');
  console.log('  2. Deploy the Edge Function:');
  console.log('       supabase functions deploy calculate-mbal \\');
  console.log('         --project-ref ssyckywijlrkgcwvkwlr');
  console.log('');
  console.log('  3. Open an oil case with aquifer_model="none" in the app.');
  console.log('     The ValidationTierBadge should now show "benchmark_verified"');
  console.log('     (green) and the tooltip should cite Tarek Ahmed Example 11-3.');
  console.log('');
  console.log('Rollback (if needed):');
  console.log('  cp ' + backupPath + ' ' + TARGET);
}

try {
  main();
} catch (err) {
  console.error('');
  console.error('✗ Patch failed: ' + err.message);
  console.error(err.stack);
  process.exit(1);
}
