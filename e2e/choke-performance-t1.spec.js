// Choke & Wellhead Performance senior test T1 on /dev/production/choke.
// By hand: Gilbert Pwh = 10 x GLR^0.546 x q_liquid / S^1.89 = 0.4698 q_liquid
// at GLR 600 and 32/64; the oil rate 1,112 stb/d at 20 percent water is
// 1,390 bbl/d of liquid, and 0.4698 x 1,390 = 653 psia. The seeded HP-1
// tests sit exactly on Gilbert, so the fit hands back c 9.99, m 0.546,
// n 1.890.
import { test, expect } from '@playwright/test';

test('T1: one rate basis; the fit recovers Gilbert; readable axes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/production/choke', { timeout: 120000 });
  await expect(page.getByText('1,112 stb/d').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('1,389 bbl/d liquid').first()).toBeVisible();
  await expect(page.getByText('653').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Well Model' }).click();
  await page.getByText('Not linked', { exact: true }).click();
  await page.getByText('Harness Field', { exact: true }).click();
  await page.getByRole('tab', { name: 'Coefficients' }).click();
  await page.getByRole('button', { name: /Fit to 6 tests/ }).click();
  await expect(page.getByText('9.992')).toBeVisible();
  await expect(page.getByText('1.8900')).toBeVisible();
  await expect(page.getByText('2000', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/1911\.6/)).toHaveCount(0);
  await expect(page.getByText('-0.0 %')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Performance' }).click();
  await page.getByRole('button', { name: /Run envelope/ }).click();
  await expect(page.getByText(/Flow stops being critical between 61\/64 and 68\/64/).first()).toBeVisible({ timeout: 60000 });
});
