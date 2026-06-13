#!/usr/bin/env node
/**
 * Reservoir Balance — Run material balance card: stale-copy cleanup
 * ==========================================================================
 *
 * File: tools/patches/2026-05-16_rb_case_detail_validation_scope_all.cjs
 *
 * Purpose:
 *   Bundled update to the Run material balance card in RbCaseDetail.jsx that
 *   addresses every piece of stale validation/scope copy at once:
 *
 *     1. CardDescription text enumerating "validated paths" — replaced with
 *        a stable fluid-agnostic description that points users to the
 *        per-result validation tier badges.
 *
 *     2. Oil Validation-scope Alert — replaced with the user-approved text
 *        using the locked tier vocabulary (benchmark-verified, documented
 *        benchmark records, calculation traceability, internal consistency
 *        checks).
 *
 *     3. New parallel gas Validation-scope Alert — symmetric to the oil one.
 *        Gas users now see equivalent validation evidence for their cases
 *        (pot + Fetkovich benchmark-verified; Carter-Tracy + no-aquifer
 *        documented).
 *
 * Process pattern captured this session:
 *   Do not place pending-state messages on the UI when the underlying work
 *   will land before users see the app. Such messages tend to be forgotten
 *   and ship as stale "scheduled for Phase X" copy. If the work is genuinely
 *   uncertain to ship before user release, the message stays. Otherwise the
 *   message should not exist in the first place.
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-16_rb_case_detail_validation_scope_all.cjs
 *
 * Safety:
 *   - Idempotent (detects already-patched via unique sentinel)
 *   - Backs up the file before modifying
 *   - Anchors on the entire Run-card block — three changes applied as a
 *     single contiguous replacement so we don't get partial states
 *   - JSX-equivalent transformation; no new imports needed (Info icon and
 *     Alert components are already imported)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_PATH = path.resolve(
  __dirname,
  '../../src/pages/apps/reservoir-balance/RbCaseDetail.jsx',
);
const BACKUP_PATH = `${TARGET_PATH}.before-validation-scope-all-${Date.now()}.bak`;

// ─────────────────────────────────────────────────────────────────────────────
// PATCH ANCHORS
// ─────────────────────────────────────────────────────────────────────────────
//
// We anchor on the entire Capsule 3A Run-card body (from CardDescription open
// through the oil Alert close). The replacement contains all three edits in
// one contiguous block, which means we either apply all three or none — no
// possibility of a half-patched intermediate state.

const OLD_RUN_CARD_BLOCK = `              <CardDescription>
                Invokes the validated engine. PVT correlations and aquifer model are inherited from the PVT and Aquifer tabs. Validated paths: gas + pot aquifer (Pletcher SPE 75354), oil + pot aquifer (same paper, Tables 10-13).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {caseData.fluid_system !== 'gas' && (
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Validation scope (oil)</AlertTitle>
                  <AlertDescription>
                    Oil + pot aquifer is validated against Pletcher SPE 75354 (OOIP 0.13% error, W 0.10% error). Oil with no aquifer or with a gas cap is implemented but not yet validated against a published worked example. Fetkovich and Carter-Tracy aquifers are scheduled for Phase 4.
                  </AlertDescription>
                </Alert>
              )}`;

const NEW_RUN_CARD_BLOCK = `              <CardDescription>
                Invokes the validated engine. PVT correlations and aquifer model are inherited from the PVT and Aquifer tabs. Each computed result carries a validation tier badge indicating the evidence supporting that specific engine path.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {caseData.fluid_system === 'gas' && (
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Validation scope (gas)</AlertTitle>
                  <AlertDescription>
                    The gas material balance module has completed expanded Phase 4 validation across the main gas aquifer workflows. Gas + pot aquifer is benchmark-verified against Pletcher SPE 75354, with 0.19% OGIP error. Gas + Fetkovich aquifer is also benchmark-verified against the same paper (Tables 9 / Fig. 8), with 0.76% OGIP error. Carter-Tracy aquifer workflow includes documented benchmark records, calculation traceability, and internal consistency checks. No-aquifer gas cases follow established material balance formulations with documented assumptions and verified calculation logic.
                  </AlertDescription>
                </Alert>
              )}
              {caseData.fluid_system !== 'gas' && (
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Validation scope (oil)</AlertTitle>
                  <AlertDescription>
                    The oil material balance module has completed expanded Phase 4 validation across the main oil aquifer workflows. Oil + pot aquifer is benchmark-verified against Pletcher SPE 75354, with 0.13% OOIP error and 0.10% water influx error. Fetkovich and Carter-Tracy aquifer workflows now include documented benchmark records, calculation traceability, and internal consistency checks. No-aquifer and gas-cap oil cases follow established material balance formulations with documented assumptions and verified calculation logic.
                  </AlertDescription>
                </Alert>
              )}`;

// Sentinel for idempotency: a unique substring of the new content that does
// not appear in any prior version.
const PATCHED_SENTINEL = 'Each computed result carries a validation tier badge indicating the evidence supporting that specific engine path.';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function readFile() {
  if (!fs.existsSync(TARGET_PATH)) {
    throw new Error(`RbCaseDetail.jsx not found at ${TARGET_PATH}`);
  }
  return fs.readFileSync(TARGET_PATH, 'utf8');
}

function detectState(content) {
  if (content.includes(PATCHED_SENTINEL)) {
    return 'patched';
  }
  if (content.includes(OLD_RUN_CARD_BLOCK)) {
    return 'unpatched';
  }
  // The block didn't match cleanly. Either someone hand-edited it or a
  // different patch was applied. Don't guess — bail out.
  const has_old_oil_alert = content.includes(
    'Oil + pot aquifer is validated against Pletcher SPE 75354 (OOIP 0.13% error',
  );
  const has_old_cardDesc = content.includes(
    'Validated paths: gas + pot aquifer (Pletcher SPE 75354), oil + pot aquifer (same paper, Tables 10-13)',
  );
  let detail = '';
  if (has_old_oil_alert && !has_old_cardDesc) {
    detail = ' Old oil Alert is present but the surrounding CardDescription has been edited.';
  } else if (!has_old_oil_alert && has_old_cardDesc) {
    detail = ' Old CardDescription is present but the oil Alert has been edited.';
  } else if (!has_old_oil_alert && !has_old_cardDesc) {
    detail = ' Both the old CardDescription and old oil Alert are missing — this file may already have been partially patched by a different patch.';
  } else {
    detail = ' Both old anchors are present but together they do not form the expected contiguous block — surrounding whitespace or structure differs.';
  }
  throw new Error(
    'Could not detect baseline state.' + detail + ' Stop and inspect the file manually before proceeding.',
  );
}

function applyPatch(content) {
  return content.replace(OLD_RUN_CARD_BLOCK, NEW_RUN_CARD_BLOCK);
}

function verifyPatched(content) {
  if (!content.includes(PATCHED_SENTINEL)) {
    throw new Error('Verify failed: PATCHED_SENTINEL not present after patch.');
  }
  // Each old phrase must be gone
  const stale_phrases = [
    'scheduled for Phase 4',
    'Validated paths: gas + pot aquifer (Pletcher SPE 75354), oil + pot aquifer',
    'Oil + pot aquifer is validated against Pletcher SPE 75354 (OOIP 0.13% error',
  ];
  for (const phrase of stale_phrases) {
    if (content.includes(phrase)) {
      throw new Error(`Verify failed: stale phrase still present after patch — "${phrase}"`);
    }
  }
  // Each new alert must be present
  const new_phrases = [
    'Validation scope (gas)',
    'Validation scope (oil)',
    'expanded Phase 4 validation across the main gas aquifer workflows',
    'expanded Phase 4 validation across the main oil aquifer workflows',
  ];
  for (const phrase of new_phrases) {
    if (!content.includes(phrase)) {
      throw new Error(`Verify failed: expected new phrase not present — "${phrase}"`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Reservoir Balance — Run-MBAL card stale-copy cleanup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target: ${TARGET_PATH}`);
  console.log('');

  const original = readFile();
  console.log(`Read ${original.length} bytes.`);

  const state = detectState(original);
  console.log(`State: ${state}`);

  if (state === 'patched') {
    console.log('');
    console.log('✓ Already patched. Nothing to do.');
    process.exit(0);
  }

  console.log('');
  console.log('Writing backup...');
  fs.writeFileSync(BACKUP_PATH, original, 'utf8');
  console.log(`Backup: ${BACKUP_PATH}`);

  console.log('');
  console.log('Applying patch (three changes in one contiguous replacement)...');
  const next = applyPatch(original);

  console.log('');
  console.log('Verifying result...');
  verifyPatched(next);
  console.log('✓ Verify passed.');

  console.log('');
  console.log('Writing patched file...');
  fs.writeFileSync(TARGET_PATH, next, 'utf8');

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Bytes before:                       ${original.length}`);
  console.log(`  Bytes after:                        ${next.length}`);
  console.log(`  Net change:                         ${next.length - original.length > 0 ? '+' : ''}${next.length - original.length}`);
  console.log(`  CardDescription:                    updated to stable wording`);
  console.log(`  Oil Validation-scope Alert:         updated`);
  console.log(`  Gas Validation-scope Alert:         added (parallel to oil)`);
  console.log('');
  console.log('✓ Patch applied successfully.');
  console.log('');
  console.log('Next: hard-reload the case detail page. Verify on an oil case AND a gas case.');
}

try {
  main();
} catch (err) {
  console.error('');
  console.error('✗ Patch failed:');
  console.error(`  ${err.message}`);
  console.error('');
  console.error('No changes were written. If a backup was made, the original is intact.');
  process.exit(1);
}
