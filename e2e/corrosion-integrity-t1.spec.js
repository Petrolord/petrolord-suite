// Corrosion & Integrity Studio senior test T1 on /dev/facilities/corrosion.
// By hand: effective inhibition 1 - 0.95 x 0.90 = 0.145 left, so 85.5 %
// and 5.204 x 0.145 = 0.755 mm/yr; reaction and mass transfer in series
// 1 / (1/44.23 + 1/11.70) = 9.25 mm/yr; CO2 51.0 bar x 3 % = 1.53 bar, H2S
// 0.051 bar; a 20-year life needs 15.1 mm (0.5941 in) against 0.125 in.
import { test, expect } from '@playwright/test';

test('T1: rate and life by hand; engine numbers read as decimals; summary fits', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/corrosion', { timeout: 120000 });
  await expect(page.getByText('0.755').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('body')).toContainText(/Combined\s*9\.25\s*mm\/yr/i);
  const body = page.locator('body');
  await expect(body).toContainText('H2S partial pressure 0.051 bar (0.74 psia)');
  await expect(body).not.toContainText(/\d\.\d+e-\d/);
  await expect(body).not.toContainText('0.050763');
  await page.getByRole('tab', { name: 'Integrity' }).click();
  await expect(page.getByText('0.5941')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
