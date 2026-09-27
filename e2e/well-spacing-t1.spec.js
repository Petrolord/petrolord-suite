// Well Spacing Optimizer senior test T1 on /dev/studio/well-spacing.
// Example field: Standing Bo at 500 scf/stb, 35 API, 0.75, 180 F = 1.2846;
// EUR at 20 acres = 7758 x 20 x 60 x 0.152 x 0.75 x 0.35 / 1.284 = 289.2
// Mbbl (it used to read 371.5, reservoir barrels priced as stock-tank).
import { test, expect } from '@playwright/test';

test('T1: example loads, stock-tank EUR, recharts on the chart standard', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dev/studio/well-spacing', { timeout: 120000 });
  await page.getByRole('button', { name: 'Load example field' }).click();
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.getByTestId('ws-bo-note')).toContainText('Bo 1.28', { timeout: 30000 });
  await expect(page.getByRole('cell', { name: '289.2' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: '371.5' })).toHaveCount(0);
  expect(await page.locator('.recharts-wrapper').count()).toBe(3);
  expect(await page.locator('canvas').count()).toBe(0);
  expect(errors).toEqual([]);
});
