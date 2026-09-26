// Well Intervention Planner senior test T1 on /dev/production/intervention.
// The spine ledger carries daily VOLUMES (oil_stb, water_stb, gas_mscf,
// hours_on); the Chan reading only read *_rate_* names, so a 180-day
// history was refused as "a handful of days". By hand: flow efficiency
// 7.78 / (7.78 + 7) = 53 %, so the PI rises x 1.90 at zero skin; the
// spreadsheet uplift 372 x 0.90 = 334 stb/d against 200 from the nodal
// solve.
import { test, expect } from '@playwright/test';

test('T1: a real spine history is diagnosed; value carries the nodal uplift', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/production/intervention', { timeout: 120000 });
  await page.getByText('Not linked', { exact: true }).click({ timeout: 60000 });
  await page.getByText('Harness Field', { exact: true }).click();
  await expect(page.getByText('Pick a well to read its production history.')).toBeVisible();
  await page.getByText('Pick a well', { exact: true }).click();
  await page.getByText('HP-1', { exact: true }).click();
  await expect(page.getByText('180 days of production history on the spine.')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('not enough production history')).toHaveCount(0);
  await expect(page.getByText('Normal displacement').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Value' }).click();
  await page.getByRole('button', { name: /Run the plan/ }).click();
  await expect(page.getByText('x 1.90')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('body')).toContainText('would have promised 334 stb/d');
});
