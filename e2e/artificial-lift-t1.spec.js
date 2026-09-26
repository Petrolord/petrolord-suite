// Artificial Lift Advisor senior test T1 on /dev/production/artificial-lift
// (seeded po_* spine). By hand: composite IPR q_b = 0.8 x (2,400 - 1,800) =
// 480, AOF = 480 + 0.8 x 1,800 / 1.8 = 1,280 stb/d. The rod ladder now
// judges pump displacement (liquid) against the 400 bbl/d liquid target:
// 0.1166 x 2.25^2 x 73.9 in x 11 spm x 0.9 = 432 bbl/d, where it used to
// accept 173 bbl/d (69 stb/d of oil) as meeting a 160 stb/d oil number.
import { test, expect } from '@playwright/test';

test('T1: rod pump sized on liquid; target labelled liquid; figures readable', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/production/artificial-lift', { timeout: 120000 });
  await expect(page.getByText('liquid at 60 percent water, 160 stb/d of oil')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('1,280 stb/d').first()).toBeVisible();
  await page.getByRole('button', { name: 'Design them all' }).click();
  await expect(page.getByText('432 bbl/d liquid')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('2.25 in plunger, 86 in stroke at 11 spm', { exact: false })).toBeVisible();
  const grids = page.getByTestId('al-figures');
  const n = await grids.count();
  for (let i = 0; i < n; i += 1) {
    const box = await grids.nth(i).boundingBox();
    const sw = await grids.nth(i).evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(sw).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThan(200);
  }
});
