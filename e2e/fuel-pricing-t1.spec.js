// Fuel Pricing & Supply Chain Studio senior test T1 on /dev/studio/fuel-pricing.
// 37,000 t at $700 FOB, density 745, 0.5 % ocean loss: 49,416,107 L out,
// $0.52412/L, 812.39 at 1,550. With 16 rates blank this is a floor. Lane:
// 800 km at 40 km/h + 2 + 1.5 + 1 h = 24.5 h; 607,163 a trip over 44,910 L
// delivered = 13.520/L; 9 trucks at 90.7 %.
import { test, expect } from '@playwright/test';

test('T1: floor said so, every lane input editable, round FX axis', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/fuel-pricing', { timeout: 120000 });
  await expect(page.getByText('Pump price at least 812.39 per litre')).toBeVisible({ timeout: 60000 });
  const x = await page.locator('.recharts-wrapper').nth(1).locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').allTextContents();
  expect(x[0]).toBe('1000');
  expect(x[x.length - 1]).toBe('2600');
  expect(x.join(' ')).not.toMatch(/\./);

  await page.getByRole('tab', { name: 'Lane, fleet & station' }).click();
  await expect(page.getByText('24.50 h')).toBeVisible();
  await expect(page.getByText('607,163')).toBeVisible();
  await page.getByLabel('Loading (h)').fill('3');
  await expect(page.getByText('25.50 h')).toBeVisible();
  for (const l of ['Discharge (h)', 'Overhead (per trip)', 'Tolls and levies (per trip)', 'Maintenance (per km)', 'Tyres (per km)', 'Working hours (per day)', 'Working days (per year)', 'Handling per sale (min)']) {
    await expect(page.getByLabel(l)).toBeVisible();
  }
});
