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

test('BF1: Expert mode edits the erosion events and the heat-flow model, and the engine answers with the golden controls', async ({ page }) => {
  await openExpert(page);
  // remove the seeded erosion event: the no-erosion control
  await page.getByTestId('bf-history-tab-erosion').click();
  await expect(page.getByTestId('bf-erosion-amount-0')).toHaveValue('600');
  await page.getByTestId('bf-erosion-remove-0').click();
  await expect(page.getByTestId('bf-erosion-empty')).toBeVisible();
  await simulate(page);
  await expect(page.getByTestId('bf-present-ro-source_shale')).toHaveText(REF.final_source_ro_no_erosion.toFixed(3));

  // put the event back and switch the heat flow to a constant 60: the constant-Q control
  await page.getByTestId('bf-tab-properties').click();
  await page.getByTestId('bf-history-tab-erosion').click();
  await page.getByTestId('bf-erosion-add').click();
  await page.getByTestId('bf-erosion-age-0').fill('10');
  await page.getByTestId('bf-erosion-amount-0').fill('600');
  await page.getByTestId('bf-history-tab-thermal').click();
  await expect(page.getByTestId('bf-heatflow-table')).toBeVisible(); // the seeded history is editable
  await expect(page.getByTestId('bf-heatflow-q-0')).toHaveValue('80');
  await page.getByTestId('bf-heatflow-type-constant').click();
  await page.getByTestId('bf-heatflow-value').fill('60');
  await expect(page.getByTestId('bf-heatflow-chart')).toBeVisible();
  await simulate(page);
  await expect(page.getByTestId('bf-present-ro-source_shale')).toHaveText(REF.final_source_ro_constant_q.toFixed(3));

  // the surface temperature is an input now and it changes the answer
  await page.getByTestId('bf-tab-properties').click();
  await page.getByTestId('bf-history-tab-thermal').click();
  await expect(page.getByTestId('bf-surface-temp')).toHaveValue('15');
  await page.getByTestId('bf-surface-temp').fill('25');
  await simulate(page);
  await expect(page.getByTestId('bf-present-ro-source_shale')).not.toHaveText(REF.final_source_ro_constant_q.toFixed(3));
});

test('BF2: calibration points are typed or imported from a file, tops files and registry wells become the stratigraphy', async ({ page }) => {
  await openExpert(page);
  await simulate(page);

  // type two Ro points: the misfit is live
  await page.getByTestId('bf-tab-calibration').click();
  await page.getByTestId('bf-cal-ro-add').click();
  await page.getByTestId('bf-cal-ro-depth-0').fill('3000');
  await page.getByTestId('bf-cal-ro-value-0').fill('0.8');
  await expect(page.getByTestId('bf-cal-ro-rms')).not.toHaveText('0.000 %');

  // import a calibration file: preview, problems for the bad row, replace
  await page.getByTestId('bf-tab-import').click();
  await page.getByTestId('bf-import-input-calibration').setInputFiles({
    name: 'cal.csv', mimeType: 'text/csv',
    buffer: Buffer.from('depth,Ro,temp\n1500,0.55,65\n3000,1.15,110\n3500,abc,\n'),
  });
  await expect(page.getByTestId('bf-import-preview-calibration')).toHaveText('2 Ro points, 2 temperature points read.');
  await expect(page.getByTestId('bf-import-problems-calibration')).toContainText('Row 4');
  await page.getByTestId('bf-import-apply-calibration').click();
  await page.getByTestId('bf-tab-calibration').click();
  await expect(page.getByTestId('bf-cal-ro-depth-1')).toHaveValue('3000');
  await expect(page.getByTestId('bf-cal-temp-value-1')).toHaveValue('110');
  await expect(page.getByTestId('bf-cal-ro-depth-2')).toHaveCount(0); // replaced, not appended

  // a tops file replaces the stratigraphy with placeholder ages flagged
  await page.getByTestId('bf-tab-import').click();
  await page.getByTestId('bf-import-tab-tops').click();
  await page.getByTestId('bf-import-input-tops').setInputFiles({
    name: 'tops.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Formation,MD\nUpper,0\nMiddle,1000\nLower,2500\n'),
  });
  await page.getByTestId('bf-import-tops-td').fill('4000');
  await expect(page.getByTestId('bf-import-preview-tops')).toContainText('1500');
  await page.getByTestId('bf-import-apply-tops').click();
  await page.getByTestId('bf-tab-properties').click();
  await expect(page.locator('[data-testid="bf-layer-card"]')).toHaveCount(3);
  await expect(page.getByTestId('bf-layer-ages-guessed').first()).toBeVisible();

  // a registry well's tops do the same and tie the model to the well
  await page.getByTestId('bf-tab-import').click();
  await page.getByTestId('bf-import-tab-registry').click();
  await page.getByTestId('bf-registry-well').selectOption({ label: 'KETA-1 (4 tops)' });
  await expect(page.getByTestId('bf-registry-preview')).toContainText('Top Source Shale');
  await page.getByTestId('bf-registry-apply').click();
  await expect(page.getByTestId('bf-registry-tied')).toHaveText('Tied to KETA-1.');
  await page.getByTestId('bf-tab-properties').click();
  await expect(page.locator('[data-testid="bf-layer-card"]')).toHaveCount(4);
});
