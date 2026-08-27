// Well Integrity & P&A Studio (Drilling D10) acceptance: the
// /dev/well-integrity harness mounts the REAL app on the in-memory
// backend seeded with the oracle golden barrier/annulus/P&A case; the UI
// must reproduce the engine's answers — expectations recomputed here
// through the same pure wiRun service + vendored engines.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import {
  runAll, buildGoldenCaseDoc,
} from '../src/pages/apps/WellIntegrityPA/services/wiRun.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(
  dirname, '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens', 'wellintegrity_cases.json',
), 'utf8'));

const doc = buildGoldenCaseDoc(golden);
const res = runAll({ caseDoc: doc, stations: golden.stations });

test('harness reproduces the barrier category and checks off the UI', async ({ page }) => {
  await page.goto('/dev/well-integrity');
  await expect(page.getByTestId('wi-category')).toContainText(res.barriers.category, { timeout: 20000 });
  await expect(page.getByTestId('wi-primary-status')).toContainText(res.barriers.primary.status);
  await expect(page.getByTestId('wi-secondary-status')).toContainText(res.barriers.secondary.status);
  await expect(page.getByTestId('wi-banner')).toContainText(res.kpis.status);
  await expect(page.getByTestId('wi-check-no-failed-elements')).toContainText('PASS');
});

test('failing the DHSV turns the well orange, both failures red', async ({ page }) => {
  await page.goto('/dev/well-integrity');
  await expect(page.getByTestId('wi-category')).toBeVisible({ timeout: 20000 });
  const dhsvId = doc.barrier.elements.find((e) => e.name === 'DHSV').id;
  await page.getByTestId(`wi-el-status-${dhsvId}`).selectOption('failed');
  await expect(page.getByTestId('wi-category')).toContainText('orange');
  const whId = doc.barrier.elements.find((e) => e.name === 'Wellhead').id;
  await page.getByTestId(`wi-el-status-${whId}`).selectOption('failed');
  await expect(page.getByTestId('wi-category')).toContainText('red');
  await expect(page.getByTestId('wi-banner')).toContainText('FAIL');
});

test('annulus MAWOP carries the oracle numbers and the governing element', async ({ page }) => {
  await page.goto('/dev/well-integrity');
  await expect(page.getByTestId('wi-category')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('wi-tab-annulus').click();
  const a = res.annuli[0];
  await expect(page.getByTestId('wi-mawop')).toContainText((a.result.mawopPa / 1e6).toFixed(2));
  await expect(page.getByTestId('wi-governing')).toContainText(a.result.governing);
  await expect(page.getByTestId('wi-annulus-chart')).toBeVisible();
});

test('plug placement, program compliance and takeoff match the engine', async ({ page }) => {
  await page.goto('/dev/well-integrity');
  await expect(page.getByTestId('wi-category')).toBeVisible({ timeout: 20000 });

  await page.getByTestId('wi-tab-plugs').click();
  const p1 = res.program.designs.find((d) => d.name === 'P1 reservoir primary');
  await expect(page.getByTestId('wi-slurry')).toContainText(p1.placement.slurryM3.toFixed(2));
  await expect(page.getByTestId('wi-displacement')).toContainText(p1.placement.displacementM3.toFixed(2));
  await expect(page.getByTestId('wi-plugtop')).toContainText(p1.placement.pluggedTopMdM.toFixed(0));

  await page.getByTestId('wi-tab-program').click();
  await expect(page.getByTestId('wi-program-pass')).toContainText('GAPS');
  await expect(page.getByTestId('wi-zone-comp-0')).toContainText('PASS');
  await expect(page.getByTestId('wi-zone-comp-1')).toContainText('FAIL');
  await expect(page.getByTestId('wi-takeoff-slurry')).toContainText(res.program.takeoff.slurryM3.toFixed(2));
});

test('duplicate, edit and save round-trip through the backend', async ({ page }) => {
  await page.goto('/dev/well-integrity');
  await expect(page.getByTestId('wi-category')).toBeVisible({ timeout: 20000 });

  await expect(page.getByTestId('wi-save-case')).toHaveCount(0);
  await page.getByTestId('wi-duplicate-case').click();
  await expect(page.getByTestId('wi-case-Golden Integrity (copy)')).toBeVisible({ timeout: 10000 });

  // Edit a plug top: the placement moves; save persists.
  await page.getByTestId('wi-tab-plugs').click();
  await page.getByTestId('wi-plug-top').fill('2400');
  const moved = runAll({
    caseDoc: {
      ...doc,
      pa: {
        ...doc.pa,
        plugs: doc.pa.plugs.map((p) => (p.name === 'P1 reservoir primary' ? { ...p, topMdM: 2400 } : p)),
      },
    },
    stations: golden.stations,
  });
  const movedP1 = moved.program.designs.find((d) => d.name === 'P1 reservoir primary');
  await expect(page.getByTestId('wi-slurry')).toContainText(movedP1.placement.slurryM3.toFixed(2));
  await page.getByTestId('wi-save-case').click();
  await expect(page.getByTestId('wi-save-case')).toHaveCount(0, { timeout: 10000 });

  await page.getByTestId('wi-case-Golden Integrity').click();
  await expect(page.getByTestId('wi-plug-top')).toHaveValue(String(golden.program.plugs[0].topMdM));
  await page.getByTestId('wi-case-Golden Integrity (copy)').click();
  await expect(page.getByTestId('wi-plug-top')).toHaveValue('2400');
});
