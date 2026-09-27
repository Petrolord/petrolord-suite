// Refinery Planning & Scheduling Studio senior test T1 on
// /dev/studio/refinery-planning. Hand check: light sweet 909,091 bbl fills
// the reformer exactly (0.22 x 909,091 + 0.15 x 2,000,000 = 500,000
// naphtha); revenue 245,896,364; crude 222,545,455 + opex 4,990,909;
// margin 18,360,000 = $6.31/bbl; naphtha worth $75.50 (4.545 bbl of light
// sweet at -$16.6 backed out).
import { test, expect } from '@playwright/test';

test('T1: plan checks, names not ids, no variance before any actual', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/refinery-planning', { timeout: 120000 });
  await expect(page.getByText('$18,360,000')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('$6.31/bbl')).toBeVisible();
  await expect(page.getByText('$75.50')).toBeVisible();
  await expect(page.getByText('$-0.00')).toHaveCount(0);
  await expect(page.locator('.recharts-legend-wrapper')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Schedule' }).click();
  await expect(page.getByRole('cell', { name: 'Light sweet' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'crude_a' })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'fuel_oil' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Actuals & variance' }).click();
  await expect(page.getByText('nothing recorded')).toBeVisible();
  await expect(page.getByText('-$18,360,000')).toHaveCount(0);
  await expect(page.getByText(/movement\(s\) appear in one ledger/)).toHaveCount(0);
});
