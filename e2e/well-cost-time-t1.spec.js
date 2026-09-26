// Well Cost & Time Estimator senior test T1 on the /dev/well-cost harness
// (the oracle golden case). Lump-sum AFE rows carry a linked-activity
// picker; at 1366 their names must stay readable.
import { test, expect } from '@playwright/test';

test('T1: lump AFE item names readable at 1366', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/well-cost', { timeout: 120000 });
  await page.getByTestId('wct-tab-cost').click({ timeout: 60000 });
  const name = page.getByTestId('wct-item-c5').locator('input').first();
  await expect(name).toHaveValue('Wellhead');
  const box = await name.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(110);
  await expect(page.getByTestId('wct-total-usd')).toHaveText('5,918,000 USD');
});
