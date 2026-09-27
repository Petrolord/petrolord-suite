// Consequence Modelling Studio senior test T1 on /dev/facilities/consequence.
// By hand: Bernoulli 0.62 x 1.96e-3 x sqrt(2 x 879 x 43,100) = 10.6 kg/s;
// Briggs rural D at 500 m sigma_y 39.0, sigma_z 22.7, C = 5.86 / (pi 5 x 39
// x 22.7) = 421 mg/m3 = 132 ppm; Yellow Book 6.6.3 4.58 kW/m2; TNT 1,000 x
// 46 x 0.03 / 4.68 = 294.9 kg, Z 15.02; Eisenberg probit 0.7775.
import { test, expect } from '@playwright/test';

test('T1: source, plume, fire, blast and harm by hand; decade axes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/consequence', { timeout: 120000 });
  await expect(page.getByText('10.6', { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByRole('tab', { name: 'Dispersion' }).click();
  await expect(page.getByText('421', { exact: true })).toBeVisible();
  const chart = page.locator('.recharts-wrapper').first();
  await expect(chart.getByText('1k', { exact: true }).first()).toBeVisible();
  await expect(chart.getByText(/e\d/)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Explosion' }).click();
  await expect(page.getByText('294.9')).toBeVisible();
  await page.getByRole('tab', { name: 'Harm' }).click();
  await expect(page.getByText('0.7775')).toBeVisible();
});
