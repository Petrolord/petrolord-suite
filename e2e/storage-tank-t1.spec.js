// Storage Tank & Venting Designer senior test T1 on /dev/facilities/tank.
// By hand: capacity pi/4 x 120^2 x 40 / 5.6146 = 80,574 bbl; one-foot
// method course 1 t = 2.6 x 120 x 37 x 0.85 / 23,200 + 0.0625 = 0.4854 in;
// API 650 sets 5/16 in minimum for 120 to 200 ft, so course 5 is 0.3125;
// inbreathing 800 x 5.6146 + 80,574 thermal = 85,066 scfh.
import { test, expect } from '@playwright/test';

test('T1: shell by the one-foot method with the API 650 minimum; plain-language notes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/tank', { timeout: 120000 });
  await expect(page.getByText('80,574').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('0.4854').first()).toBeVisible();
  await expect(page.getByText('0.3125').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Venting' }).click();
  await expect(page.getByText('85,066')).toBeVisible();
  await page.getByRole('tab', { name: 'Losses' }).click();
  await expect(page.locator('body')).not.toContainText('workingTurnoverFactor');
  await expect(page.locator('body')).not.toContainText('this repository');
});
