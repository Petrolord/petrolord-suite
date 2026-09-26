// Fiscal Regime Designer senior test T1 on the /dev harness: the default
// regime is a named sample (not labelled as the PIA), production and price
// inputs carry headers and units, and the results fit a laptop screen.

import { test, expect } from '@playwright/test';

test('T1: sample regime name, units on inputs, results within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/fiscal-regime-designer');
  await expect(page.getByRole('button', { name: /Run Comparison/ })).toBeVisible({ timeout: 60000 });
  await expect(page.locator('option', { hasText: 'Nigerian PIA (PSC)' })).toHaveCount(0);
  await expect(page.locator('option', { hasText: 'Sample PSC (R-factor split)' })).toHaveCount(1);
  await expect(page.getByTestId('fis-prod-label-gas')).toHaveText('Gas (Mcf/d)');
  await expect(page.getByTestId('fis-price-headers')).toContainText('Gas ($/Mcf)');
  await page.getByRole('button', { name: /Run Comparison/ }).click();
  const table = page.locator('table').first();
  await expect(table).toBeVisible({ timeout: 30000 });
  const box = await table.locator('xpath=..').boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(1366);
  await page.screenshot({ path: 'test-results/fis-t1.png', fullPage: true });
});
