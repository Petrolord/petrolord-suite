// Mapping & Surface Studio G4.3 acceptance: the workstation drives on
// the /dev harness without auth. Seeded 5 wells with tops (two deviated)
// let the flow grid a top across them in TVDSS elevation, contour +
// raster it on the map canvas,
// publish it to the registry, and run an isochore — with the seeded
// org-shared surface read-only.

import { test, expect } from '@playwright/test';

/** Screen position of a world point on the map canvas (its data attributes). */
async function screenOf(canvas, wx, wy) {
  const scale = Number(await canvas.getAttribute('data-scale'));
  const cx = Number(await canvas.getAttribute('data-cx'));
  const cy = Number(await canvas.getAttribute('data-cy'));
  const vw = Number(await canvas.getAttribute('data-vw'));
  const vh = Number(await canvas.getAttribute('data-vh'));
  return { x: vw / 2 + (wx - cx) * scale, y: vh / 2 - (wy - cy) * scale };
}

test('grid a top, render the map, publish, isochore, delete', async ({ page }) => {
  await page.goto('/dev/mapping-surface-studio');
  await expect(page.getByTestId('map-empty')).toBeVisible();
  // one seeded org-shared surface, no delete affordance on it
  await expect(page.getByTestId('map-surface-row')).toHaveCount(2); // the org-shared regional top and the seeded TWT dome
  await expect(page.getByTestId('map-delete-Regional Top (org shared)')).toHaveCount(0);

  // grid Top Dome across the 5 wells: TVDSS elevation at the borehole,
  // displayed in feet by default (MS0)
  await page.getByTestId('map-source').selectOption('top:Top Dome');
  await expect(page.getByTestId('map-depth-ref')).toHaveValue('tvdss');
  await page.getByTestId('map-cell').fill('150');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Gridded');
  await expect(page.getByTestId('map-status')).toContainText('TVDSS elevation, ft');
  await expect(page.getByTestId('map-status')).toContainText('from 5 wells');
  // the map canvas renders with a z-range readout in feet, negative down
  await expect(page.getByTestId('map-canvas')).toBeVisible();
  await expect(page.getByTestId('map-zrange')).toContainText('grid');
  await expect(page.getByTestId('map-zrange')).toContainText('ft');
  await expect(page.getByTestId('map-zrange')).toContainText('z -');
  const box = await page.getByTestId('map-canvas').boundingBox();
  expect(box.width).toBeGreaterThan(300);
  // MS1 map window: wheel zoom changes the scale, double-click restores
  // the fit, the readout samples under the cursor, the contour interval
  // is typed in the display unit, a titled PNG downloads
  const canvas = page.getByTestId('map-canvas');
  const fitScale = Number(await canvas.getAttribute('data-scale'));
  expect(Number(await canvas.getAttribute('data-fit-scale'))).toBeCloseTo(fitScale, 9);
  await canvas.hover({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.getByTestId('map-readout')).toContainText('z -');
  await expect(page.getByTestId('map-readout')).toContainText('ft');
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => Number(await canvas.getAttribute('data-scale'))).toBeGreaterThan(fitScale * 1.2);
  await canvas.dblclick({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect.poll(async () => Number(await canvas.getAttribute('data-scale'))).toBeCloseTo(fitScale, 6);
  const autoStep = Number(await canvas.getAttribute('data-contour-step'));
  await page.getByTestId('map-contour-interval').fill('25');
  await expect.poll(async () => Number(await canvas.getAttribute('data-contour-step'))).toBeCloseTo(25 * 0.3048, 6);
  expect(autoStep).not.toBeCloseTo(25 * 0.3048, 6);
  await page.getByTestId('map-contour-interval').fill('');
  await page.getByTestId('map-colormap').selectOption('structure');
  await page.getByTestId('map-show-axes').check();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('map-export-png').click(),
  ]);
  expect(download.suggestedFilename()).toContain('map.png');
  await expect(page.getByTestId('map-status')).toContainText('Exported');

  // metres on demand, and back
  await page.getByTestId('map-depth-unit').click();
  await expect(page.getByTestId('map-zrange')).toContainText(' m ');
  await expect(page.getByTestId('map-status-unit')).toContainText('depth: m');
  await page.getByTestId('map-depth-unit').click();
  await expect(page.getByTestId('map-zrange')).toContainText('ft');

  // publish -> appears in the registry list
  await page.getByTestId('map-publish').click();
  await expect(page.getByTestId('map-status')).toContainText('Published');
  await expect(page.getByTestId('map-surface-count')).toHaveText('3');

  // an attribute map picks its zone (named after the top, the PT4 way)
  await page.getByTestId('map-source').selectOption('zone:phi_avg');
  await expect(page.getByTestId('map-zone')).toHaveValue('Top Dome');
  await expect(page.getByTestId('map-depth-ref')).toHaveCount(0);
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Gridded phi_avg attribute (attribute)');

  // grid Base Sand too, publish
  await page.getByTestId('map-source').selectOption('top:Base Sand');
  await page.getByTestId('map-grid-run').click();
  await page.getByTestId('map-publish').click();
  await expect(page.getByTestId('map-surface-count')).toHaveText('4');

  // isochore: top surface Top Dome to base surface Base Sand
  await page.getByTestId('map-iso-a').selectOption({ label: 'Top Dome structure' });
  await page.getByTestId('map-iso-b').selectOption({ label: 'Base Sand structure' });
  await page.getByTestId('map-iso-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Isochore');
  await page.getByTestId('map-publish').click();
  await expect(page.getByTestId('map-surface-count')).toHaveText('5');

  // share toggle on an owned surface: private -> shared -> private; the
  // teammate's row shows a passive badge, never a toggle
  await page.getByTestId('map-share-Top Dome structure').click();
  await expect(page.getByTestId('map-status')).toContainText('Shared Top Dome structure');
  await page.getByTestId('map-share-Top Dome structure').click();
  await expect(page.getByTestId('map-status')).toContainText('private again');
  await expect(page.getByTestId('map-share-Regional Top (org shared)')).toHaveCount(0);

  // delete an owned surface
  await page.getByTestId('map-delete-Top Dome structure').click();
  await expect(page.getByTestId('map-surface-count')).toHaveText('4');

  // MS2: import a Petrel-style CPS-3 grid (the Seismolord golden: feet,
  // negative down), which draws at once in feet
  await page.getByTestId('map-import').click();
  await page.getByTestId('map-import-file').setInputFiles('test-data/seismolord/surfaces/dome_surface_cps3.dat');
  await expect(page.getByTestId('map-import-preview')).toContainText('50×40');
  await expect(page.getByTestId('map-import-preview')).toContainText('1,376 live');
  await page.getByTestId('map-import-unit').selectOption('ft');
  await page.getByTestId('map-import-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Imported dome_surface_cps3');
  await expect(page.getByTestId('map-surface-count')).toHaveText('5');
  await expect(page.getByTestId('map-zrange')).toContainText('-7114.4');
  await expect(page.getByTestId('map-zrange')).toContainText('-5002.4 ft');

  // row menu: export ZMAP+ in the display unit, control points CSV of a
  // gridded surface, rename inline
  const dome = page.locator('[data-testid="map-surface-row"][data-surface-name="dome_surface_cps3"]');
  await expect(dome.getByTestId('map-row-badge')).toHaveText('depth · ft');
  await dome.click({ button: 'right' });
  await page.getByTestId('map-row-export-sub').hover(); // Radix mounts the submenu on hover
  await expect(page.getByTestId('map-row-export-zmap')).toBeVisible();
  const [zmap] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('map-row-export-zmap').click(),
  ]);
  expect(zmap.suggestedFilename()).toBe('dome_surface_cps3-ft.zmap.dat');
  const baseSand = page.locator('[data-testid="map-surface-row"][data-surface-name="Base Sand structure"]');
  await baseSand.click({ button: 'right' });
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('map-row-points-csv').click(),
  ]);
  expect(csv.suggestedFilename()).toBe('base_sand_structure-control-points.csv');
  await dome.click({ button: 'right' });
  await page.getByTestId('map-row-rename').click();
  await page.getByTestId('map-rename-input').fill('Dome import');
  await page.getByTestId('map-rename-input').press('Enter');
  await expect(page.locator('[data-testid="map-surface-row"][data-surface-name="Dome import"]')).toHaveCount(1);
  await expect(page.getByTestId('map-status')).toContainText('Renamed to Dome import');

  // re-grid Base Sand in place at 100 m: same row, finer frame
  await baseSand.click({ button: 'right' });
  await page.getByTestId('map-row-regrid').click();
  await expect(page.getByTestId('map-status')).toContainText('Re-gridding Base Sand structure');
  await expect(page.getByTestId('map-row-replacing')).toHaveCount(1);
  await expect(page.getByTestId('map-cell')).toHaveValue('150');
  await page.getByTestId('map-cell').fill('100');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Gridded');
  await expect(page.getByTestId('map-publish')).toHaveText(/Replace surface/);
  await page.getByTestId('map-publish').click();
  await expect(page.getByTestId('map-status')).toContainText('Replaced Base Sand structure in place');
  await expect(page.getByTestId('map-surface-count')).toHaveText('5');
  await expect(page.getByTestId('map-row-replacing')).toHaveCount(0);
});

test('MS3: fault-block and boundary polygons, a guide point, arithmetic, quick GRV, time to depth', async ({ page }) => {
  await page.goto('/dev/mapping-surface-studio');
  await page.getByTestId('map-source').selectOption('top:Top Dome');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Gridded');
  const canvas = page.getByTestId('map-canvas');

  // draw a fault-block polygon around the western wells by clicking world points
  await page.getByTestId('map-draw-fault').click();
  for (const [wx, wy] of [[500700, 6699200], [501800, 6699200], [501800, 6700900], [500700, 6700900]]) {
    const p = await screenOf(canvas, wx, wy);
    await canvas.click({ position: p });
  }
  await expect(page.getByTestId('map-draw-count')).toHaveText('4');
  await page.getByTestId('map-polygon-name').fill('West block');
  await page.getByTestId('map-polygon-save').click();
  await expect(page.getByTestId('map-status')).toContainText('Saved fault-block polygon West block (4 vertices)');
  await expect(page.getByTestId('map-polygon-row-West block')).toBeVisible();

  // a boundary around everything, then grid with the block and the clip
  await page.getByTestId('map-draw-boundary').click();
  for (const [wx, wy] of [[500600, 6699000], [503700, 6699000], [503700, 6701000], [500600, 6701000]]) {
    const p = await screenOf(canvas, wx, wy);
    await canvas.click({ position: p });
  }
  await page.getByTestId('map-polygon-name').fill('Lease');
  await page.getByTestId('map-polygon-save').click();
  await expect(page.getByTestId('map-status')).toContainText('Saved boundary Lease');
  await page.getByTestId('map-fault-use-West block').check();
  await page.getByTestId('map-clip-use-Lease').check();
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('With 1 fault-block polygon, clipped to Lease');

  // a guide point: click, type an elevation in feet, grid again
  await page.getByTestId('map-guide-point').click();
  const gp = await screenOf(canvas, 502600, 6699700);
  await canvas.click({ position: gp });
  await page.getByTestId('map-guide-value').fill('-4600');
  await page.getByTestId('map-guide-add').click();
  await expect(page.getByTestId('map-guide-row-G1')).toContainText('-4600.0 ft');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('from 6 wells');
  await expect(page.getByTestId('map-status')).toContainText('1 guide point');
  await page.getByTestId('map-publish').click();
  await expect(page.getByTestId('map-status')).toContainText('Published');

  // quick GRV on the published structure (ft contact)
  await page.getByTestId('map-grv-contact').fill('-4900');
  await page.getByTestId('map-grv-run').click();
  await expect(page.getByTestId('map-grv-result')).toContainText('acre-ft');
  await expect(page.getByTestId('map-grv-result')).toContainText('above -4900 ft');

  // arithmetic: A + k on the structure, an attribute product needs B
  await page.getByTestId('map-arith-op').selectOption('scalarAdd');
  await page.getByTestId('map-iso-a').selectOption({ label: 'Top Dome structure' });
  await expect(page.getByTestId('map-iso-b')).toHaveCount(0);
  await page.getByTestId('map-arith-k').fill('-10');
  await page.getByTestId('map-iso-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Computed Top Dome structure - 10');

  // time to depth: the seeded TWT dome through the linear model, feet
  await page.locator('[data-testid="map-surface-row"][data-surface-name="Dome TWT"]').click();
  await expect(page.getByTestId('map-zrange')).toContainText('1401.2 to 1790.0 ms');
  await page.getByTestId('map-td-model').selectOption({ label: 'KETA 3D layer cake (layer cake)' });
  await page.getByTestId('map-td-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Convert the horizon to depth in Seismolord');
  await page.getByTestId('map-td-model').selectOption({ label: 'KETA 3D (v0 2000, k 0.3)' });
  await page.getByTestId('map-td-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Converted Dome TWT to depth');
  // the crest node (1401.2 ms TWT) through V = 2000 + 0.3 z:
  // z = (2000/0.3)(e^(0.3*0.7006) - 1) = 1559.3 m = -5116 ft, elevation in feet
  await expect(page.getByTestId('map-zrange')).toHaveText(/z -6736\.\d to -511[56]\.\d ft/);
  await page.getByTestId('map-publish').click();
  await expect(page.getByTestId('map-status')).toContainText('Published Dome TWT depth (ft)');
  const depthRow = page.locator('[data-testid="map-surface-row"][data-surface-name="Dome TWT depth (ft)"]');
  await expect(depthRow.getByTestId('map-row-badge')).toHaveText('depth · ft');
});

test('mapping app route loads its chunk and gates on auth', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dashboard/apps/geoscience/mapping-surface-studio');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  expect(page.url()).not.toContain('mapping-surface-studio');
});
