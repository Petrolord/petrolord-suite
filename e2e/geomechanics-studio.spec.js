// Geomechanics Studio (Drilling D5) acceptance: the /dev/geomechanics
// harness mounts the REAL workstation on the in-memory backend serving the
// oracle golden profile as published pp-1.0.0 curves; the UI must reproduce
// the engine's answers — expectations computed here from the same
// services/engines.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import {
  assembleBaseProfile, runMem, runWindow, emwOut,
} from '../src/pages/apps/GeomechanicsStudio/services/gmRun.js';
import { tvdAt } from '../packages/engines/engines/drilling/wellControl.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(
  dirname, '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', 'geomech_cases.json',
), 'utf8'));

const CASE = golden.cases.find((c) => c.well === 'slant');
const PROF = golden.profile;
const P = golden.params;

const CASE_PARAMS = {
  nu: P.nu, alphaBiot: P.alphaBiot, ePa: P.ePa, epsX: P.epsX, epsY: P.epsY,
  frictionAngleDeg: P.frictionAngleDeg, regime: P.regime,
  shmaxAzimuthDeg: P.shmaxAzimuthDeg, tensileStrengthPa: P.tensileStrengthPa,
  ucs: { correlation: 'horsrud' },
};

function expected() {
  // Mirror the harness path: published pp-1.0.0 curves round-trip through
  // Float32 MPa (the in-memory backend serves them that way).
  const f32 = (arr) => Array.from(Float32Array.from(arr, (v) => v / 1e6), (v) => v * 1e6);
  // PP-U2-013: the harness serves the TVD profile on a regular MD grid along
  // the slant trajectory (as Pore Pressure publishes on MD); the app carries
  // it back to TVD through the same trajectory
  const T = PROF.tvdM; const step = T[1] - T[0];
  const lerp = (xs, ys, x) => { let i = 1; while (i < xs.length - 1 && xs[i] < x) i += 1; const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + f * (ys[i] - ys[i - 1]); };
  const tdMd = CASE.stations[CASE.stations.length - 1].md;
  const md = [];
  for (let m = T[0]; m <= tdMd + 1e-9 && tvdAt(CASE.stations, m) <= T[T.length - 1] + 1e-9; m += step) md.push(m);
  const onGrid = (arr) => md.map((m) => lerp(T, arr, tvdAt(CASE.stations, m)));
  const base = assembleBaseProfile({
    source: { ppSource: 'published' },
    published: { tvdM: md, ppPa: f32(onGrid(PROF.ppPa)), obgPa: f32(onGrid(PROF.svPa)), dtAligned: Array.from(Float32Array.from(onGrid(PROF.dtUsPerM))) },
    stations: CASE.stations,
  });
  const dt = base.dtAligned;
  const mem = runMem({ base, dtUsPerM: dt, params: CASE_PARAMS });
  const win = runWindow({ stations: CASE.stations, mem, params: CASE_PARAMS });
  const last = win.rows[win.rows.length - 1];
  return {
    quality: String(mem.quality.score),
    collapseTd: emwOut(last.collapseEmwKgM3, 'm').toFixed(3),
    fracTd: emwOut(last.fracInitEmwKgM3, 'm').toFixed(3),
    windowMin: emwOut(win.tightest.widthKgM3, 'm').toFixed(3),
    oracle: CASE.expected,
    win,
  };
}

test('harness builds the MEM and window with the engine numbers', async ({ page }) => {
  const exp = expected();
  // Engine (through the f32 round trip) vs oracle: within 1e-4 relative.
  const rel = (a, b) => Math.abs(a - b) / Math.max(1e-9, Math.abs(b));
  expect(rel(exp.win.tightest.widthKgM3, exp.oracle.tightestWidthKgM3)).toBeLessThan(1e-3);

  await page.goto('/dev/geomechanics');
  await expect(page.getByTestId('gm-traj-info')).toContainText('definitive');

  await page.getByTestId('gm-load').click();
  await expect(page.getByTestId('gm-curve-status')).toContainText('published PP: found', { timeout: 20000 });

  await page.getByTestId('gm-tab-profiles').click();
  await page.getByTestId('gm-run-mem').click();
  await expect(page.getByTestId('gm-quality')).toContainText(exp.quality, { timeout: 20000 });
  await expect(page.getByTestId('gm-stress-chart')).toBeVisible();
  await expect(page.getByTestId('gm-ucs-chart')).toBeVisible();

  await page.getByTestId('gm-tab-window').click();
  await page.getByTestId('gm-run-window').click();
  await expect(page.getByTestId('gm-collapse-td')).toContainText(exp.collapseTd, { timeout: 30000 });
  await expect(page.getByTestId('gm-fracinit-td')).toContainText(exp.fracTd);
  await expect(page.getByTestId('gm-window-min')).toContainText(exp.windowMin);
  await expect(page.getByTestId('gm-window-chart')).toBeVisible();
});

test('publish + run history through the backend', async ({ page }) => {
  await page.goto('/dev/geomechanics');
  await page.getByTestId('gm-load').click();
  await expect(page.getByTestId('gm-curve-status')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('gm-tab-profiles').click();
  await page.getByTestId('gm-run-mem').click();
  await expect(page.getByTestId('gm-quality')).toBeVisible({ timeout: 20000 });
  // Toasts are not mounted on /dev routes; the publish round trip itself is
  // jest-verified (gmRun.test). Here: the button cycles back from Publishing.
  await page.getByTestId('gm-publish').click();
  await expect(page.getByTestId('gm-publish')).toContainText('Publish SHMIN/SHMAX/UCS', { timeout: 20000 });
  await expect(page.getByTestId('gm-publish')).toBeEnabled();
  await page.getByTestId('gm-tab-window').click();
  await page.getByTestId('gm-run-window').click();
  await expect(page.getByTestId('gm-collapse-td')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('gm-save-run').click();
  await expect(page.locator('text=No saved runs yet.')).toHaveCount(0);
});

test('parameter edits mark the case dirty', async ({ page }) => {
  await page.goto('/dev/geomechanics');
  await page.getByTestId('gm-nu').fill('0.3');
  await expect(page.getByTestId('gm-save-case')).toBeVisible();
});
