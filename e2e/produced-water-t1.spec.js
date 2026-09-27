// Produced Water Treatment Studio senior test T1 on
// /dev/facilities/produced-water. By hand: overall removal 1 - 6.5 / 500 =
// 98.7 %; the hydrocyclone takes 455.2 to 11.2 ppm, 97.5 %; oil at 32 API
// is 865 kg/m3 at 60 F and 844 at 120 F; spec 29 ppm met by 22.5 ppm.
import { test, expect } from '@playwright/test';

test('T1: removal by hand; the dissolved-oil caveat reads for a user; a readable droplet chart', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/produced-water', { timeout: 120000 });
  await expect(page.getByText('98.7').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('97.5', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('dissolvedOilFloorPpm');
  await expect(page.getByText(/Take a dissolved-oil analysis of the water/)).toBeVisible();
  await page.getByRole('tab', { name: 'Droplets' }).click();
  const chart = page.locator('.recharts-wrapper').first();
  await expect(chart.getByText('10', { exact: true })).toBeVisible();
  await expect(chart.getByText(/^\d+\.\d{2}$/)).toHaveCount(0);
});
