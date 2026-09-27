// SCAL Studio senior test T1 on /dev/studio/scal. Corey oil-water: span
// 1 - 0.2 - 0.25 = 0.55; 0.35 S^2.5 = 0.9 (1-S)^2 at S = 0.6415, crossover
// Sw 0.553. J = 0.25 Sw*^-1.4 at Sw 0.5 (Sw* 0.4118) = 0.866; Pc = J x 26
// cos30 / (0.21645 sqrt(150/0.22)) = 3.449 psi; h = 3.449 / (0.4335 x 0.25)
// = 31.8 ft. The card used to read 32.5 ft (the grid row just under 0.5).
import { test, expect } from '@playwright/test';

test('T1: Corey and J-function checks, exact height at Sw 0.5, clean axes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/scal', { timeout: 120000 });
  await expect(page.getByText('0.550')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('0.554')).toBeVisible();
  const x = await page.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').allTextContents();
  expect(x).toEqual(['0.0', '0.2', '0.4', '0.6', '0.8', '1.0']);
  await page.getByRole('button', { name: 'Height & Saturation' }).or(page.getByRole('tab', { name: 'Height & Saturation' })).first().click();
  await expect(page.getByText(/^31\.8\s*ft/)).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/—/);
});
