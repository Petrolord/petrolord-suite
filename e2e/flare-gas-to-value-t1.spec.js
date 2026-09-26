// Flare Gas to Value Studio senior test T1 on the /dev harness. Default gas
// (C1 0.78 ... CO2 0.02), 10 MMscfd x 350 d, DRE 0.98, GWP 28, displaced
// "Diesel" (150,000 burned, 160,000 displaced). By hand: 4.19e6 kmol/yr;
// CO2 = 4.19e6 x (0.02 + 0.98 x 1.28) x 44 = 234,6xx t; CH4 slip = 1,047 t;
// total 263,944 tCO2e; abatement 0.9 x 263,944 - 150,000 + 160,000 = 247,550.
import { test, expect } from '@playwright/test';

test('T1: flare footprint, abatement, capital basis, route labels', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/flare-gas-to-value', { timeout: 120000 });
  await expect(page.getByText('1,211 Btu/scf')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('fv-capex-basis')).toContainText('power 0.9');
  // the route card shows a short label; the input keeps the full name
  await expect(page.getByLabel('Compressed natural gas Minimum volume (MMscfd)')).toBeVisible();

  await page.getByLabel(/^Flare destruction efficiency/).fill('0.98');
  await page.getByLabel(/^Methane GWP/).fill('28');
  await page.getByLabel(/^What the product displaces/).fill('Diesel');
  await page.getByLabel(/^Product burned/).fill('150000');
  await page.getByLabel(/^Fuel displaced/).fill('160000');
  await page.getByRole('tab', { name: /Abatement/ }).click();
  await expect(page.getByText('234,628 t/yr')).toBeVisible();
  await expect(page.getByText('263,944 tCO2e/yr')).toBeVisible();
  await expect(page.getByText(/247,550 tCO2e a year abated/)).toBeVisible();
  await expect(page.getByText('Credit price ($ per tCO2e)')).toBeVisible();
});
