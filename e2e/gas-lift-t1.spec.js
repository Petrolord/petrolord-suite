// Gas Lift Design Studio senior test T1 on /dev/production/gas-lift. The
// default design now drops 50 psi per valve (1,000, 950, 900 psig), wider
// than the valve spread, so every unloading stage shows the valves above
// shut; at 25 psi two stages left the valve above open (injection at two
// depths). By hand: casing at 4,056 ft = 914.7 psia x exp(0.01875 x 0.65 x
// 4,056 / (0.9 x 560)) = about 994 psig (992 shown), tubing 50 psi less.
import { test, expect } from '@playwright/test';

test('T1: a sound default design; summary lists its warnings; target rate shown', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/production/gas-lift', { timeout: 120000 });
  await expect(page.getByText('600 Mscf/d')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('things to look at')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Unloading' }).click();
  await expect(page.getByText(/V\d still open/)).toHaveCount(0);
  await expect(page.getByText('all shut')).toHaveCount(3);
  await page.getByRole('tab', { name: 'Injection Point' }).click();
  await expect(page.getByText('992').first()).toBeVisible();
  await expect(page.getByText(/\d+\.\d{6,}/)).toHaveCount(0);
});
