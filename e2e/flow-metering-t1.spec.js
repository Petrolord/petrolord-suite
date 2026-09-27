// Flow Metering Designer senior test T1 on /dev/facilities/metering. By
// hand: beta 3 / 6.065 = 0.4946, E = 1 / sqrt(1 - beta^4) = 1.0314; mass
// flow 0.60241 x 1.0314 x 0.99794 x 0.04909 ft2 x sqrt(2 x 2.5 x 520.3 x
// 32.174) = 31,630 lb/hr (31,697 shown, inH2O reference); permanent loss
// (0.9807 - 0.1474) / (0.9807 + 0.1474) = 73.9 %; turndown sqrt(200/100) =
// 1.41; Cd share 0.758 x 0.574^2 gives 0.50 %, the RHG figure.
import { test, expect } from '@playwright/test';

test('T1: flow and uncertainty by hand; a readable Cd curve; capitalised notes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/metering', { timeout: 120000 });
  await expect(page.getByText('31,697').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('0.4946')).toBeVisible();
  await expect(page.locator('body')).toContainText(/Permanent loss\s*73\.9/i);
  const chart = page.locator('.recharts-wrapper').first();
  await expect(chart.getByText('100k', { exact: true })).toBeVisible();
  await expect(chart.getByText('0.605', { exact: true })).toBeVisible();
  await expect(chart.getByText(/e\+\d/)).toHaveCount(0);
  const note = page.getByText(/^beta above 0\.6/);
  expect(await note.evaluate((el) => getComputedStyle(el, '::first-letter').textTransform)).toBe('uppercase');
  await page.getByRole('tab', { name: 'Uncertainty' }).click();
  await expect(page.getByText('0.574').first()).toBeVisible();
});
