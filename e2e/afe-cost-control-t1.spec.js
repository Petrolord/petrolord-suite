// AFE & Cost Control senior test T1 on /dev/studio/afe (seeded AFE). By hand:
// EAC = max(budget, actual + commitment) unless entered: 5.0 + 2.3 + 1.5 =
// 8.8M against 8.5M, variance -300k; actual 5.2M is 61.2 % of budget; EV
// 3.0 + 1.8 + 0.45 = 5.25M, CPI 1.01; operator 60 % of 5.2M = 3,120,000.
import { test, expect } from '@playwright/test';

test('T1: EAC, CPI and the JV split by hand; no vendor named as operator; white charts', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/afe', { timeout: 120000 });
  await page.getByText('AFE-2026-014', { exact: true }).click({ timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'AFE-2026-014 - H-1 drill and complete' })).toBeVisible();
  await expect(page.getByText('$8.8M')).toBeVisible();
  await expect(page.getByText('61.2% of Budget')).toBeVisible();
  await expect(page.getByText('$10M', { exact: true })).toBeVisible();
  await expect(page.getByText('$10000k')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Partners' }).click();
  await expect(page.getByText('Operator (your share)')).toBeVisible();
  await expect(page.getByText('Petrolord (Operator)')).toHaveCount(0);
  await expect(page.getByText('$3,120,000').first()).toBeVisible();
  await expect(page.getByText('Non-Operator')).toBeVisible();
});
