#!/usr/bin/env node
/**
 * Reservoir Balance — Phase 2 — App.jsx Routing Patch
 * ====================================================
 *
 * File: tools/patches/2026-05-13_app_jsx_rb_routes.cjs
 *
 * Purpose:
 *   Rebind the 4 existing reservoir-balance routes from the old (missing)
 *   `ReservoirBalanceSurveillance` component to the new `ReservoirBalance`
 *   case list page. Add 4 sibling `:caseId` routes for the new case detail.
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-13_app_jsx_rb_routes.cjs
 *
 * Safety:
 *   - Detects baseline state by content (not line number)
 *   - Detects already-patched state (idempotent — exits cleanly on re-run)
 *   - Writes a timestamped backup before modifying
 *   - Verifies brace balance after patching
 *   - Aborts with descriptive error if anything looks wrong
 *
 * What changes:
 *   1. Line ~88: Lazy import `ReservoirBalanceSurveillance` →
 *                two lazy imports for `ReservoirBalance` and `RbCaseDetail`
 *   2. Lines ~453, 455, 456, 457: Route element prop
 *                `<ReservoirBalanceSurveillance />` → `<ReservoirBalance />`
 *   3. After each of the 4 routes: Insert a sibling nested route for case detail
 *
 * Result: 4 case-list routes + 4 case-detail routes = 8 total routes.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const APP_JSX_PATH = path.resolve(
  __dirname,
  '../../src/App.jsx',
);

const BACKUP_PATH = `${APP_JSX_PATH}.before-rb-phase2-${Date.now()}.bak`;

// ─────────────────────────────────────────────────────────────────────────────
// BASELINE PATTERNS (what we expect to find)
// ─────────────────────────────────────────────────────────────────────────────

const OLD_IMPORT =
  "const ReservoirBalanceSurveillance = lazy(() => import('@/pages/apps/ReservoirBalanceSurveillance'));";

const NEW_IMPORTS =
  "const ReservoirBalance = lazy(() => import('@/pages/apps/reservoir-balance/ReservoirBalance'));\n" +
  "const RbCaseDetail = lazy(() => import('@/pages/apps/reservoir-balance/RbCaseDetail'));";

// Route bindings: [path string, old element, new element]
// We patch by full route-line match to avoid ambiguity.
const ROUTE_PATCHES = [
  {
    path: 'apps/reservoir/reservoir-balance',
    oldLine:
      '<Route path="apps/reservoir/reservoir-balance" element={<ReservoirBalanceSurveillance />} />',
    newLine:
      '<Route path="apps/reservoir/reservoir-balance" element={<ReservoirBalance />} />',
  },
  {
    path: 'apps/reservoir/reservoir-balance-pro',
    oldLine:
      '<Route path="apps/reservoir/reservoir-balance-pro" element={<ReservoirBalanceSurveillance />} />',
    newLine:
      '<Route path="apps/reservoir/reservoir-balance-pro" element={<ReservoirBalance />} />',
  },
  {
    path: 'apps/reservoir/reservoir-balance-surveillance',
    oldLine:
      '<Route path="apps/reservoir/reservoir-balance-surveillance" element={<ReservoirBalanceSurveillance />} />',
    newLine:
      '<Route path="apps/reservoir/reservoir-balance-surveillance" element={<ReservoirBalance />} />',
  },
  {
    path: 'apps/reservoir/material-balance-studio',
    oldLine:
      '<Route path="apps/reservoir/material-balance-studio" element={<ReservoirBalanceSurveillance />} />',
    newLine:
      '<Route path="apps/reservoir/material-balance-studio" element={<ReservoirBalance />} />',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PATCH STAGES
// ─────────────────────────────────────────────────────────────────────────────

function readFile() {
  if (!fs.existsSync(APP_JSX_PATH)) {
    throw new Error(`App.jsx not found at ${APP_JSX_PATH}`);
  }
  return fs.readFileSync(APP_JSX_PATH, 'utf8');
}

function detectState(content) {
  const hasOldImport = content.includes(OLD_IMPORT);
  const hasNewImport =
    content.includes('@/pages/apps/reservoir-balance/ReservoirBalance') &&
    content.includes('@/pages/apps/reservoir-balance/RbCaseDetail');

  if (hasOldImport && !hasNewImport) return 'unpatched';
  if (!hasOldImport && hasNewImport) return 'patched';
  if (hasOldImport && hasNewImport) {
    throw new Error(
      'Inconsistent state: both old and new imports present. Manual review required.',
    );
  }
  throw new Error(
    'Could not detect baseline state. Expected to find:\n  ' +
      OLD_IMPORT +
      '\nOr the new imports already in place. File may have been hand-edited.',
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
    import_replaced: false,
    routes_rebound: 0,
    nested_routes_added: 0,
  };

  // ─── Stage 1: replace the lazy import ───
  if (!next.includes(OLD_IMPORT)) {
    throw new Error(
      'Stage 1 failed: old import line not found. Cannot proceed.',
    );
  }
  next = next.replace(OLD_IMPORT, NEW_IMPORTS);
  summary.import_replaced = true;

  // ─── Stage 2 + 3: rebind each route and insert nested case-detail route ───
  for (const patch of ROUTE_PATCHES) {
    if (!next.includes(patch.oldLine)) {
      throw new Error(
        `Stage 2 failed: route line not found for "${patch.path}".\n` +
          `Expected: ${patch.oldLine}`,
      );
    }

    // Determine indentation by inspecting the line in context
    // (we want the nested route to share the same indent as the parent route)
    const lineRegex = new RegExp(
      `(\\s*)${escapeRegex(patch.oldLine)}`,
      'g',
    );
    const match = lineRegex.exec(next);
    if (!match) {
      throw new Error(
        `Stage 2 failed: could not capture indent for "${patch.path}"`,
      );
    }
    const indent = match[1].replace(/^\n+/, '').replace(/^\n/, ''); // keep just the leading-whitespace part

    // Build the nested route line at the same indent
    const nestedLine =
      `<Route path="${patch.path}/cases/:caseId" element={<RbCaseDetail />} />`;

    // Replacement: new parent route + newline + same-indent nested route
    const replacement = `${patch.newLine}\n${indent}${nestedLine}`;

    // Single-shot replace, scoped to the next occurrence
    const idx = next.indexOf(patch.oldLine);
    next = next.slice(0, idx) + replacement + next.slice(idx + patch.oldLine.length);

    summary.routes_rebound++;
    summary.nested_routes_added++;
  }

  return { next, summary };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function verifyPatched(content) {
  // Check the expected new imports exist
  if (!content.includes('@/pages/apps/reservoir-balance/ReservoirBalance')) {
    throw new Error('Verify failed: new ReservoirBalance import missing.');
  }
  if (!content.includes('@/pages/apps/reservoir-balance/RbCaseDetail')) {
    throw new Error('Verify failed: new RbCaseDetail import missing.');
  }
  // Check old reference is gone (note: we check the import string, not just the name,
  // because <ReservoirBalanceSurveillance /> might appear in comments or backups)
  if (
    content.includes(
      "import('@/pages/apps/ReservoirBalanceSurveillance')",
    )
  ) {
    throw new Error(
      'Verify failed: old ReservoirBalanceSurveillance import still present.',
    );
  }
  // Check each new route is bound to <ReservoirBalance />
  for (const patch of ROUTE_PATCHES) {
    if (!content.includes(patch.newLine)) {
      throw new Error(
        `Verify failed: rebound route missing for "${patch.path}".`,
      );
    }
    const nestedNeedle = `<Route path="${patch.path}/cases/:caseId" element={<RbCaseDetail />} />`;
    if (!content.includes(nestedNeedle)) {
      throw new Error(
        `Verify failed: nested case-detail route missing for "${patch.path}".`,
      );
    }
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
  console.log('Reservoir Balance — App.jsx routing patch');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target: ${APP_JSX_PATH}`);
  console.log('');

  const original = readFile();
  console.log(`Read ${original.length} bytes.`);

  // Verify baseline brace balance — refuse to patch a broken file
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
  fs.writeFileSync(APP_JSX_PATH, next, 'utf8');

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(
    `  Import line replaced:   ${summary.import_replaced ? 'YES' : 'NO'}`,
  );
  console.log(`  Routes rebound:         ${summary.routes_rebound}`);
  console.log(`  Nested routes added:    ${summary.nested_routes_added}`);
  console.log(`  Bytes before:           ${original.length}`);
  console.log(`  Bytes after:            ${next.length}`);
  console.log(`  Net change:             +${next.length - original.length}`);
  console.log('');
  console.log('✓ Patch applied successfully.');
  console.log('');
  console.log('Next: restart the dev server to pick up routing changes.');
  console.log('  docker restart plstudio-suite-dev   (or your equivalent)');
}

try {
  main();
} catch (err) {
  console.error('');
  console.error('✗ Patch failed:');
  console.error(`  ${err.message}`);
  console.error('');
  console.error(
    'No changes were written. If a backup was made, the original is intact.',
  );
  process.exit(1);
}
