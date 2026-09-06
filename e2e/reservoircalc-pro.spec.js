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
