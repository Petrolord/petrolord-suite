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
const LAS = path.join(here, '..', 'packages', 'engines', 'test-data', 'wells', 'las', 'basic_20.las');

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

  // 2026-09-03: a second LAS lands IN the selected well, not in a new one.
  // The wizard defaults to the selected own well; same-name curves are
  // kept alongside with a :n suffix, one of them renamed on the way in.
  await page.getByTestId('wdm-open-las').click();
  await page.getByTestId('wdm-las-file').setInputFiles(LAS);
  await expect(page.getByTestId('wdm-las-target-existing')).toBeChecked();
  await expect(page.getByTestId('wdm-las-target-well')).toHaveValue(/.+/);
  await expect(page.getByTestId('wdm-las-target-note')).toContainText('depth grid');
  await expect(page.getByTestId('wdm-las-clash-GR')).toBeVisible();
  await page.getByTestId('wdm-las-name-GR').fill('GR_RUN2');
  await expect(page.getByTestId('wdm-las-clash-GR')).toHaveCount(0);
  await page.getByTestId('wdm-las-import').click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('wdm-detail-name')).toHaveText('KETA G1-1');
  await page.getByTestId('wdm-detail-tab-logs').click();
  await expect(page.getByTestId('wdm-log-row')).toHaveCount(9);
  await expect(page.locator('[data-testid=wdm-log-row][data-mnemonic="GR_RUN2"]')).toHaveCount(1);
  await expect(page.locator('[data-testid=wdm-log-row][data-mnemonic="RHOB:2"]')).toHaveCount(1);

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
  await expect(page.getByTestId('wdm-delete-warning')).toContainText('9 logs');
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

test('PT1: Petrel checkshots (MD ft + OWT) convert at the door, read back as entered, and stay editable', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await page.getByTestId('wdm-open-manual').click();
  await page.getByTestId('well-import-name').fill('PETREL-1');
  await page.getByTestId('well-import-x').fill('501700');
  await page.getByTestId('well-import-y').fill('6700700');
  await page.getByTestId('well-import-kb').fill('30');
  await page.getByTestId('well-import-td').fill('3000');
  await page.getByTestId('well-tab-checkshots').click();
  // header words set the convention once: MD in feet, one-way time
  await page.getByTestId('well-import-text').fill('MD_ft,OWT_ms\n1000,100\n2000,180\n3000,250');
  await expect(page.getByTestId('well-import-cs-depthref')).toHaveValue('md');
  await expect(page.getByTestId('well-import-cs-unit')).toHaveValue('ft');
  await expect(page.getByTestId('well-import-cs-time')).toHaveValue('owt');
  // preview: 1000 ft = 304.8 m MD, vertical well, KB 30 -> TVDSS 274.80; OWT 100 -> TWT 200
  await expect(page.getByTestId('well-import-preview-stored').first()).toHaveText('274.80 / 200.0');
  await expect(page.getByTestId('well-import-cs-note')).toContainText('vertical');
  await page.getByTestId('well-import-save').click();
  await expect(page.getByTestId('wdm-detail-name')).toHaveText('PETREL-1');

  // read back as entered, stored columns beside
  await page.getByTestId('wdm-detail-tab-checkshots').click();
  const rows = page.getByTestId('wdm-cs-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('1000.00');
  await expect(rows.first()).toContainText('274.80');
  await page.getByTestId('wdm-cs-view-time').selectOption('twt');
  await expect(rows.first()).toContainText('200.0');

  // edit a row in place (still MD ft / OWT)
  await page.getByTestId('wdm-edit-checkshots').click();
  await page.getByTestId('wdm-checkshots-cell-1-time').fill('190');
  await page.getByTestId('wdm-checkshots-save').click();
  // the view is still set to TWT, so the edited 190 ms OWT reads as 380.0
  await expect(rows.nth(1)).toContainText('380.0');

  // a KB change re-derives the MD-referenced table and says so
  await page.getByTestId('wdm-detail-tab-header').click();
  await page.getByTestId('wdm-edit-header').click();
  await page.getByTestId('wdm-header-kb').fill('45');
  await page.getByTestId('wdm-header-save').click();
  await expect(page.getByTestId('wdm-status')).toContainText('re-derived');
  await page.getByTestId('wdm-detail-tab-checkshots').click();
  await expect(rows.first()).toContainText('259.80');

  // tops: add one through the grid, ids kept for the others
  await page.getByTestId('wdm-detail-tab-tops').click();
  await page.getByTestId('wdm-edit-tops').click();
  await page.getByTestId('wdm-tops-add').click();
  await page.getByTestId('wdm-tops-cell-0-name').fill('Top X');
  await page.getByTestId('wdm-tops-cell-0-md').fill('1500');
  await page.getByTestId('wdm-tops-save').click();
  await expect(page.getByTestId('wdm-top-row')).toHaveCount(1);

  // non-monotonic paste is refused with the domain message
  await page.getByTestId('wdm-detail-tab-checkshots').click();
  await page.getByTestId('wdm-edit-checkshots').click();
  await page.getByTestId('wdm-checkshots-paste-toggle').click();
  await page.getByTestId('wdm-checkshots-paste-text').fill('0,0\n50,55\n40,60');
  await page.getByTestId('wdm-checkshots-save').click();
  await expect(page.getByTestId('wdm-checkshots-error')).toContainText('strictly increase');
});

test('PT1: deep link opens the well on the requested tab and shows the table as entered', async ({ page }) => {
  // the harness seeds the org-shared well first, so its id is stable
  await page.goto('/dev/well-data-manager?well=well-1&tab=checkshots');
  await expect(page.getByTestId('wdm-detail-name')).toHaveText('AKOMA-2 (org shared)');
  const rows = page.getByTestId('wdm-cs-row');
  await expect(rows).toHaveCount(3);
  // seeded as MD ft + OWT: 304.8 m reads back as 1000.00 ft, 240 ms TWT as 120.0 OWT
  await expect(rows.first()).toContainText('1000.00');
  await expect(rows.first()).toContainText('120.0');
  // read-only for a shared well: no edit button
  await expect(page.getByTestId('wdm-edit-checkshots')).toHaveCount(0);
});

// Cross-app navigation (2026-09-03): a loaded well opens straight into the
// other Geoscience apps from the ribbon, the tree row menu and the detail
// header, and the ribbon links back to the Geoscience dashboard.
test('cross-app: Open in launchers carry the well into Petrophysics and Well Correlation; home link', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await expect(page.getByTestId('wdm-home')).toHaveAttribute('href', '/dashboard/geoscience');

  // nothing selected: the ribbon launcher waits for a selection
  await expect(page.getByTestId('wdm-open-in')).toBeDisabled();

  // right-click menu on a read-only (org shared) well still offers Open in
  const row = page.getByTestId('wdm-well-row').first();
  await row.click({ button: 'right' });
  await page.getByTestId('wdm-row-open-in').hover();
  const rowLink = page.getByTestId('wdm-row-open-in-well-correlation');
  await expect(rowLink).toBeVisible();
  await expect(rowLink).toHaveAttribute('href', /\/dev\/well-correlation\?wells=.+/);
  await page.keyboard.press('Escape');

  // select the well: ribbon launcher lists the apps with the well preselected
  await row.click();
  await expect(page.getByTestId('wdm-detail-name')).toBeVisible();
  await page.getByTestId('wdm-open-in').click();
  await expect(page.getByTestId('wdm-open-in-petrophysics-studio')).toHaveAttribute('href', /\/dev\/petrophysics-studio\?well=.+/);
  await expect(page.getByTestId('wdm-open-in-well-correlation')).toHaveAttribute('href', /\/dev\/well-correlation\?wells=.+/);
  await expect(page.getByTestId('wdm-open-in-rock-physics-studio')).toHaveAttribute('href', '/dev/rock-physics-studio');
  await expect(page.getByTestId('wdm-open-in-seismolord')).toHaveAttribute('href', '/dashboard/apps/geoscience/seismolord');
  await page.keyboard.press('Escape');

  // the detail header carries the same launcher
  await page.getByTestId('wdm-detail-open-in').click();
  await expect(page.getByTestId('wdm-detail-open-in-petrophysics-studio')).toBeVisible();
  await page.keyboard.press('Escape');
});
