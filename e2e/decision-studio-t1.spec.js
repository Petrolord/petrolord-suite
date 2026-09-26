// Decision Studio senior test T1 on the /dev harness (two Monte Carlo runs
// of the Ekene demo case from the engines, the drill-or-farm-out tree and a
// four-project portfolio): money reads with the sign first and enough
// decimals to tell small cases apart, the S-curves have round ticks and a
// labelled NPV = 0 line, and the brief exports.

import { test, expect } from '@playwright/test';

test('T1: compare two cases, read the S-curves, export the brief', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/dev/decision-studio');
  await expect(page.getByText('Decision brief')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText(/P50 \$1\.\d\dM/).first()).toBeVisible();
  await page.getByText('Ekene 2P, narrow price (65 to 85) · 9/24/2026').click();
  await page.getByText('Ekene 2P, wide price (50 to 100) · 9/25/2026').click();
  await expect(page.getByText(/^-\$\d\.\d\dM$/).first()).toBeVisible();
  await expect(page.getByText('$-', { exact: false })).toHaveCount(0);
  await expect(page.getByText('NPV = 0')).toBeVisible();
  await page.getByText('Ekene 2P, wide price (50 to 100)').first().click();
  await page.getByText('Ekene-11: drill or farm out').first().click();
  await page.getByText('FY27 Capital Plan').first().click();
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.getByRole('button', { name: /Export one-page brief/ }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
  await page.screenshot({ path: 'test-results/ds-t1.png', fullPage: true });
});
