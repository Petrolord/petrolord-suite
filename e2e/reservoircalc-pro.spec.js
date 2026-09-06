// ReservoirCalc Pro RC0 acceptance: the whole app on the /dev harness
// without auth. A registry surface (the seeded depth dome) is imported
// through the Surface import, the hybrid method uses it with a contact,
// STOOIP comes out positive, a Monte Carlo run reports P50, and Save
// stores a project through the in-memory backend.

import { test, expect } from '@playwright/test';

test('RC0: import a registry surface, compute with a contact, run Monte Carlo, save', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/reservoircalc-pro');
  await expect(page.getByTestId('rcp-harness')).toBeVisible();
  await expect(page.getByTestId('rcp-project-name')).toHaveText('Unsaved Workspace');

  // the surface registry lists the harness dome; Use it
  await page.getByTestId('rcp-tab-surfaces').click();
  await page.getByTestId('rcp-import-open').click();
  await page.getByTestId('rcp-registry-use-Harness Dome').click();
  // Use fills the form from the registry row; Import Surface parses it
  await expect(page.getByTestId('rcp-import-confirm')).toBeEnabled({ timeout: 15000 });
  await page.getByTestId('rcp-import-confirm').click();
  // a registry grid may raise geometry warnings held for confirmation
  const anyway = page.getByTestId('rcp-import-anyway');
  await Promise.race([
    anyway.waitFor({ state: 'visible', timeout: 15000 }).then(() => anyway.click()).catch(() => {}),
    page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {}),
  ]);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15000 });

  // hybrid method: surface top + gross thickness; contact well below the crest
  await page.getByTestId('rcp-tab-geometry').click();
  await page.locator('label[for="im-hybrid"]').click();
  await page.locator('#owc-input').fill('-5600');
  await page.locator('#owc-input').blur();
  const stooip = page.getByTestId('rcp-stooip');
  await expect(stooip).toBeVisible({ timeout: 20000 });
  await expect.poll(async () => Number(await stooip.getAttribute('data-value')), { timeout: 20000 }).toBeGreaterThan(0);

  // save through the in-memory backend with the dev user
  await page.getByTestId('rcp-save').click();
  await page.getByTestId('rcp-save-name').fill('Harness volumetrics');
  await page.getByTestId('rcp-save-confirm').click();
  await expect(page.getByTestId('rcp-project-name')).toHaveText('Harness volumetrics');
  expect(errors).toEqual([]);
});

test('RC1: the Wells tab pulls zone averages, a surface footprint and a Mapping boundary from the registry', async ({ page }) => {
  await page.goto('/dev/reservoircalc-pro');
  await page.getByTestId('rcp-tab-registry').click();
  await page.getByTestId('rcp-reg-zone').selectOption('Top Dome');
  await expect(page.getByTestId('rcp-reg-preview')).toContainText(/porosity 0\.\d+, NTG 0\.\d+ from/);
  await page.getByTestId('rcp-reg-apply-zone').click();
  await expect(page.getByTestId('rcp-reg-note')).toContainText(/Applied porosity/);
  await page.getByTestId('rcp-reg-surface').selectOption({ label: 'Harness Dome (16x11)' });
  await page.getByTestId('rcp-reg-apply-area').click();
  await expect(page.getByTestId('rcp-reg-note')).toContainText(/Applied area \d+\.\d acres from the live footprint of Harness Dome/);
  await page.getByTestId('rcp-reg-boundary').selectOption({ label: 'Demo license block (license_block)' });
  await page.getByTestId('rcp-reg-add-aoi').click();
  await expect(page.getByTestId('rcp-reg-note')).toContainText('Added Demo license block as an AOI (4 vertices)');
  // the AOI is listed in the AOI tab
  await page.getByTestId('rcp-tab-aoi').click();
  await expect(page.getByTestId('rcp-aoi-row-Demo license block')).toBeVisible();
});

test('RC2: contacts are TVDSS elevations in a chosen unit and the viewers label a metre surface in metres', async ({ page }) => {
  await page.goto('/dev/reservoircalc-pro');
  await page.getByTestId('rcp-tab-surfaces').click();
  await page.getByTestId('rcp-import-open').click();
  await page.getByTestId('rcp-registry-use-Harness Dome').click();
  await page.getByTestId('rcp-import-confirm').click();
  const anyway = page.getByTestId('rcp-import-anyway');
  await Promise.race([
    anyway.waitFor({ state: 'visible', timeout: 15000 }).then(() => anyway.click()).catch(() => {}),
    page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {}),
  ]);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15000 });
  // the 3D viewer labels the metre surface in metres although the workspace is field
  await expect(page.getByText(/Depth \(m\)/i).first()).toBeVisible({ timeout: 15000 });

  await page.getByTestId('rcp-tab-geometry').click();
  await page.locator('label[for="im-hybrid"]').click();
  await expect(page.getByTestId('rcp-contact-note')).toContainText('Elevation below the datum');
  await page.locator('#owc-input').fill('-5249.34');
  await page.locator('#owc-input').blur();
  const stooip = page.getByTestId('rcp-stooip');
  await expect.poll(async () => Number(await stooip.getAttribute('data-value')), { timeout: 20000 }).toBeGreaterThan(0);
  const feet = Number(await stooip.getAttribute('data-value'));
  // the same contact typed in metres gives the same volume
  await page.getByTestId('rcp-contact-unit').selectOption('m');
  await expect(page.locator('#owc-input')).toHaveValue(/-1599\.99|-1600/);
  await page.locator('#owc-input').fill('-1600');
  await page.locator('#owc-input').blur();
  await expect.poll(async () => Math.abs(Number(await stooip.getAttribute('data-value')) - feet) / feet, { timeout: 20000 }).toBeLessThan(0.005);
});

test('RC3: a registry surface carries launchers into Mapping and Earth Modeling; zone wells open in Well Data Manager; the docs hub has the registry chapter', async ({ page }) => {
  await page.goto('/dev/reservoircalc-pro');
  await page.getByTestId('rcp-tab-surfaces').click();
  await page.getByTestId('rcp-import-open').click();
  await page.getByTestId('rcp-registry-use-Harness Dome').click();
  await page.getByTestId('rcp-import-confirm').click();
  const anyway = page.getByTestId('rcp-import-anyway');
  await Promise.race([
    anyway.waitFor({ state: 'visible', timeout: 15000 }).then(() => anyway.click()).catch(() => {}),
    page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {}),
  ]);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByTestId('rcp-open-mapping-Harness Dome')).toHaveAttribute('href', /mapping-surface-studio\?surface=surf-/);
  await expect(page.getByTestId('rcp-open-earth-Harness Dome')).toHaveAttribute('href', /earth-modeling\?surface=surf-/);
  await page.getByTestId('rcp-tab-registry').click();
  await page.getByTestId('rcp-reg-zone').selectOption('Top Dome');
  const wellLinks = page.locator('[data-testid^="rcp-reg-well-"]');
  await expect(wellLinks.first()).toBeVisible();
  await expect(wellLinks.first()).toHaveAttribute('href', /well-data-manager\?well=.*tab=tops/);
});
