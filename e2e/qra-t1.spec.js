// QRA Studio senior test T1 on /dev/facilities/qra. By hand: process area
// LSIR 4e-6 x 0.537 + 1.728e-5 + 1.152e-5 + 5e-6 x 0.35 = 3.27e-5; IRPA
// 3.27e-5 x 2,000/8,760 + 2.5e-7 x 1,500/8,760 = 7.51e-6; PLL 1.352e-4,
// FAR 1.352e-4 x 1e8 / 80,000 = 0.169; F-N at N 12 is 5e-6 against 1e-3 /
// 144 = 6.94e-6, ratio 0.72.
import { test, expect } from '@playwright/test';

test('T1: LSIR, IRPA, PLL and the F-N check by hand; decade axes; worded states', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && /same key/.test(m.text())) errors.push(m.text()); });
  await page.goto('/dev/facilities/qra', { timeout: 120000 });
  await page.getByRole('tab', { name: 'Individual risk' }).click({ timeout: 60000 });
  await expect(page.getByText('3.270e-5')).toBeVisible();
  await expect(page.getByText('7.508e-6')).toBeVisible();
  await expect(page.getByText('BROADLY ACCEPTABLE').first()).toBeVisible();
  await expect(page.getByText('BROADLY_ACCEPTABLE')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Societal risk' }).click();
  await expect(page.getByText('1.352e-4').first()).toBeVisible();
  await expect(page.getByText('0.169', { exact: true })).toBeVisible();
  const fn = page.getByTestId('fn-chart');
  await expect(fn.getByText('1k', { exact: true })).toBeVisible();
  await expect(fn.getByText(/1\.0e/)).toHaveCount(0);
  expect(errors).toHaveLength(0);
});
