// Product Blending Optimizer senior test T1 on /dev/studio/blending.
// Default gasoline pool, 1,000 bbl: reformate 516.0, FCC 414.9, butane
// 69.1. RON 96.27 and MON 85.27 by volume; sulfur on mass 38,210 / 764.1 =
// 50.0 ppm (binding); RVP through RVP^1.25: 15.60^0.8 = 9.00 (binding);
// cost 86,124, $86.12/bbl.
import { test, expect } from '@playwright/test';

test('T1: recipe checks, grouped money, no negative zero, no stray legend', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/blending', { timeout: 120000 });
  await expect(page.getByText('$86.12/bbl')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('$86,123')).toBeVisible();
  await expect(page.getByText('96.27')).toBeVisible();
  await expect(page.getByText('-0.00')).toHaveCount(0);
  await expect(page.locator('.recharts-legend-wrapper')).toHaveCount(0);
  await page.getByPlaceholder('$/unit').first().fill('0.6');
  await expect(page.getByText('$3,160')).toBeVisible();
});
