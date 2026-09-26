// Cementing Studio senior test T1 on /dev/cementing (the oracle golden 7 in
// job). By hand: tail 0.011782 m2 x 1.15 x 1,600 m + 0.78 m3 shoe track =
// 22.5 m3; lead 0.013356 m2 x 200 m = 2.7 m3; sacks 25.1 / 0.0382 = 658;
// displacement 2,960 m x 0.019377 m2 = 57.4 m3. The placement checklist now
// compares the peak ECD at the previous shoe with the shoe fracture EMW, and
// the ECD chart shows that limit.
import { test, expect } from '@playwright/test';

test('T1: volumes; ECD against the shoe fracture in the checklist and chart', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/cementing', { timeout: 120000 });
  await page.getByRole('button', { name: /Compute volumes/ }).click({ timeout: 60000 });
  await expect(page.getByText('22.5 m3')).toBeVisible();
  await expect(page.getByText('658', { exact: true })).toBeVisible();
  await page.getByTestId('cmt-tab-placement').click();
  await page.getByRole('button', { name: /Simulate placement/ }).click();
  const list = page.getByTestId('cmt-checklist');
  await expect(list).toContainText('(6/6)');
  await expect(list).toContainText(/Peak ECD at the previous shoe 1\.6\d\d g\/cc against the shoe fracture EMW 1\.750 g\/cc/);
  await expect(page.getByTestId('cmt-ecd-chart').getByText('frac EMW')).toBeVisible();
});
