// Heat Exchanger & Cooling Studio senior test T1 on
// /dev/facilities/heat-exchanger. By hand: duty 50,000 x 0.55 x 100 = 2.75
// MMBtu/hr, LMTD (165.6 - 100) / ln 1.656 = 130.1, U 1 / 0.01086 = 92.1,
// area 230 ft2; rating NTU 144,000 / 27,500 = 5.24, epsilon 0.979, 5.38
// MMBtu/hr; air cooler LMTD 85.3, area 20e6 / (4.5 x 85.3) = 52,100 ft2.
import { test, expect } from '@playwright/test';

test('T1: sizing, rating and air cooler by hand; resistances readable', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/heat-exchanger', { timeout: 120000 });
  await expect(page.getByText('130.1').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('Outside film', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('outsideFilm')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/\d\.\d{3}e-\d/);
  await expect(page.getByText('0.00100 (9.2 %)')).toBeVisible();
  await page.getByRole('tab', { name: 'Rating' }).click();
  await expect(page.getByText('5.24', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Air Cooler' }).click();
  await expect(page.getByText('52,126')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('fCorrection');
  await expect(page.locator('body')).not.toContainText('this repository');
});
