// Drilling Fluids & Hydraulics Studio senior test T1 on /dev/hydraulics
// (oracle golden case). By hand: PV 64 - 38 = 26 cP; n = 3.32 log(64/38) =
// 0.752; jet velocity 0.025 / 4.618e-4 = 54.1 m/s; bit drop
// 1440 x 54.1^2 / (2 x 0.95^2) = 2,335 kPa. The surge chart shows the pore
// and fracture limits; the ECD chart starts at surface; model names read as
// words.
import { test, expect } from '@playwright/test';

test('T1: bit hydraulics, limits on the surge chart, ECD from surface', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/hydraulics', { timeout: 120000 });
  await expect(page.getByText('Herschel-Bulkley (used)')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('hyd-tab-hydraulics').click();
  await page.getByRole('button', { name: /Run hydraulics/ }).click();
  await expect(page.getByText(/^2338/).first()).toBeVisible();
  await expect(page.getByText('jet 54.1 m/s')).toBeVisible();
  const ecdTicks = await page.getByTestId('hyd-ecd-chart').locator('.recharts-cartesian-axis-tick-value').allTextContents();
  expect(ecdTicks).toContain('0');
  await page.getByTestId('hyd-tab-surge').click();
  await page.getByRole('button', { name: /Sweep trip speeds/ }).click();
  const surge = page.getByTestId('hyd-surge-chart');
  await expect(surge.getByText('PP', { exact: true })).toBeVisible();
  await expect(surge.getByText('FP', { exact: true })).toBeVisible();
});
