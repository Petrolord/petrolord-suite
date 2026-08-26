// Torque & Drag Studio (Drilling D1) acceptance: the /dev/torque-drag
// harness mounts the REAL workstation on the in-memory backend seeded with
// the oracle golden horizontal well; the UI must reproduce the engine's
// answers for that case — expectations are computed here from the same
// validated engines package and services (never hardcoded).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import {
  runCase, runWear, forceOut, torqueOut, depthOut,
} from '../src/pages/apps/TorqueDragStudio/services/tdRun.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(
  dirname, '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', 'torquedrag_cases.json',
), 'utf8'));

const IN = 0.0254;
const CASE = golden.cases.find((c) => c.name === 'horizontal');

// Mirror of inMemoryBackend's seeded case/geometry (same golden inputs).
const HOLE_SECTIONS = CASE.geometry.map((g) => (g.cased ? {
  from_md_m: g.fromMd, to_md_m: g.toMd, hole_id_m: 12.25 * IN, cased: true,
  casing_od_m: 9.625 * IN, casing_id_m: g.holeIdM, casing_weight_kgm: 69.94,
  grade: 'L-80', description: '9-5/8 47 casing',
} : {
  from_md_m: g.fromMd, to_md_m: g.toMd, hole_id_m: g.holeIdM, cased: false,
  description: '8-1/2 open hole',
}));
const CASE_ROW = {
  string: CASE.string,
  mud: { densityKgM3: CASE.mudDensityKgM3 },
  friction: { cased: 0.25, open: 0.35, overrides: [] },
  operations: {
    wobN: CASE.params.wobN,
    bitTorqueNm: CASE.params.bitTorqueNm,
    tripSpeedMs: CASE.params.tripSpeedMs,
    rpm: CASE.params.rpm,
    ops: ['trip_out', 'trip_in', 'rotate_on_bottom', 'slide_drill'],
    wear: { schedule: [{ rpm: 120, hours: 50 }], wearFactorMm3PerKNm: 2, intervalM: 30 },
  },
};
const GEOMETRY_ROW = { hole_sections: HOLE_SECTIONS };

// The workstation runs with stepM 5 (TDWorkstation.onRun); recompute the
// exact displayed values with the same service call.
function expected() {
  const { results } = runCase({
    stations: CASE.stations, caseRow: CASE_ROW, geometryRow: GEOMETRY_ROW, stepM: 5,
  });
  const wear = runWear({ results, caseRow: CASE_ROW, geometryRow: GEOMETRY_ROW });
  const buckMds = Object.values(results)
    .map((r) => r.summary.bucklingFirstMd).filter((v) => v != null).sort((a, b) => a - b);
  return {
    hookload: forceOut(results.trip_out.summary.hookloadN, 'm').toFixed(1),
    torque: torqueOut(results.rotate_on_bottom.summary.surfaceTorqueNm, 'm').toFixed(2),
    buckMd: buckMds.length ? depthOut(buckMds[0], 'm').toFixed(0) : 'none',
    wearPct: wear.summary.maxWallLossPct.toFixed(1),
    wearDepthMm: (wear.summary.maxWearDepthM * 1000).toFixed(2),
    oracle: CASE.expected,
    results,
  };
}

test('harness runs the golden case and the UI shows the engine numbers', async ({ page }) => {
  const exp = expected();

  // Engine vs oracle sanity inside the spec itself (rtol 1e-3 at stepM 5).
  const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
  expect(rel(exp.results.trip_out.summary.hookloadN, exp.oracle.trip_out.hookloadN)).toBeLessThan(1e-3);

  await page.goto('/dev/torque-drag');
  await expect(page.getByTestId('td-traj-info')).toContainText('definitive');

  await page.getByTestId('td-tab-analysis').click();
  await page.getByTestId('td-run').click();
  await expect(page.getByTestId('td-hookload')).toContainText(exp.hookload, { timeout: 20000 });
  await expect(page.getByTestId('td-torque')).toContainText(exp.torque);
  await expect(page.getByTestId('td-buckmd')).toContainText(exp.buckMd);
  await expect(page.getByTestId('td-wear')).toContainText(exp.wearPct);

  // Charts render.
  await expect(page.getByTestId('td-broomstick')).toBeVisible();
  await expect(page.getByTestId('td-torquechart')).toBeVisible();
  await expect(page.getByTestId('td-sideforce')).toBeVisible();

  // Wear tab shows the crescent-model depth.
  await page.getByTestId('td-tab-wear').click();
  await expect(page.getByTestId('td-wear-depth')).toContainText(`${exp.wearDepthMm} mm`);
  await expect(page.getByTestId('td-wearchart')).toBeVisible();
});

test('run history saves to the immutable store through the backend', async ({ page }) => {
  await page.goto('/dev/torque-drag');
  await page.getByTestId('td-tab-analysis').click();
  await page.getByTestId('td-run').click();
  await expect(page.getByTestId('td-hookload')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('td-save-run').click();
  await expect(page.locator('text=No saved runs yet.')).toHaveCount(0);
});

test('string builder edits update the case draft', async ({ page }) => {
  await page.goto('/dev/torque-drag');
  await expect(page.getByTestId('td-len-0')).toBeVisible();
  const rows = await page.locator('[data-testid^="td-len-"]').count();
  await page.getByTestId('td-add-component').click();
  await expect(page.locator('[data-testid^="td-len-"]')).toHaveCount(rows + 1);
  // Editing marks the case dirty and surfaces Save case.
  await expect(page.getByTestId('td-save-case')).toBeVisible();
});
