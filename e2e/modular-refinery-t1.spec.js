// Modular Refinery Feasibility senior test T1 on the /dev harness. Default
// hydroskimming case: gross value 0.03x55 + 0.2x108 + 0.13x100 + 0.32x104 +
// 0.3x58 = 86.93 $/bbl; margin 86.93 - 80 - 3.5 = 3.43 $/bbl. Product names
// read as a refiner writes them and negative money puts the sign first.
import { test, expect } from '@playwright/test';

test('T1: slate names, signed money, margins', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/modular-refinery-feasibility', { timeout: 120000 });
  await expect(page.getByText('$86.93/bbl')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('$3.43/bbl')).toBeVisible();
  await expect(page.getByText(/^-\$\d[\d.,]*MM$/)).toBeVisible();   // NPV, sign before the $
  await expect(page.getByText('-$2.57')).toBeVisible();             // disrupted supply
  await expect(page.getByRole('cell', { name: 'Fuel oil' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'LPG' })).toBeVisible();
  await expect(page.getByText('fuelOil')).toHaveCount(0);
});
