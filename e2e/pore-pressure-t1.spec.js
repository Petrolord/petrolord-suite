// Pore Pressure Studio senior test T1 on the /dev harness: depth runs down
// the prognosis, the calibration points are drawn, the drilling window is
// shaded and its narrowest point reported, and the ribbon fits a laptop.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/pore-pressure-studio');
  await page.getByTestId('pp-well-row').click();
  await expect(page.getByTestId('pp-prognosis-chart')).toBeVisible({ timeout: 60000 });
});

test('T1-001/002: depth increases downward and both calibration points are drawn', async ({ page }) => {
  const chart = page.getByTestId('pp-prognosis-chart');
  const y = async (t) => (await chart.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value', { hasText: new RegExp(`^${t}$`) }).first().boundingBox()).y;
  expect(await y('1000')).toBeLessThan(await y('3000'));
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
