#!/usr/bin/env node
/**
 * Reservoir Balance — Phase 3 Capsule 3A — RbCaseDetail.jsx PVT tab patch
 * ========================================================================
 *
 * File: tools/patches/2026-05-14_rb_case_detail_pvt_tab.cjs
 *
 * Purpose:
 *   Mount the rewritten PvtRock component as a new tab in RbCaseDetail.jsx,
 *   between the Data tab and the Run tab. Also rewire handleRun() to inherit
 *   PVT settings from the case-default config so user saves actually affect
 *   runs. Remove the "PVT & Rock" preview card from Advanced (no longer a
 *   preview — it's wired now).
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-14_rb_case_detail_pvt_tab.cjs
 *
 * Safety:
 *   - Idempotent (detects already-patched state)
 *   - Backs up the file before modifying
 *   - Verifies brace balance + sentinel after patch
 *   - Aborts cleanly if baseline can't be matched
 *
 * Four changes:
 *   1. Add PvtRock import
 *   2. Add getCaseDefaultConfig to the api import list
 *   3. Change TabsList from 4 cols to 5; insert PVT TabsTrigger
 *   4. Insert <TabsContent value="pvt">...PvtRock...</TabsContent> after Data tab
 *   5. Patch handleRun to read default config and inherit fields
 *   6. Remove the "PVT & Rock" PreviewCard from Advanced tab
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_PATH = path.resolve(
  __dirname,
  '../../src/pages/apps/reservoir-balance/RbCaseDetail.jsx',
);
const BACKUP_PATH = `${TARGET_PATH}.before-rb-phase3a-${Date.now()}.bak`;

// ─────────────────────────────────────────────────────────────────────────────
// PATCH ANCHORS (short, distinctive, exact-content baselines)
// ─────────────────────────────────────────────────────────────────────────────

// Change 1: add PvtRock import after the toast import line
const OLD_TOAST_IMPORT = `import { useToast } from '@/components/ui/use-toast';`;
const NEW_AFTER_TOAST_IMPORT = `import { useToast } from '@/components/ui/use-toast';
import PvtRock from '@/components/reservoirbalance/PvtRock';`;

// Change 2: extend the api import to include getCaseDefaultConfig
const OLD_API_IMPORT = `import {
  getCaseWithProductionData,
  updateCase,
  replaceProductionData,
  createRunConfig,
  runMBAL,
  listRuns,
  getResultByRunId,
} from './lib/api';`;

const NEW_API_IMPORT = `import {
  getCaseWithProductionData,
  updateCase,
  replaceProductionData,
  createRunConfig,
  runMBAL,
  listRuns,
  getResultByRunId,
  getCaseDefaultConfig,
} from './lib/api';`;

// Change 3: TabsList from 4 cols to 5; insert PVT TabsTrigger
const OLD_TABS_LIST = `        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            <Info className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="data">
            <Database className="mr-2 h-4 w-4" />
            Data
          </TabsTrigger>
          <TabsTrigger value="run">
            <Play className="mr-2 h-4 w-4" />
            Run
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <Sparkles className="mr-2 h-4 w-4" />
            Advanced
          </TabsTrigger>
        </TabsList>`;

const NEW_TABS_LIST = `        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">
            <Info className="mr-2 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="data">
            <Database className="mr-2 h-4 w-4" />
            Data
          </TabsTrigger>
          <TabsTrigger value="pvt">
            <Settings className="mr-2 h-4 w-4" />
            PVT
          </TabsTrigger>
          <TabsTrigger value="run">
            <Play className="mr-2 h-4 w-4" />
            Run
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <Sparkles className="mr-2 h-4 w-4" />
            Advanced
          </TabsTrigger>
        </TabsList>`;

// Change 4: Insert PVT TabsContent block right after Data tab closes (before Run tab opens)
const OLD_DATA_TO_RUN_BOUNDARY = `        </TabsContent>

        {/* ───────────────── RUN ───────────────── */}
        <TabsContent value="run" className="mt-6">`;

const NEW_DATA_TO_RUN_BOUNDARY = `        </TabsContent>

        {/* ───────────────── PVT (Phase 3 Capsule 3A) ───────────────── */}
        <TabsContent value="pvt" className="mt-6">
          <PvtRock
            caseId={caseId}
            caseData={caseData}
            onConfigChange={() => {
              // Future hook: refresh anything that depends on saved PVT.
              // Phase 3: nothing here yet — Run tab re-reads on each invocation.
            }}
          />
        </TabsContent>

        {/* ───────────────── RUN ───────────────── */}
        <TabsContent value="run" className="mt-6">`;

// Change 5: handleRun reads case-default config and inherits PVT fields
const OLD_HANDLE_RUN_CONFIG_CREATE = `    setRunning(true);

    // Create a fresh run config for this run (Phase 2 uses default params)
    const isGas = caseData.fluid_system === 'gas';
    const { data: runConfig, error: configErr } = await createRunConfig(caseId, {
      name: \`Run \${new Date().toISOString().slice(0, 19).replace('T', ' ')}\`,
      gas_specific_gravity: isGas ? 0.65 : 0.7,
      aquifer_model: caseData.has_aquifer ? 'pot' : 'none',
      solver_method: isGas ? 'pot_aquifer_plot' : 'havlena_odeh',
      formation_compressibility_psi: 6e-6,
      water_compressibility_psi: 3e-6,
    });`;

const NEW_HANDLE_RUN_CONFIG_CREATE = `    setRunning(true);

    // Phase 3: inherit PVT and rock settings from the case-default config
    // saved by PvtRock. Fall back to sensible defaults if no default exists.
    const isGas = caseData.fluid_system === 'gas';
    const { data: defaultCfg } = await getCaseDefaultConfig(caseId);

    const { data: runConfig, error: configErr } = await createRunConfig(caseId, {
      name: \`Run \${new Date().toISOString().slice(0, 19).replace('T', ' ')}\`,
      is_scenario: true, // mark this row as an executed run, not a default
      // PVT — inherit from saved default config
      oil_gravity_api: defaultCfg?.oil_gravity_api ?? null,
      gas_specific_gravity:
        defaultCfg?.gas_specific_gravity ?? (isGas ? 0.65 : 0.7),
      water_salinity_ppm: defaultCfg?.water_salinity_ppm ?? null,
      pvt_source: defaultCfg?.pvt_source ?? 'correlated',
      pvt_correlations: defaultCfg?.pvt_correlations ?? undefined,
      pvt_lab_table: defaultCfg?.pvt_lab_table ?? null,
      // Rock — inherit
      formation_compressibility_psi:
        defaultCfg?.formation_compressibility_psi ?? 6e-6,
      water_compressibility_psi:
        defaultCfg?.water_compressibility_psi ?? 3e-6,
      // Aquifer + solver — still hardcoded until Artifact 7 wires AquiferModel
      aquifer_model:
        defaultCfg?.aquifer_model ?? (caseData.has_aquifer ? 'pot' : 'none'),
      aquifer_params: defaultCfg?.aquifer_params ?? null,
      solver_method:
        defaultCfg?.solver_method ??
        (isGas ? 'pot_aquifer_plot' : 'havlena_odeh'),
    });`;

// Change 6: Remove the "PVT & Rock" PreviewCard from Advanced tab
const OLD_PVT_PREVIEW_CARD = `            <PreviewCard
              icon={Settings}
              title="PVT & Rock"
              description="Standing, Vasquez-Beggs, Glaso for oil. Hall-Yarborough, Dranchuk-Abou-Kassem for gas. Lab table upload."
            />
            <PreviewCard
              icon={TrendingUp}
              title="Aquifer model"`;

const NEW_AFTER_REMOVING_PVT_CARD = `            <PreviewCard
              icon={TrendingUp}
              title="Aquifer model"`;

// Sentinel for idempotency detection
const PATCHED_SENTINEL = 'PVT (Phase 3 Capsule 3A)';

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
    if (content.includes(OLD_TOAST_IMPORT) && !content.includes(NEW_AFTER_TOAST_IMPORT)) {
      // Partially patched: should not happen with our flow
      throw new Error(
        'Inconsistent state: PATCHED_SENTINEL present but new toast/PvtRock import missing.',
      );
    }
    return 'patched';
  }
  if (
    content.includes(OLD_API_IMPORT) &&
    content.includes(OLD_TABS_LIST) &&
    content.includes(OLD_DATA_TO_RUN_BOUNDARY) &&
    content.includes(OLD_HANDLE_RUN_CONFIG_CREATE) &&
    content.includes(OLD_PVT_PREVIEW_CARD)
  ) {
    return 'unpatched';
  }
  // Determine which baseline doesn't match — for diagnostic clarity
  const missing = [];
  if (!content.includes(OLD_API_IMPORT)) missing.push('api import block');
  if (!content.includes(OLD_TABS_LIST)) missing.push('TabsList (grid-cols-4)');
  if (!content.includes(OLD_DATA_TO_RUN_BOUNDARY)) missing.push('Data→Run boundary');
  if (!content.includes(OLD_HANDLE_RUN_CONFIG_CREATE)) missing.push('handleRun createRunConfig block');
  if (!content.includes(OLD_PVT_PREVIEW_CARD)) missing.push('PVT PreviewCard');
  throw new Error(
    `Could not detect baseline state. Missing anchors: ${missing.join(', ')}. File may have been hand-edited.`,
  );
}

function checkBraceBalance(src) {
  let braces = 0, parens = 0, brackets = 0;
  let inString = false, inComment = false, inLineComment = false, stringChar = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inComment) { if (c === '*' && next === '/') { inComment = false; i++; } continue; }
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inString = true; stringChar = c; continue; }
    if (c === '{') braces++; else if (c === '}') braces--;
    if (c === '(') parens++; else if (c === ')') parens--;
    if (c === '[') brackets++; else if (c === ']') brackets--;
  }
  return { braces, parens, brackets };
}

function applyPatch(content) {
  let next = content;
  const summary = {
    pvtrock_import_added: false,
    api_import_extended: false,
    tabs_list_extended: false,
    pvt_tab_content_inserted: false,
    handle_run_inherits: false,
    pvt_preview_card_removed: false,
  };

  // Change 1: PvtRock import
  if (!next.includes(OLD_TOAST_IMPORT)) {
    throw new Error('Stage 1: toast import line not found.');
  }
  next = next.replace(OLD_TOAST_IMPORT, NEW_AFTER_TOAST_IMPORT);
  summary.pvtrock_import_added = true;

  // Change 2: extend api import
  if (!next.includes(OLD_API_IMPORT)) {
    throw new Error('Stage 2: api import block not found.');
  }
  next = next.replace(OLD_API_IMPORT, NEW_API_IMPORT);
  summary.api_import_extended = true;

  // Change 3: TabsList grid-cols-4 → 5 and insert PVT TabsTrigger
  if (!next.includes(OLD_TABS_LIST)) {
    throw new Error('Stage 3: TabsList block not found.');
  }
  next = next.replace(OLD_TABS_LIST, NEW_TABS_LIST);
  summary.tabs_list_extended = true;

  // Change 4: insert PVT TabsContent between Data and Run
  if (!next.includes(OLD_DATA_TO_RUN_BOUNDARY)) {
    throw new Error('Stage 4: Data→Run boundary not found.');
  }
  next = next.replace(OLD_DATA_TO_RUN_BOUNDARY, NEW_DATA_TO_RUN_BOUNDARY);
  summary.pvt_tab_content_inserted = true;

  // Change 5: handleRun inherits from default config
  if (!next.includes(OLD_HANDLE_RUN_CONFIG_CREATE)) {
    throw new Error('Stage 5: handleRun createRunConfig block not found.');
  }
  next = next.replace(OLD_HANDLE_RUN_CONFIG_CREATE, NEW_HANDLE_RUN_CONFIG_CREATE);
  summary.handle_run_inherits = true;

  // Change 6: remove the PVT preview card from Advanced
  if (!next.includes(OLD_PVT_PREVIEW_CARD)) {
    throw new Error('Stage 6: PVT PreviewCard block not found.');
  }
  next = next.replace(OLD_PVT_PREVIEW_CARD, NEW_AFTER_REMOVING_PVT_CARD);
  summary.pvt_preview_card_removed = true;

  return { next, summary };
}

function verifyPatched(content) {
  if (!content.includes(PATCHED_SENTINEL)) {
    throw new Error('Verify failed: sentinel not present after patch.');
  }
  if (!content.includes(`import PvtRock from '@/components/reservoirbalance/PvtRock';`)) {
    throw new Error('Verify failed: PvtRock import missing.');
  }
  if (!content.includes('getCaseDefaultConfig,')) {
    throw new Error('Verify failed: getCaseDefaultConfig not added to api imports.');
  }
  if (!content.includes(`<TabsTrigger value="pvt">`)) {
    throw new Error('Verify failed: PVT TabsTrigger missing.');
  }
  if (!content.includes(`<TabsContent value="pvt"`)) {
    throw new Error('Verify failed: PVT TabsContent missing.');
  }
  if (!content.includes('grid-cols-5')) {
    throw new Error('Verify failed: TabsList grid-cols-5 not present.');
  }
  if (content.includes('grid-cols-4">')) {
    // Specifically the TabsList one; broader grid-cols-4 may live in other layout cards.
    // We have to be precise:
    if (content.includes('<TabsList className="grid w-full grid-cols-4">')) {
      throw new Error('Verify failed: TabsList still grid-cols-4.');
    }
  }
  if (content.includes('Standing, Vasquez-Beggs, Glaso for oil. Hall-Yarborough, Dranchuk-Abou-Kassem for gas.')) {
    throw new Error('Verify failed: old PVT PreviewCard description still present.');
  }
  if (!content.includes('is_scenario: true,')) {
    throw new Error('Verify failed: handleRun does not mark runs as is_scenario=true.');
  }
  const { braces, parens, brackets } = checkBraceBalance(content);
  if (braces !== 0 || parens !== 0 || brackets !== 0) {
    throw new Error(
      `Verify failed: brace balance off after patch. ` +
        `braces=${braces}, parens=${parens}, brackets=${brackets}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Reservoir Balance — Phase 3A — RbCaseDetail PVT tab');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target: ${TARGET_PATH}`);
  console.log('');

  const original = readFile();
  console.log(`Read ${original.length} bytes.`);

  const baseBraces = checkBraceBalance(original);
  if (baseBraces.braces || baseBraces.parens || baseBraces.brackets) {
    throw new Error(
      `Baseline brace balance is off — refusing to patch. ${JSON.stringify(baseBraces)}`,
    );
  }
  console.log('Baseline brace balance: OK');

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
  console.log(`  PvtRock import added:        ${summary.pvtrock_import_added ? 'YES' : 'NO'}`);
  console.log(`  api import extended:         ${summary.api_import_extended ? 'YES' : 'NO'}`);
  console.log(`  TabsList grid-cols-5:        ${summary.tabs_list_extended ? 'YES' : 'NO'}`);
  console.log(`  PVT TabsContent inserted:    ${summary.pvt_tab_content_inserted ? 'YES' : 'NO'}`);
  console.log(`  handleRun inherits config:   ${summary.handle_run_inherits ? 'YES' : 'NO'}`);
  console.log(`  PVT PreviewCard removed:     ${summary.pvt_preview_card_removed ? 'YES' : 'NO'}`);
  console.log(`  Bytes before:                ${original.length}`);
  console.log(`  Bytes after:                 ${next.length}`);
  console.log(`  Net change:                  ${next.length - original.length > 0 ? '+' : ''}${next.length - original.length}`);
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
