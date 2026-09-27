// Facility Layout Mapper senior test T1 on /dev/facilities/layout. By hand:
// the point-source flare setback D = sqrt(F Q LHV / (4 pi K)) = sqrt(0.3 x
// 20 x 46,000 / (4 pi x 4.73)) = 68.1 m. The basemap used to answer every
// tile with "API KEY REQUIRED", Leaflet's stylesheet was never loaded, and
// react-leaflet 4 ignores `whenCreated`, so nothing placed was ever drawn.
import { test, expect } from '@playwright/test';

test('T1: a real basemap; placed equipment draws; the flare setback is checked', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/layout', { timeout: 120000 });
  const tile = page.locator('.leaflet-tile-pane img').first();
  await expect(tile).toHaveAttribute('src', /tile\.openstreetmap\.org/, { timeout: 60000 });
  for (let i = 0; i < 4; i += 1) {
    await page.locator('.leaflet-control-zoom-in').click();
    await page.waitForTimeout(400);
  }
  await page.getByText('Separator', { exact: true }).click();
  await page.mouse.click(800, 400);
  await page.getByText('Flare', { exact: true }).click();
  await page.mouse.click(840, 400);
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);
  await expect(page.locator('.leaflet-tooltip', { hasText: 'Flare-001' })).toBeVisible();
  await page.getByText('Safety Spacing', { exact: true }).click();
  await expect(page.getByText(/needs 68\.1 m/).first()).toBeVisible();
  await expect(page.getByText(/checks fail/)).toBeVisible();
});
