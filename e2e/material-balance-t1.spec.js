// Material Balance Studio senior test T1 on the /dev harness (Ahmed Example
// 11-3 in an in-memory rb_* store; calculate-mbal runs the canonical engine
// in the browser with the edge function's mapping). The first end-to-end
// test of this app: run the regression, read OOIP with its intercept, edit
// the case's initial conditions, and the left rail keeps its values in view.
import { test, expect } from '@playwright/test';

test('T1: run, intercept, edit case, rail layout', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/material-balance-studio/cases/case-ahmed-11-3?tab=run', { timeout: 120000 });
  await expect(page.getByRole('button', { name: 'Run MBAL' })).toBeVisible({ timeout: 60000 });
  // the rail shows the case values inside its width
  const rail = await page.getByText('Initial P').locator('xpath=ancestor::section[1]').boundingBox();
  const val = await page.getByText('3,685 psia').boundingBox();
  expect(val.x + val.width).toBeLessThanOrEqual(rail.x + rail.width + 1);
  // run: free-intercept Havlena-Odeh on Ahmed's Table 11-3 gives 291.3 MMSTB
  await page.getByRole('button', { name: 'Run MBAL' }).click();
  await expect(page.getByText('291.31 MMSTB')).toBeVisible({ timeout: 30000 });
  await page.locator('header').getByText('Plots', { exact: true }).click();
  await expect(page.getByTestId('rb-ho-intercept')).toContainText('intercept =');
  // edit the case: the initial pressure can be corrected after creation
  await page.getByTestId('mbal-edit-case').click();
  await expect(page.getByRole('dialog').getByText('Edit case', { exact: true })).toBeVisible();
  await page.locator('#pi').fill('3690');
  await page.getByRole('button', { name: 'Save case' }).click();
  await expect(page.getByText('3,690 psia')).toBeVisible({ timeout: 15000 });
  // H4: the stored run was made on 3,685 psia, so it is now named as an
  // earlier run and the report waits for a new one
  await expect(page.getByTestId('mbal-stale-run')).toContainText('earlier run');
  await page.locator('header').getByText('Report', { exact: true }).click();
  await expect(page.getByTestId('mbal-export-pdf')).toBeDisabled();
  // the engine refuses an initial pressure that differs from the first data
  // row, so put 3,685 back; the case was still saved after the run, so the
  // stored result stays an earlier one until the engine runs again
  await page.getByTestId('mbal-edit-case').click();
  await page.locator('#pi').fill('3685');
  await page.getByRole('button', { name: 'Save case' }).click();
  await expect(page.getByText('3,685 psia')).toBeVisible({ timeout: 15000 });
  await page.locator('header').getByText('Run', { exact: true }).click();
  await expect(page.getByTestId('mbal-result-title')).toHaveText('Earlier result, inputs changed since');
  await page.getByRole('button', { name: 'Run MBAL' }).click();
  await expect(page.getByTestId('mbal-result-title')).toHaveText('Latest result', { timeout: 30000 });
  await expect(page.getByTestId('mbal-stale-run')).toHaveCount(0);
});
