// Rod Pump Design Studio senior test T1 on /dev/production/rod-pump. By
// hand: fluid load (2,107 - 1,082) psi x 2.405 in2 = 2,464 lb; swept
// 0.1166 x 1.75^2 x 56.2 in x 8 spm = 160.5 bbl/d, x 0.9 = 144.4 bbl/d,
// against 25 stb/d oil at 80 % water = 125 bbl/d of liquid; Goodman on the
// 7/8 in section 12,798 / 0.601 = 21,295 psi against 115,000 / 4 + 0.5625
// x 9,225 = 33,939 psi, 62.7 %.
import { test, expect } from '@playwright/test';

test('T1: default duty is met; a liquid shortfall is flagged; the card reads 0 to the stroke', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/production/rod-pump', { timeout: 120000 });
  const body = page.locator('body');
  await expect(body).toContainText(/Target 25 stb\/d oil at 80 percent water, 125\s*bbl\/d of liquid/, { timeout: 60000 });
  await expect(page.getByText('144.4 bbl/d').first()).toBeVisible();
  await expect(body).not.toContainText('lifts 144.4 bbl/d of liquid');
  await page.getByRole('tab', { name: 'Dyno Cards' }).click();
  await expect(body).not.toContainText(/-6\d\.\d{5,}/);
  await page.getByRole('tab', { name: 'Rod String' }).click();
  await expect(page.getByText('62.7 %').first()).toBeVisible();
  // Ask for the old duty (120 stb/d at 80 % water, 600 bbl/d of liquid).
  await page.getByRole('tab', { name: 'Design' }).click();
  const rate = page.locator('input').first();
  await rate.fill('120');
  await expect(body).toContainText(/against the 120 stb\/d oil target \(600 bbl\/d of liquid\)/, { timeout: 30000 });
});
