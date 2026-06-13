#!/usr/bin/env node
/**
 * Reservoir Balance — Safe deletion of EnergyBalance.jsx
 * =========================================================================
 *
 * File: tools/patches/2026-05-16_rb_delete_energy_balance.cjs
 *
 * Purpose:
 *   EnergyBalance.jsx was neutralized to a placeholder in Phase 2 once its
 *   responsibilities were redistributed across PvtRock + AquiferModel + the
 *   Run tab in RbCaseDetail. The file itself still exists as a stub; this
 *   patch deletes it.
 *
 * Safety:
 *   - Scans the entire repo for any import of EnergyBalance before deleting
 *   - Aborts if ANY reference is found, listing the offending files
 *   - Idempotent (if the file is already gone, exits 0)
 *   - Moves the file to a .deleted-{timestamp} sibling rather than rm -f, so
 *     recovery is trivial if something turns up later
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-16_rb_delete_energy_balance.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const NOW = Date.now();
const REPO_ROOT = path.resolve(__dirname, '../..');

// Target path. The component lives in the same directory as the other
// Reservoir Balance components (AquiferModel.jsx, PvtRock.jsx, DataHub.jsx,
// RbDiagnosticPlots.jsx).
const TARGET_PATH = path.join(REPO_ROOT, 'src/components/reservoirbalance/EnergyBalance.jsx');

// Where to move the file if deletion proceeds — sibling .deleted file for
// trivial recovery.
const ARCHIVE_PATH = `${TARGET_PATH}.deleted-${NOW}`;

// Roots to scan for any reference to EnergyBalance.
const SCAN_ROOTS = [
  path.join(REPO_ROOT, 'src'),
  path.join(REPO_ROOT, 'supabase/functions'),
];

// File extensions to scan.
const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.cjs', '.mjs']);

// Directories to skip entirely.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next']);

// ─────────────────────────────────────────────────────────────────────────────

function walk(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return; // directory doesn't exist, skip
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
  const offenders = []; // [{ file, lineNumber, line }]
  const filesScanned = [];
  for (const root of SCAN_ROOTS) walk(root, filesScanned);

  for (const file of filesScanned) {
    // Skip the file itself
    if (path.resolve(file) === path.resolve(TARGET_PATH)) continue;
    // Skip .bak / .deleted siblings of the target
    if (path.basename(file).startsWith('EnergyBalance.jsx.')) continue;

    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (err) {
      continue; // unreadable, ignore
    }

    // Quick reject: if the literal substring isn't present, no match.
    if (!content.includes('EnergyBalance')) continue;

    // Line-level pass for reporting precision.
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/\bEnergyBalance\b/.test(line)) continue;
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
  console.log('Reservoir Balance — Delete neutralized EnergyBalance.jsx');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target: ${TARGET_PATH}`);
  console.log('');

  // Idempotency check
  if (!fs.existsSync(TARGET_PATH)) {
    console.log('✓ Already deleted. Nothing to do.');
    process.exit(0);
  }

  // Reference scan
  console.log('Scanning repo for any reference to EnergyBalance...');
  const offenders = scanForReferences();

  if (offenders.length > 0) {
    console.log('');
    console.log(`✗ Found ${offenders.length} reference(s) to EnergyBalance:`);
    console.log('');
    for (const o of offenders) {
      console.log(`  ${o.file}:${o.lineNumber}`);
      console.log(`    ${o.line}`);
    }
    console.log('');
    console.log('Aborting. Resolve these references before deleting.');
    process.exit(1);
  }

  console.log('  ✓ No references found.');
  console.log('');

  // Move to archive
  console.log(`Moving file to archive...`);
  console.log(`  ${TARGET_PATH} →`);
  console.log(`  ${ARCHIVE_PATH}`);
  fs.renameSync(TARGET_PATH, ARCHIVE_PATH);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Deletion complete.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Recovery: rename the archive file back if anything turns up:');
  console.log(`  mv ${path.basename(ARCHIVE_PATH)} EnergyBalance.jsx`);
  console.log('');
  console.log('Final cleanup: once you have confirmed nothing breaks for a few');
  console.log('days, you can permanently delete the archive file.');
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
