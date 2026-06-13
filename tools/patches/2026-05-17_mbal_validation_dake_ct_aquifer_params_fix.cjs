#!/usr/bin/env node
/**
 * Petrolord Suite — CASE 2C structural fix
 * =========================================================================
 *
 * File: tools/patches/2026-05-17_mbal_validation_dake_ct_aquifer_params_fix.cjs
 *
 * Purpose
 *   The CASE 2C validation harness placed Carter-Tracy aquifer parameters
 *   at the top level of the inputs object (aquifer_permeability_md, etc.).
 *   The engine actually reads them from a nested aquifer_params sub-object:
 *
 *     Error: Carter-Tracy aquifer requires aquifer_params.aquifer_permeability_md.
 *
 *   This patch restructures the inputs in runCarterTracyOilCase so the
 *   aquifer fields are nested correctly:
 *
 *     OLD: inputs = { ..., aquifer_permeability_md: 200, ... }
 *     NEW: inputs = { ..., aquifer_params: { aquifer_permeability_md: 200, ... } }
 *
 * Field names
 *   Keeping the same field names within aquifer_params. The error confirms
 *   "aquifer_permeability_md" is correct — we just nest the whole block.
 *   If other field names inside aquifer_params are wrong (e.g.
 *   aquifer_dim_radius_ratio should be aquifer_re or aquifer_outer_radius),
 *   the engine will throw on the NEXT missing field and we'll iterate.
 *
 * What the patch does
 *   1. Sentinel-based str_replace of the inputs block in
 *      runCarterTracyOilCase. Replaces the 8 top-level aquifer_* fields
 *      with a single aquifer_params object containing them.
 *   2. Idempotent (detects aquifer_params nesting already present).
 *   3. Backs up .bak-{timestamp}.
 *
 * Run
 *   node tools/patches/2026-05-17_mbal_validation_dake_ct_aquifer_params_fix.cjs
 *   npx tsx tools/validation/mbal-validation.ts
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
// Sentinel: the 8 top-level aquifer fields in the inputs object.
// We replace them with a single aquifer_params sub-object.
// ──────────────────────────────────────────────────────────────────────────

const OLD_AQUIFER_BLOCK = [
  "    // Carter-Tracy aquifer parameters",
  "    aquifer_model: 'carter_tracy' as const,",
  "    aquifer_radius_ft: DAKE_CT_RESERVOIR.aquifer_radius_ft,",
  "    aquifer_dim_radius_ratio: DAKE_CT_RESERVOIR.aquifer_dim_radius_ratio,",
  "    aquifer_thickness_ft: DAKE_CT_RESERVOIR.aquifer_thickness_ft,",
  "    aquifer_permeability_md: DAKE_CT_RESERVOIR.aquifer_permeability_md,",
  "    aquifer_porosity: DAKE_CT_RESERVOIR.aquifer_porosity,",
  "    aquifer_water_viscosity_cp: DAKE_CT_RESERVOIR.aquifer_water_viscosity_cp,",
  "    aquifer_encroachment_angle_deg: DAKE_CT_RESERVOIR.aquifer_encroachment_angle_deg,",
  "    aquifer_total_compressibility_psi: DAKE_CT_RESERVOIR.aquifer_total_compressibility_psi,",
].join('\n');

const NEW_AQUIFER_BLOCK = [
  "    // Carter-Tracy aquifer parameters. Engine reads these from a nested",
  "    // aquifer_params sub-object (revealed by engine error message at runtime).",
  "    aquifer_model: 'carter_tracy' as const,",
  "    aquifer_params: {",
  "      aquifer_radius_ft: DAKE_CT_RESERVOIR.aquifer_radius_ft,",
  "      aquifer_dim_radius_ratio: DAKE_CT_RESERVOIR.aquifer_dim_radius_ratio,",
  "      aquifer_thickness_ft: DAKE_CT_RESERVOIR.aquifer_thickness_ft,",
  "      aquifer_permeability_md: DAKE_CT_RESERVOIR.aquifer_permeability_md,",
  "      aquifer_porosity: DAKE_CT_RESERVOIR.aquifer_porosity,",
  "      aquifer_water_viscosity_cp: DAKE_CT_RESERVOIR.aquifer_water_viscosity_cp,",
  "      aquifer_encroachment_angle_deg: DAKE_CT_RESERVOIR.aquifer_encroachment_angle_deg,",
  "      aquifer_total_compressibility_psi: DAKE_CT_RESERVOIR.aquifer_total_compressibility_psi,",
  "    },",
].join('\n');

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' CASE 2C structural fix: nest aquifer fields under aquifer_params');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Target: ' + TARGET);
  console.log('');

  if (!fs.existsSync(TARGET)) {
    console.error('✗ File not found: ' + TARGET);
    process.exit(1);
  }

  const original = fs.readFileSync(TARGET, 'utf8');
  console.log('Pre-fix MD5: ' + md5(original));

  // Idempotency: detect whether the nesting has been applied
  if (original.includes('aquifer_params: {')) {
    console.log('');
    console.log('✓ Already patched (aquifer_params nesting present).');
    console.log('  No changes made.');
    process.exit(0);
  }

  // Verify Carter-Tracy case exists
  if (!original.includes('async function runCarterTracyOilCase')) {
    console.error('');
    console.error('✗ runCarterTracyOilCase not found.');
    process.exit(1);
  }

  // Sentinel uniqueness
  const occurrences = original.split(OLD_AQUIFER_BLOCK).length - 1;
  if (occurrences === 0) {
    console.error('');
    console.error('✗ Sentinel block not found.');
    console.error('  The aquifer field block may have been modified manually.');
    console.error('  Check the inputs object in runCarterTracyOilCase().');
    process.exit(1);
  }
  if (occurrences > 1) {
    console.error('');
    console.error('✗ Sentinel matched ' + occurrences + ' times. Aborting.');
    process.exit(1);
  }

  const patched = original.replace(OLD_AQUIFER_BLOCK, NEW_AQUIFER_BLOCK);

  if (patched === original) {
    console.error('✗ str_replace produced no change. Aborting.');
    process.exit(1);
  }

  const stamp = Date.now();
  const backupPath = TARGET + '.bak-' + stamp;
  fs.writeFileSync(backupPath, original);
  console.log('Backup written: ' + path.basename(backupPath));

  fs.writeFileSync(TARGET, patched);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Patch applied. Aquifer fields nested under aquifer_params.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Post-fix MD5: ' + md5(patched));
  console.log('');
  console.log('Next step:');
  console.log('  npx tsx tools/validation/mbal-validation.ts');
  console.log('');
  console.log('Possible next outcomes:');
  console.log('  (a) All 7 assertions pass — engine accepts our field names. Ship');
  console.log('      the engine-side tier flip and Phase 5 chunk 3 closes.');
  console.log('  (b) Engine throws on a different missing/wrong field inside');
  console.log('      aquifer_params (e.g. wants aquifer_re instead of');
  console.log('      aquifer_dim_radius_ratio). Capture the error; one more fix.');
  console.log('  (c) Engine runs but assertions fail. Capture the output; we');
  console.log('      diagnose from the drive indices and OOIP numbers.');
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
