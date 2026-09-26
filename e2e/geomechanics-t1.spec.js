// Geomechanics & Wellbore Stability Studio senior test T1 on /dev/geomechanics
// (the oracle golden MEM). Tightest window = fracture initiation 2.22 -
// pore pressure 1.18 = 1.04 g/cc at TD. The mud window axis is sized on the
// drilling range (shallow fracture values near 11 g/cc used to stretch it to
// 12) and says what it clips; depth axes start at surface.
import { test, expect } from '@playwright/test';

test('T1: mud window sized on the drilling range, clipping stated', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/geomechanics', { timeout: 120000 });
  await page.getByRole('button', { name: /Load curves/ }).click({ timeout: 60000 });
  await expect(page.getByText('curves loaded')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('gm-tab-window').click();
  await page.getByRole('button', { name: /Compute mud window/ }).click();
  await expect(page.getByText(/^1\.041/).first()).toBeVisible({ timeout: 20000 });
  const ticks = (await page.getByTestId('gm-window-chart').locator('.recharts-cartesian-axis-tick-value').allTextContents()).map(Number);
  expect(Math.max(...ticks.filter((t) => t < 100))).toBeLessThanOrEqual(5);
  expect(ticks).toContain(0);
  await expect(page.getByTestId('gm-window-clipped')).toBeVisible();
});
