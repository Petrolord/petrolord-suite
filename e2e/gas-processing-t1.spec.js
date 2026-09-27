// Gas Processing Studio senior test T1 on /dev/facilities/gas-processing.
// By hand: water 50 x (45 - 7) = 1,900 lb/day, 3 gal/lb gives 3.96 gpm,
// reboiler 240 gal/h x (1,432 + 458) = 0.45 MMBtu/hr, Kremser A 2.5 N 2 =
// 89.7 %; amine 3 % of 263,470 lbmol/day = 7,904, at 0.45 pickup 372 gpm,
// 800 Btu/gal x 372 x 60 = 17.9 MMBtu/hr; JT 24 F over 400 psi.
import { test, expect } from '@playwright/test';

test('T1: dehydration, sweetening and JT by hand; all tabs visible', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/gas-processing', { timeout: 120000 });
  await expect(page.getByText('1,902').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('89.7').first()).toBeVisible();
  const dew = page.getByRole('tab', { name: 'Dew Point' });
  const toggle = await page.getByTestId('full-precision-toggle').boundingBox();
  const box = await dew.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(toggle.x + 1);
  await page.getByRole('tab', { name: 'Sweetening' }).click();
  await expect(page.getByText('7,904')).toBeVisible();
  await dew.click();
  await expect(page.getByText('76.0').first()).toBeVisible();
});
