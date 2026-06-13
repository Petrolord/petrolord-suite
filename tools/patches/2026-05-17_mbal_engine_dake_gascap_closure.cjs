#!/usr/bin/env node
/**
 * Petrolord Suite — Phase 5 second chunk, engine closure
 * =========================================================================
 *
 * File: tools/patches/2026-05-17_mbal_engine_dake_gascap_closure.cjs
 *
 * Context
 *   CASE 2G (Dake Exercise 3.4) now passes all seven assertions G-1..G-7
 *   in the validation harness. The engine's oil + no-aquifer + gas-cap
 *   (aquifer_model='none', m>0) path is therefore benchmark-verified, but
 *   the engine still emits a stale "not yet validated" warning for that
 *   path. The tier function already returns 'benchmark_verified' for
 *   oil + 'none' regardless of m (this was set by the previous Tarek
 *   engine patch, which didn't sub-branch on m), but its reference text
 *   cites only Tarek Ahmed Example 11-3 — needs to also cite Dake
 *   Exercise 3.4 for the m>0 case.
 *
 * What the patch does
 *   1. Refresh the tier function reference text for oil + 'none' to cite
 *      both validated worked examples (Tarek and Dake).
 *
 *   2. Remove the "Oil reservoir with no aquifer and gas cap (m > 0) is
 *      implemented but not yet validated..." warning. CASE 2G validates
 *      this path. The warning's else-if becomes the new sole warning arm
 *      (oil + pot + gas cap, still unvalidated).
 *
 *   3. Update the comment block above the warning to reflect both new
 *      validations.
 *
 * What the patch does NOT do
 *   - Does not change any computation.
 *   - Does not change Cases 1/2/2D/2G/3/etc. validation results.
 *
 * Run
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-17_mbal_engine_dake_gascap_closure.cjs
 *
 * Then redeploy
 *   supabase functions deploy calculate-mbal \
 *     --project-ref ssyckywijlrkgcwvkwlr
 *
 * Then verify
 *   npx tsx tools/validation/mbal-validation.ts
 *   # Expected: CASE 2G "Engine Warnings" → "(none)". All seven G-1..G-7
 *   # assertions still pass. Cases 1, 2, 2D, 3, 4 etc. unchanged.
 *
 * Safety
 *   - Idempotent (detects whether the Dake reference is already present)
 *   - Three sentinel-based str_replace edits, each verified for unique match
 *   - No MD5 pre-flight (file MD5 will differ depending on order in which
 *     previous engine patches were applied)
 *   - Backs up the original to .bak-{timestamp}
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TARGET    = path.join(REPO_ROOT, 'supabase/functions/_shared/mbal-engine.ts');

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

// ──────────────────────────────────────────────────────────────────────────
// Edit 1: refresh the tier function reference text for oil + 'none'
//
// The previous Tarek patch set this branch to return:
//   reference: 'Tarek Ahmed (2010) Reservoir Engineering Handbook ... '
//
// Now we need to expand it to cite both Tarek (for m=0) and Dake (for m>0).
// ──────────────────────────────────────────────────────────────────────────

const TIER_REF_OLD =
  "    reference: 'Tarek Ahmed (2010) Reservoir Engineering Handbook, 4th ed., Chapter 11, Example 11-3 — Virginia Hills Beaverhill Lake field. Validated 2026-05-17: engine LSQ N = 291.3 MM STB vs Ahmed graphical fit 257 MM STB vs volumetric estimate 270.6 MM STB (all within ~7% of geomean). Drive indices match expected depletion-drive signature: DDI + SDI ≈ 1.01, WDI ≈ 0, GDI = 0. Uses Havlena-Odeh (1963) F vs Et formulation.',\n" +
  "    notes: 'Method spread between LSQ (engine) and graphical fit (Ahmed) is the dominant source of disagreement on real-world data, not engine error.',";

const TIER_REF_NEW =
  "    reference: 'Validated against two worked examples: (a) Tarek Ahmed (2010) Reservoir Engineering Handbook, 4th ed., Chapter 11, Example 11-3 — Virginia Hills Beaverhill Lake field — for the no-gas-cap (m=0) variant. Engine LSQ N = 291.3 MM STB vs Ahmed graphical fit 257 MM STB vs volumetric 270.6 MM STB. (b) Dake (1978) Fundamentals of Reservoir Engineering, Chapter 3, Exercise 3.4 — for the gas-cap (m>0) variant. Engine LSQ N = 115.5 MM STB vs Dake trial-and-error fit 114 MM STB vs volumetric 115 MM STB; m=0.5 input reproduces Dake\\'s preferred solution. Both use Havlena-Odeh (1963) F vs Et or F vs (Eo + m·Eg) formulations.',\n" +
  "    notes: 'For m=0 the method spread between LSQ (engine) and graphical fit (Ahmed) is the dominant source of disagreement on real-world data. For m>0 the engine matches Dake\\'s LSQ within < 2% (engine 115.5 MM STB vs Dake 114 MM STB).',";

// ──────────────────────────────────────────────────────────────────────────
// Edit 2: remove the stale "oil + none + m > 0 not yet validated" warning.
//
// Current state (after previous Tarek closure patch):
//   if (aquiferModel === 'none' && m > 0) {
//     warnings.push('Oil reservoir with no aquifer and gas cap (m > 0) ...');
//   } else if (aquiferModel === 'pot' && m > 0) {
//     warnings.push('Oil reservoir with pot aquifer and gas cap (m > 0) ...');
//   }
//
// After this patch, the 'none' && m>0 arm becomes the validated path (no
// warning); the 'pot' && m>0 arm remains the sole unvalidated warning.
// ──────────────────────────────────────────────────────────────────────────

const WARNING_OLD = [
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

const WARNING_NEW = [
  "  if (aquiferModel === 'pot' && m > 0) {",
  "    warnings.push(",
  "      'Oil reservoir with pot aquifer and gas cap (m > 0) is implemented but not yet validated against a published worked example. Validated cases: oil + no aquifer + no gas cap (Tarek Ahmed Example 11-3), oil + no aquifer + gas cap (Dake Exercise 3.4), and oil + pot aquifer + no gas cap (Pletcher SPE 75354 Tables 10-13).',",
  "    );",
  "  }",
  "  // Validated paths (no warning emitted):",
  "  //   aquiferModel === 'none' && m === 0  (Tarek Ahmed Example 11-3)",
  "  //   aquiferModel === 'none' && m > 0   (Dake Exercise 3.4)",
  "  //   aquiferModel === 'pot'  && m === 0  (Pletcher Tables 10-13)",
  "  // Still unvalidated (warning emitted):",
  "  //   aquiferModel === 'pot'  && m > 0   (oil + pot aquifer + gas cap)",
].join('\n');

// ──────────────────────────────────────────────────────────────────────────
// Edit 3: refresh the comment block above the warning to match new state.
//
// Current state (set by previous Tarek closure):
//   // Validated oil paths:
//   //   • oil + pot aquifer + no gas cap (m=0): Pletcher SPE 75354 ...
//   //   • oil + no aquifer + no gas cap (m=0): Tarek Ahmed Example 11-3 ...
//   //
//   // Still unvalidated (warning emitted):
//   //   • oil + pot aquifer + gas cap (m>0): Phase 5 next-chunk candidate.
//   //
//   // The oil + fetkovich and oil + carter_tracy paths ...
// ──────────────────────────────────────────────────────────────────────────

const COMMENT_OLD = [
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

const COMMENT_NEW = [
  "  // Validated oil paths:",
  "  //   • oil + pot aquifer + no gas cap (m=0): Pletcher SPE 75354 Tables",
  "  //     10-13 (Capsule 3A, 1.79% OOIP error vs paper).",
  "  //   • oil + no aquifer + no gas cap (m=0): Tarek Ahmed (2010) Example",
  "  //     11-3, Virginia Hills Beaverhill Lake (Phase 5 chunk 1, 2026-05-17).",
  "  //   • oil + no aquifer + gas cap (m>0): Dake (1978) Exercise 3.4",
  "  //     'GASCAP DRIVE' (Phase 5 chunk 2, 2026-05-17). Engine LSQ 115.5 MM",
  "  //     STB vs Dake 114 MM STB (1.33%); m=0.5 input.",
  "  //",
  "  // Still unvalidated (warning emitted):",
  "  //   • oil + pot aquifer + gas cap (m>0): future Phase 5 chunk.",
  "  //",
  "  // The oil + fetkovich and oil + carter_tracy paths use validated aquifer",
  "  // models but no oil-side worked-example validation; tier remains",
  "  // 'published_method' for those.",
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
  console.log(' Phase 5 chunk 2 closure: engine tier refresh + warning removal');
  console.log(' (oil + no aquifer + gas cap (m>0) — Dake Exercise 3.4 validated)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Target file: ' + TARGET);
  console.log('');

  if (!fs.existsSync(TARGET)) {
    console.error('✗ File not found: ' + TARGET);
    process.exit(1);
  }

  const original = fs.readFileSync(TARGET, 'utf8');
  console.log('Pre-fix MD5: ' + md5(original));

  // Idempotency
  if (original.includes('Dake (1978) Fundamentals of Reservoir Engineering, Chapter 3, Exercise 3.4')) {
    console.log('');
    console.log('✓ Already patched (Dake Exercise 3.4 reference present in tier function).');
    console.log('  No changes made.');
    process.exit(0);
  }

  // Sanity: confirm the previous Tarek engine patch was applied
  if (!original.includes('Tarek Ahmed (2010) Reservoir Engineering Handbook')) {
    console.error('');
    console.error('✗ The previous Tarek engine closure patch has not been applied.');
    console.error('  Apply 2026-05-17_mbal_engine_oil_no_aquifer_tier.cjs first.');
    process.exit(1);
  }

  // Apply the three edits
  let content = original;
  let ok, reason;

  console.log('');
  console.log('Applying edit 1: tier function reference text (add Dake citation)...');
  ({ content, ok, reason } = applyEdit(content, TIER_REF_OLD, TIER_REF_NEW, '1'));
  if (!ok) {
    console.error(`✗ Edit 1 failed: ${reason}`);
    process.exit(1);
  }
  console.log('  ✓ ok');

  console.log('Applying edit 2: remove stale "oil + none + m > 0" warning...');
  ({ content, ok, reason } = applyEdit(content, WARNING_OLD, WARNING_NEW, '2'));
  if (!ok) {
    console.error(`✗ Edit 2 failed: ${reason}`);
    process.exit(1);
  }
  console.log('  ✓ ok');

  console.log('Applying edit 3: refresh validation-state comment block...');
  ({ content, ok, reason } = applyEdit(content, COMMENT_OLD, COMMENT_NEW, '3'));
  if (!ok) {
    console.error(`✗ Edit 3 failed: ${reason}`);
    process.exit(1);
  }
  console.log('  ✓ ok');

  // Backup
  const stamp = Date.now();
  const backupPath = TARGET + '.bak-' + stamp;
  fs.writeFileSync(backupPath, original);
  console.log('');
  console.log('Backup written: ' + path.basename(backupPath));

  fs.writeFileSync(TARGET, content);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Patch applied. Three edits made.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Post-fix MD5: ' + md5(content));
  console.log('');
  console.log('Next steps:');
  console.log('  1. Re-run harness:');
  console.log('       npx tsx tools/validation/mbal-validation.ts');
  console.log('     Expected: CASE 2G "Engine Warnings" → "(none)".');
  console.log('     All seven G-1..G-7 still pass.');
  console.log('');
  console.log('  2. Redeploy Edge Function:');
  console.log('       supabase functions deploy calculate-mbal \\');
  console.log('         --project-ref ssyckywijlrkgcwvkwlr');
  console.log('');
  console.log('  3. Open an oil case with aquifer_model="none" and m>0.');
  console.log('     ValidationTierBadge: still benchmark_verified, tooltip');
  console.log('     now cites both Tarek Ahmed and Dake.');
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
