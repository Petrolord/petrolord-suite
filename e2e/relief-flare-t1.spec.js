// Relief & Flare Studio senior test T1 on /dev/facilities/relief. By hand:
// C(k 1.25) = 342.2, P1 = 285 x 1.1 + 14.7 = 328.2 psia, A = 50,000 /
// (342.2 x 0.975 x 328.2) x sqrt(609.7 x 0.9 / 19) = 2.454 in2, orifice L;
// flare 2e9 Btu/h = 586.1 MW, D = sqrt(0.3 Q / (4 pi 4.73)) = 54 m;
// blowdown 559.7 R x (114.7 / 1,014.7)^0.2308 = 338.4 R = -121 F.
import { test, expect } from '@playwright/test';

test('T1: PSV, radiation and blowdown by hand; a whole-minute time axis', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/relief', { timeout: 120000 });
  await expect(page.getByText('2.454').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('328.2').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Radiation' }).click();
  await expect(page.getByText('586.1')).toBeVisible();
  await page.getByRole('tab', { name: 'Blowdown' }).click();
  await expect(page.locator('body')).toContainText(/Final temperature\s*-121\s*F/i);
  const chart = page.locator('.recharts-wrapper').first();
  await expect(chart.getByText(/^\d+\.\d{4,}$/)).toHaveCount(0);
  await expect(chart.getByText('5', { exact: true })).toBeVisible();
});
