// Perforation & Sand Control senior test T1 on /dev/perforation-sand-control.
// By hand: productivity ratio ln(re/rw) / (ln(re/rw) + s) = 7.93 / 9.90 =
// 0.801; clearance (2.635 - 2.125) in x 25.4 = 13.0 mm diametral; Saucier
// band 5 to 6 x D50 113 um = 564 to 676 um, so 20/40 mesh (pack D50 631 um).
// The underbalance card now caps the band at the sanding drawdown margin
// (6.00 MPa = 870 psi), and the PSD chart draws the gravel band.
import { test, expect } from '@playwright/test';

test('T1: skin, clearance, underbalance cap, gravel band, sanding layout', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/perforation-sand-control', { timeout: 120000 });
  await expect(page.getByTestId('ps-psd-chart').getByText(/Saucier gravel band 564 to 676 um/)).toBeVisible({ timeout: 60000 });
  await page.getByTestId('ps-tab-perforating').click();
  await expect(page.getByTestId('ps-clearance-mm')).toHaveText('13.0 mm');
  await expect(page.getByText('0.801', { exact: true })).toBeVisible();
  await expect(page.getByTestId('ps-ub-sanding')).toContainText('keep the underbalance below about 870 psi');
  await page.getByTestId('ps-tab-sandcontrol').click();
  await expect(page.getByText('564 to 676 um')).toBeVisible();
  await page.getByTestId('ps-tab-sanding').click();
  const geo = await page.getByTestId('ps-geometry').boundingBox();
  const boost = await page.getByTestId('ps-boost').boundingBox();
  expect(geo.y + geo.height).toBeLessThanOrEqual(boost.y);
});
