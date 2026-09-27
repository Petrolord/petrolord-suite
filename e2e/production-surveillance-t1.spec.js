// Production Surveillance senior test T1 on /dev/production/surveillance.
// By hand (trailing 7 days to 2026-09-25): oil 844 + 38 = 882 stb/d, water
// 509 + 8 = 516, gas 675 + 3,840 = 4,515 Mscf/d, watercut 36.9 %; the HP-1
// deferment is 1,200 (e^-0.144 + e^-0.146 + e^-0.148) = 3,111 stb. The
// decline fit recovers qi 1,200 and D 0.002/day; the 1,825-day forecast
// now starts at the last fitted date (838.8 stb/d), about 408,000 stb,
// where it used to start at the first date and re-count the history.
import { test, expect } from '@playwright/test';

test('T1: KPIs match the seed; decline forecast is forward volume only', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/production/surveillance', { timeout: 120000 });
  await expect(page.getByText('Select a field in the left rail to see which wells breach')).toBeVisible({ timeout: 60000 });
  await page.getByText('Select field', { exact: true }).click();
  await page.getByText('Harness Field', { exact: true }).click();
  const body = page.locator('body');
  await expect(body).toContainText(/Oil\s*882\s*stb\/d/, { timeout: 30000 });
  await expect(body).toContainText(/Gas\s*4,515\s*Mscf\/d/);
  await expect(body).toContainText(/Watercut\s*36\.9\s*%/);
  await expect(body).toContainText(/Oil deferred\s*3,111\s*stb/);
  await page.getByRole('tab', { name: 'Decline' }).click();
  await page.getByText('Select well', { exact: true }).click();
  await page.getByText('HP-1', { exact: true }).click();
  await expect(page.getByText('0.00200')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('from 2026-09-25, the last fitted date')).toBeVisible();
  await expect(page.locator('body')).toContainText(/Forecast volume\s*40[78],\d{3}/);
  await expect(page.getByText('583,821')).toHaveCount(0);
  await expect(page.getByText('no economic limit set')).toBeVisible();
});
