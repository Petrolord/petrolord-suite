// Production Allocation senior test T1 on /dev/production/allocation. The
// seed meters 95 % of the wells' oil at the export point and tests at the
// declining daily rate, so the like-for-like period factor must sit below
// 0.95: allocated 159,472 / theoretical 172,437 = 0.925. It used to read
// 1.027 (metered over all 180 dates against theoretical over the 165 dates
// a test could carry). Reconciliation: 177,040 / 186,358 = 0.950.
import { test, expect } from '@playwright/test';

test('T1: like-for-like period factor; uncarried oil stated; imbalance says which side', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/production/allocation', { timeout: 120000 });
  await page.getByText('Select field', { exact: true }).click({ timeout: 60000 });
  await page.getByText('Harness Field', { exact: true }).click();
  await expect(page.getByText('0.925', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('1.027', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('alloc-uncarried')).toContainText('17,568 stb of metered oil');
  await page.getByRole('tab', { name: 'Reconciliation' }).click();
  await expect(page.getByText(/the wells book 9,318 stb \(5\.0%\) more than the meter reads/)).toBeVisible();
});
