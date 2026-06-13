#!/usr/bin/env node
/**
 * Reservoir Balance — Phase 3 Capsule 3A — RbCaseDetail.jsx Aquifer tab patch
 * ============================================================================
 *
 * File: tools/patches/2026-05-14_rb_case_detail_aquifer_tab.cjs
 *
 * Purpose:
 *   Mount the rewritten AquiferModel component as a new tab in RbCaseDetail.jsx,
 *   between the PVT tab and the Run tab. The handleRun() wiring for aquifer
 *   was already added in Artifact 5 (it reads aquifer_model and aquifer_params
 *   from the case-default config), so this patch is purely UI mounting.
 *
 * Prerequisite: Artifact 5 (PVT tab patch) must already be applied. This
 * patch anchors on post-Artifact-5 state (911 lines, grid-cols-5 TabsList).
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-14_rb_case_detail_aquifer_tab.cjs
 *
 * Safety:
 *   - Idempotent (detects already-patched state)
 *   - Backs up the file before modifying
 *   - Verifies sentinel after patch
 *   - Aborts cleanly if baseline can't be matched
 *
 * Four changes:
 *   1. Add AquiferModel import (after PvtRock import line)
 *   2. Change TabsList from 5 cols to 6; insert Aquifer TabsTrigger between PVT and Run
 *   3. Insert <TabsContent value="aquifer">...AquiferModel...</TabsContent>
 *      between the PVT and Run tab blocks
 *   4. Remove the "Aquifer model" PreviewCard from the Advanced tab
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_PATH = path.resolve(
  __dirname,
  '../../src/pages/apps/reservoir-balance/RbCaseDetail.jsx',
);
const BACKUP_PATH = `${TARGET_PATH}.before-rb-phase3a-aquifer-${Date.now()}.bak`;

// ─────────────────────────────────────────────────────────────────────────────
// PATCH ANCHORS (post-Artifact-5 state)
// ─────────────────────────────────────────────────────────────────────────────

// Change 1: Add AquiferModel import after PvtRock import
const OLD_PVTROCK_IMPORT = `import PvtRock from '@/components/reservoirbalance/PvtRock';`;
const NEW_AFTER_PVTROCK_IMPORT = `import PvtRock from '@/components/reservoirbalance/PvtRock';
import AquiferModel from '@/components/reservoirbalance/AquiferModel';`;

// Change 2: TabsList grid-cols-5 → 6; insert Aquifer TabsTrigger between PVT and Run.
// Anchor is the existing post-Artifact-5 PVT TabsTrigger followed by Run TabsTrigger.
const OLD_PVT_TO_RUN_TRIGGERS = `          <TabsTrigger value="pvt">
            <Settings className="mr-2 h-4 w-4" />
            PVT
          </TabsTrigger>
          <TabsTrigger value="run">
            <Play className="mr-2 h-4 w-4" />
            Run
          </TabsTrigger>`;

const NEW_PVT_TO_RUN_TRIGGERS = `          <TabsTrigger value="pvt">
            <Settings className="mr-2 h-4 w-4" />
            PVT
          </TabsTrigger>
          <TabsTrigger value="aquifer">
            <TrendingUp className="mr-2 h-4 w-4" />
            Aquifer
          </TabsTrigger>
          <TabsTrigger value="run">
            <Play className="mr-2 h-4 w-4" />
            Run
          </TabsTrigger>`;

// Change 2b: Update TabsList grid-cols-5 → grid-cols-6.
// We do this as a separate replace to keep it independent of the trigger insertion.
const OLD_TABS_LIST_GRID = `<TabsList className="grid w-full grid-cols-5">`;
const NEW_TABS_LIST_GRID = `<TabsList className="grid w-full grid-cols-6">`;

// Change 3: Insert Aquifer TabsContent block. Anchor is the closing tag of
// the PVT TabsContent followed by the opening of the Run TabsContent.
// The PVT TabsContent (added by Artifact 5) ends with </TabsContent>; the
// Run section begins with the existing comment + opening tag.
const OLD_PVT_END_TO_RUN_START = `        </TabsContent>

        {/* ───────────────── RUN ───────────────── */}
        <TabsContent value="run" className="mt-6">`;

const NEW_PVT_END_TO_RUN_START = `        </TabsContent>

        {/* ───────────────── AQUIFER (Phase 3 Capsule 3A) ───────────────── */}
        <TabsContent value="aquifer" className="mt-6">
          <AquiferModel
            caseId={caseId}
            caseData={caseData}
            onConfigChange={() => {
              // Future hook: refresh anything that depends on saved aquifer model.
              // Phase 3: nothing here yet — Run tab re-reads on each invocation.
            }}
          />
        </TabsContent>

        {/* ───────────────── RUN ───────────────── */}
        <TabsContent value="run" className="mt-6">`;

// Change 4: Remove the "Aquifer model" PreviewCard from the Advanced tab.
// Post-Artifact-5, the Aquifer card is the first card (PVT one was removed).
// Anchor on the Aquifer card and the next card (Contacts tracker) that
// stays.
const OLD_AQUIFER_PREVIEW_CARD = `            <PreviewCard
              icon={TrendingUp}
              title="Aquifer model"
              description="Pot, Fetkovich, Carter-Tracy. With optional history matching."
            />
            <PreviewCard
              icon={Layers}
              title="Contacts tracker"`;

const NEW_AFTER_REMOVING_AQUIFER_CARD = `            <PreviewCard
              icon={Layers}
              title="Contacts tracker"`;

// Sentinel for idempotency detection
const PATCHED_SENTINEL = 'AQUIFER (Phase 3 Capsule 3A)';

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
  // Hard-required prerequisite: Artifact 5 (PVT tab patch) must be applied.
  if (!content.includes(OLD_PVTROCK_IMPORT)) {
    throw new Error(
      'Prerequisite missing: PvtRock import not found. Apply patch_rb_case_detail_pvt_tab.cjs (Artifact 5) before this patch.',
    );
  }

  if (content.includes(PATCHED_SENTINEL)) {
    return 'patched';
  }

  if (
    content.includes(OLD_PVT_TO_RUN_TRIGGERS) &&
    content.includes(OLD_TABS_LIST_GRID) &&
    content.includes(OLD_PVT_END_TO_RUN_START) &&
    content.includes(OLD_AQUIFER_PREVIEW_CARD)
  ) {
    return 'unpatched';
  }

  const missing = [];
  if (!content.includes(OLD_PVT_TO_RUN_TRIGGERS)) missing.push('PVT-to-Run triggers block');
  if (!content.includes(OLD_TABS_LIST_GRID)) missing.push('TabsList (grid-cols-5)');
  if (!content.includes(OLD_PVT_END_TO_RUN_START)) missing.push('PVT-end-to-Run-start boundary');
  if (!content.includes(OLD_AQUIFER_PREVIEW_CARD)) missing.push('Aquifer PreviewCard');
  throw new Error(
    `Could not detect baseline state. Missing anchors: ${missing.join(', ')}. File may have been hand-edited or Artifact 5 not yet applied.`,
  );
}

function applyPatch(content) {
  let next = content;
  const summary = {
    aquifermodel_import_added: false,
    aquifer_trigger_inserted: false,
    tabs_list_grid_extended: false,
    aquifer_content_inserted: false,
    aquifer_preview_card_removed: false,
  };

  // Change 1: AquiferModel import
  next = next.replace(OLD_PVTROCK_IMPORT, NEW_AFTER_PVTROCK_IMPORT);
  summary.aquifermodel_import_added = true;

  // Change 2: Aquifer TabsTrigger inserted between PVT and Run
  next = next.replace(OLD_PVT_TO_RUN_TRIGGERS, NEW_PVT_TO_RUN_TRIGGERS);
  summary.aquifer_trigger_inserted = true;

  // Change 2b: grid-cols-5 → grid-cols-6
  next = next.replace(OLD_TABS_LIST_GRID, NEW_TABS_LIST_GRID);
  summary.tabs_list_grid_extended = true;

  // Change 3: insert Aquifer TabsContent between PVT and Run
  next = next.replace(OLD_PVT_END_TO_RUN_START, NEW_PVT_END_TO_RUN_START);
  summary.aquifer_content_inserted = true;

  // Change 4: remove Aquifer PreviewCard from Advanced
  next = next.replace(OLD_AQUIFER_PREVIEW_CARD, NEW_AFTER_REMOVING_AQUIFER_CARD);
  summary.aquifer_preview_card_removed = true;

  return { next, summary };
}

function verifyPatched(content) {
  if (!content.includes(PATCHED_SENTINEL)) {
    throw new Error('Verify failed: sentinel not present after patch.');
  }
  if (!content.includes(`import AquiferModel from '@/components/reservoirbalance/AquiferModel';`)) {
    throw new Error('Verify failed: AquiferModel import missing.');
  }
  if (!content.includes(`<TabsTrigger value="aquifer">`)) {
    throw new Error('Verify failed: Aquifer TabsTrigger missing.');
  }
  if (!content.includes(`<TabsContent value="aquifer"`)) {
    throw new Error('Verify failed: Aquifer TabsContent missing.');
  }
  if (!content.includes('grid-cols-6')) {
    throw new Error('Verify failed: TabsList grid-cols-6 not present.');
  }
  if (content.includes('<TabsList className="grid w-full grid-cols-5">')) {
    throw new Error('Verify failed: TabsList still grid-cols-5.');
  }
  if (content.includes('description="Pot, Fetkovich, Carter-Tracy. With optional history matching."')) {
    throw new Error('Verify failed: old Aquifer PreviewCard description still present.');
  }
  if (!content.includes('<AquiferModel')) {
    throw new Error('Verify failed: AquiferModel JSX usage missing.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Reservoir Balance — Phase 3A — RbCaseDetail Aquifer tab');
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
  console.log(`  AquiferModel import added:     ${summary.aquifermodel_import_added ? 'YES' : 'NO'}`);
  console.log(`  Aquifer TabsTrigger inserted:  ${summary.aquifer_trigger_inserted ? 'YES' : 'NO'}`);
  console.log(`  TabsList grid-cols-6:          ${summary.tabs_list_grid_extended ? 'YES' : 'NO'}`);
  console.log(`  Aquifer TabsContent inserted:  ${summary.aquifer_content_inserted ? 'YES' : 'NO'}`);
  console.log(`  Aquifer PreviewCard removed:   ${summary.aquifer_preview_card_removed ? 'YES' : 'NO'}`);
  console.log(`  Bytes before:                  ${original.length}`);
  console.log(`  Bytes after:                   ${next.length}`);
  console.log(`  Net change:                    ${next.length - original.length > 0 ? '+' : ''}${next.length - original.length}`);
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
