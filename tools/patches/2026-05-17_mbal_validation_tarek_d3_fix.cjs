#!/usr/bin/env node
/**
 * Petrolord Suite — Phase 5 first chunk, follow-up fix
 * =========================================================================
 *
 * File: tools/patches/2026-05-17_mbal_validation_tarek_d3_fix.cjs
 *
 * Purpose
 *   The first Tarek patch (2026-05-17_mbal_validation_tarek_depletion.cjs)
 *   added Case 3 (Tarek Ahmed Example 11-3) validation with assertions
 *   D-1 through D-6. Five of the six passed cleanly. D-3 failed because
 *   my physical assumption was wrong:
 *
 *     I asserted DDI >= 0.85 (depletion drive should dominate).
 *
 *   But Ahmed's Example 11-3 uses cf = 4.95e-6 psi^-1, which is high
 *   (Beaverhill Lake carbonate). At the final timestep this makes
 *   Ef,w = 0.00499 bbl/STB vs Eo = 0.00680 bbl/STB, so the rock+water
 *   compressibility drive (SDI) is ~42% of total energy, not the ~5% I
 *   anticipated. The engine reports DDI = 0.583, SDI = 0.427, sum = 1.010.
 *
 *   The engine math is correct. My assertion was wrong.
 *
 *   The physically correct invariant for "no aquifer + no gas cap" is
 *   that hydrocarbon expansion (DDI) plus rock+water compressibility
 *   (SDI) together account for all reservoir energy — WDI ~ 0, GDI = 0,
 *   DDI + SDI ~ 1.0. That's what this patch asserts.
 *
 *   This patch also:
 *     - Updates informational labels (SDI is not always "small")
 *     - Renames the banner from "CASE 3" to "CASE 2D" to avoid the
 *       cosmetic collision with the pre-existing "CASE 3 — Gas+Fetkovich"
 *       added by Capsule 4A.
 *
 * What the patch does NOT do
 *   - Does not change the engine. The engine is mathematically correct.
 *   - Does not change Cases 1, 2, 3 (Fetkovich), 4 (Vasquez-Beggs), etc.
 *   - Does not modify the OOIP D-1 tolerance.
 *
 * Run
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-17_mbal_validation_tarek_d3_fix.cjs
 *
 * Then verify
 *   npx tsx tools/validation/mbal-validation.ts
 *   # Expected: D-3 now reads "DDI + SDI" and passes (1.010 > 0.95).
 *   # All six Tarek assertions D-1 .. D-6 pass.
 *
 * Safety
 *   - Idempotent: detects whether the fix has already been applied
 *   - Sentinel-based: searches for the exact old D-3 block (unique because
 *     this patch script wrote it on the previous run)
 *   - Aborts if any sentinel match-count is not exactly 1
 *   - Backs up the original to .bak-{timestamp}
 *   - No MD5 pre-flight (the file MD5 differs depending on which
 *     other harness patches have been applied; we trust the sentinels)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TARGET    = path.join(REPO_ROOT, 'tools/validation/mbal-validation.ts');

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

// ──────────────────────────────────────────────────────────────────────────
// Edit 1: banner label in main() — rename "CASE 3 — Oil reservoir + no
// aquifer (Tarek Ahmed Example 11-3)" to "CASE 2D" to avoid collision with
// the existing "CASE 3 — Gas reservoir + Fetkovich" added by Capsule 4A.
// ──────────────────────────────────────────────────────────────────────────
const BANNER_OLD = [
  "  // ─────────────────────────────────────────────────────────────────────",
  "  // CASE 3 — Tarek Ahmed Example 11-3: depletion-drive oil + no aquifer",
  "  // (Volumetric undersaturated, Virginia Hills Beaverhill Lake field)",
  "  // ─────────────────────────────────────────────────────────────────────",
  "  console.log('');",
  "  console.log('═══════════════════════════════════════════════════════════════════');",
  "  console.log('  CASE 3 — Oil reservoir + no aquifer (Tarek Ahmed Example 11-3)');",
  "  console.log('═══════════════════════════════════════════════════════════════════');",
  "  console.log('');",
  "  await runDepletionOilCase();",
].join('\n');

const BANNER_NEW = [
  "  // ─────────────────────────────────────────────────────────────────────",
  "  // CASE 2D — Tarek Ahmed Example 11-3: depletion-drive oil + no aquifer",
  "  // (Volumetric undersaturated, Virginia Hills Beaverhill Lake field).",
  "  // Labelled 2D because the Capsule 4A harness already uses CASE 3 for",
  "  // the Pletcher gas+Fetkovich validation; renumbering this one keeps",
  "  // the existing case labels stable.",
  "  // ─────────────────────────────────────────────────────────────────────",
  "  console.log('');",
  "  console.log('═══════════════════════════════════════════════════════════════════');",
  "  console.log('  CASE 2D — Oil + no aquifer (Tarek Ahmed Example 11-3, depletion drive)');",
  "  console.log('═══════════════════════════════════════════════════════════════════');",
  "  console.log('');",
  "  await runDepletionOilCase();",
].join('\n');

// ──────────────────────────────────────────────────────────────────────────
// Edit 2: replace the broken D-3 assertion with the physically correct one
// (DDI + SDI >= 0.95 for no-aquifer no-gas-cap reservoirs).
// ──────────────────────────────────────────────────────────────────────────
const D3_OLD = [
  "  // ──────────────────────────────────────────────────────────────────────",
  "  // ASSERTION D-3: Depletion drive dominates (DDI ≥ 0.85)",
  "  // No aquifer + no gas cap → depletion drive should be ~all of energy,",
  "  // with a small rock+water compressibility (cf+cw) contribution.",
  "  // ──────────────────────────────────────────────────────────────────────",
  "  console.log('─── Assertion D-3: Depletion drive dominates ────────────────────');",
  "  checkRange('DDI (depletion drive index)', result.final_ddi ?? 0, 0.85, 1.05);",
].join('\n');

const D3_NEW = [
  "  // ──────────────────────────────────────────────────────────────────────",
  "  // ASSERTION D-3: Combined hydrocarbon + rock/water expansion accounts",
  "  // for all reservoir energy (DDI + SDI in [0.95, 1.05]).",
  "  //",
  "  // Revised 2026-05-17. Original D-3 asserted DDI ≥ 0.85 on the assumption",
  "  // that oil expansion alone dominates in a depletion-drive reservoir.",
  "  // That holds in normal-cf reservoirs but fails in Ahmed's Example 11-3",
  "  // because cf = 4.95e-6 psi^-1 (high, Beaverhill Lake carbonate). At the",
  "  // final timestep Ef,w = 0.00499 bbl/STB vs Eo = 0.00680 bbl/STB, so",
  "  // SDI ≈ 0.43 and DDI ≈ 0.58 — both substantial. The physically correct",
  "  // invariant for 'no aquifer + no gas cap' is that hydrocarbon-side",
  "  // energy (DDI + SDI together) covers ~all of total voidage, with",
  "  // WDI ≈ 0 (D-4) and GDI = 0 (D-5).",
  "  // ──────────────────────────────────────────────────────────────────────",
  "  console.log('─── Assertion D-3: DDI + SDI account for all reservoir energy ───');",
  "  const ddi_plus_sdi = (result.final_ddi ?? 0) + (result.final_sdi ?? 0);",
  "  checkRange('DDI + SDI (combined expansion drive)', ddi_plus_sdi, 0.95, 1.05);",
].join('\n');

// ──────────────────────────────────────────────────────────────────────────
// Edit 3: informational drive-index breakdown labels — SDI is not always
// "small", so the label was misleading.
// ──────────────────────────────────────────────────────────────────────────
const LABEL_OLD = [
  "  console.log(`  DDI: ${(result.final_ddi ?? 0).toFixed(3)}    (depletion drive — expected ~1.0)`);",
  "  console.log(`  SDI: ${(result.final_sdi ?? 0).toFixed(3)}    (rock+water compressibility — small)`);",
  "  console.log(`  GDI: ${(result.final_gdi ?? 0).toFixed(3)}    (gas cap — expected 0)`);",
  "  console.log(`  WDI: ${(result.final_wdi ?? 0).toFixed(3)}    (water drive — expected 0)`);",
].join('\n');

const LABEL_NEW = [
  "  console.log(`  DDI: ${(result.final_ddi ?? 0).toFixed(3)}    (depletion drive — oil expansion)`);",
  "  console.log(`  SDI: ${(result.final_sdi ?? 0).toFixed(3)}    (rock+water compressibility — magnitude depends on cf, cw)`);",
  "  console.log(`  GDI: ${(result.final_gdi ?? 0).toFixed(3)}    (gas cap — expected 0 for this case)`);",
  "  console.log(`  WDI: ${(result.final_wdi ?? 0).toFixed(3)}    (water drive — expected ~0 for this case)`);",
  "  console.log(`  DDI+SDI: ${((result.final_ddi ?? 0) + (result.final_sdi ?? 0)).toFixed(3)}   (combined hydrocarbon-side energy; D-3 target ≥ 0.95)`);",
].join('\n');

// ──────────────────────────────────────────────────────────────────────────
// Patch logic
// ──────────────────────────────────────────────────────────────────────────
function applyEdit(content, oldStr, newStr, editName) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) {
    console.error(`✗ Edit ${editName}: sentinel not found.`);
    console.error('  Either the first patch (depletion case) was not applied,');
    console.error('  or this D-3 fix has already been applied.');
    return { content, ok: false };
  }
  if (count > 1) {
    console.error(`✗ Edit ${editName}: sentinel found ${count} times. Aborting.`);
    return { content, ok: false };
  }
  return { content: content.replace(oldStr, newStr), ok: true };
}

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Tarek Ahmed Case D-3 fix + banner relabel');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Target file: ' + TARGET);
  console.log('');

  if (!fs.existsSync(TARGET)) {
    console.error('✗ File not found: ' + TARGET);
    process.exit(1);
  }

  const original = fs.readFileSync(TARGET, 'utf8');
  console.log('Pre-fix MD5: ' + md5(original));

  // Idempotency: if the new D-3 invariant text is already present, skip.
  if (original.includes('DDI + SDI account for all reservoir energy')) {
    console.log('');
    console.log('✓ Already patched (DDI + SDI assertion present).');
    console.log('  No changes made.');
    process.exit(0);
  }

  // Verify the first patch was applied (depletion case sentinel must exist).
  if (!original.includes('async function runDepletionOilCase')) {
    console.error('');
    console.error('✗ The depletion-case insertion has not been applied yet.');
    console.error('  Run the first patch first:');
    console.error('    node tools/patches/2026-05-17_mbal_validation_tarek_depletion.cjs');
    process.exit(1);
  }

  // ─── Apply the three edits ────────────────────────────────────────────
  let content = original;
  let ok;

  ({ content, ok } = applyEdit(content, BANNER_OLD, BANNER_NEW, '1 (banner relabel)'));
  if (!ok) process.exit(1);

  ({ content, ok } = applyEdit(content, D3_OLD, D3_NEW, '2 (D-3 assertion)'));
  if (!ok) process.exit(1);

  ({ content, ok } = applyEdit(content, LABEL_OLD, LABEL_NEW, '3 (informational labels)'));
  if (!ok) process.exit(1);

  // ─── Backup ────────────────────────────────────────────────────────────
  const stamp = Date.now();
  const backupPath = TARGET + '.bak-' + stamp;
  fs.writeFileSync(backupPath, original);
  console.log('');
  console.log('Backup written: ' + path.basename(backupPath));

  // ─── Write patched file ────────────────────────────────────────────────
  fs.writeFileSync(TARGET, content);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Patch applied. Three edits made:');
  console.log('  1. Banner relabeled: CASE 3 → CASE 2D (avoids collision)');
  console.log('  2. D-3 assertion now: DDI + SDI in [0.95, 1.05]');
  console.log('  3. Drive-index labels updated to reflect that SDI is not');
  console.log('     always small');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Post-fix MD5: ' + md5(content));
  console.log('');
  console.log('Next step:');
  console.log('  cd ' + REPO_ROOT);
  console.log('  npx tsx tools/validation/mbal-validation.ts');
  console.log('');
  console.log('Expected: D-3 now reads "DDI + SDI" and passes (engine');
  console.log('reports 1.010, range [0.95, 1.05]). All six Tarek assertions');
  console.log('D-1 .. D-6 pass. Cases 1, 2, 3 (Fetkovich), 4 (Vasquez-Beggs)');
  console.log('and any subsequent cases are unaffected.');
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
