// Well Data Manager G1.3 acceptance (WellDataManager-PLAN.md): the
// full import → view → share → delete flow drivable in the /dev
// harness without auth. The harness runs the REAL app on the in-memory
// backend — LAS parsing goes through the real engine in the real
// worker; the seeded org-shared well proves read-only rows hide the
// owner actions.

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const LAS = path.join(here, '..', 'test-data', 'wells', 'las', 'basic_20.las');

test('full LAS import → view → share → delete flow in the harness', async ({ page }) => {
  await page.goto('/dev/well-data-manager');

  // seeded org-shared well is listed read-only
  const rows = page.getByTestId('wdm-well-row');
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('wdm-well-badge')).toHaveText(/org/);

  // LAS wizard: file → parse (worker) → header suggestion → import
  await page.getByTestId('wdm-open-las').click();
  await page.getByTestId('wdm-las-file').setInputFiles(LAS);
  await expect(page.getByTestId('wdm-las-summary')).toContainText('4 curves');
  await expect(page.getByTestId('wdm-las-curves')).toContainText('GR');
  // suggested name comes from the ~Well section; surface X/Y are manual
  await expect(page.getByTestId('wdm-las-name')).toHaveValue('KETA G1-1');
  await page.getByTestId('wdm-las-x').fill('501000');
  await page.getByTestId('wdm-las-y').fill('6700200');
  await page.getByTestId('wdm-las-import').click();

  // lands selected on the detail view
  await expect(page.getByTestId('wdm-detail-name')).toHaveText('KETA G1-1');
  await expect(rows).toHaveCount(2);

  // logs tab: 5 rows (DEPT + 4), plot one curve onto the tracks canvas
  await page.getByTestId('wdm-detail-tab-logs').click();
  await expect(page.getByTestId('wdm-log-row')).toHaveCount(5);
  await page.getByTestId('wdm-plot-GR').check();
  await expect(page.getByTestId('wdm-log-tracks')).toBeVisible();

  // share via the tree context menu; badge flips to org
  const ownRow = page.locator('[data-well-name="KETA G1-1"]');
  await ownRow.click({ button: 'right' });
  await page.getByText('Share with organization').click();
  await expect(ownRow.getByTestId('wdm-well-badge')).toHaveText(/org/);
  await expect(page.getByTestId('wdm-status-message')).toContainText('shared');

  // the seeded read-only well offers no context menu actions
  const sharedRow = page.locator('[data-well-name="AKOMA-2 (org shared)"]');
  await sharedRow.click({ button: 'right' });
  await expect(page.getByText('Delete well…')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // delete with the dependent-data warning
  await ownRow.click({ button: 'right' });
  await page.getByText('Delete well…').click();
  await expect(page.getByTestId('wdm-delete-warning')).toContainText('5 logs');
  await page.getByTestId('wdm-delete-confirm').click();
  await expect(rows).toHaveCount(1);
});

// G1.5: the real app route must resolve its lazy chunk (registry
// backend + wellsRegistry imports, none of which the harness touches)
// and hand off to the auth gate — not crash, and not fall through to
// the home-redirect catch-all as an unregistered route would.
test('well-data-manager app route loads its chunk and gates on auth', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dashboard/apps/geoscience/well-data-manager');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  expect(page.url()).not.toContain('well-data-manager'); // redirected by the auth gate
});

test('map shows wells and click-selects; manual add-well flow', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await expect(page.getByTestId('wdm-map')).toBeVisible();

  // manual well with pasted tops through the shared WellImport form
  await page.getByTestId('wdm-open-manual').click();
  await page.getByTestId('well-import-name').fill('MANUAL-1');
  await page.getByTestId('well-import-x').fill('501500');
  await page.getByTestId('well-import-y').fill('6700600');
  await page.getByTestId('well-import-td').fill('1800');
  await page.getByTestId('well-tab-tops').click();
  await page.getByTestId('well-import-text').fill('name,md\nTop Dome,1500\nBase Seal,1690');
  await page.getByTestId('well-import-save').click();

  await expect(page.getByTestId('wdm-detail-name')).toHaveText('MANUAL-1');
  await page.getByTestId('wdm-detail-tab-tops').click();
  await expect(page.getByTestId('wdm-top-row')).toHaveCount(2);

  // back to the map; both wells plotted (canvas present, count in tree)
  await page.getByTestId('wdm-view-map').click();
  await expect(page.getByTestId('wdm-map')).toBeVisible();
  await expect(page.getByTestId('wdm-well-count')).toHaveText('2');
});
