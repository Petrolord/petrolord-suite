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

test('well-correlation app route loads its chunk and gates on auth', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dashboard/apps/geoscience/well-correlation');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  expect(page.url()).not.toContain('well-correlation'); // redirected by the auth gate
});

test('PT5: the section has a depth navigator that pans the window', async ({ page }) => {
  await page.goto('/dev/well-correlation');
  for (const name of ['KETA-1', 'KETA-2', 'KETA-3']) await page.getByTestId(`corr-add-${name}`).click();
  const canvas = page.getByTestId('corr-section-canvas');
  await expect(canvas).toBeVisible();
  const nav = page.getByTestId('corr-depth-nav');
  await expect(nav).toBeVisible();
  const top0 = Number(await nav.getAttribute('data-view-top'));
  const base0 = Number(await nav.getAttribute('data-view-base'));
  expect(base0).toBeGreaterThan(top0);
  // zoom in on the section, then drag the band on the navigator
  const cb = await canvas.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => Number(await nav.getAttribute('data-view-base')) - Number(await nav.getAttribute('data-view-top'))).toBeLessThan(base0 - top0);
  const top1 = Number(await nav.getAttribute('data-view-top'));
  const base1 = Number(await nav.getAttribute('data-view-base'));
  const nb = await nav.boundingBox();
  const plotH = nb.height - 34 - 6;
  const yOf = (d) => nb.y + 34 + ((d - top0) / (base0 - top0)) * plotH;
  const cx = nb.x + nb.width / 2;
  const mid = (top1 + base1) / 2;
  await page.mouse.move(cx, yOf(mid));
  await page.mouse.down();
  await page.mouse.move(cx, yOf(mid + (base0 - top0) * 0.05));
  await page.mouse.move(cx, yOf(mid + (base0 - top0) * 0.1));
  await page.mouse.up();
  expect(Number(await nav.getAttribute('data-view-top'))).toBeGreaterThan(top1);
});

// Cross-app navigation (2026-09-03): ?wells=<id,id> from Well Data Manager
// or Petrophysics builds the section on arrival; own wells link to Well
// Data Manager for editing; the ribbon links back to the dashboard.
test('cross-app: a ?wells= deep link adds the wells to the section; edit and home links', async ({ page }) => {
  await page.goto('/dev/well-correlation?wells=corr-w1,corr-w3,corr-w1,no-such-well');
  await expect(page.getByTestId('corr-order-count')).toHaveText('2');
  await expect(page.getByTestId('corr-status')).toContainText('Added 2 linked wells');
  await expect(page.getByTestId('corr-section-canvas')).toBeVisible();
  await expect(page.getByTestId('corr-home')).toHaveAttribute('href', '/dashboard/geoscience');
  // KETA-1 is owned: it links to Well Data Manager on its tops tab; KETA-3 is
  // org-shared and read-only, so it offers no edit link
  await expect(page.getByTestId('corr-edit-well-data-KETA-1')).toHaveAttribute('href', '/dev/well-data-manager?well=corr-w1&tab=tops');
  await expect(page.getByTestId('corr-edit-well-data-KETA-3')).toHaveCount(0);
});
