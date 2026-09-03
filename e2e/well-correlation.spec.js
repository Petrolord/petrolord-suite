// Well Correlation acceptance (G3.2, rebuilt for the WC series 2026-09-03):
// the cross-section drives on the /dev harness without auth on the
// deterministic 3-well synthetic section (services/sampleSection.js), so
// geometry is asserted off the section's own data attributes rather than
// hard-coded constants. KETA-3 is org-shared and read-only; KETA-2 builds
// angle below 1400 m so TVDSS differs from MD there.

import { test, expect } from '@playwright/test';

async function openSection(page, query = '') {
  await page.goto(`/dev/well-correlation${query}`);
  await expect(page.getByText('Well Correlation').first()).toBeVisible();
}

// section geometry from the wrapper's data attributes
async function geometry(page) {
  const sec = page.getByTestId('corr-section');
  const num = async (k) => Number(await sec.getAttribute(k));
  const list = async (k) => (await sec.getAttribute(k)).split(',').map(Number);
  const canvas = await page.getByTestId('corr-section-canvas').boundingBox();
  const g = {
    canvas, axisW: await num('data-axis-w'), plotTop: await num('data-plot-top'), plotH: await num('data-plot-h'),
    colX: await list('data-col-x'), colW: await list('data-col-w'), vTop: await num('data-view-top'), vBase: await num('data-view-base'),
  };
  g.yOf = (d) => canvas.y + g.plotTop + ((d - g.vTop) / (g.vBase - g.vTop)) * g.plotH;
  g.tagX = (i) => canvas.x + g.colX[i] + g.colW[i] - 20;   // inside the name tag at the column's right edge
  g.midX = (i) => canvas.x + g.colX[i] + g.colW[i] / 2;
  return g;
}

test('order 3 wells, flatten on Top Dome, drag + propagate tops', async ({ page }) => {
  await openSection(page);
  await expect(page.getByTestId('corr-empty')).toBeVisible();
  await expect(page.getByTestId('corr-map')).toBeVisible();

  // build the section from the available-wells list (deterministic order)
  for (const name of ['KETA-1', 'KETA-2', 'KETA-3']) {
    await page.getByTestId(`corr-add-${name}`).click();
  }
  await expect(page.getByTestId('corr-order-count')).toHaveText('3');
  await expect(page.getByTestId('corr-order-row')).toHaveCount(3);

  // cross-section renders (structural view by default, quicklook template)
  const canvas = page.getByTestId('corr-section-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('corr-depth-status')).toContainText('Raw quicklook');
  let g = await geometry(page);
  expect(g.colX).toHaveLength(3);
  expect([g.vTop, g.vBase]).toEqual([1400, 1750]); // GR log range bounds every well

  // drag Top Dome's name tag on KETA-1 (column 0) down by ~20 m
  await page.mouse.move(g.tagX(0), g.yOf(1500));
  await page.mouse.down();
  await page.mouse.move(g.tagX(0), g.yOf(1520), { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('corr-status')).toContainText(/Moved Top Dome on KETA-1 to 15(19|20|21)\.\d m/);

  // flatten on Top Dome: the datum line, no error, the view refits
  await page.getByTestId('corr-datum-mode').selectOption('flatten');
  await page.getByTestId('corr-datum-top').selectOption('Top Dome');
  await page.getByTestId('corr-datum-depth').fill('1500');
  await expect(page.getByTestId('corr-status')).not.toContainText('Could not');
  g = await geometry(page);
  expect(g.vTop).toBeLessThan(1400);

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

test('well-correlation app route loads its chunk and gates on auth', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dashboard/apps/geoscience/well-correlation');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  await expect(page).not.toHaveURL(/well-correlation$/);
});

test('PT5: the section has a depth navigator that pans the window', async ({ page }) => {
  await openSection(page, '?wells=corr-w1,corr-w2,corr-w3');
  await expect(page.getByTestId('corr-section-canvas')).toBeVisible();
  const nav = page.getByTestId('corr-depth-nav');
  await expect(nav).toBeVisible();
  const top0 = Number(await nav.getAttribute('data-view-top'));
  const base0 = Number(await nav.getAttribute('data-view-base'));
  expect(base0).toBeGreaterThan(top0);

  // wheel zoom on the section narrows the window
  const canvas = page.getByTestId('corr-section-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => Number(await nav.getAttribute('data-view-base')) - Number(await nav.getAttribute('data-view-top')))
    .toBeLessThan(base0 - top0);

  // dragging the navigator band scrolls the window down
  const nbox = await nav.boundingBox();
  const topBefore = Number(await nav.getAttribute('data-view-top'));
  await page.mouse.move(nbox.x + nbox.width / 2, nbox.y + nbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(nbox.x + nbox.width / 2, nbox.y + nbox.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await nav.getAttribute('data-view-top'))).toBeGreaterThan(topBefore);
});

// Cross-app navigation (2026-09-03): ?wells=<id,id> from Well Data Manager
// or Petrophysics builds the section on arrival; own wells link to Well
// Data Manager for editing; the ribbon links back to the dashboard.
test('cross-app: a ?wells= deep link adds the wells to the section; edit and home links', async ({ page }) => {
  await openSection(page, '?wells=corr-w1,corr-w3,corr-w1,no-such-well');
  await expect(page.getByTestId('corr-order-count')).toHaveText('2');
  await expect(page.getByTestId('corr-status')).toContainText('Added 2 linked wells');
  await expect(page.getByTestId('corr-section-canvas')).toBeVisible();
  await expect(page.getByTestId('corr-home')).toHaveAttribute('href', '/dashboard/geoscience');
  // KETA-1 is owned: it links to Well Data Manager on its tops tab; KETA-3 is
  // org-shared and read-only, so it offers no edit link
  await expect(page.getByTestId('corr-edit-well-data-KETA-1')).toHaveAttribute('href', '/dev/well-data-manager?well=corr-w1&tab=tops');
  await expect(page.getByTestId('corr-edit-well-data-KETA-3')).toHaveCount(0);
});

// WC series (Petrel tester readiness, 2026-09-03): tops picked by click,
// renamed and deleted on the section; zones, templates, units, spacing
// and depth reference; PNG export; read-only wells refuse picks.
test('WC: pick, rename and delete tops on the section; templates, ft, spacing, TVDSS and PNG export', async ({ page }) => {
  await openSection(page, '?wells=corr-w1,corr-w2,corr-w3');
  await expect(page.getByTestId('corr-section-canvas')).toBeVisible();
  let g = await geometry(page);

  // pick a top by clicking on KETA-2 (column 1) at ~1620 m
  await page.getByTestId('corr-top-pick').click();
  await expect(page.getByTestId('corr-section')).toHaveAttribute('data-pick-mode', 'top');
  await page.mouse.click(g.midX(1), g.yOf(1620));
  await expect(page.getByTestId('corr-top-popover')).toBeVisible();
  await page.getByTestId('corr-top-name').fill('Pick A');
  await page.getByTestId('corr-top-confirm').click();
  await expect(page.getByTestId('corr-status')).toContainText(/Added top Pick A on KETA-2 at 16(19|20|21)\.\d m/);
  await expect(page.getByTestId('corr-toggle-Pick A')).toBeVisible();

  // a read-only (shared) well refuses the pick, then Esc leaves pick mode
  await page.mouse.click(g.midX(2), g.yOf(1600));
  await expect(page.getByTestId('corr-status')).toContainText('read-only');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('corr-section')).toHaveAttribute('data-pick-mode', '');

  // rename it from the tops list, then delete it (two clicks: confirm)
  await page.getByTestId('corr-top-rename-Pick A').click();
  await page.getByTestId('corr-top-rename-input-Pick A').fill('Pick B');
  await page.getByTestId('corr-top-rename-ok-Pick A').click();
  await expect(page.getByTestId('corr-status')).toContainText('Renamed Pick A to Pick B on 1 well');
  await expect(page.getByTestId('corr-toggle-Pick B')).toBeVisible();
  await page.getByTestId('corr-top-delete-Pick B').click();
  await page.getByTestId('corr-top-delete-Pick B').click();
  await expect(page.getByTestId('corr-status')).toContainText('Deleted Pick B from 1 well');
  await expect(page.getByTestId('corr-toggle-Pick B')).toHaveCount(0);

  // zones off and on, template switch, feet
  await page.getByTestId('corr-zone-mode').selectOption('none');
  await page.getByTestId('corr-zone-mode').selectOption('pair');
  await page.getByTestId('corr-zone-top').selectOption('Top Dome');
  await page.getByTestId('corr-zone-base').selectOption('Base Sand');
  await page.getByTestId('corr-template').selectOption('lithology-quicklook');
  await expect(page.getByTestId('corr-depth-status')).toContainText('Lithology quicklook');
  await page.getByTestId('corr-depth-unit').selectOption('ft');
  await expect(page.getByTestId('corr-depth-status')).toContainText('depth ft');

  // proportional spacing narrows the columns and opens gaps
  const equalW = g.colW[0];
  await page.getByTestId('corr-spacing').selectOption('proportional');
  await expect.poll(async () => (await geometry(page)).colW[0]).toBeLessThan(equalW);
  g = await geometry(page);
  expect(g.colX[1] - g.colX[0]).toBeGreaterThan(g.colW[0]);

  // TVDSS: every well is 30 m above MD at the top of the logs (KB 30 m)
  await page.getByTestId('corr-depth-ref').selectOption('tvdss');
  await expect(page.getByTestId('corr-depth-status')).toContainText('TVDSS');
  await expect.poll(async () => (await geometry(page)).vTop).toBe(1370);

  // PNG export downloads the section
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('corr-export-png').click(),
  ]);
  expect(download.suggestedFilename()).toBe('well-correlation-section.png');
  await expect(page.getByTestId('corr-status')).toContainText('exported as PNG');
});
