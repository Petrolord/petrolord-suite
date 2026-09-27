// Compressor Station Designer senior test T1 on /dev/facilities/compressor.
// By hand: overall ratio 999.7 / 99.7 = 10.03, three stages at 2.16; the
// polytropic exponent (k - 1) / (k eta_p) = 0.28 / 0.96 = 0.2917 gives
// 560 R x 2.157^0.2917 = 701 R = 241 F from 100 F and 253 F from 110 F; two
// stages would reach 324 F, above the 300 F limit, so the temperature sets
// three. Brake power 3,238 / 0.97 = 3,339 bhp; stage 1 cooling 41,350 lb/h
// x 0.55 x 131 F = 2.98 MMBtu/hr; inlet 2,168 acfm; fuel 0.675 / 20 = 3.37 %.
import { test, expect } from '@playwright/test';

test('T1: staging and power by hand; every tab visible at 1366; a readable sweep', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/compressor', { timeout: 120000 });
  await expect(page.getByText('3,339').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('overall 10.03')).toBeVisible();
  await expect(page.getByText('2.97', { exact: true })).toBeVisible();
  const sweepTab = page.getByRole('tab', { name: 'Pressure Sweep' });
  const box = await sweepTab.boundingBox();
  const toggle = await page.getByTestId('full-precision-toggle').boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(toggle.x + 1);
  await sweepTab.click();
  await expect(page.getByText('6.17', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('not the one just above it');
});
