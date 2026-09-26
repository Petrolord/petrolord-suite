// Gas Well Performance senior test T1 on /dev/production/gas-well. By hand:
// q = AOF (1 - (pwf/pr)^2)^n = 1,636 x (1 - (513/2,200)^2)^0.85 = 1,560
// Mscf/d (1,558 shown); Coleman at 8,000 ft: rho_g 1.59 lb/ft3, v_c =
// 1.593 x (60 x 65.4)^0.25 / 1.59^0.5 = 10.0 ft/s, q_c = 3.067 p v A / (z T)
// = 859 Mscf/d (843 shown); margin 1,558 / 843 - 1 = 85 %. Plunger: 150 ft
// of slug in 2.441 in tubing is 0.87 bbl a cycle, 7,355 / 0.868 = 8,472
// scf/bbl needed.
import { test, expect } from '@playwright/test';

test('T1: deliverability axis reads whole rates; forecast finds the loading pressure', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/production/gas-well', { timeout: 120000 });
  await expect(page.getByText('1,558').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('843').first()).toBeVisible();
  await expect(page.getByText(/\d+\.\d{6,}/)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Plunger Lift' }).click();
  await expect(page.getByText('8,472 scf/bbl')).toBeVisible();
  await page.getByRole('tab', { name: 'Forecast' }).click();
  await page.getByRole('button', { name: /Run forecast/ }).click();
  await expect(page.getByText('1,570').first()).toBeVisible({ timeout: 60000 });
});
