// Pore Pressure Studio senior test T1 on the /dev harness: depth runs down
// the prognosis, the calibration points are drawn, the drilling window is
// shaded and its narrowest point reported, and the ribbon fits a laptop.

import { test, expect } from '@playwright/test';

// PP-U1-000: the harness opens in the Suite unit profile (signed out: ft and
// psi), so the depth checks read every tick in whatever unit is shown and
// assert that deeper ticks sit lower; the typed calibration points are SI,
// so that test pins m and MPa first.
async function ticksRunDown(scope) {
  const ticks = scope.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value');
  await expect(ticks.first()).toBeVisible();
  const rows = [];
  for (const t of await ticks.all()) {
    const v = Number((await t.textContent()).replace(/,/g, ''));
    const box = await t.boundingBox();
    if (Number.isFinite(v) && box) rows.push({ v, y: box.y });
  }
  rows.sort((a, b) => a.v - b.v);
  expect(rows.length).toBeGreaterThan(2);
  for (let i = 1; i < rows.length; i++) expect(rows[i].y).toBeGreaterThan(rows[i - 1].y);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/pore-pressure-studio');
  await page.getByTestId('pp-well-row').click();
  await expect(page.getByTestId('pp-prognosis-chart')).toBeVisible({ timeout: 60000 });
});

test('T1-001/002: depth increases downward and both calibration points are drawn', async ({ page }) => {
  const chart = page.getByTestId('pp-prognosis-chart');
  await ticksRunDown(chart);
  await page.getByTestId('pp-unit-pressure').selectOption('MPa');
  await page.getByTestId('pp-unit-depth').selectOption('m');
  // no points yet: the placeholder is an example, not data, and there is no legend entry
  await expect(chart.getByText('Calibration')).toHaveCount(0);
  await page.getByTestId('pp-param-cal').fill('3000, 34.5\n3600, 45.2');
  await page.getByTestId('pp-apply-params').click();
  await expect(chart.locator('circle[fill="#e76f51"]')).toHaveCount(2);
});

test('T1-E1/003: drilling window reported; ribbon keeps Save on screen', async ({ page }) => {
  await expect(page.getByTestId('pp-drilling-window')).toContainText(/Narrowest drilling window \d+\.\d\d ppg/);
  await expect(page.getByText('Drilling window (PP to FG)')).toBeVisible();
  const save = await page.getByTestId('pp-save-project').boundingBox();
  expect(save.x + save.width).toBeLessThanOrEqual(1366);
  await page.screenshot({ path: 'test-results/pp-t1.png' });
});

test('T1-001: the NCT plot also reads depth downward', async ({ page }) => {
  await page.getByTestId('pp-view-nct').click();
  await ticksRunDown(page.getByTestId('pp-nct-chart'));
});
