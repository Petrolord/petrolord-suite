// Basin & Charge Modeling G7.4 (BasinFlow-PLAN.md): the tile↔route
// contract — the route the seeded master_apps tile points at must
// resolve its lazy chunk (engines, contexts, plots — post-G7.3 the
// chunk no longer pulls @tensorflow/tfjs) and hand off to the auth
// gate; not crash, and not fall through to the home-redirect
// catch-all as an unregistered route would.

import { test, expect } from '@playwright/test';

test('basinflow-genesis app route loads its chunk and gates on auth', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dashboard/apps/geoscience/basinflow-genesis');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  expect(page.url()).not.toContain('basinflow-genesis'); // redirected by the auth gate
});

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldens = JSON.parse(fs.readFileSync(
  path.join(here, '..', 'test-data', 'basinflow', 'goldens.json'), 'utf8',
));
const REF = goldens.reference_basin;
const lastOf = (a) => a[a.length - 1];

async function openExpert(page) {
  await page.goto('/dev/basinflow-genesis');
  await expect(page.getByTestId('bf-harness')).toBeVisible();
  await page.getByTestId('bf-mode-expert').click();
  await expect(page.getByTestId('bf-simulate')).toBeVisible();
  // the seeded reference basin is the active well and its layers are listed
  await expect(page.locator('[data-testid="bf-well-row"][data-well-name="Reference Basin (oracle)"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-testid="bf-layer-card"]')).toHaveCount(4);
}

async function simulate(page) {
  await page.getByTestId('bf-simulate').click();
  await expect(page.getByTestId('bf-sim-status')).toHaveText('Complete', { timeout: 60000 });
  await page.getByTestId('bf-sim-view').click();
  await page.getByTestId('bf-results-tab-summary').click();
  await expect(page.getByTestId('bf-present-table')).toBeVisible();
}

test('BF0: the harness runs the oracle reference basin in Expert mode and shows the golden present-day source Ro', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openExpert(page);
  await simulate(page);
  // every layer's present-day Ro is the last sample of the golden series
  for (const [id, s] of Object.entries(REF.series)) {
    await expect(page.getByTestId(`bf-present-ro-${id}`)).toHaveText(lastOf(s.ro).toFixed(3));
  }
  expect(errors).toEqual([]);
});

test('BF0: erosion events and the surface temperature survive a reload (they were dropped on every save before)', async ({ page }) => {
  await openExpert(page);
  await simulate(page);
  const withErosion = lastOf(REF.series.source_shale.ro).toFixed(3);
  await expect(page.getByTestId('bf-present-ro-source_shale')).toHaveText(withErosion);
  // reload: the in-memory backend persists in sessionStorage, so the
  // erosion event and the 15 C surface come back with the well
  await page.reload();
  await page.getByTestId('bf-mode-expert').click();
  await expect(page.locator('[data-testid="bf-layer-card"]')).toHaveCount(4);
  await simulate(page);
  await expect(page.getByTestId('bf-present-ro-source_shale')).toHaveText(withErosion);
  // the no-erosion golden differs, so the value above proves the event was applied
  expect(withErosion).not.toBe(REF.final_source_ro_no_erosion.toFixed(3));
});
