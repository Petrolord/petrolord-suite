// Well Correlation G3.2 acceptance (WellCorrelation-PLAN.md): the
// cross-section workstation drives on the /dev harness without auth.
// The seeded 3-well synthetic section lets the flow exercise the
// roadmap acceptance — order ≥3 wells, flatten on any top, pick/drag
// tops, propagate — with the org-shared well read-only.

import { test, expect } from '@playwright/test';

test('order 3 wells, flatten on Top Dome, drag + propagate tops', async ({ page }) => {
  await page.goto('/dev/well-correlation');
  await expect(page.getByTestId('corr-empty')).toBeVisible();
  await expect(page.getByTestId('corr-map')).toBeVisible();

  // build the section from the available-wells list (deterministic order)
  for (const name of ['KETA-1', 'KETA-2', 'KETA-3']) {
    await page.getByTestId(`corr-add-${name}`).click();
  }
  await expect(page.getByTestId('corr-order-count')).toHaveText('3');
  await expect(page.getByTestId('corr-order-row')).toHaveCount(3);

  // cross-section renders (structural view by default)
  const canvas = page.getByTestId('corr-section-canvas');
  await expect(canvas).toBeVisible();

  // drag Top Dome's handle on KETA-1 (column 0). Structural auto-fit
  // view is [1400,1750] (GR log range bounds every well); geometry
  // constants match CrossSection.jsx (AXIS_W 52, HEADER_H 34).
  const cbox = await canvas.boundingBox();
  const colW = (cbox.width - 52) / 3;
  const handleX = cbox.x + 52 + colW - 8;
  const plotH = cbox.height - 34 - 6;
  const yOfDepth = (d) => cbox.y + 34 + ((d - 1400) / (1750 - 1400)) * plotH;
  await page.mouse.move(handleX, yOfDepth(1500));
  await page.mouse.down();
  await page.mouse.move(handleX, yOfDepth(1520), { steps: 6 }); // pull Top Dome down ~20 m
  await page.mouse.up();
  await expect(page.getByTestId('corr-status')).toContainText('Moved Top Dome');

  // flatten on Top Dome — no error, datum controls populate
  await page.getByTestId('corr-datum-mode').selectOption('flatten');
  await page.getByTestId('corr-datum-top').selectOption('Top Dome');
  await page.getByTestId('corr-datum-depth').fill('1500');
  await expect(page.getByTestId('corr-status')).not.toContainText('Could not');

  // propagate a new marker across owned wells (KETA-3 shared -> skipped)
  await page.getByTestId('corr-prop-name').fill('Marker Z');
  await page.getByTestId('corr-prop-md').fill('1630');
  await page.getByTestId('corr-prop-run').click();
  await expect(page.getByTestId('corr-status')).toContainText('Propagated Marker Z to 2 wells');
  await expect(page.getByTestId('corr-toggle-Marker Z')).toBeVisible();

  // save the section
  await page.getByTestId('corr-save').click();
  await expect(page.getByTestId('corr-status')).toContainText('Section saved');

  // remove a well from the section via the ordered list
  await page.getByTestId('corr-remove-KETA-3').click();
  await expect(page.getByTestId('corr-order-count')).toHaveText('2');
});
