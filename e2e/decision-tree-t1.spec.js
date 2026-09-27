// Decision Tree Builder senior test T1 on /dev/studio/decision-tree. By hand:
// Drill 0.3 x 300 + 0.7 x (-10) = 83, less the 40 cost = 43; Farm out 0.3 x
// 60 = 18; Do nothing 0; advantage 43 - 18 = 25.
import { test, expect } from '@playwright/test';

test('T1: rolled-back EMVs by hand; node labels and legend clear of the branches', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/decision-tree', { timeout: 120000 });
  const body = page.locator('body');
  await expect(body).toContainText(/Optimal EMV\s*43 \$MM/i, { timeout: 60000 });
  await expect(body).toContainText(/Decision advantage\s*25 \$MM/i);
  const svg = page.locator('svg[aria-label="Decision tree diagram"]');
  await expect(svg.getByText('EMV 83.0 $MM')).toBeVisible();
  const legend = await svg.getByText('optimal path').boundingBox();
  const doNothing = await svg.getByText('Do nothing').boundingBox();
  expect(doNothing.y + doNothing.height).toBeLessThanOrEqual(legend.y);
});
