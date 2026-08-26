// Stimulation Designer (Drilling D9) acceptance: the /dev/stimulation
// harness mounts the REAL app on the in-memory backend seeded with the
// oracle golden frac + acid case (golden profile served as published
// gm-1.0.0/pp-1.0.0 curves); the UI must reproduce the engine's answers
// — expectations recomputed here through the same pure stRun service +
// vendored engines.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import {
  runAll, buildGoldenCaseDoc,
} from '../src/pages/apps/StimulationDesigner/services/stRun.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(
  dirname, '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', 'stim_cases.json',
), 'utf8'));

const curves = {
  tvdM: golden.profile.tvdM, svPa: golden.profile.svPa,
  shmaxPa: golden.profile.shmaxPa, shminPa: golden.profile.shminPa,
  ppPa: golden.profile.ppPa, ucsPa: golden.profile.ucsPa,
};
const doc = buildGoldenCaseDoc(golden);
const res = runAll({ caseDoc: doc, stations: golden.stations, curves });
const kgdRes = runAll({
  caseDoc: { ...doc, frac: { ...doc.frac, model: 'kgd' } },
  stations: golden.stations,
  curves,
});

test('harness reproduces the rock context and PKN geometry off the UI', async ({ page }) => {
  await page.goto('/dev/stimulation');
  await expect(page.getByTestId('st-closure')).toContainText(
    (res.rock.closurePa / 1e6).toFixed(2), { timeout: 20000 },
  );
  await expect(page.getByTestId('st-pres')).toContainText((res.rock.pResPa / 1e6).toFixed(2));
  await expect(page.getByTestId('st-wmax')).toContainText((res.geometry.wMaxM * 1000).toFixed(2));
  await expect(page.getByTestId('st-pnet')).toContainText((res.geometry.pNetPa / 1e6).toFixed(2));
  await expect(page.getByTestId('st-bhtp')).toContainText((res.geometry.bhtpPa / 1e6).toFixed(2));
  await expect(page.getByTestId('st-width-chart')).toBeVisible();
  await expect(page.getByTestId('st-banner')).toContainText(res.kpis.status);
});

test('KGD toggle moves the numbers to the engine answers', async ({ page }) => {
  await page.goto('/dev/stimulation');
  await expect(page.getByTestId('st-wmax')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('st-model-kgd').click();
  await expect(page.getByTestId('st-wmax')).toContainText((kgdRes.geometry.wMaxM * 1000).toFixed(2));
  await expect(page.getByTestId('st-pnet')).toContainText((kgdRes.geometry.pNetPa / 1e6).toFixed(2));
  await page.getByTestId('st-model-pkn').click();
  await expect(page.getByTestId('st-wmax')).toContainText((res.geometry.wMaxM * 1000).toFixed(2));
});

test('schedule, productivity and acidizing carry the oracle numbers', async ({ page }) => {
  await page.goto('/dev/stimulation');
  await expect(page.getByTestId('st-wmax')).toBeVisible({ timeout: 20000 });

  await page.getByTestId('st-tab-schedule').click();
  await expect(page.getByTestId('st-ti')).toContainText((res.balance.tiS / 60).toFixed(1));
  await expect(page.getByTestId('st-eta')).toContainText((res.balance.etaFrac * 100).toFixed(1));
  await expect(page.getByTestId('st-pad')).toContainText((res.schedule.padFrac * 100).toFixed(1));
  await expect(page.getByTestId('st-mass')).toContainText((res.schedule.massKg / 1000).toFixed(1));
  await expect(page.getByTestId('st-schedule-chart')).toBeVisible();
  await expect(page.getByTestId('st-wp')).toContainText((res.pack.wpM * 1000).toFixed(2));

  await page.getByTestId('st-tab-productivity').click();
  await expect(page.getByTestId('st-cfd')).toContainText(res.productivity.cfd.toFixed(3));
  await expect(page.getByTestId('st-sf')).toContainText(res.productivity.sF.toFixed(3));
  await expect(page.getByTestId('st-foi')).toContainText(res.productivity.pr.ratio.toFixed(2));

  await page.getByTestId('st-tab-acidizing').click();
  await expect(page.getByTestId('st-sbefore')).toContainText(res.acid.sandstone.sBefore.toFixed(2));
  await expect(page.getByTestId('st-acid-vol')).toContainText(res.acid.sandstone.volumeM3.toFixed(1));
  await expect(page.getByTestId('st-carb-skin')).toContainText(res.acid.carbonate.skin.toFixed(2));
  await expect(page.getByTestId('st-qmax')).toContainText(
    (res.acid.matrixRate.qM3s * 60000).toFixed(0),
  );
});

test('duplicate, edit and save round-trip through the backend', async ({ page }) => {
  await page.goto('/dev/stimulation');
  await expect(page.getByTestId('st-wmax')).toBeVisible({ timeout: 20000 });

  await expect(page.getByTestId('st-save-case')).toHaveCount(0);
  await page.getByTestId('st-duplicate-case').click();
  await expect(page.getByTestId('st-case-Golden Stimulation (copy)')).toBeVisible({ timeout: 10000 });

  // Edit the target half-length: geometry moves; save persists.
  await page.getByTestId('st-xf').fill('200');
  const moved = runAll({
    caseDoc: { ...doc, frac: { ...doc.frac, xfM: 200 } },
    stations: golden.stations,
    curves,
  });
  await expect(page.getByTestId('st-wmax')).toContainText((moved.geometry.wMaxM * 1000).toFixed(2));
  await page.getByTestId('st-save-case').click();
  await expect(page.getByTestId('st-save-case')).toHaveCount(0, { timeout: 10000 });

  await page.getByTestId('st-case-Golden Stimulation').click();
  await expect(page.getByTestId('st-xf')).toHaveValue(String(golden.params.xfM));
  await page.getByTestId('st-case-Golden Stimulation (copy)').click();
  await expect(page.getByTestId('st-xf')).toHaveValue('200');
});
