// Casing & Tubing Design Studio senior test T1 on /dev/casing-tubing (the
// oracle golden 9-5/8 design). API burst by hand: 0.875 x 2 x 110,000 x
// 0.472 / 9.625 = 9,440 psi (47# P-110); 7,927 psi (53.5# L-80). The design
// FAILs on the tubing packer seal stroke: the banner and the warnings now say
// so; the section tables and the tubing tab stay readable at 1366.
import { test, expect } from '@playwright/test';

test('T1: the FAIL names its reason; readable tables at 1366', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/casing-tubing', { timeout: 120000 });
  await expect(page.getByTestId('ct-overall-status')).toHaveText('FAIL', { timeout: 60000 });
  await expect(page.getByTestId('ct-fail-reason')).toContainText('Production Tubing');
  await page.getByText(/^Warnings \(/).click();
  await expect(page.getByText(/FAIL under Injection: tubing movement [\d.]+ m exceeds the packer seal stroke/)).toBeVisible();
  await page.getByRole('tab', { name: 'Casing Design' }).click();
  await expect(page.getByText('9,440')).toBeVisible();
  const bottom = page.locator('input[type=number]').nth(1);
  expect((await bottom.boundingBox()).width).toBeGreaterThanOrEqual(64);
  await page.getByRole('tab', { name: 'Tubing Design' }).click();
  await expect(page.getByTestId('ct-packer-inline')).toBeVisible();
});
