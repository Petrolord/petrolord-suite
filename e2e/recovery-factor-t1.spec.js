// Recovery Factor Estimator senior test T1 on /dev/studio/recovery-factor.
// OOIP = 7758 x 1200 x 45 x 0.22 x 0.72 x 0.85 / 1.3 = 43.39 MMSTB; water
// drive analog 35/50/75 % gives 15.19 / 21.69 / 32.54. Arps (API 1967)
// water drive: 0.54898 x 0.9150 x 1.4057 x 1.2741 x 0.8007 = 72.0 %.
import { test, expect } from '@playwright/test';

test('T1: volumetrics, analog band, API water drive, round ticks, no em dashes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/recovery-factor', { timeout: 120000 });
  await expect(page.getByText('43.39 MMSTB')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('21.69 MMSTB').first()).toBeVisible();
  const y = await page.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value').allTextContents();
  expect(y).toEqual(['0', '10', '20', '30', '40']);
  await page.getByRole('button', { name: 'API (1967): water drive' }).click();
  await expect(page.getByText('72.0%')).toBeVisible();
  await expect(page.getByLabel('Permeability k (md)')).toHaveValue('150');
  expect(await page.locator('body').innerText()).not.toMatch(/—/);
});
