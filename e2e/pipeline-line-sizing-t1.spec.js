// Pipeline & Line Sizing Studio senior test T1 on /dev/facilities/pipeline.
// By hand: 8,000 bpd in 6.065 in = 2.59 ft/s, Re 34,400, f 0.0236, dP 26.9
// psi over 15,000 ft; Barlow 1,440 x 6.625 / (2 x 52,000 x 0.72) = 0.1274 +
// 0.0625 = 0.1899 in; pig 536 bbl x 0.409 = 219 bbl. The sweep used to
// recommend 3 in (a ~700 psi drop); with the 100 psi budget it is 6 in sch 80.
import { test, expect } from '@playwright/test';

test('T1: the size sweep respects a pressure budget and names each failure', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/pipeline', { timeout: 120000 });
  await expect(page.getByText('26.9').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('cell', { name: '6 in sch 80' })).toBeVisible();
  await expect(page.locator('body')).toContainText(/Recommended size.*6 in sch 80/);
  await expect(page.getByText('fails dP, velocity, erosional').first()).toBeVisible();
  await expect(page.getByText('fails dP', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Wall Thickness' }).click();
  await expect(page.getByText('0.1899')).toBeVisible();
  await expect(page.getByText('2,458')).toBeVisible();
  await page.getByRole('tab', { name: 'Pigging' }).click();
  await expect(page.locator('body')).toContainText(/Line volume\s*536\s*bbl/i);
});
