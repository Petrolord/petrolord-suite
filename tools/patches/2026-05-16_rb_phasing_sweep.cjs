#!/usr/bin/env node
/**
 * Reservoir Balance — User-Visible Phasing-Language Sweep
 * ==========================================================================
 *
 * File: tools/patches/2026-05-16_rb_phasing_sweep.cjs
 *
 * Purpose:
 *   Comprehensive cleanup of every user-visible "Phase X" / "Capsule Y"
 *   reference across the Reservoir Balance UI. This is a single atomic patch
 *   that modifies three files; either all transformations succeed and all
 *   three files are written, or nothing is written.
 *
 *   Files touched:
 *     1. RbCaseDetail.jsx — three changes
 *        (a) Remove both Validation-scope Alerts (handles pre-bundled and
 *            post-bundled states)
 *        (b) Reword Advanced tab Alert from "Phase 4 preview" to neutral
 *            "Modules in development"
 *        (c) Reword "Coming in Phase 3" badge to "In development"
 *
 *     2. AquiferModel.jsx — two changes
 *        (a) Drop "Phase 5 polish" from radius-ratio hint; keep substance
 *        (b) Drop "Phase 5 will refine both" from current-assumptions
 *            disclosure; keep substance
 *
 *     3. RbDiagnosticPlots.jsx — one change
 *        (a) Remove trailing "Pressure history match plot is scheduled for
 *            Phase 6 when forecast math is implemented" from plot help text
 *
 *   NOT touched in this patch:
 *     - PvtRock.jsx — the 5 "(Phase 4)" dropdown labels there get replaced
 *       wholesale by Capsule 4C chunk c.2.a (PvtRock UI rewrite). A drive-by
 *       edit here would leave the file in an awkward intermediate state where
 *       dropdown labels look enabled but the underlying options still have
 *       supported:false. Let c.2.a handle it properly.
 *     - Comment-only references (JSX comment blocks that get stripped at
 *       build time and never reach the user).
 *
 * Process pattern (captured this session):
 *   Don't write user-visible UI messages in internal-team vocabulary ("Phase
 *   X", "Capsule Y", "sprint Z", "scheduled for ...", "coming in ..."). For
 *   work that will land before users see the app, no message should exist.
 *   For genuine engineering disclosures (current assumptions, deferred
 *   features), describe the substance in neutral terms ("a future update
 *   will refine X" rather than "Phase 5 will refine X").
 *
 * Per-file state handling:
 *   RbCaseDetail.jsx may be in any of:
 *     - State A (pre-bundled): Capsule 3A oil Alert with "scheduled for
 *                              Phase 4" wording; no gas Alert
 *     - State B (post-bundled): both gas+oil Alerts with "expanded Phase 4"
 *                               wording
 *     - State C (Alerts already removed): neither Alert present
 *   The Advanced-tab Alert and "Coming in Phase 3" badge anchors are
 *   independent of these states.
 *
 *   AquiferModel.jsx and RbDiagnosticPlots.jsx have only one known state.
 *
 * Idempotency:
 *   Per-file detection. If a file is already swept, skip writing it. If
 *   every file is already swept, exit 0 with "Nothing to do".
 *
 * Atomicity:
 *   Two-phase: (1) plan all transformations and verify all anchors found
 *   per their detected state, (2) write all backups and patched files. If
 *   any anchor is missing in phase 1, nothing is written in phase 2.
 *
 * Run:
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-16_rb_phasing_sweep.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const NOW = Date.now();
const REPO_ROOT = path.resolve(__dirname, '../..');

// ─────────────────────────────────────────────────────────────────────────────
// FILE 1 — RbCaseDetail.jsx
// ─────────────────────────────────────────────────────────────────────────────

const FILE_RB_CASE_DETAIL = path.join(
  REPO_ROOT,
  'src/pages/apps/reservoir-balance/RbCaseDetail.jsx',
);

const RB_VS_STATE_A = `              {caseData.fluid_system !== 'gas' && (
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Validation scope (oil)</AlertTitle>
                  <AlertDescription>
                    Oil + pot aquifer is validated against Pletcher SPE 75354 (OOIP 0.13% error, W 0.10% error). Oil with no aquifer or with a gas cap is implemented but not yet validated against a published worked example. Fetkovich and Carter-Tracy aquifers are scheduled for Phase 4.
                  </AlertDescription>
                </Alert>
              )}

`;

const RB_VS_STATE_B = `              {caseData.fluid_system === 'gas' && (
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Validation scope (gas)</AlertTitle>
                  <AlertDescription>
                    The gas material balance module has completed expanded Phase 4 validation across the main gas aquifer workflows. Gas + pot aquifer is benchmark-verified against Pletcher SPE 75354, with 0.19% OGIP error. Gas + Fetkovich aquifer is also benchmark-verified against the same paper (Tables 9 / Fig. 8), with 0.76% OGIP error. Carter-Tracy aquifer workflow includes documented benchmark records, calculation traceability, and internal consistency checks. No-aquifer gas cases follow established material balance formulations with documented assumptions and verified calculation logic.
                  </AlertDescription>
                </Alert>
              )}
              {caseData.fluid_system !== 'gas' && (
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Validation scope (oil)</AlertTitle>
                  <AlertDescription>
                    The oil material balance module has completed expanded Phase 4 validation across the main oil aquifer workflows. Oil + pot aquifer is benchmark-verified against Pletcher SPE 75354, with 0.13% OOIP error and 0.10% water influx error. Fetkovich and Carter-Tracy aquifer workflows now include documented benchmark records, calculation traceability, and internal consistency checks. No-aquifer and gas-cap oil cases follow established material balance formulations with documented assumptions and verified calculation logic.
                  </AlertDescription>
                </Alert>
              )}

`;

const RB_ADV_OLD = `          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertTitle>Phase 4 preview</AlertTitle>
            <AlertDescription>
              The following modules exist as UI shells but are not yet wired to the new engine. Phase 4 will integrate them.
            </AlertDescription>
          </Alert>`;

const RB_ADV_NEW = `          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertTitle>Modules in development</AlertTitle>
            <AlertDescription>
              The following modules are placeholder shells. Their underlying functionality is under active development and will be integrated in a future update.
            </AlertDescription>
          </Alert>`;

const RB_BADGE_OLD = `      <Badge variant="outline" className="mt-3 text-xs">
        Coming in Phase 3
      </Badge>`;

const RB_BADGE_NEW = `      <Badge variant="outline" className="mt-3 text-xs">
        In development
      </Badge>`;

// ─────────────────────────────────────────────────────────────────────────────
// FILE 2 — AquiferModel.jsx
// ─────────────────────────────────────────────────────────────────────────────

const FILE_AQUIFER_MODEL = path.join(
  REPO_ROOT,
  'src/components/reservoirbalance/AquiferModel.jsx',
);

const AM_HINT_OLD = `hint="Optional. The current engine implementation uses the infinite-aquifer pD function regardless. Phase 5 polish will enforce a finite-aquifer cap when this is set."`;
const AM_HINT_NEW = `hint="Optional. The current engine implementation uses the infinite-aquifer pD function regardless. A future update will enforce a finite-aquifer cap when this is set."`;

const AM_ASSUMP_OLD = `            Reservoir radius r_R is treated as 2,980 ft (the 640-acre single-cell convention used in Pletcher's modified Roach example). Water viscosity \\u03bc_w is taken as 0.5 cP. Phase 5 will refine both: r_R will be derived from your reservoir geometry, and \\u03bc_w will be computed from temperature and salinity. For now, override only if your case differs materially.`;
const AM_ASSUMP_NEW = `            Reservoir radius r_R is treated as 2,980 ft (the 640-acre single-cell convention used in Pletcher's modified Roach example). Water viscosity \\u03bc_w is taken as 0.5 cP. A future update will refine both: r_R will be derived from your reservoir geometry, and \\u03bc_w will be computed from temperature and salinity. For now, override only if your case differs materially.`;

// ─────────────────────────────────────────────────────────────────────────────
// FILE 3 — RbDiagnosticPlots.jsx
// ─────────────────────────────────────────────────────────────────────────────

const FILE_DIAG_PLOTS = path.join(
  REPO_ROOT,
  'src/components/reservoirbalance/RbDiagnosticPlots.jsx',
);

const DP_HELP_OLD = ` The dashed red reference line on Campbell/Cole plots shows the MBAL-derived OOIP/OGIP for visual comparison with the apparent value the plot would suggest at each timestep. Pressure history match plot is scheduled for Phase 6 when forecast math is implemented.`;
const DP_HELP_NEW = ` The dashed red reference line on Campbell/Cole plots shows the MBAL-derived OOIP/OGIP for visual comparison with the apparent value the plot would suggest at each timestep.`;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function readFileSafe(filepath) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }
  return fs.readFileSync(filepath, 'utf8');
}

function planRbCaseDetail(content) {
  const has_state_a = content.includes(RB_VS_STATE_A);
  const has_state_b = content.includes(RB_VS_STATE_B);
  const has_old_phrase = content.includes('scheduled for Phase 4');
  const has_new_phrase = content.includes('expanded Phase 4 validation');
  const has_oil_alert_title = content.includes('Validation scope (oil)');
  const has_gas_alert_title = content.includes('Validation scope (gas)');

  let vs_action;
  if (has_state_b) {
    vs_action = { state: 'unpatched_b', apply: (c) => c.replace(RB_VS_STATE_B, '') };
  } else if (has_state_a) {
    vs_action = { state: 'unpatched_a', apply: (c) => c.replace(RB_VS_STATE_A, '') };
  } else if (
    !has_old_phrase &&
    !has_new_phrase &&
    !has_oil_alert_title &&
    !has_gas_alert_title
  ) {
    vs_action = { state: 'patched', apply: (c) => c };
  } else {
    throw new Error(
      'RbCaseDetail.jsx Validation-scope state is unrecognized. ' +
        `(old=${has_old_phrase}, new=${has_new_phrase}, oilAlert=${has_oil_alert_title}, gasAlert=${has_gas_alert_title}). ` +
        'Inspect manually before proceeding.',
    );
  }

  let adv_action;
  if (content.includes(RB_ADV_OLD)) {
    adv_action = { state: 'unpatched', apply: (c) => c.replace(RB_ADV_OLD, RB_ADV_NEW) };
  } else if (content.includes(RB_ADV_NEW)) {
    adv_action = { state: 'patched', apply: (c) => c };
  } else {
    throw new Error(
      'RbCaseDetail.jsx Advanced-tab Alert: neither old nor new wording found. The Alert may have been hand-edited.',
    );
  }

  let badge_action;
  if (content.includes(RB_BADGE_OLD)) {
    badge_action = { state: 'unpatched', apply: (c) => c.replace(RB_BADGE_OLD, RB_BADGE_NEW) };
  } else if (content.includes(RB_BADGE_NEW)) {
    badge_action = { state: 'patched', apply: (c) => c };
  } else {
    throw new Error(
      'RbCaseDetail.jsx Coming-in-Phase-3 badge: neither old nor new wording found. The badge may have been hand-edited.',
    );
  }

  return {
    file: FILE_RB_CASE_DETAIL,
    actions: [
      { name: 'Validation-scope Alerts', ...vs_action },
      { name: 'Advanced tab Alert', ...adv_action },
      { name: 'Coming-in-Phase-3 badge', ...badge_action },
    ],
  };
}

function planAquiferModel(content) {
  let hint_action;
  if (content.includes(AM_HINT_OLD)) {
    hint_action = { state: 'unpatched', apply: (c) => c.replace(AM_HINT_OLD, AM_HINT_NEW) };
  } else if (content.includes(AM_HINT_NEW)) {
    hint_action = { state: 'patched', apply: (c) => c };
  } else {
    throw new Error('AquiferModel.jsx radius_ratio hint: neither old nor new wording found.');
  }

  let assump_action;
  if (content.includes(AM_ASSUMP_OLD)) {
    assump_action = { state: 'unpatched', apply: (c) => c.replace(AM_ASSUMP_OLD, AM_ASSUMP_NEW) };
  } else if (content.includes(AM_ASSUMP_NEW)) {
    assump_action = { state: 'patched', apply: (c) => c };
  } else {
    throw new Error(
      'AquiferModel.jsx current-assumptions disclosure: neither old nor new wording found.',
    );
  }

  return {
    file: FILE_AQUIFER_MODEL,
    actions: [
      { name: 'radius_ratio hint', ...hint_action },
      { name: 'current-assumptions disclosure', ...assump_action },
    ],
  };
}

function planDiagnosticPlots(content) {
  let help_action;
  if (content.includes(DP_HELP_OLD)) {
    help_action = { state: 'unpatched', apply: (c) => c.replace(DP_HELP_OLD, DP_HELP_NEW) };
  } else if (content.includes(DP_HELP_NEW)) {
    help_action = { state: 'patched', apply: (c) => c };
  } else {
    throw new Error('RbDiagnosticPlots.jsx help text: neither old nor new wording found.');
  }

  return {
    file: FILE_DIAG_PLOTS,
    actions: [{ name: 'plot help footer text', ...help_action }],
  };
}

function verifyClean(content, filename) {
  // After patch, ensure no user-visible "Phase N" / "Capsule N" remains.
  // We allow these inside JSX comment blocks {/* ... */} since those are
  // stripped at build time. Detection: any line where the match isn't
  // preceded on the same line by `{/*` opening, `//` (line comment), or
  // `*` (block comment continuation).
  const lines = content.split('\n');
  const offenders = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\b(?:Phase\s+[0-9]|Capsule\s+[0-9A-Z])/.test(line)) continue;
    const matchIndex = line.search(/\b(?:Phase\s+[0-9]|Capsule\s+[0-9A-Z])/);
    const beforeMatch = line.slice(0, matchIndex);
    if (
      beforeMatch.includes('{/*') ||
      /^\s*\/\//.test(line) ||
      /^\s*\*/.test(line) ||
      /^\s*\/\*/.test(line)
    ) {
      continue;
    }
    offenders.push(`    line ${i + 1}: ${line.trim().slice(0, 100)}`);
  }
  if (offenders.length > 0) {
    throw new Error(
      `${filename}: verifyClean failed — user-visible phasing language still present:\n` +
        offenders.join('\n'),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Reservoir Balance — User-visible phasing-language sweep');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  console.log('Reading files...');
  const originals = {
    rbCaseDetail: readFileSafe(FILE_RB_CASE_DETAIL),
    aquiferModel: readFileSafe(FILE_AQUIFER_MODEL),
    diagPlots: readFileSafe(FILE_DIAG_PLOTS),
  };
  console.log(`  RbCaseDetail.jsx:       ${originals.rbCaseDetail.length} bytes`);
  console.log(`  AquiferModel.jsx:       ${originals.aquiferModel.length} bytes`);
  console.log(`  RbDiagnosticPlots.jsx:  ${originals.diagPlots.length} bytes`);

  console.log('');
  console.log('Planning transformations...');
  const plans = [
    planRbCaseDetail(originals.rbCaseDetail),
    planAquiferModel(originals.aquiferModel),
    planDiagnosticPlots(originals.diagPlots),
  ];

  let total_changes_needed = 0;
  for (const plan of plans) {
    const fname = path.basename(plan.file);
    console.log(`  ${fname}:`);
    for (const action of plan.actions) {
      const marker = action.state === 'patched' ? '✓ already patched' : '→ will patch';
      console.log(`    ${marker}  ${action.name}`);
      if (action.state !== 'patched') total_changes_needed++;
    }
  }

  if (total_changes_needed === 0) {
    console.log('');
    console.log('✓ Every anchor is already patched. Nothing to do.');
    process.exit(0);
  }

  console.log('');
  console.log(`Applying transformations (${total_changes_needed} change${total_changes_needed === 1 ? '' : 's'} across ${plans.length} files)...`);

  const patched = {};
  for (const plan of plans) {
    const fname = path.basename(plan.file);
    const original = originals[
      plan.file === FILE_RB_CASE_DETAIL
        ? 'rbCaseDetail'
        : plan.file === FILE_AQUIFER_MODEL
          ? 'aquiferModel'
          : 'diagPlots'
    ];
    let content = original;
    let changed = false;
    for (const action of plan.actions) {
      if (action.state !== 'patched') {
        content = action.apply(content);
        changed = true;
      }
    }
    if (changed) {
      console.log('');
      console.log(`Verifying ${fname}...`);
      verifyClean(content, fname);
      console.log(`  ✓ Verify passed.`);
    }
    patched[plan.file] = { original, content, changed };
  }

  console.log('');
  console.log('Writing backups and patched files...');
  for (const plan of plans) {
    const { original, content, changed } = patched[plan.file];
    if (!changed) continue;
    const fname = path.basename(plan.file);
    const backupPath = `${plan.file}.before-phasing-sweep-${NOW}.bak`;
    fs.writeFileSync(backupPath, original, 'utf8');
    fs.writeFileSync(plan.file, content, 'utf8');
    const delta = content.length - original.length;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    console.log(`  ${fname}: ${original.length} → ${content.length} bytes (${deltaStr})`);
    console.log(`    backup: ${path.basename(backupPath)}`);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const plan of plans) {
    const { changed } = patched[plan.file];
    const fname = path.basename(plan.file);
    const status = changed ? '✓ updated' : '— already swept';
    console.log(`  ${fname.padEnd(28)} ${status}`);
  }
  console.log('');
  console.log('✓ Sweep complete.');
  console.log('');
  console.log('Next: restart dev container and smoke-test:');
  console.log('  - Oil case Run tab: no Validation-scope Alert');
  console.log('  - Gas case Run tab: no Validation-scope Alert');
  console.log('  - Advanced tab: Alert reads "Modules in development"');
  console.log('  - Advanced tab PreviewCards: badges read "In development"');
  console.log('  - Aquifer tab Carter-Tracy params: no "Phase 5" in hints');
  console.log('  - Plots tab help footer: no "Phase 6" mention');
  console.log('');
  console.log('NOT touched by this sweep (handled by Capsule 4C chunk c.2.a):');
  console.log('  - PvtRock.jsx correlation dropdown "(Phase 4)" labels');
}

try {
  main();
} catch (err) {
  console.error('');
  console.error('✗ Sweep failed:');
  console.error(`  ${err.message}`);
  console.error('');
  console.error('No changes were written. All files remain in their original state.');
  process.exit(1);
}
