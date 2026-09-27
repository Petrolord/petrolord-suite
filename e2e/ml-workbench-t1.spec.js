// ML Workbench senior test T1 on /dev/studio/ml-workbench. The fixture holds
// four wells where PHI = (2.65 - RHOB) / 1.65 exactly, so OLS on RHOB must
// score R^2 = 1 on every held-out well; the folds now default to the 4 wells
// the table has (5 was refused), and the depth track ticks round.
import path from 'path';
import { test, expect } from '@playwright/test';

test('T1: exact relation recovered on held-out wells; folds fit the table', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/ml-workbench', { timeout: 120000 });
  await page.getByRole('tab', { name: 'Upload' }).click();
  await page.locator('input[type="file"]').setInputFiles(path.resolve('e2e/fixtures/ml-density-porosity.csv'));
  await page.getByTestId('group-col').selectOption({ label: 'well (text)' });
  await page.getByTestId('depth-col').selectOption({ label: 'depth' });
  await page.getByTestId('use-upload').click();
  await page.getByTestId('target-select').selectOption('PHI');
  await page.getByTestId('feature-RHOB').click();
  await expect(page.getByTestId('k')).toHaveValue('4');
  await page.getByTestId('run-evaluate').click();
  await expect(page.getByTestId('run-refused')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Validation results' }).click();
  await expect(page.getByText(/k = 4, seed 42; 120 held-out rows\. Pooled RMSE [0-9.e-]+, MAE [0-9.e-]+, R² 1\./)).toBeVisible({ timeout: 20000 });
  const depth = await page.getByTestId('depth-track').locator('.recharts-yAxis .recharts-cartesian-axis-tick-value').allTextContents();
  expect(depth.length).toBeGreaterThan(2);
  for (const t of depth) expect(Number(t.replace(/,/g, '')) % 5).toBe(0);
});
