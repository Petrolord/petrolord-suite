#!/usr/bin/env node
/**
 * Reservoir Balance — Phase 3 Capsule 4B — RbCaseDetail.jsx tier-badge patch
 * ==========================================================================
 *
 * File: tools/patches/2026-05-15_rb_case_detail_tier_badge.cjs
 *
 * Purpose:
 *   Surface the engine's validation_tier in the case detail page. Renders
 *   the new ValidationTierBadge component in two places:
 *
 *     1. Overview tab — small badge in the "Last result" tile below the
 *        OOIP/OGIP value
 *     2. Run tab — the green CheckCircle2 (runtime success marker) is
 *        kept as a fallback for legacy rows; new rows show the tier badge
 *        in the same visual position
 *
 * Prerequisite: Capsule 4B Artifact 1 (ValidationTierBadge.jsx) must be
 * deployed. This patch's prerequisite check verifies the file exists by
 * checking for the import target in the path.
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-15_rb_case_detail_tier_badge.cjs
 *
 * Safety:
 *   - Idempotent (detects already-patched via sentinel)
 *   - Backs up the file before modifying
 *   - Verifies all anchors after patch
 *   - Aborts cleanly if baseline can't be matched
 *   - Aborts cleanly if ValidationTierBadge.jsx prerequisite is missing
 *
 * Three changes:
 *   1. Add ValidationTierBadge import (after RbDiagnosticPlots import)
 *   2. Add small badge to Overview "Last result" tile under the headline value
 *   3. Replace CheckCircle2 in Run tab result card with conditional badge
 *      (badge if validation_tier present; CheckCircle2 fallback if not)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_PATH = path.resolve(
  __dirname,
  '../../src/pages/apps/reservoir-balance/RbCaseDetail.jsx',
);
const BADGE_COMPONENT_PATH = path.resolve(
  __dirname,
  '../../src/components/reservoirbalance/ValidationTierBadge.jsx',
);
const BACKUP_PATH = `${TARGET_PATH}.before-rb-capsule4b-tier-${Date.now()}.bak`;

// ─────────────────────────────────────────────────────────────────────────────
// PATCH ANCHORS (post-Capsule-3B state — RbCaseDetail.jsx is 693 lines)
// ─────────────────────────────────────────────────────────────────────────────

// Change 1: Add ValidationTierBadge import after RbDiagnosticPlots import.
const OLD_RBPLOTS_IMPORT = `import RbDiagnosticPlots from '@/components/reservoirbalance/RbDiagnosticPlots';`;
const NEW_AFTER_RBPLOTS_IMPORT = `import RbDiagnosticPlots from '@/components/reservoirbalance/RbDiagnosticPlots';
import ValidationTierBadge from '@/components/reservoirbalance/ValidationTierBadge';`;

// Change 2: Overview tab "Last result" tile — add badge under the headline.
// Anchor on the existing CardContent paragraph.
const OLD_OVERVIEW_RESULT_TILE = `              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {lastResult
                    ? \`\${caseData.fluid_system === 'gas' ? 'OGIP' : 'OOIP'} estimate\`
                    : 'No runs yet'}
                </p>
              </CardContent>`;

const NEW_OVERVIEW_RESULT_TILE = `              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {lastResult
                    ? \`\${caseData.fluid_system === 'gas' ? 'OGIP' : 'OOIP'} estimate\`
                    : 'No runs yet'}
                </p>
                {lastResult?.validation_tier && (
                  <div className="mt-2">
                    <ValidationTierBadge
                      tier={lastResult.validation_tier}
                      reference={lastResult.validation_reference}
                      tolerancePct={lastResult.validation_tolerance_pct}
                      size="sm"
                    />
                  </div>
                )}
              </CardContent>`;

// Change 3: Run tab result card header — swap CheckCircle2 for tier badge
// (with CheckCircle2 fallback for legacy rows without validation_tier).
const OLD_RUN_RESULT_HEADER_ICON = `                    <CardDescription>
                      Drive mechanism:{' '}
                      <span className="font-medium">
                        {lastResult.drive_mechanism?.replace(/_/g, ' ')}
                      </span>
                      {' • '}
                      Aquifer:{' '}
                      <span className="font-medium">
                        {lastResult.aquifer_strength}
                      </span>
                    </CardDescription>
                  </div>
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>`;

const NEW_RUN_RESULT_HEADER_ICON = `                    <CardDescription>
                      Drive mechanism:{' '}
                      <span className="font-medium">
                        {lastResult.drive_mechanism?.replace(/_/g, ' ')}
                      </span>
                      {' • '}
                      Aquifer:{' '}
                      <span className="font-medium">
                        {lastResult.aquifer_strength}
                      </span>
                    </CardDescription>
                  </div>
                  {lastResult.validation_tier ? (
                    <ValidationTierBadge
                      tier={lastResult.validation_tier}
                      reference={lastResult.validation_reference}
                      tolerancePct={lastResult.validation_tolerance_pct}
                    />
                  ) : (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  )}
                </div>`;

// Sentinel for idempotency detection
const PATCHED_SENTINEL = `import ValidationTierBadge from '@/components/reservoirbalance/ValidationTierBadge';`;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function readFile() {
  if (!fs.existsSync(TARGET_PATH)) {
    throw new Error(`RbCaseDetail.jsx not found at ${TARGET_PATH}`);
  }
  return fs.readFileSync(TARGET_PATH, 'utf8');
}

function checkPrerequisite() {
  // Hard prerequisite: ValidationTierBadge.jsx (Artifact 1 from Capsule 4B)
  // must exist. Otherwise the import this patch adds would fail at build time.
  if (!fs.existsSync(BADGE_COMPONENT_PATH)) {
    throw new Error(
      `Prerequisite missing: ValidationTierBadge.jsx not found at ${BADGE_COMPONENT_PATH}. Deploy Capsule 4B Artifact 1 (ValidationTierBadge.jsx) before running this patch.`,
    );
  }
}

function detectState(content) {
  // Prerequisite check: Capsule 3B Artifact 3 (Plots tab) must be applied,
  // which proves Capsule 3A artifacts also landed.
  if (!content.includes(`import RbDiagnosticPlots from '@/components/reservoirbalance/RbDiagnosticPlots';`)) {
    throw new Error(
      'Prerequisite missing: RbDiagnosticPlots import not found. Apply Capsule 3B Artifact 3 (Plots tab patch) before this patch. Expected baseline is post-Capsule-3B (693 lines).',
    );
  }

  if (content.includes(PATCHED_SENTINEL)) {
    return 'patched';
  }

  if (
    content.includes(OLD_RBPLOTS_IMPORT) &&
    content.includes(OLD_OVERVIEW_RESULT_TILE) &&
    content.includes(OLD_RUN_RESULT_HEADER_ICON)
  ) {
    return 'unpatched';
  }

  const missing = [];
  if (!content.includes(OLD_RBPLOTS_IMPORT)) missing.push('RbDiagnosticPlots import line');
  if (!content.includes(OLD_OVERVIEW_RESULT_TILE)) missing.push('Overview Last-result tile block');
  if (!content.includes(OLD_RUN_RESULT_HEADER_ICON)) missing.push('Run-result header icon block');
  throw new Error(
    `Could not detect baseline state. Missing anchors: ${missing.join(', ')}. File may have been hand-edited or Capsule 3B not fully applied.`,
  );
}

function applyPatch(content) {
  let next = content;
  const summary = {
    badge_import_added: false,
    overview_tile_badge_added: false,
    run_header_badge_added: false,
  };

  // Change 1
  next = next.replace(OLD_RBPLOTS_IMPORT, NEW_AFTER_RBPLOTS_IMPORT);
  summary.badge_import_added = true;

  // Change 2
  next = next.replace(OLD_OVERVIEW_RESULT_TILE, NEW_OVERVIEW_RESULT_TILE);
  summary.overview_tile_badge_added = true;

  // Change 3
  next = next.replace(OLD_RUN_RESULT_HEADER_ICON, NEW_RUN_RESULT_HEADER_ICON);
  summary.run_header_badge_added = true;

  return { next, summary };
}

function verifyPatched(content) {
  if (!content.includes(PATCHED_SENTINEL)) {
    throw new Error('Verify failed: ValidationTierBadge import sentinel not present after patch.');
  }
  const badgeUsages = (content.match(/<ValidationTierBadge/g) || []).length;
  if (badgeUsages < 2) {
    throw new Error(`Verify failed: expected at least 2 <ValidationTierBadge> usages, found ${badgeUsages}.`);
  }
  // The fallback CheckCircle2 should still be in the file (it now lives inside
  // a conditional, not as the sole icon).
  if (!content.includes('<CheckCircle2 className="h-6 w-6 text-green-500" />')) {
    throw new Error('Verify failed: CheckCircle2 fallback (for legacy rows) is missing.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Reservoir Balance — Capsule 4B — Tier badge patch');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target: ${TARGET_PATH}`);
  console.log('');

  checkPrerequisite();
  console.log('✓ Prerequisite passed: ValidationTierBadge.jsx exists.');

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
  console.log('Applying patch...');
  const { next, summary } = applyPatch(original);

  console.log('');
  console.log('Verifying result...');
  verifyPatched(next);
  console.log('✓ Verify passed.');

  console.log('');
  console.log('Writing patched file...');
  fs.writeFileSync(TARGET_PATH, next, 'utf8');

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ValidationTierBadge import added:    ${summary.badge_import_added ? 'YES' : 'NO'}`);
  console.log(`  Overview Last-result tile badge:     ${summary.overview_tile_badge_added ? 'YES' : 'NO'}`);
  console.log(`  Run tab result header badge:         ${summary.run_header_badge_added ? 'YES' : 'NO'}`);
  console.log(`  Bytes before:                        ${original.length}`);
  console.log(`  Bytes after:                         ${next.length}`);
  console.log(`  Net change:                          ${next.length - original.length > 0 ? '+' : ''}${next.length - original.length}`);
  console.log('');
  console.log('✓ Patch applied successfully.');
  console.log('');
  console.log('Next: hard-reload the case detail page to see the tier badges.');
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
