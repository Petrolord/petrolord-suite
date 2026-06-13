#!/usr/bin/env node
/**
 * Reservoir Balance — Phase 3 Capsule 3B — RbCaseDetail.jsx Plots tab patch
 * =========================================================================
 *
 * File: tools/patches/2026-05-15_rb_case_detail_plots_tab.cjs
 *
 * Purpose:
 *   Mount the RbDiagnosticPlots component as a new tab in RbCaseDetail.jsx,
 *   between the Run tab and the Advanced tab. Case detail goes from 6 tabs
 *   to 7 tabs.
 *
 * Prerequisite: Capsule 3A Artifact 9 (DataHub mount + state cleanup) must
 * be applied. This patch verifies the DataHub import exists before proceeding,
 * which proves Artifact 9 landed (and by transitive dependency, Artifacts 5
 * and 7 also landed).
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-15_rb_case_detail_plots_tab.cjs
 *
 * Safety:
 *   - Idempotent (detects already-patched state via sentinel)
 *   - Backs up the file before modifying
 *   - Verifies sentinel after patch
 *   - Aborts cleanly if baseline can't be matched
 *   - Aborts cleanly if prerequisite (DataHub import) is missing
 *
 * Four changes:
 *   1. Add RbDiagnosticPlots import (after DataHub import line)
 *   2. Change TabsList from grid-cols-6 to grid-cols-7
 *   3. Insert <TabsTrigger value="plots"> between Run trigger and Advanced trigger
 *   4. Insert <TabsContent value="plots">...RbDiagnosticPlots...</TabsContent>
 *      between Run TabsContent and Advanced TabsContent
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_PATH = path.resolve(
  __dirname,
  '../../src/pages/apps/reservoir-balance/RbCaseDetail.jsx',
);
const BACKUP_PATH = `${TARGET_PATH}.before-rb-phase3b-plots-${Date.now()}.bak`;

// ─────────────────────────────────────────────────────────────────────────────
// PATCH ANCHORS (post-Capsule-3A state)
// ─────────────────────────────────────────────────────────────────────────────

// Change 1: Add RbDiagnosticPlots import after DataHub import
const OLD_DATAHUB_IMPORT = `import DataHub from '@/components/reservoirbalance/DataHub';`;
const NEW_AFTER_DATAHUB_IMPORT = `import DataHub from '@/components/reservoirbalance/DataHub';
import RbDiagnosticPlots from '@/components/reservoirbalance/RbDiagnosticPlots';`;

// Change 2: Update TabsList grid-cols-6 → grid-cols-7
const OLD_TABS_LIST_GRID = `<TabsList className="grid w-full grid-cols-6">`;
const NEW_TABS_LIST_GRID = `<TabsList className="grid w-full grid-cols-7">`;

// Change 3: Insert Plots TabsTrigger between Run and Advanced.
// Anchor is the existing Run TabsTrigger followed by Advanced TabsTrigger.
const OLD_RUN_TO_ADVANCED_TRIGGERS = `          <TabsTrigger value="run">
            <Play className="mr-2 h-4 w-4" />
            Run
          </TabsTrigger>
          <TabsTrigger value="advanced">`;

const NEW_RUN_TO_ADVANCED_TRIGGERS = `          <TabsTrigger value="run">
            <Play className="mr-2 h-4 w-4" />
            Run
          </TabsTrigger>
          <TabsTrigger value="plots">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Plots
          </TabsTrigger>
          <TabsTrigger value="advanced">`;

// Change 4: Insert Plots TabsContent between Run and Advanced TabsContent.
// Anchor is the closing </TabsContent> of the Run section followed by the
// Advanced comment block opening.
const OLD_RUN_END_TO_ADVANCED_START = `        </TabsContent>

        {/* ───────────────── ADVANCED (Phase 3 preview) ───────────────── */}
        <TabsContent value="advanced" className="mt-6">`;

const NEW_RUN_END_TO_ADVANCED_START = `        </TabsContent>

        {/* ───────────────── PLOTS (Phase 3 Capsule 3B) ───────────────── */}
        <TabsContent value="plots" className="mt-6">
          <RbDiagnosticPlots
            caseId={caseId}
            caseData={caseData}
          />
        </TabsContent>

        {/* ───────────────── ADVANCED (Phase 3 preview) ───────────────── */}
        <TabsContent value="advanced" className="mt-6">`;

// Sentinel for idempotency detection
const PATCHED_SENTINEL = 'PLOTS (Phase 3 Capsule 3B)';

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
  // Hard-required prerequisite: Capsule 3A Artifact 9 (DataHub import) must
  // be applied. This proves the case detail page is in post-Capsule-3A state.
  if (!content.includes(OLD_DATAHUB_IMPORT)) {
    throw new Error(
      'Prerequisite missing: DataHub import not found. Apply Capsule 3A artifacts (5, 7, and 9) before this patch. The expected state is post-Capsule-3A — six tabs visible (Overview / Data / PVT / Aquifer / Run / Advanced).',
    );
  }

  if (content.includes(PATCHED_SENTINEL)) {
    return 'patched';
  }

  if (
    content.includes(OLD_TABS_LIST_GRID) &&
    content.includes(OLD_RUN_TO_ADVANCED_TRIGGERS) &&
    content.includes(OLD_RUN_END_TO_ADVANCED_START)
  ) {
    return 'unpatched';
  }

  const missing = [];
  if (!content.includes(OLD_TABS_LIST_GRID)) missing.push('TabsList (grid-cols-6)');
  if (!content.includes(OLD_RUN_TO_ADVANCED_TRIGGERS)) missing.push('Run-to-Advanced triggers block');
  if (!content.includes(OLD_RUN_END_TO_ADVANCED_START)) missing.push('Run-end-to-Advanced-start boundary');
  throw new Error(
    `Could not detect baseline state. Missing anchors: ${missing.join(', ')}. File may have been hand-edited or Capsule 3A not fully applied.`,
  );
}

function applyPatch(content) {
  let next = content;
  const summary = {
    plots_import_added: false,
    tabs_list_grid_extended: false,
    plots_trigger_inserted: false,
    plots_content_inserted: false,
  };

  // Change 1: RbDiagnosticPlots import
  next = next.replace(OLD_DATAHUB_IMPORT, NEW_AFTER_DATAHUB_IMPORT);
  summary.plots_import_added = true;

  // Change 2: grid-cols-6 → grid-cols-7
  next = next.replace(OLD_TABS_LIST_GRID, NEW_TABS_LIST_GRID);
  summary.tabs_list_grid_extended = true;

  // Change 3: Plots TabsTrigger inserted between Run and Advanced
  next = next.replace(OLD_RUN_TO_ADVANCED_TRIGGERS, NEW_RUN_TO_ADVANCED_TRIGGERS);
  summary.plots_trigger_inserted = true;

  // Change 4: Plots TabsContent inserted between Run and Advanced
  next = next.replace(OLD_RUN_END_TO_ADVANCED_START, NEW_RUN_END_TO_ADVANCED_START);
  summary.plots_content_inserted = true;

  return { next, summary };
}

function verifyPatched(content) {
  if (!content.includes(PATCHED_SENTINEL)) {
    throw new Error('Verify failed: sentinel not present after patch.');
  }
  if (!content.includes(`import RbDiagnosticPlots from '@/components/reservoirbalance/RbDiagnosticPlots';`)) {
    throw new Error('Verify failed: RbDiagnosticPlots import missing.');
  }
  if (!content.includes(`<TabsTrigger value="plots">`)) {
    throw new Error('Verify failed: Plots TabsTrigger missing.');
  }
  if (!content.includes(`<TabsContent value="plots"`)) {
    throw new Error('Verify failed: Plots TabsContent missing.');
  }
  if (!content.includes('grid-cols-7')) {
    throw new Error('Verify failed: TabsList grid-cols-7 not present.');
  }
  if (content.includes('<TabsList className="grid w-full grid-cols-6">')) {
    throw new Error('Verify failed: TabsList still grid-cols-6 (should be -7).');
  }
  if (!content.includes('<RbDiagnosticPlots')) {
    throw new Error('Verify failed: RbDiagnosticPlots JSX usage missing.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Reservoir Balance — Phase 3B — RbCaseDetail Plots tab');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
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
  console.log(`  RbDiagnosticPlots import added:    ${summary.plots_import_added ? 'YES' : 'NO'}`);
  console.log(`  TabsList grid-cols-7:              ${summary.tabs_list_grid_extended ? 'YES' : 'NO'}`);
  console.log(`  Plots TabsTrigger inserted:        ${summary.plots_trigger_inserted ? 'YES' : 'NO'}`);
  console.log(`  Plots TabsContent inserted:        ${summary.plots_content_inserted ? 'YES' : 'NO'}`);
  console.log(`  Bytes before:                      ${original.length}`);
  console.log(`  Bytes after:                       ${next.length}`);
  console.log(`  Net change:                        ${next.length - original.length > 0 ? '+' : ''}${next.length - original.length}`);
  console.log('');
  console.log('✓ Patch applied successfully.');
  console.log('');
  console.log('Next: restart dev server to pick up the new tab.');
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
