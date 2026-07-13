// Mapping & Surface Studio G4.3 acceptance: the workstation drives on
// the /dev harness without auth. Seeded 4 wells with tops let the flow
// grid a top across them, contour + raster it on the map canvas,
// publish it to the registry, and run an isochore — with the seeded
// org-shared surface read-only.

import { test, expect } from '@playwright/test';

test('grid a top, render the map, publish, isochore, delete', async ({ page }) => {
  await page.goto('/dev/mapping-surface-studio');
  await expect(page.getByTestId('map-empty')).toBeVisible();
  // one seeded org-shared surface, no delete affordance on it
  await expect(page.getByTestId('map-surface-row')).toHaveCount(1);
  await expect(page.getByTestId('map-delete-Regional Top (org shared)')).toHaveCount(0);

  // grid Top Dome across the 4 wells
  await page.getByTestId('map-source').selectOption('top:Top Dome');
  await page.getByTestId('map-cell').fill('150');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Gridded');
  // the map canvas renders with a z-range readout
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  await expect(page.getByTestId('map-zrange')).toContainText('grid');
  const box = await page.getByTestId('map-canvas').boundingBox();
  expect(box.width).toBeGreaterThan(300);

  // publish -> appears in the registry list
  await page.getByTestId('map-publish').click();
  await expect(page.getByTestId('map-status')).toContainText('Published');
  await expect(page.getByTestId('map-surface-count')).toHaveText('2');

  // grid Base Sand too, publish
  await page.getByTestId('map-source').selectOption('top:Base Sand');
  await page.getByTestId('map-grid-run').click();
  await page.getByTestId('map-publish').click();
  await expect(page.getByTestId('map-surface-count')).toHaveText('3');

  // isochore Base Sand − Top Dome
  await page.getByTestId('map-iso-a').selectOption({ label: 'Base Sand structure' });
  await page.getByTestId('map-iso-b').selectOption({ label: 'Top Dome structure' });
  await page.getByTestId('map-iso-run').click();
  await expect(page.getByTestId('map-status')).toContainText('isochore');
  await page.getByTestId('map-publish').click();
  await expect(page.getByTestId('map-surface-count')).toHaveText('4');

  // delete an owned surface
  await page.getByTestId('map-delete-Top Dome structure').click();
  await expect(page.getByTestId('map-surface-count')).toHaveText('3');
});

test('mapping app route loads its chunk and gates on auth', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dashboard/apps/geoscience/mapping-surface-studio');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  expect(page.url()).not.toContain('mapping-surface-studio');
});
