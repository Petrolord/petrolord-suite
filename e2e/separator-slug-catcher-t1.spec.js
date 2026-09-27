// Separator & Slug Catcher Studio senior test T1 on /dev/facilities/separator.
// By hand: settling 0.362 x sqrt((57.42 - 3.597) / 3.597) = 1.400 ft/s;
// liquid-controlled length scales as 1/D^2 (18.6 x 16 / 20.25 = 14.7 ft);
// slug catcher (34.7 + 200) / 0.6 = 391 bbl = 2,196 ft3, pi D^3 = 2,196 at
// L = 4D, D = 8.87 ft, L = 35.5 ft.
import { test, expect } from '@playwright/test';

test('T1: settling, the L/D family and the slug catcher by hand', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/separator', { timeout: 120000 });
  await expect(page.getByText('1.398').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('PREFERRED')).toBeVisible();
  await expect(page.getByText('3.27').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Slug Catcher' }).click();
  await expect(page.getByText('35.5').first()).toBeVisible();
  await expect(page.locator('body')).toContainText(/Working volume\s*235\s*bbl/i);
});
