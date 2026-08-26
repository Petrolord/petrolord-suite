// Cementing Studio (Drilling D4) acceptance: the /dev/cementing harness
// mounts the REAL workstation on the in-memory backend seeded with the
// oracle golden slant-well 7" job; the UI must reproduce the engine's
// answers — expectations computed here from the same services/engines.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import {
  runVolumes, runPlacement, runStandoff,
  volumeOut, pressureOut, emwOut,
} from '../src/pages/apps/CementingStudio/services/cmtRun.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(
  dirname, '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', 'cementing_cases.json',
), 'utf8'));

const CASE = golden.cases.find((c) => c.well === 'slant');

// Mirror of inMemoryBackend's seeded case.
const CASE_ROW = {
  name: 'Golden 7in job',
  casing: CASE.casing,
  fluids: {
    mudInHole: { densityKgM3: 1440, fann: CASE.mudFann },
    program: [
      { kind: 'spacer', densityKgM3: 1500, volumeM3: 4, fann: CASE.spacerFann },
      { kind: 'lead', densityKgM3: 1560, volumeM3: null, fann: CASE.leadFann },
      { kind: 'tail', densityKgM3: 1900, volumeM3: null, fann: CASE.tailFann },
      { kind: 'displacement', densityKgM3: 1440, volumeM3: null, fann: CASE.mudFann },
    ],
  },
  job: {
    tocMd: CASE.tocMd,
    excessOpenHolePct: CASE.excessOpenHolePct,
    leadTailSplitMd: CASE.leadTailSplitMd,
    pumpRateM3s: CASE.pumpRateM3s,
    slurryYieldM3PerSack: CASE.slurryYieldM3PerSack,
    fracEmwKgM3: 1750,
  },
  centralizers: CASE.centralizer,
};
const GEOMETRY_ROW = { hole_sections: CASE.holeSections };

function expected() {
  const args = { stations: CASE.stations, caseRow: CASE_ROW, geometryRow: GEOMETRY_ROW };
  const vols = runVolumes(args);
  const { placement } = runPlacement(args);
  const { profile, requiredSpacingM } = runStandoff(args);
  return {
    slurry: volumeOut(vols.slurryM3, 'm').toFixed(1),
    sacks: vols.sacks.toFixed(0),
    pumpEnd: pressureOut(placement.endPumpPressurePa, 'm').toFixed(0),
    ecdMax: emwOut(placement.maxEcdPrevShoeKgM3, 'm').toFixed(3),
    minStandoff: (100 * profile.minStandoff).toFixed(0),
    reqSpacing: requiredSpacingM.toFixed(1),
    oracle: CASE.expected,
    vols,
  };
}

test('harness computes the golden job and the UI shows the engine numbers', async ({ page }) => {
  const exp = expected();
  const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
  expect(rel(exp.vols.slurryM3, exp.oracle.volumes.slurryM3)).toBeLessThan(1e-6);

  await page.goto('/dev/cementing');
  await expect(page.getByTestId('cmt-traj-info')).toContainText('definitive');

  await page.getByTestId('cmt-compute').click();
  await expect(page.getByTestId('cmt-slurry')).toContainText(exp.slurry, { timeout: 20000 });
  await expect(page.getByTestId('cmt-sacks')).toContainText(exp.sacks);

  await page.getByTestId('cmt-tab-placement').click();
  await page.getByTestId('cmt-run').click();
  await expect(page.getByTestId('cmt-pump-end')).toContainText(exp.pumpEnd, { timeout: 30000 });
  await expect(page.getByTestId('cmt-ecd-max')).toContainText(exp.ecdMax);
  await expect(page.getByTestId('cmt-placement-chart')).toBeVisible();
  await expect(page.getByTestId('cmt-ecd-chart')).toBeVisible();
  await expect(page.getByTestId('cmt-checklist')).toBeVisible();

  await page.getByTestId('cmt-tab-centralization').click();
  await expect(page.getByTestId('cmt-min-standoff')).toContainText(exp.minStandoff);
  await expect(page.getByTestId('cmt-req-spacing')).toContainText(exp.reqSpacing);
  await expect(page.getByTestId('cmt-standoff-chart')).toBeVisible();
});

test('run history saves through the backend', async ({ page }) => {
  await page.goto('/dev/cementing');
  await page.getByTestId('cmt-tab-placement').click();
  await page.getByTestId('cmt-run').click();
  await expect(page.getByTestId('cmt-pump-end')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('cmt-save-run').click();
  await expect(page.locator('text=No saved runs yet.')).toHaveCount(0);
});

test('job edits mark the case dirty', async ({ page }) => {
  await page.goto('/dev/cementing');
  await page.getByTestId('cmt-toc').fill('1100');
  await expect(page.getByTestId('cmt-save-case')).toBeVisible();
});
