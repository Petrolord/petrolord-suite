#!/usr/bin/env node
/**
 * Petrolord Suite — CASE 2C harness cosmetic fix
 * =========================================================================
 *
 * File: tools/patches/2026-05-17_mbal_validation_dake_ct_we_field_fix.cjs
 *
 * Purpose
 *   The CASE 2C informational dump reads `result.final_cumulative_we_rb`
 *   and displays "Cumulative We (final): 0.00 MM rb" — but the engine
 *   doesn't have a field by that name. The correct field is
 *   `aquifer_cumulative_we_rb` (verified via grep on engine source:
 *   defined at line 219 of MBALResult interface, populated at lines 1904
 *   and 2340 for gas and oil paths respectively).
 *
 *   This patch renames the field reference in the informational dump.
 *   No assertion changes; purely cosmetic.
 *
 * Important note about CASE 2C specifically
 *   The engine populates `aquifer_cumulative_we_rb` only when `W_rb !==
 *   null` for oil cases. `W_rb` is the aquifer original water volume
 *   derived from regression slope, which only the pot-aquifer code path
 *   computes. For Carter-Tracy, W_rb is null because CT specifies
 *   aquifer geometry via radius_ratio + r_R + θ + k + φ + h + μw + ct
 *   rather than via an aquifer-W regression slope.
 *
 *   So even after this rename, the display will still read 0.00 MM rb
 *   for CASE 2C. That's a deeper engine issue (the CT path internally
 *   computes a We array via computeCarterTracyWe but doesn't bubble the
 *   final value up to the result through this field). Fixing that is a
 *   separate small engine patch — needs sight of line 2330-2350 to do
 *   correctly without breaking the W_rb guard.
 *
 *   This harness patch is correct on its own — the field name was simply
 *   wrong. The remaining "always 0" behavior for CT is now visible because
 *   of the rename, and is a known issue for a follow-up engine patch.
 *
 * What this patch does
 *   1. Replace `result.final_cumulative_we_rb` with
 *      `result.aquifer_cumulative_we_rb` in the CASE 2C informational dump
 *
 * Run
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-17_mbal_validation_dake_ct_we_field_fix.cjs
 *
 * Safety
 *   - Single sentinel-based str_replace
 *   - Idempotent (detects renamed field)
 *   - Backs up to .bak-{timestamp}
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TARGET    = path.join(REPO_ROOT, 'tools/validation/mbal-validation.ts');

function md5(buf) { return crypto.createHash('md5').update(buf).digest('hex'); }

// ──────────────────────────────────────────────────────────────────────────
// Edit: rename field reference in the Cumulative We informational dump.
// Sentinel uses the full template-literal line to anchor uniquely.
// ──────────────────────────────────────────────────────────────────────────

const OLD = "  console.log(`  Cumulative We (final):     ${((result.final_cumulative_we_rb ?? 0)/1e6).toFixed(2)} MM rb  (Dake reD=5: 89.2 MM rb)`);";

const NEW = "  console.log(`  Cumulative We (final):     ${((result.aquifer_cumulative_we_rb ?? 0)/1e6).toFixed(2)} MM rb  (Dake reD=5: 89.2 MM rb)`);";

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' CASE 2C cosmetic fix: rename We field reference in dump');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Target: ' + TARGET);
  console.log('');

  if (!fs.existsSync(TARGET)) {
    console.error('✗ File not found: ' + TARGET);
    process.exit(1);
  }

  const original = fs.readFileSync(TARGET, 'utf8');
  console.log('Pre-fix MD5: ' + md5(original));

  // Idempotency
  if (original.includes('result.aquifer_cumulative_we_rb')) {
    console.log('');
    console.log('✓ Already patched (aquifer_cumulative_we_rb field reference present).');
    console.log('  No changes made.');
    process.exit(0);
  }

  // Sanity: CT case exists
  if (!original.includes('async function runCarterTracyOilCase')) {
    console.error('');
    console.error('✗ runCarterTracyOilCase not found.');
    process.exit(1);
  }

  // Sentinel uniqueness
  const occurrences = original.split(OLD).length - 1;
  if (occurrences === 0) {
    console.error('');
    console.error('✗ Sentinel not found. Check actual harness line:');
    console.error('  grep "Cumulative We (final)" tools/validation/mbal-validation.ts');
    process.exit(1);
  }
  if (occurrences > 1) {
    console.error('');
    console.error('✗ Sentinel matched ' + occurrences + ' times. Aborting.');
    process.exit(1);
  }

  const patched = original.replace(OLD, NEW);

  const stamp = Date.now();
  const backupPath = TARGET + '.bak-' + stamp;
  fs.writeFileSync(backupPath, original);
  console.log('Backup written: ' + path.basename(backupPath));

  fs.writeFileSync(TARGET, patched);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Patch applied. One field renamed.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Post-fix MD5: ' + md5(patched));
  console.log('');
  console.log('Field rename:');
  console.log('  result.final_cumulative_we_rb → result.aquifer_cumulative_we_rb');
  console.log('');
  console.log('Important caveat:');
  console.log('  Even with the correct field name, CASE 2C dump may still show');
  console.log('  0.00 MM rb because the engine populates this field only when');
  console.log('  W_rb !== null (true for pot aquifer, false for Carter-Tracy).');
  console.log('  Fixing the CT path to bubble We up to the result is a separate');
  console.log('  small engine patch (needs sight of mbal-engine.ts:2330-2350).');
  console.log('');
  console.log('  Other CASES that use this field (pot aquifer paths) will now');
  console.log('  display correct We values where they were previously broken.');
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
