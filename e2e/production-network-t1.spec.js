// Production Network Studio senior test T1 on /dev/production/network. By
// hand: 1,417 + 417 + 2,271 = 4,105 stb/d; every branch lands on the 219
// psia header (263 - 43, 233 - 14, 274 - 55) and 219 - 39 = 180 psia at the
// separator. The bottleneck is ranked per pound of fluid moved, and the
// separator sweep now lists the pressures that have no solution.
import { test, expect } from '@playwright/test';

test('T1: consistent solve; bottleneck basis stated; sweep shows every pressure it tried', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/production/network', { timeout: 120000 });
  await page.getByRole('button', { name: /Solve the network/ }).click({ timeout: 60000 });
  await expect(page.getByText('4,105 stb/d').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('Most pressure per pound of fluid moved')).toBeVisible();
  await page.getByRole('tab', { name: 'Sensitivity' }).click();
  await page.getByRole('button', { name: /^Sweep$/ }).click();
  await expect(page.getByText('80 psia', { exact: true })).toBeVisible({ timeout: 90000 });
  await expect(page.getByText('400 psia', { exact: true })).toBeVisible();
  await expect(page.getByText(/\d+\.\d{6,}/)).toHaveCount(0);
  // Continuation solves 354 and 400 psia (both failed cold); 217 psia sits
  // on P-2's shut-in switch and says so.
  await expect(page.getByText('2,683', { exact: true })).toBeVisible();
  const failed = page.getByTestId('net-sweep-failed');
  await expect(failed).toHaveCount(1);
  await expect(failed).toContainText('P-2 is on the edge of shutting in here (flowing at 171 psia, shut in at 263 psia)');
  await expect(failed).toContainText('48,195 lb/d');
});
