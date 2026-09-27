// Pump Station Designer senior test T1 on /dev/facilities/pump-station. By
// hand: system 150 + 200 (1,509 / 1,500)^2 = 352.4 ft at the crossing;
// hydraulic 1,509 x 352 x 0.85 / 3,960 = 114.0 hp; motor 146.3 x 0.7457 /
// 0.94 = 116.1 kW; NPSHa (14.7 - 0.5) x 2.31 / 0.85 = 38.6 + 8 flooded - 3
// friction = 43.6 ft against 14 required.
import { test, expect } from '@playwright/test';

test('T1: the duty crossing and NPSH by hand; a rounded flow axis', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/pump-station', { timeout: 120000 });
  await expect(page.getByText('1,509').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('116.1').first()).toBeVisible();
  const chart = page.locator('.recharts-wrapper').first();
  await expect(chart.getByText('3,000', { exact: true })).toBeVisible();
  await expect(chart.getByText('2640', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Suction & Changes' }).click();
  await expect(page.getByText('43.6').first()).toBeVisible();
});
