// Drilling Fluids & Hydraulics Studio (Drilling D2) acceptance: the
// /dev/hydraulics harness mounts the REAL workstation on the in-memory
// backend seeded with the oracle golden slant well; the UI must reproduce
// the engine's answers — expectations are computed here from the same
// validated engines/services (never hardcoded).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import {
  runHydraulics, runSurgeSwab, runHoleCleaning, requiredFlowRate,
  pressureOut, emwOut, flowOut,
} from '../src/pages/apps/HydraulicsStudio/services/hydRun.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(
  dirname, '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', 'hydraulics_cases.json',
), 'utf8'));

const IN = 0.0254;
const CASE = golden.cases.find((c) => c.well === 'slant' && c.mudName === 'kcl_polymer');

// Mirror of inMemoryBackend's seed (same golden inputs).
const HOLE_SECTIONS = CASE.geometry.map((g) => (g.cased ? {
  from_md_m: g.fromMd, to_md_m: g.toMd, hole_id_m: 12.25 * IN, cased: true,
  casing_od_m: 9.625 * IN, casing_id_m: g.holeIdM, casing_weight_kgm: 69.94,
  grade: 'L-80', description: '9-5/8 47 casing',
} : {
  from_md_m: g.fromMd, to_md_m: g.toMd, hole_id_m: g.holeIdM, cased: false,
  description: '8-1/2 open hole',
}));
const CASE_ROW = {
  mud: { densityKgM3: CASE.mud.densityKgM3, fann: CASE.mud.fann, model: 'auto' },
  string: CASE.string,
  flow: { flowRateM3s: 0.025, nozzlesMm: [14, 14, 14], surfaceLossPa: 0 },
  trip: { mode: 'closed', maxSpeedMs: 3 },
  cuttings: { ropMs: 0.005, dParticleM: 0.006, rhoSolidKgM3: 2600 },
};
const GEOMETRY_ROW = { hole_sections: HOLE_SECTIONS };

function expected() {
  const args = { stations: CASE.stations, caseRow: CASE_ROW, geometryRow: GEOMETRY_ROW };
  const hyd = runHydraulics(args);
  const ss = runSurgeSwab({ ...args, speeds: Array.from({ length: 10 }, (_, i) => +(0.1 * (i + 1)).toFixed(2)) });
  const hc = runHoleCleaning(args);
  const minQ = requiredFlowRate({ ...args, targetTr: 0.5 });
  const at05 = ss.sweep.find((r) => Math.abs(r.tripSpeedMs - 0.5) < 1e-9);
  return {
    pump: pressureOut(hyd.summary.pumpPressurePa, 'm').toFixed(0),
    bitdp: pressureOut(hyd.summary.bitDpPa, 'm').toFixed(0),
    ecd: emwOut(hyd.summary.ecdAtTdKgM3, 'm').toFixed(3),
    surge05: emwOut(at05.surgeEmwKgM3, 'm').toFixed(3),
    swab05: emwOut(at05.swabEmwKgM3, 'm').toFixed(3),
    minTr: hc.summary.minTransportRatio.toFixed(3),
    minQ: minQ != null ? flowOut(minQ, 'm').toFixed(0) : null,
    oracle: CASE.expected,
    hyd,
  };
}

test('harness runs the golden case and the UI shows the engine numbers', async ({ page }) => {
  const exp = expected();

  // Engine vs oracle sanity inside the spec (tight: same algebra).
  const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
  expect(rel(exp.hyd.summary.pumpPressurePa, exp.oracle.hydraulics['q_0.025'].pumpPressurePa)).toBeLessThan(1e-6);

  await page.goto('/dev/hydraulics');
  await expect(page.getByTestId('hyd-traj-info')).toContainText('definitive');
  await expect(page.getByTestId('hyd-fit-table')).toBeVisible();
  await expect(page.getByTestId('hyd-rheogram')).toBeVisible();

  await page.getByTestId('hyd-tab-hydraulics').click();
  await page.getByTestId('hyd-run').click();
  await expect(page.getByTestId('hyd-pump')).toContainText(exp.pump, { timeout: 20000 });
  await expect(page.getByTestId('hyd-bitdp')).toContainText(exp.bitdp);
  await expect(page.getByTestId('hyd-ecd')).toContainText(exp.ecd);
  await expect(page.getByTestId('hyd-ecd-chart')).toBeVisible();
  await expect(page.getByTestId('hyd-loss-table')).toBeVisible();

  await page.getByTestId('hyd-tab-surge').click();
  await page.getByTestId('hyd-surge-run').click();
  await expect(page.getByTestId('hyd-surge-05')).toContainText(exp.surge05, { timeout: 20000 });
  await expect(page.getByTestId('hyd-swab-05')).toContainText(exp.swab05);
  await expect(page.getByTestId('hyd-surge-chart')).toBeVisible();
  // The in-memory backend serves a synthetic PP/FP window: safe speed resolves.
  await expect(page.getByTestId('hyd-safe-speed')).not.toContainText('no PP/FP');

  await page.getByTestId('hyd-tab-cleaning').click();
  await page.getByTestId('hyd-clean-run').click();
  await expect(page.getByTestId('hyd-min-tr')).toContainText(exp.minTr, { timeout: 20000 });
  if (exp.minQ != null) {
    await expect(page.getByTestId('hyd-min-q')).toContainText(exp.minQ);
  }
});

test('run history saves through the backend', async ({ page }) => {
  await page.goto('/dev/hydraulics');
  await page.getByTestId('hyd-tab-hydraulics').click();
  await page.getByTestId('hyd-run').click();
  await expect(page.getByTestId('hyd-pump')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('hyd-save-run').click();
  await expect(page.locator('text=No saved runs yet.')).toHaveCount(0);
});

test('mud edits mark the case dirty and refit the models', async ({ page }) => {
  await page.goto('/dev/hydraulics');
  await expect(page.getByTestId('hyd-fit-table')).toBeVisible();
  await page.getByTestId('hyd-f600').fill('70');
  await expect(page.getByTestId('hyd-save-case')).toBeVisible();
  await expect(page.getByTestId('hyd-fit-table')).toBeVisible();
});
