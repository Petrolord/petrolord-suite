#!/usr/bin/env node
/**
 * Petrolord Suite — Safe deletion of ReservoirBalanceSurveillance.jsx
 * =========================================================================
 *
 * File: tools/patches/2026-05-16_delete_reservoir_balance_surveillance.cjs
 *
 * Purpose:
 *   ReservoirBalanceSurveillance.jsx is the legacy "Material Balance Studio"
 *   tabbed single-page UI that pre-dated the case-based Reservoir Balance
 *   app. Its functionality is now covered by:
 *     - ReservoirBalance.jsx (case list)
 *     - RbCaseDetail.jsx (case detail with Data/PVT/Aquifer/Run/Plots tabs)
 *
 *   The current App.jsx routes `apps/reservoir/reservoir-balance-surveillance`
 *   (and two other path variants) all to <ReservoirBalance />, so this file
 *   is no longer reachable through normal navigation. It is orphan code.
 *
 *   This patch deletes it after confirming nothing in the active source tree
 *   imports it.
 *
 * Why this is the right time:
 *   - Diagnostic 2026-05-16 confirmed zero references in live source (only
 *     hits were inside .bak files, which this scan skips by extension filter)
 *   - Deleting this file unblocks deletion of EnergyBalance.jsx, which is
 *     imported only by this file
 *
 * Safety:
 *   - Scans the entire repo for any active reference before deleting
 *   - Skip extensions are .js/.jsx/.ts/.tsx/.json/.cjs/.mjs only; .bak files
 *     are NOT scanned (legacy backups are intentionally ignored)
 *   - Aborts if ANY reference is found, listing the offending files
 *   - Idempotent (if the file is already gone, exits 0)
 *   - Moves the file to .deleted-{timestamp} sibling rather than rm -f
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-16_delete_reservoir_balance_surveillance.cjs
 *
 * After this patch:
 *   Run patch_delete_energy_balance.cjs — it will now succeed because
 *   ReservoirBalanceSurveillance was EnergyBalance's only importer.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const NOW = Date.now();
const REPO_ROOT = path.resolve(__dirname, '../..');

const TARGET_PATH = path.join(REPO_ROOT, 'src/pages/apps/ReservoirBalanceSurveillance.jsx');
const ARCHIVE_PATH = `${TARGET_PATH}.deleted-${NOW}`;

const SCAN_ROOTS = [
  path.join(REPO_ROOT, 'src'),
  path.join(REPO_ROOT, 'supabase/functions'),
];

// Only scan active source files. .bak files are intentionally skipped —
// legacy backups can keep their references without blocking deletion.
const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.cjs', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next']);

const SYMBOL = 'ReservoirBalanceSurveillance';

// ─────────────────────────────────────────────────────────────────────────────

function walk(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SCAN_EXTENSIONS.has(ext)) {
        results.push(path.join(dir, entry.name));
      }
    }
  }
}

function scanForReferences() {
  const offenders = [];
  const filesScanned = [];
  for (const root of SCAN_ROOTS) walk(root, filesScanned);

  for (const file of filesScanned) {
    // Skip the file itself (it defines the symbol — naturally references it)
    if (path.resolve(file) === path.resolve(TARGET_PATH)) continue;
    // Skip any sibling backup that might somehow have a scannable extension
    if (path.basename(file).startsWith('ReservoirBalanceSurveillance.jsx.')) continue;

    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (err) {
      continue;
    }

    if (!content.includes(SYMBOL)) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!new RegExp(`\\b${SYMBOL}\\b`).test(line)) continue;
      offenders.push({
        file: path.relative(REPO_ROOT, file),
        lineNumber: i + 1,
        line: line.trim().slice(0, 120),
      });
    }
  }

  return offenders;
}

// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Petrolord Suite — Delete orphaned ReservoirBalanceSurveillance.jsx');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target: ${TARGET_PATH}`);
  console.log('');

  if (!fs.existsSync(TARGET_PATH)) {
    console.log('✓ Already deleted. Nothing to do.');
    process.exit(0);
  }

  console.log('Scanning active source tree for references to ReservoirBalanceSurveillance...');
  console.log('  (.bak files are excluded — legacy backups are allowed to retain references)');
  console.log('');
  const offenders = scanForReferences();

  if (offenders.length > 0) {
    console.log(`✗ Found ${offenders.length} active reference(s):`);
    console.log('');
    for (const o of offenders) {
      console.log(`  ${o.file}:${o.lineNumber}`);
      console.log(`    ${o.line}`);
    }
    console.log('');
    console.log('Aborting. Resolve these references before deleting.');
    process.exit(1);
  }

  console.log('  ✓ No active references found.');
  console.log('');

  console.log('Moving file to archive...');
  console.log(`  ${TARGET_PATH}`);
  console.log('  →');
  console.log(`  ${ARCHIVE_PATH}`);
  fs.renameSync(TARGET_PATH, ARCHIVE_PATH);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Deletion complete.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Recovery (if anything turns up):');
  console.log(`  mv ${path.basename(ARCHIVE_PATH)} ReservoirBalanceSurveillance.jsx`);
  console.log('');
  console.log('Next step: run patch_delete_energy_balance.cjs');
  console.log('  EnergyBalance was imported only by the file we just deleted,');
  console.log('  so the EnergyBalance scan will now find zero references.');
}

try {
  main();
} catch (err) {
  console.error('');
  console.error('✗ Patch failed:');
  console.error(`  ${err.message}`);
  console.error('');
  console.error('No changes were made.');
  process.exit(1);
}
