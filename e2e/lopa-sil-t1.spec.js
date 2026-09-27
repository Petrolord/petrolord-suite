// LOPA & SIL Studio senior test T1 on /dev/facilities/lopa. By hand: 0.1 x
// 0.5 x 0.01 = 5.0e-4/yr, RRF 5e-4 / 1e-5 = 50, required PFDavg 0.02 (SIL
// 1); valve 1oo1 2e-6 x 4,380 + 2e-6 x 24 = 8.81e-3; SIF 6.82e-5 + 2.59e-5
// + 8.81e-3 = 8.90e-3 (SIL 2); mitigated 4.45e-6/yr.
import { test, expect } from '@playwright/test';

test('T1: the LOPA chain and SIF by hand; plain credit reason; clean proof-test axes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/lopa', { timeout: 120000 });
  await expect(page.getByText('5.00e-4')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('4.45e-6')).toBeVisible();
  await expect(page.getByTestId('not-credited-reason')).toContainText('tick Independent');
  await page.getByRole('tab', { name: 'SIF verification' }).click();
  await expect(page.getByText('8.81e-3')).toBeVisible();
  await expect(page.getByText('Low demand mode only.')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Proof test interval' }).click();
  const chart = page.locator('.recharts-wrapper').first();
  await expect(chart.getByText(/0\.0833333/)).toHaveCount(0);
  await expect(chart.getByText('0.001', { exact: true })).toBeVisible();
});
