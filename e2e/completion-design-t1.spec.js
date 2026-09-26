// Completion Design Studio senior test T1 on /dev/completion-design (the
// oracle golden 3-1/2 in completion). By hand: string capacity 0.004536 m2
// x 2,606 m = 11.82 m3; side pocket mandrel clearance in the 7 in liner
// (6.059 - 5.750) x 25.4 = 7.8 mm diametral. Inches print without float
// noise; the clearance is labelled diametral; correlations by name.
import { test, expect } from '@playwright/test';

test('T1: clean inches, diametral clearance, correlation names', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/completion-design', { timeout: 120000 });
  await expect(page.getByText('2.992').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText(/2\.99200000/)).toHaveCount(0);
  await expect(page.getByText(/5\.75000000/)).toHaveCount(0);
  await page.getByTestId('cd-tab-checks').click();
  await expect(page.getByText('Diametral clearance (mm)')).toBeVisible();
  await expect(page.getByText('11.82 m³ (74.3 bbl)')).toBeVisible();
  await page.getByTestId('cd-tab-sizing').click();
  await expect(page.getByText('Beggs & Brill')).toBeVisible();
});
