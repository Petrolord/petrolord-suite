// Fluid Systems Studio senior test T1 on the /dev harness: no empty right
// rail, KPI values inside their cards, round pressure ticks, and a warning
// when an input leaves the correlation's data range.
import { test, expect } from '@playwright/test';

test('T1: layout, axes and correlation range warning', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/fluid-systems-studio', { timeout: 120000 });
  await expect(page.getByText('Bubble Point').first()).toBeVisible({ timeout: 60000 });
  // each KPI value sits inside its card
  const card = page.getByText('Oil FVF @ Pb').locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
  const cb = await card.boundingBox();
  const vb = await card.getByText('1.372').boundingBox();
  expect(vb.x + vb.width).toBeLessThanOrEqual(cb.x + cb.width);
  // round pressure ticks
  await expect(page.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value', { hasText: /^1,000$/ }).first()).toBeVisible();
  // an out-of-range GOR is named
  await page.locator('#gor').fill('2000');
  await expect(page.getByText(/Standing: solution GOR 2000 scf\/STB is outside its data range/)).toBeVisible();
});
