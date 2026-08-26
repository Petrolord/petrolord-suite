// Perforation & Sand Control (Drilling D8) acceptance: the
// /dev/perforation-sand-control harness mounts the REAL app on the
// in-memory backend seeded with the oracle golden perforation case (2-1/8"
// through-tubing gun, golden sieve, D7 golden completion linked, golden
// profile served as published gm-1.0.0/pp-1.0.0 curves); the UI must
// reproduce the engine's answers — expectations recomputed here through
// the same pure psRun service + vendored engines.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import {
  runAll, buildGoldenCaseDoc, gunFromCatalog, GUN_CATALOG,
} from '../src/pages/apps/PerforationSandControl/services/psRun.js';
import { buildGoldenCaseDoc as buildCdGolden } from '../src/pages/apps/CompletionDesignStudio/services/cdRun.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const loadGolden = (name) => JSON.parse(fs.readFileSync(path.join(
  dirname, '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', name,
), 'utf8'));
const golden = loadGolden('perfsand_cases.json');
const completionGolden = loadGolden('completion_cases.json');

const curves = {
  tvdM: golden.profile.tvdM, svPa: golden.profile.svPa,
  shmaxPa: golden.profile.shmaxPa, shminPa: golden.profile.shminPa,
  ppPa: golden.profile.ppPa, ucsPa: golden.profile.ucsPa,
};
const doc = buildGoldenCaseDoc(golden, completionGolden);
const cdDoc = buildCdGolden(completionGolden);
const cdCase = { id: 'cd-1', name: cdDoc.name, string: cdDoc.string };
const res = runAll({ caseDoc: doc, stations: golden.stations, curves, cdCase });

test('harness reproduces the oracle sieve statistics and skin off the UI', async ({ page }) => {
  await page.goto('/dev/perforation-sand-control');

  // Interval & Sand tab (default): D-stats from the engine.
  await expect(page.getByTestId('ps-d50')).toContainText(
    (res.sand.stats.d50M * 1e6).toFixed(0), { timeout: 20000 },
  );
  await expect(page.getByTestId('ps-cu')).toContainText(res.sand.stats.uniformity.toFixed(2));
  await expect(page.getByTestId('ps-fines')).toContainText(`${res.sand.stats.finesPct.toFixed(1)}%`);
  await expect(page.getByTestId('ps-psd-chart')).toBeVisible();
  await expect(page.getByTestId('ps-banner')).toContainText(res.kpis.status);

  // Perforating tab: Karakas-Tariq breakdown + PR + underbalance band.
  await page.getByTestId('ps-tab-perforating').click();
  await expect(page.getByTestId('ps-skin-total')).toContainText(res.perforation.skin.total.toFixed(3));
  await expect(page.getByTestId('ps-sh')).toContainText(res.perforation.skin.sH.toFixed(3));
  await expect(page.getByTestId('ps-scz')).toContainText(res.perforation.skin.sCz.toFixed(3));
  await expect(page.getByTestId('ps-pr')).toContainText(res.perforation.pr.ratio.toFixed(3));
  await expect(page.getByTestId('ps-ub-band')).toContainText(
    `${res.perforation.underbalance.minPsi} to ${res.perforation.underbalance.maxPsi} psi`,
  );
});

test('clearance verdict flips with the gun choice', async ({ page }) => {
  await page.goto('/dev/perforation-sand-control');
  await expect(page.getByTestId('ps-d50')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('ps-tab-perforating').click();

  // Seeded 2-1/8" through-tubing gun passes the linked completion bore.
  await expect(page.getByTestId('ps-clearance-status')).toContainText(res.clearance.status);
  await expect(page.getByTestId('ps-clearance-bore')).toContainText(
    (res.clearance.boreM / 0.0254).toFixed(3),
  );

  // A 2-7/8" gun cannot pass the nipple bore: FAIL, and the banner follows.
  const bigGun = GUN_CATALOG.find((g) => g.name.startsWith('2-7/8"'));
  const failRes = runAll({ caseDoc: { ...doc, gun: gunFromCatalog(bigGun) }, cdCase });
  expect(failRes.clearance.status).toBe('FAIL');
  await page.getByTestId('ps-gun-select').selectOption(bigGun.name);
  await expect(page.getByTestId('ps-clearance-status')).toContainText('FAIL');
  await expect(page.getByTestId('ps-banner')).toContainText('FAIL');

  // A casing gun is checked against the program drift instead: the 7"
  // liner controls at the interval.
  const casingGun = GUN_CATALOG.find((g) => g.name.startsWith('4-5/8"'));
  const casingRes = runAll({ caseDoc: { ...doc, gun: gunFromCatalog(casingGun) } });
  await page.getByTestId('ps-gun-select').selectOption(casingGun.name);
  await expect(page.getByTestId('ps-clearance-status')).toContainText(casingRes.clearance.status);
  await expect(page.getByTestId('ps-clearance-bore')).toContainText(
    (casingRes.clearance.boreM / 0.0254).toFixed(3),
  );
});

test('sand control and sanding tabs carry the oracle numbers', async ({ page }) => {
  await page.goto('/dev/perforation-sand-control');
  await expect(page.getByTestId('ps-d50')).toBeVisible({ timeout: 20000 });

  await page.getByTestId('ps-tab-sandcontrol').click();
  await expect(page.getByTestId('ps-advisor-indication')).toContainText(res.sand.advisor.indication);
  await expect(page.getByTestId('ps-gravel-match')).toContainText(res.sand.gravel.matches[0].mesh);
  await expect(page.getByTestId('ps-gauge')).toContainText(
    `${Math.round(res.sand.gpScreen.gaugeM / 25.4e-6)} thou`,
  );

  // Sanding: the workstation assembles curves from the published Float32
  // logs, so compare numerically at Float32 precision.
  await page.getByTestId('ps-tab-sanding').click();
  await expect(page.getByTestId('ps-cdp-chart')).toBeVisible();
  const cdpText = await page.getByTestId('ps-gov-cdp').textContent();
  const shown = parseFloat(cdpText);
  expect(Math.abs(shown - res.sanding.governing.cdpPa / 1e6)).toBeLessThan(0.02);
  await expect(page.getByTestId('ps-gov-md')).toContainText(
    String(Math.round(res.sanding.governing.mdM)),
  );
});

test('duplicate, edit and save round-trip through the backend', async ({ page }) => {
  await page.goto('/dev/perforation-sand-control');
  await expect(page.getByTestId('ps-d50')).toBeVisible({ timeout: 20000 });

  // Saved case starts clean: no Save button rendered.
  await expect(page.getByTestId('ps-save-case')).toHaveCount(0);

  await page.getByTestId('ps-duplicate-case').click();
  await expect(page.getByTestId('ps-case-Golden Perforation (copy)')).toBeVisible({ timeout: 10000 });

  // Edit the interval bottom: dirty appears; save persists.
  await page.getByTestId('ps-interval-bottom').fill('2500');
  await page.getByTestId('ps-save-case').click();
  await expect(page.getByTestId('ps-save-case')).toHaveCount(0, { timeout: 10000 });

  // Round trip: leave and return; the edit survived.
  await page.getByTestId('ps-case-Golden Perforation').click();
  await expect(page.getByTestId('ps-interval-bottom')).toHaveValue(
    String(Math.round(golden.params.interval.bottomMdM)),
  );
  await page.getByTestId('ps-case-Golden Perforation (copy)').click();
  await expect(page.getByTestId('ps-interval-bottom')).toHaveValue('2500');
});
