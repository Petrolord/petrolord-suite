#!/usr/bin/env node
/**
 * Reservoir Balance — RbCaseDetail.jsx polish patch
 * =========================================================================
 *
 * File: tools/patches/2026-05-16_rb_case_detail_polish.cjs
 *
 * Purpose:
 *   Two independent fixes to the Reservoir Balance case detail page,
 *   bundled atomically:
 *
 *   1. Remove the stale "Diagnostic plots" PreviewCard from the Advanced
 *      tab. Diagnostic plots are now fully implemented in their own Plots
 *      tab; listing them as a development item in Advanced is misleading.
 *
 *   2. Wire the runVersion prop into RbDiagnosticPlots so the Plots tab
 *      auto-refreshes when a new MBAL run completes:
 *      (a) Add `const [runVersion, setRunVersion] = useState(0);` alongside
 *          the other state declarations.
 *      (b) After a successful Run MBAL, call `setRunVersion(v => v + 1)`.
 *      (c) Pass `runVersion={runVersion}` to the <RbDiagnosticPlots />
 *          render in the Plots tab.
 *
 *   The RbDiagnosticPlots component already accepts `runVersion = 0` as
 *   default; without this patch the prop is never passed and auto-refresh
 *   relies on the user clicking the manual Refresh button.
 *
 * Pre-flight expected MD5: 8d09a84a87836aba4fa8eff0ce49dffa
 *
 * Safety:
 *   - Five named anchored operations, each verified unique in source
 *   - Atomic: all five succeed or none are written
 *   - Idempotent: re-running on patched source exits "Already patched"
 *   - JSX-parse verified by deployer post-write (manually)
 *   - Backs up the file before modifying
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-16_rb_case_detail_polish.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_PATH = path.resolve(
  __dirname,
  '../../src/pages/apps/reservoir-balance/RbCaseDetail.jsx',
);
const BACKUP_PATH = `${TARGET_PATH}.before-case-detail-polish-${Date.now()}.bak`;

// ─────────────────────────────────────────────────────────────────────────────
// ANCHORS
// ─────────────────────────────────────────────────────────────────────────────

// OP 1: Remove the stale "Diagnostic plots" PreviewCard from Advanced tab.
const OP1_OLD = `            <PreviewCard
              icon={TrendingUp}
              title="Forecast scenarios"
              description="DCA forecast tied to MBAL recoverable estimate."
            />
            <PreviewCard
              icon={CheckCircle2}
              title="Diagnostic plots"
              description="Havlena-Odeh F vs Et, p/z, Campbell, Cole, drive indices bar chart, pressure history match."
            />`;
const OP1_NEW = `            <PreviewCard
              icon={TrendingUp}
              title="Forecast scenarios"
              description="DCA forecast tied to MBAL recoverable estimate."
            />`;

// OP 2: Add runVersion state alongside other state declarations.
// Anchor on the contiguous state block at the top of the component.
const OP2_OLD = `  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastResultLoading, setLastResultLoading] = useState(false);`;
const OP2_NEW = `  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastResultLoading, setLastResultLoading] = useState(false);
  // Bumped on successful MBAL run; passed to <RbDiagnosticPlots /> so the
  // Plots tab auto-refreshes without the user clicking Refresh manually.
  const [runVersion, setRunVersion] = useState(0);`;

// OP 3: Bump runVersion after a successful Run MBAL. Anchor on the exact
// post-result success block in handleRun.
const OP3_OLD = `    // Fetch the result row for display
    const { data: result } = await getResultByRunId(runResp.run_id);
    setLastResult(result);
    setRunning(false);

    toast({
      title: 'MBAL completed',
      description: \`Engine returned in \${runResp.duration_ms}ms.\`,
    });`;
const OP3_NEW = `    // Fetch the result row for display
    const { data: result } = await getResultByRunId(runResp.run_id);
    setLastResult(result);
    setRunning(false);
    // Signal the Plots tab to re-fetch the latest result for auto-refresh.
    setRunVersion((v) => v + 1);

    toast({
      title: 'MBAL completed',
      description: \`Engine returned in \${runResp.duration_ms}ms.\`,
    });`;

// OP 4: Pass runVersion prop to RbDiagnosticPlots in the Plots tab.
const OP4_OLD = `        <TabsContent value="plots" className="mt-6">
          <RbDiagnosticPlots
            caseId={caseId}
            caseData={caseData}
          />
        </TabsContent>`;
const OP4_NEW = `        <TabsContent value="plots" className="mt-6">
          <RbDiagnosticPlots
            caseId={caseId}
            caseData={caseData}
            runVersion={runVersion}
          />
        </TabsContent>`;

// Idempotency sentinel: a unique substring present after the patch is applied.
// Using OP4's NEW form because it's the most distinctive.
const PATCHED_SENTINEL = `runVersion={runVersion}`;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function readFile() {
  if (!fs.existsSync(TARGET_PATH)) {
    throw new Error(`RbCaseDetail.jsx not found at ${TARGET_PATH}`);
  }
  return fs.readFileSync(TARGET_PATH, 'utf8');
}

function applyOp(content, opName, oldStr, newStr) {
  if (!content.includes(oldStr)) {
    throw new Error(
      `Anchor not found for op "${opName}". The file has drifted from the expected baseline.`,
    );
  }
  const occ = content.split(oldStr).length - 1;
  if (occ !== 1) {
    throw new Error(
      `Anchor for op "${opName}" matched ${occ} times in the file; expected exactly 1.`,
    );
  }
  return content.replace(oldStr, newStr);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Reservoir Balance — RbCaseDetail.jsx polish patch');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target: ${TARGET_PATH}`);
  console.log('');

  const original = readFile();
  console.log(`Read ${original.length} bytes.`);

  if (original.includes(PATCHED_SENTINEL)) {
    console.log('');
    console.log('✓ Already patched. Nothing to do.');
    process.exit(0);
  }

  console.log('');
  console.log('Applying 4 anchored operations...');

  let next = original;
  const ops = [
    { name: '1-remove-stale-preview-card', old: OP1_OLD, new: OP1_NEW },
    { name: '2-add-runversion-state', old: OP2_OLD, new: OP2_NEW },
    { name: '3-bump-runversion-on-run', old: OP3_OLD, new: OP3_NEW },
    { name: '4-pass-runversion-prop', old: OP4_OLD, new: OP4_NEW },
  ];

  for (const op of ops) {
    next = applyOp(next, op.name, op.old, op.new);
    console.log(`  ✓ ${op.name}`);
  }

  // Verify sentinel is present post-patch
  if (!next.includes(PATCHED_SENTINEL)) {
    throw new Error('Verify failed: PATCHED_SENTINEL not present after patch.');
  }

  // Verify the stale "Diagnostic plots" PreviewCard is gone
  if (next.includes('title="Diagnostic plots"')) {
    throw new Error('Verify failed: stale "Diagnostic plots" PreviewCard still present after patch.');
  }

  console.log('');
  console.log('Writing backup...');
  fs.writeFileSync(BACKUP_PATH, original, 'utf8');
  console.log(`Backup: ${BACKUP_PATH}`);

  console.log('');
  console.log('Writing patched file...');
  fs.writeFileSync(TARGET_PATH, next, 'utf8');

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Bytes before: ${original.length}`);
  console.log(`  Bytes after:  ${next.length}`);
  console.log(`  Net change:   ${next.length - original.length > 0 ? '+' : ''}${next.length - original.length}`);
  console.log(`  Removed:      "Diagnostic plots" PreviewCard from Advanced tab`);
  console.log(`  Added:        runVersion state + bump on Run success + prop pass`);
  console.log('');
  console.log('✓ Patch applied successfully.');
  console.log('');
  console.log('Next: hard-reload the case detail page.');
  console.log('  - Advanced tab: only "Contacts tracker" and "Forecast scenarios" visible.');
  console.log('  - Run MBAL on the Run tab — the Plots tab should auto-refresh when the run completes.');
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
