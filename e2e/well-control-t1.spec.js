// Well Control Studio senior test T1 on /dev/well-control (the oracle golden
// kick). By hand: formation pressure 2,000 + 1,440 x 9.80665 x 2,508 =
// 37,416 kPa; KMW 1.521 g/cc; ICP 6,500; FCP 4,500 x 1,521/1,440 = 4,754;
// strokes to bit 26.1 m3 / 12 L = 2,174; MAASP 0.31 x 9.80665 x 1,282 =
// 3,898 kPa; kick tolerance 205.6 m x 0.0135 m2 = 2.78 m3. The influx column
// is 222 m along the 40 degree bottom section but 170 m vertically; the
// screen says so.
import { test, expect } from '@playwright/test';

test('T1: kill sheet and kick tolerance; deviated influx stated', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/well-control', { timeout: 120000 });
  await page.getByTestId('wc-tab-killsheet').click({ timeout: 60000 });
  await page.getByRole('button', { name: /Compute kill sheet/ }).click();
  await expect(page.getByTestId('wc-icp')).toContainText('6500');
  await expect(page.getByTestId('wc-fcp')).toContainText('4754');
  await expect(page.getByTestId('wc-influx-deviation')).toContainText('222 m along the hole but 170 m vertically');
  await expect(page.getByTestId('wc-influx-deviation')).toContainText('0.90 g/cc');
  await page.getByTestId('wc-tab-kicktol').click();
  await page.getByRole('button', { name: /Compute kick tolerance/ }).click();
  await expect(page.getByText('2.78 m3').first()).toBeVisible();
  await expect(page.getByTestId('wc-kt-deviation')).toBeVisible();
});
