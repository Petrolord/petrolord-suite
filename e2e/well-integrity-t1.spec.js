// Well Integrity & P&A senior test T1 on /dev/well-integrity. By hand:
// hole area pi/4 x 0.216^2 = 0.036644 m2, so 140 m x 1.2 = 6.16 m3 slurry;
// balanced height 6.156 / (0.023977 + 0.009263) = 185.2 m; top after POOH
// 2520 - 6.156 / 0.036644 = 2352 m. MAWOP: 0.75 x 25 MPa less (1200 - 500)
// x 9.81 x TVD at 1030 m MD = 11.91 MPa, governed by the tubing collapse.
// The reservoir plug is no longer failed against a zone it sits below.
import { test, expect } from '@playwright/test';

test('T1: plug rules scoped to the zone; readable element names; MAWOP labelled', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/well-integrity', { timeout: 120000 });
  const name = page.getByTestId('wi-el-name').first();
  await expect(name).toBeVisible({ timeout: 60000 });
  expect((await name.boundingBox()).width).toBeGreaterThan(300);
  await page.getByTestId('wi-tab-annulus').click();
  await expect(page.getByTestId('wi-annulus-chart').getByText(/MAWOP 11\.91 MPa/)).toBeVisible();
  await page.getByTestId('wi-tab-plugs').click();
  await expect(page.getByText('6.16 m3')).toBeVisible();
  const rules = page.getByTestId('wi-plug-rules');
  await expect(rules.getByTestId('wi-rule-na')).toContainText('Intermediate gas stringer');
  await expect(rules.getByText('FAIL')).toHaveCount(0);
  await page.getByTestId('wi-tab-program').click();
  await expect(page.getByTestId('wi-zone-fix-1')).toContainText('Add a second plug above P3 intermediate');
});
