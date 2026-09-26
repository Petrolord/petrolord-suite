// ESP Design Studio senior test T1 on /dev/production/esp. By hand: head
// 1,758 psi / 0.420 psi/ft = 4,183 ft; hydraulic 3,115 bbl/d x 1,758 psi x
// 1.7e-5 = 93 hp, shaft 93.2 / 0.685 = 136.1 hp, load 136 / 250 = 55 %;
// cable drop sqrt(3) x 36.6 A x 0.1951 ohm/kft x 7.2 kft = 89.0 V.
import { test, expect } from '@playwright/test';

test('T1: electrical hints carry their inputs; system curve axis reads whole rates', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/production/esp', { timeout: 120000 });
  await expect(page.getByText('4,183').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('so no gas is free at the intake')).toBeVisible();
  await page.getByRole('tab', { name: 'Electrical' }).click();
  await expect(page.getByText('at 85 percent motor efficiency')).toBeVisible();
  await expect(page.getByText('over 7,200 ft at 180 F')).toBeVisible();
  await expect(page.getByText('89.0 V').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Performance' }).click();
  await page.getByRole('button', { name: /Run system curve/ }).click();
  await expect(page.getByText('Operating point')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText(/\d+\.\d{5,}/)).toHaveCount(0);
});
