#!/usr/bin/env node
/**
 * Reservoir Balance — Phase 2 — EnergyBalance.jsx Neutralization Patch
 * =====================================================================
 *
 * File: tools/patches/2026-05-13_energy_balance_neutralize.cjs
 *
 * Purpose:
 *   The original EnergyBalance.jsx imports `mbalCalculations` from
 *   `@/utils/mbalCalculations` — a file that was deleted during the Horizons
 *   migration. The component is currently a build-time hazard.
 *
 *   Phase 2 does NOT mount EnergyBalance.jsx (the case detail page shows it
 *   as a Phase 3 preview placeholder), but the broken import would still fail
 *   if anything pulled the file into the module graph.
 *
 *   This patch:
 *     1. Removes the dead import line
 *     2. Replaces the `handleRunModel` body with a friendly placeholder toast
 *        directing users to the Run tab on the case detail page
 *
 *   Phase 3 will rebuild handleRunModel as an async Edge Function invocation.
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-13_energy_balance_neutralize.cjs
 *
 * Safety:
 *   - Detects baseline state by content (not line number)
 *   - Detects already-patched state (idempotent — exits cleanly on re-run)
 *   - Writes a timestamped backup before modifying
 *   - Verifies brace balance after patching
 *   - Aborts with descriptive error if anything looks wrong
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_PATH = path.resolve(
  __dirname,
  '../../src/components/reservoirbalance/EnergyBalance.jsx',
);

const BACKUP_PATH = `${TARGET_PATH}.before-rb-phase2-${Date.now()}.bak`;

// ─────────────────────────────────────────────────────────────────────────────
// BASELINE PATTERNS (exact text we expect to find)
// ─────────────────────────────────────────────────────────────────────────────

const OLD_IMPORT_LINE =
  "import { mbalCalculations } from '@/utils/mbalCalculations';";

// We delete the import line; we don't need a NEW_IMPORT replacement.

// The full handleRunModel function body. Match this exactly to be safe.
const OLD_HANDLE_RUN_MODEL = `const handleRunModel = useCallback(() => {
    if (!productionData || !pressureData || !pvtData) {
      toast({
        title: 'Missing Data',
        description: 'Please ensure Production, Pressure, and PVT data are loaded.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      try {
        const results = mbalCalculations({ productionData, pressureData, pvtData, aquiferResults });
        onResultsChange(results);
        
        if (results.warnings && results.warnings.length > 0) {
            results.warnings.forEach(warning => {
                toast({
                    title: 'Analysis Warning',
                    description: warning,
                    variant: 'default',
                    duration: 6000,
                });
            });
        } else {
            toast({
              title: 'Material Balance Calculated',
              description: \`OOIP estimated at \${(results.ooip / 1e6).toFixed(2)} MMSTB.\`,
            });
        }
      } catch (error) {
        toast({
          title: 'Calculation Error',
          description: error.message,
          variant: 'destructive',
        });
        onResultsChange(null);
      } finally {
        setIsLoading(false);
      }
    }, 500);
  }, [productionData, pressureData, pvtData, aquiferResults, toast, onResultsChange]);`;

// Phase 2 placeholder: keep the same function name and signature so the JSX
// (Button onClick={handleRunModel}) still binds. Body is a no-op + helpful toast.
const NEW_HANDLE_RUN_MODEL = `const handleRunModel = useCallback(() => {
    // Phase 2 placeholder. This component is not yet wired to the new
    // Reservoir Balance engine. Use the Run tab on the case detail page
    // (/dashboard/apps/reservoir/reservoir-balance/cases/:caseId) instead.
    // Phase 3 will rebuild this with an async invocation of the calculate-mbal
    // Edge Function.
    setIsLoading(true);
    toast({
      title: 'Not yet wired',
      description: 'This panel will be connected to the new engine in Phase 3. For now, open a case from the Reservoir Balance app and use the Run tab.',
      variant: 'default',
      duration: 7000,
    });
    setTimeout(() => setIsLoading(false), 400);
  }, [toast]);`;

// Sentinel string we leave behind so the idempotency check has something stable
// to look for. It lives inside the new function as a comment.
const PATCHED_SENTINEL = 'Phase 2 placeholder. This component is not yet wired';

// ─────────────────────────────────────────────────────────────────────────────
// PATCH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function readFile() {
  if (!fs.existsSync(TARGET_PATH)) {
    throw new Error(`EnergyBalance.jsx not found at ${TARGET_PATH}`);
  }
  return fs.readFileSync(TARGET_PATH, 'utf8');
}

function detectState(content) {
  const hasOldImport = content.includes(OLD_IMPORT_LINE);
  const hasOldRunModel = content.includes(OLD_HANDLE_RUN_MODEL);
  const isPatched = content.includes(PATCHED_SENTINEL);

  if (isPatched && !hasOldImport && !hasOldRunModel) {
    return 'patched';
  }
  if (hasOldImport && hasOldRunModel) {
    return 'unpatched';
  }
  if (hasOldImport && !hasOldRunModel) {
    throw new Error(
      'Partial state: dead import present but handleRunModel does not match expected baseline. File may have been hand-edited.',
    );
  }
  if (!hasOldImport && hasOldRunModel) {
    throw new Error(
      'Partial state: handleRunModel present but dead import already removed. File may have been hand-edited.',
    );
  }
  if (isPatched && (hasOldImport || hasOldRunModel)) {
    throw new Error(
      'Inconsistent state: patched sentinel present but old code also present. Manual review required.',
    );
  }
  throw new Error(
    'Could not detect baseline state. Expected to find:\n  ' +
      OLD_IMPORT_LINE +
      '\nand the handleRunModel useCallback body matching diagnostic output.',
  );
}

function checkBraceBalance(src) {
  let braces = 0;
  let parens = 0;
  let brackets = 0;
  let inString = false;
  let inComment = false;
  let inLineComment = false;
  let stringChar = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inComment) {
      if (c === '*' && next === '/') {
        inComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === '{') braces++;
    else if (c === '}') braces--;
    if (c === '(') parens++;
    else if (c === ')') parens--;
    if (c === '[') brackets++;
    else if (c === ']') brackets--;
  }
  return { braces, parens, brackets };
}

function applyPatch(content) {
  let next = content;
  const summary = {
    import_removed: false,
    handle_run_model_replaced: false,
  };

  // ─── Stage 1: remove the dead import line ───
  if (!next.includes(OLD_IMPORT_LINE)) {
    throw new Error('Stage 1 failed: dead import line not found.');
  }
  // Remove the import along with its trailing newline.
  // Look for the line including its trailing \n.
  const lineWithNewline = OLD_IMPORT_LINE + '\n';
  if (next.includes(lineWithNewline)) {
    next = next.replace(lineWithNewline, '');
  } else {
    // No trailing newline (file might end with the import). Just remove the bare line.
    next = next.replace(OLD_IMPORT_LINE, '');
  }
  summary.import_removed = true;

  // ─── Stage 2: replace handleRunModel ───
  if (!next.includes(OLD_HANDLE_RUN_MODEL)) {
    throw new Error(
      'Stage 2 failed: handleRunModel useCallback body did not match expected baseline. ' +
        'Aborting (Stage 1 was already applied in memory but no file was written).',
    );
  }
  next = next.replace(OLD_HANDLE_RUN_MODEL, NEW_HANDLE_RUN_MODEL);
  summary.handle_run_model_replaced = true;

  return { next, summary };
}

function verifyPatched(content) {
  if (content.includes(OLD_IMPORT_LINE)) {
    throw new Error('Verify failed: dead import still present after patch.');
  }
  if (content.includes('mbalCalculations(')) {
    throw new Error(
      'Verify failed: a call to mbalCalculations(...) is still present in the file.',
    );
  }
  if (!content.includes(PATCHED_SENTINEL)) {
    throw new Error('Verify failed: patched sentinel not found.');
  }
  // Make sure useCallback is still being called with a dependency array
  if (!content.includes('}, [toast]);')) {
    throw new Error(
      'Verify failed: new handleRunModel dependency array not found. ' +
        'Replacement may not have landed correctly.',
    );
  }
  // Brace balance
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
  console.log('Reservoir Balance — EnergyBalance.jsx neutralization');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target: ${TARGET_PATH}`);
  console.log('');

  const original = readFile();
  console.log(`Read ${original.length} bytes.`);

  const baseBraces = checkBraceBalance(original);
  if (
    baseBraces.braces !== 0 ||
    baseBraces.parens !== 0 ||
    baseBraces.brackets !== 0
  ) {
    throw new Error(
      `Baseline brace balance is already off — refusing to patch. ` +
        `braces=${baseBraces.braces}, parens=${baseBraces.parens}, brackets=${baseBraces.brackets}`,
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
  console.log(
    `  Dead import removed:        ${summary.import_removed ? 'YES' : 'NO'}`,
  );
  console.log(
    `  handleRunModel replaced:    ${summary.handle_run_model_replaced ? 'YES' : 'NO'}`,
  );
  console.log(`  Bytes before:               ${original.length}`);
  console.log(`  Bytes after:                ${next.length}`);
  console.log(
    `  Net change:                 ${next.length - original.length > 0 ? '+' : ''}${next.length - original.length}`,
  );
  console.log('');
  console.log('✓ Patch applied successfully.');
  console.log('');
  console.log('Note: this component is still NOT mounted in Phase 2.');
  console.log('It is shown as a "Phase 3 preview" placeholder card on the');
  console.log('case detail page. Phase 3 will rebuild handleRunModel as an');
  console.log('async invocation of the calculate-mbal Edge Function.');
}

try {
  main();
} catch (err) {
  console.error('');
  console.error('✗ Patch failed:');
  console.error(`  ${err.message}`);
  console.error('');
  console.error(
    'No changes were written to the source file. If a backup was made, the original is intact.',
  );
  process.exit(1);
}
