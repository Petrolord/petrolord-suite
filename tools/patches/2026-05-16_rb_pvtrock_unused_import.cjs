#!/usr/bin/env node
/**
 * Reservoir Balance — Remove unused LineChart import from PvtRock.jsx
 * =========================================================================
 *
 * File: tools/patches/2026-05-16_rb_pvtrock_unused_import.cjs
 *
 * Purpose:
 *   PvtRock.jsx imports LineChart alongside other recharts components, but
 *   the file uses ComposedChart for its rendering. LineChart is dead code.
 *   This patch removes the unused import.
 *
 *   This was a pre-existing condition from Capsule 3A (carried through all
 *   subsequent rewrites). Cleaning up now removes one ESLint warning and
 *   reduces the import block by one line.
 *
 * Safety:
 *   - Idempotent (detects already-cleaned via the post-patch import shape)
 *   - Backs up file before modifying
 *   - Anchors on the exact recharts import block; refuses if shape differs
 *
 * Compatibility:
 *   Works on PvtRock.jsx in any of these states:
 *     - Capsule 3A canonical (831 lines)
 *     - Post-Capsule-4C-c.2.a (929 lines)
 *     - Post-Capsule-4C-c.2.b (1292 lines)
 *   All three have an identical recharts import block (the c.2.x rewrites
 *   preserved the original imports verbatim).
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-16_rb_pvtrock_unused_import.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_PATH = path.resolve(
  __dirname,
  '../../src/components/reservoirbalance/PvtRock.jsx',
);
const BACKUP_PATH = `${TARGET_PATH}.before-linechart-cleanup-${Date.now()}.bak`;

// Anchor: the exact recharts import block with LineChart included.
const OLD_IMPORT_BLOCK = `import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';`;

const NEW_IMPORT_BLOCK = `import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';`;

function readFile() {
  if (!fs.existsSync(TARGET_PATH)) {
    throw new Error(`PvtRock.jsx not found at ${TARGET_PATH}`);
  }
  return fs.readFileSync(TARGET_PATH, 'utf8');
}

function detectState(content) {
  if (content.includes(NEW_IMPORT_BLOCK) && !content.includes(OLD_IMPORT_BLOCK)) {
    return 'patched';
  }
  if (content.includes(OLD_IMPORT_BLOCK)) {
    return 'unpatched';
  }
  // Verify if LineChart is referenced anywhere else; if it actually is used
  // somewhere we missed, we should refuse to remove the import.
  const lines = content.split('\n');
  const lineChartUses = lines.filter((line, i) => {
    if (!/\bLineChart\b/.test(line)) return false;
    // Skip import line itself (we already know it's not in our shape)
    if (/^\s*LineChart,?\s*$/.test(line)) return false;
    return true;
  });
  if (lineChartUses.length > 0) {
    throw new Error(
      'LineChart appears to be in active use in PvtRock.jsx. Refusing to remove the import. ' +
        `Found ${lineChartUses.length} reference(s).`,
    );
  }
  throw new Error(
    'Could not detect baseline state. The recharts import block has an unexpected shape. Inspect manually.',
  );
}

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PvtRock.jsx — remove unused LineChart import');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target: ${TARGET_PATH}`);
  console.log('');

  const original = readFile();
  const state = detectState(original);
  console.log(`State: ${state}`);

  if (state === 'patched') {
    console.log('');
    console.log('✓ Already cleaned. Nothing to do.');
    process.exit(0);
  }

  console.log('');
  console.log(`Backing up to ${path.basename(BACKUP_PATH)}...`);
  fs.writeFileSync(BACKUP_PATH, original, 'utf8');

  const next = original.replace(OLD_IMPORT_BLOCK, NEW_IMPORT_BLOCK);

  // Sanity verify
  if (next === original) {
    throw new Error('Replacement was a no-op despite detection saying unpatched. Aborting.');
  }
  if (/\bLineChart\b/.test(next)) {
    throw new Error('LineChart still present after patch. Refusing to write.');
  }

  fs.writeFileSync(TARGET_PATH, next, 'utf8');

  console.log('✓ Patch applied successfully.');
  console.log(`  Bytes before: ${original.length}`);
  console.log(`  Bytes after:  ${next.length}`);
  console.log(`  Net change:   ${next.length - original.length}`);
}

try {
  main();
} catch (err) {
  console.error('');
  console.error('✗ Patch failed:');
  console.error(`  ${err.message}`);
  console.error('');
  console.error('No changes were written.');
  process.exit(1);
}
