// LPG & CNG Rollout Studio senior test T1 on /dev/studio/lpg-cng. Hand
// checks: blend M 52.05 (liquid volume to moles), boil duty 500 x 399.7 /
// 3600 = 55.5 kW; 2,400 cylinders at 2.5 min on 14 working positions =
// 89.3 %; float 25 d x 2,400 + 10 % = 66,000. CNG bank: 181.4 kg/m3 ideal at
// 250 bar, 272.0 kg per 1.5 m3, 333.6 kg at Z 0.8154. Conversion: 114 vs 40
// per km, 2,920,000 a year after maintenance.
import { test, expect } from '@playwright/test';

const yTicks = (page) => page.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value').allTextContents();

test('T1: LPG, CNG and conversion figures with readable axes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/lpg-cng', { timeout: 120000 });
  await expect(page.getByText('52.05 kg/kmol')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('55.5 kW', { exact: true })).toBeVisible();
  await expect(page.getByText('89.3%')).toBeVisible();
  await expect(page.getByText('66,000')).toBeVisible();
  expect(await yTicks(page)).toEqual(['0', '5', '10', '15', '20', '25']);

  await page.getByRole('tab', { name: 'CNG' }).click();
  await expect(page.getByText('333.6').first()).toBeVisible();
  await expect(page.getByText('272.0').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Conversion case' }).click();
  await expect(page.getByText('2,920,000').first()).toBeVisible();
  const y = await yTicks(page);
  expect(y).toContain('4.5M');
  expect(y.join(' ')).not.toMatch(/\d{6,}/);
});
