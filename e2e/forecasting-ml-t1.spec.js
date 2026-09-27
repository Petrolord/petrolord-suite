// Production Forecasting ML Workbench senior test T1 on
// /dev/studio/forecasting-ml. The fixture is q = 1000 exp(-0.05 t) for 36
// months: Arps must return qi 1000, Di 0.05, b 0; the damped trend fits
// phi = exp(-0.05) = 0.951229 and forecasts 1000 exp(-1.8) = 165.2989 at
// step 36. The forecast charts drew with no axes (a wrapper component
// recharts ignores); they must have both.
import path from 'path';
import { test, expect } from '@playwright/test';

test('T1: exact exponential recovered; charts carry their axes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/forecasting-ml', { timeout: 120000 });
  await page.getByTestId('upload-input').setInputFiles(path.resolve('e2e/fixtures/forecast-exponential.csv'));
  await page.getByTestId('well-col').selectOption({ label: 'well (text)' });
  await page.getByTestId('period-col').selectOption({ label: 'month (text)' });
  await page.getByTestId('value-col').selectOption({ label: 'oil' });
  await page.getByTestId('use-upload').click();
  await page.getByRole('button', { name: 'Fit and forecast' }).click();
  await expect(page.getByText(/qi 1000\.0000\d* per step, Di 0\.05 per step, b 0/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/phi 0\.95122\d/).first()).toBeVisible();
  const chart = page.getByTestId('forecast-chart');
  await expect(chart.locator('.recharts-xAxis')).toHaveCount(1);
  await expect(chart.locator('.recharts-yAxis')).toHaveCount(1);
  const x = await chart.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').allTextContents();
  expect(x).toEqual(['0', '10', '20', '30', '40', '50', '60']);
  await page.getByRole('button', { name: 'Run the bootstrap' }).click();
  await expect(page.getByRole('cell', { name: /^165\.2988/ }).first()).toBeVisible({ timeout: 20000 });
});
