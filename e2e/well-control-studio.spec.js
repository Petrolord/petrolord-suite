// Well Control Studio (Drilling D3) acceptance: the /dev/well-control
// harness mounts the REAL workstation on the in-memory backend seeded with
// the oracle golden slant well + moderate_gas kick; the UI must reproduce
// the engine's answers — expectations computed here from the same
// services/engines (never hardcoded).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import {
  runKillSheet, runKickTolerance, runVolumes,
  pressureOut, emwOut, volumeOut,
} from '../src/pages/apps/WellControlStudio/services/wcRun.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(
  dirname, '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', 'wellcontrol_cases.json',
), 'utf8'));

const IN = 0.0254;
const CASE = golden.cases.find((c) => c.well === 'slant');

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
  pump: { outputM3PerStroke: CASE.pump.outputM3PerStroke, scr: [{ spm: 30, pressurePa: CASE.pump.scrPressurePa }], scrIndex: 0 },
  shoe: { mdM: CASE.shoeMd, fracEmwKgM3: CASE.fracEmwKgM3 },
  kick: { sidppPa: 2.0e6, sicpPa: 2.9e6, pitGainM3: 3.0, influxDensityKgM3: 240, kickIntensityKgM3: 60 },
};
const GEOMETRY_ROW = { hole_sections: HOLE_SECTIONS };

function expected() {
  const args = { stations: CASE.stations, caseRow: CASE_ROW, geometryRow: GEOMETRY_ROW };
  const v = runVolumes(args);
  const ks = runKillSheet(args).result;
  const kt = runKickTolerance(args);
  return {
    volString: volumeOut(v.stringVolumeM3, 'm').toFixed(1),
    kmw: emwOut(ks.killMudDensityKgM3, 'm').toFixed(3),
    icp: pressureOut(ks.icpPa, 'm').toFixed(0),
    fcp: pressureOut(ks.fcpPa, 'm').toFixed(0),
    influxKind: ks.influx.kind,
    maasp: pressureOut(kt.result.maaspPa, 'm').toFixed(0),
    kt: volumeOut(kt.result.kickToleranceM3, 'm').toFixed(2),
    oracle: CASE.expected,
    ks,
  };
}

test('harness computes the golden kick and the UI shows the engine numbers', async ({ page }) => {
  const exp = expected();
  // Engine vs oracle sanity inside the spec.
  const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
  expect(rel(exp.ks.killMudDensityKgM3, exp.oracle.killSheets.moderate_gas.killMudDensityKgM3)).toBeLessThan(1e-6);

  await page.goto('/dev/well-control');
  await expect(page.getByTestId('wc-traj-info')).toContainText('definitive');

  await page.getByTestId('wc-compute-volumes').click();
  await expect(page.getByTestId('wc-vol-string')).toContainText(exp.volString, { timeout: 20000 });
  await expect(page.getByTestId('wc-cap-table')).toBeVisible();

  await page.getByTestId('wc-tab-killsheet').click();
  await page.getByTestId('wc-run').click();
  await expect(page.getByTestId('wc-kmw')).toContainText(exp.kmw, { timeout: 20000 });
  await expect(page.getByTestId('wc-icp')).toContainText(exp.icp);
  await expect(page.getByTestId('wc-fcp')).toContainText(exp.fcp);
  await expect(page.getByTestId('wc-influx')).toContainText(exp.influxKind);
  await expect(page.getByTestId('wc-schedule-chart')).toBeVisible();
  await expect(page.getByTestId('wc-schedule-table')).toBeVisible();

  await page.getByTestId('wc-tab-kicktol').click();
  await expect(page.getByTestId('wc-maasp')).toContainText(exp.maasp);
  await expect(page.getByTestId('wc-kt')).toContainText(exp.kt);
  await expect(page.getByTestId('wc-kt-chart')).toBeVisible();
});

test("driller's method redraws the schedule and run history saves", async ({ page }) => {
  await page.goto('/dev/well-control');
  await page.getByTestId('wc-tab-killsheet').click();
  await page.getByTestId('wc-run').click();
  await expect(page.getByTestId('wc-kmw')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('wc-method').click();
  await page.getByRole('option', { name: "Driller's method" }).click();
  await expect(page.getByTestId('wc-schedule-chart')).toContainText("driller's method");
  await page.getByTestId('wc-save-run').click();
  await expect(page.locator('text=No saved runs yet.')).toHaveCount(0);
});

test('kick input edits mark the case dirty', async ({ page }) => {
  await page.goto('/dev/well-control');
  await page.getByTestId('wc-tab-killsheet').click();
  await page.getByTestId('wc-sidpp').fill('2500');
  await expect(page.getByTestId('wc-save-case')).toBeVisible();
});
