// Source freshness (2026-10-12): ReservoirCalc Pro says when a registry
// zone it averaged was published again, and a refresh clears the notice
// and the stale mark on the results. Harness /dev/reservoircalc-pro?sourceChanged=1.
// SHOT=<path> also saves the screenshot used as the paper figure.
import { test, expect } from '@playwright/test';

test('a republished zone shows "Registry source changed"; refresh clears it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/reservoircalc-pro?sourceChanged=1');
  await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: /Projects/ }).first().click();
  await page.getByText('Keta source check', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Load Project' }).click();
  await expect(page.getByTestId('rcp-project-name')).toHaveText('Keta source check', { timeout: 15000 });
  const zone = page.locator('[data-testid="rcp-source-changed-item"][data-key^="zone:"]');
  await expect(zone).toContainText('Top Dome in KETA-2 (published petrophysics zone) changed after this project used it.', { timeout: 15000 });
  await expect(zone).toContainText('by Ada Colleague');
  await expect(page.locator('[data-testid="rcp-source-changed-item"][data-status="deleted"]')).toContainText('Top Dome v1 (registry surface)');
  await expect(page.getByTestId('rcp-source-stale')).toContainText('Top Dome in KETA-2');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await zone.getByTestId('rcp-source-changed-refresh').click();
  await expect(zone).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByTestId('rcp-source-stale')).toHaveCount(0);
  expect(errors).toEqual([]);
});
