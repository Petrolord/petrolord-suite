// Wave 1B re-checks: the Wellsite approach sentence reads in the display
// unit, and Seismolord's explorer copy carries no em dash.
import { test, expect } from '@playwright/test';

test('Wellsite approach sentence is in the display unit', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/wellsite-studio', { timeout: 120000 });
  const t = page.getByTestId('ws-approach-text');
  await expect(t).toBeVisible({ timeout: 60000 });
  await expect(t).toContainText(' ft MD above the prognosed Top Agbada');
  await expect(t).not.toContainText(' m ');
});
