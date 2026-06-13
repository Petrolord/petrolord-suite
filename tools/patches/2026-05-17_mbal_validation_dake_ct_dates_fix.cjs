#!/usr/bin/env node
/**
 * Petrolord Suite — CASE 2C fix
 * =========================================================================
 *
 * File: tools/patches/2026-05-17_mbal_validation_dake_ct_dates_fix.cjs
 *
 * Purpose
 *   The CASE 2C patch shipped earlier today added a Dake Exercise 9.2
 *   validation case but the production_data rows lacked observation_date.
 *   Carter-Tracy is a time-stepping scheme; the engine throws:
 *
 *     Timestep 0 is missing observation_date. Fetkovich and Carter-Tracy
 *     aquifer models require a date column in the production data (Δt is
 *     needed for the time-marching scheme).
 *
 *   This patch adds observation_date to each of the 11 rows. Dake's
 *   exercise uses annual timesteps; we anchor at 1980-01-01 and add one
 *   year per row.
 *
 * What the patch does
 *   1. Find the existing production_data mapping in runCarterTracyOilCase
 *   2. Replace it with a version that includes observation_date
 *   3. The fix is sentinel-based (matches the exact mapping body) and
 *      idempotent (no-op if the date field is already present)
 *
 * Run
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-17_mbal_validation_dake_ct_dates_fix.cjs
 *
 * Then verify
 *   npx tsx tools/validation/mbal-validation.ts
 *
 * Safety
 *   - Sentinel-based str_replace (verified unique match)
 *   - Idempotent: detects 'observation_date' in the Carter-Tracy case body
 *   - Backs up to .bak-{timestamp}
 *   - No MD5 pre-flight (file MD5 differs by patch sequence)
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
// Sentinel: the exact production_data mapping block from the Carter-Tracy
// case. Uses a chunk that is unique to that case (the bw_rb_stb: 1.0 line
// followed by the closing brackets that match this case body).
//
// We replace the mapping with one that adds observation_date.
// ──────────────────────────────────────────────────────────────────────────

const OLD_MAPPING = [
  "async function runCarterTracyOilCase(): Promise<void> {",
  "  const production_data = DAKE_CT_PERFORMANCE.map((row, idx) => {",
  "    const Np_stb = row.Np_mmstb * 1e6;",
  "    const Gp_scf = Np_stb * row.Rp;  // cumulative GOR × cum oil = cum gas",
  "    return {",
  "      timestep_index: idx,",
  "      pressure_psia: row.p,",
  "      cum_oil_stb: Np_stb,",
  "      cum_gas_scf: Gp_scf,",
  "      cum_water_stb: 0,",
  "      bo_rb_stb: row.Bo,",
  "      rs_scf_stb: row.Rs,",
  "      bg_rb_scf: row.Bg,",
  "      bw_rb_stb: 1.0,",
  "    };",
  "  });",
].join('\n');

const NEW_MAPPING = [
  "async function runCarterTracyOilCase(): Promise<void> {",
  "  // Dake Exercise 9.2 uses annual timesteps (year 0..10). Anchor",
  "  // observation_date at 1980-01-01 and add one year per row so the",
  "  // engine's Carter-Tracy time-marching scheme has Δt = 365 days/step.",
  "  // The absolute date is immaterial; only the deltas matter for CT.",
  "  const ANCHOR_YEAR = 1980;",
  "  const production_data = DAKE_CT_PERFORMANCE.map((row, idx) => {",
  "    const Np_stb = row.Np_mmstb * 1e6;",
  "    const Gp_scf = Np_stb * row.Rp;  // cumulative GOR × cum oil = cum gas",
  "    const observationYear = ANCHOR_YEAR + row.yr;",
  "    const observation_date = `${observationYear}-01-01`;",
  "    return {",
  "      timestep_index: idx,",
  "      observation_date,",
  "      pressure_psia: row.p,",
  "      cum_oil_stb: Np_stb,",
  "      cum_gas_scf: Gp_scf,",
  "      cum_water_stb: 0,",
  "      bo_rb_stb: row.Bo,",
  "      rs_scf_stb: row.Rs,",
  "      bg_rb_scf: row.Bg,",
  "      bw_rb_stb: 1.0,",
  "    };",
  "  });",
].join('\n');

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' CASE 2C fix: add observation_date for Carter-Tracy time-marching');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Target: ' + TARGET);
  console.log('');

  if (!fs.existsSync(TARGET)) {
    console.error('✗ File not found: ' + TARGET);
    process.exit(1);
  }

  const original = fs.readFileSync(TARGET, 'utf8');
  console.log('Pre-fix MD5: ' + md5(original));

  // Sanity: confirm runCarterTracyOilCase is present (Phase 5 chunk 3 patch
  // must have been applied).
  if (!original.includes('async function runCarterTracyOilCase')) {
    console.error('');
    console.error('✗ runCarterTracyOilCase not found. Apply the Carter-Tracy');
    console.error('  validation patch (2026-05-17_mbal_validation_dake_carter_tracy.cjs)');
    console.error('  before applying this fix.');
    process.exit(1);
  }

  // Idempotency: detect whether the fix has been applied
  // The fix introduces "ANCHOR_YEAR = 1980" — unique to this patch.
  if (original.includes('ANCHOR_YEAR = 1980')) {
    console.log('');
    console.log('✓ Already patched (ANCHOR_YEAR sentinel present).');
    console.log('  No changes made.');
    process.exit(0);
  }

  // Verify the sentinel exists exactly once
  const occurrences = original.split(OLD_MAPPING).length - 1;
  if (occurrences === 0) {
    console.error('');
    console.error('✗ Sentinel block not found.');
    console.error('  The Carter-Tracy case body may have been modified manually.');
    console.error('  Check the production_data mapping in runCarterTracyOilCase().');
    process.exit(1);
  }
  if (occurrences > 1) {
    console.error('');
    console.error('✗ Sentinel matched ' + occurrences + ' times. Aborting.');
    process.exit(1);
  }

  const patched = original.replace(OLD_MAPPING, NEW_MAPPING);

  if (patched === original) {
    console.error('✗ str_replace produced no change. Aborting.');
    process.exit(1);
  }

  // Backup
  const stamp = Date.now();
  const backupPath = TARGET + '.bak-' + stamp;
  fs.writeFileSync(backupPath, original);
  console.log('Backup written: ' + path.basename(backupPath));

  fs.writeFileSync(TARGET, patched);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Patch applied.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Post-fix MD5: ' + md5(patched));
  console.log('');
  console.log('observation_date now added to each of the 11 Dake CT rows:');
  console.log('  Year 0:  1980-01-01');
  console.log('  Year 1:  1981-01-01');
  console.log('  ...');
  console.log('  Year 10: 1990-01-01');
  console.log('');
  console.log('Next step:');
  console.log('  npx tsx tools/validation/mbal-validation.ts');
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
