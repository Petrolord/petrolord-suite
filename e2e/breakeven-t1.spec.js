// Probabilistic Breakeven Analyzer senior test T1 on /dev/studio/breakeven.
// The profile is 36 months of 10,000 bopd declining 2 % a month, about 7.8
// MMbbl; against CAPEX 800/1,000/1,300 $MM the P50 breakeven is $238.31/bbl
// at seed 20260829 (undiscounted pre-tax floor about 1,180 / 7.8 / 0.875 =
// $172). The CAPEX inputs used to show 1000 and 1300 as "100" and "130".
import path from 'path';
import { test, expect } from '@playwright/test';

test('T1: readable percentile inputs; guided next step; breakeven runs with clean axes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/breakeven', { timeout: 120000 });
  const p50 = page.locator('input[type="number"]').nth(1);
  await expect(p50).toHaveValue('1000', { timeout: 60000 });
  const w = await p50.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(w).toBeLessThanOrEqual(0);
  await page.locator('input[type="file"]').setInputFiles(path.resolve('e2e/fixtures/breakeven-profile.csv'));
  await expect(page.getByTestId('be-next-step')).toContainText('Run Simulation at the bottom of the setup panel');
  await page.getByRole('button', { name: 'Run Simulation' }).click();
  await expect(page.getByText('238.31/STB')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('median $238.31')).toBeVisible();
  await expect(page.getByText(/^\d+\.80$/)).toHaveCount(0);
});
