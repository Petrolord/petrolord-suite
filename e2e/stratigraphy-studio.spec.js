// Stratigraphy Studio ST0 acceptance on the /dev harness (no auth): the
// column editor, typed surfaces on a well, the terminology display option
// with its fallback badge, and the cross-app half of the criterion: the
// Well Correlation section draws the sample section's typed tops by type
// (read from its data-top-types attribute) and relabels them under Exxon.

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAS3 = path.join(HERE, '..', 'packages', 'engines', 'test-data', 'wells', 'las', 'las3_intervals_30.las');
// a 1x1 PNG, enough for the core photo door
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function openStudio(page, query = '') {
  await page.goto(`/dev/stratigraphy-studio${query}`);
  await expect(page.getByText('Stratigraphy Studio').first()).toBeVisible();
  await expect(page.getByTestId('strat-unit-name-0')).toHaveValue('Agbada');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.removeItem('strat.scheme'); } catch (e) { /* ignore */ } });
});

test('column editor: add a member from a timescale stage, save, explorer updates', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('strat-unit-add').click();
  const rows = await page.getByTestId(/^strat-unit-row-/).count();
  const i = rows - 1;
  await page.getByTestId(`strat-unit-name-${i}`).fill('D1 Sand');
  await page.getByTestId(`strat-unit-rank-${i}`).selectOption('member');
  await page.getByTestId(`strat-unit-parent-${i}`).selectOption('unit-agbada-upper');
  // nested under Upper Agbada now (row 2)
  await expect(page.getByTestId('strat-unit-name-2')).toHaveValue('D1 Sand');
  await page.getByTestId('strat-unit-stage-2').selectOption('Zanclean');
  await expect(page.getByTestId('strat-unit-agetop-2')).toHaveValue('3.6');
  await page.getByTestId('strat-column-save').click();
  await expect(page.getByTestId('strat-status')).toHaveText('Column saved (1 added, 0 changed, 0 removed).');
  await expect(page.getByTestId('strat-explorer-unit-D1 Sand')).toBeVisible();
});

test('type a top MFS, toggle the display scheme, the fallback badge shows where Exxon has no term', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('strat-well-KETA-1').click();
  await expect(page.getByTestId('strat-tops-typing')).toBeVisible();
  await expect(page.getByTestId('strat-top-type-Top Dome')).toHaveValue('formation_top');
  await page.getByTestId('strat-top-type-Top Dome').selectOption('MRS');
  await page.getByTestId('strat-top-unit-Top Dome').selectOption('unit-agbada-upper');
  await page.getByTestId('strat-top-confidence-Top Dome').selectOption('high');
  await page.getByTestId('strat-top-age-Top Dome').fill('5.333');
  await page.getByTestId('strat-tops-save').click();
  await expect(page.getByTestId('strat-status')).toHaveText('1 top typed on KETA-1.');
  await expect(page.getByTestId('strat-top-row-Top Dome')).toHaveAttribute('data-surface-type', 'MRS');
  // Top Dome (MRS) above Mid Shale (MFS): the regressive systems tract of a T-R sequence
  await expect(page.getByTestId('strat-top-tract-Top Dome')).toHaveText('RST');

  // display option: Exxon relabels, stored code unchanged
  await page.getByTestId('strat-scheme').selectOption('exxon');
  await expect(page.getByTestId('strat-scheme-status')).toHaveText('terms: Exxon (display)');
  await expect(page.getByTestId('strat-top-row-Top Dome')).toHaveAttribute('data-surface-type', 'MRS');
  const label = await page.getByTestId('strat-top-type-Top Dome').locator('option:checked').textContent();
  expect(label).toContain('Transgressive surface (TS)');
  await page.getByTestId('strat-top-type-Base Sand').selectOption('RSME');
  await expect(page.getByTestId('strat-fallback-RSME').first()).toBeVisible();
  await page.getByTestId('strat-view-glossary').click();
  await expect(page.getByTestId('strat-fallback-FSST')).toBeVisible();
  await expect(page.getByTestId('strat-glossary-SU')).toContainText('Sequence boundary (SB)');
});

test('a shared well is read-only', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('strat-well-KETA-3').click();
  await expect(page.getByTestId('strat-top-type-Top Dome')).toBeDisabled();
  await expect(page.getByTestId('strat-tops-typing')).toContainText('read-only');
});

test('Well Correlation draws the sample tops by surface type and follows the display scheme', async ({ page }) => {
  await page.goto('/dev/well-correlation');
  await expect(page.getByText('Well Correlation').first()).toBeVisible();
  for (const name of ['KETA-1', 'KETA-2', 'KETA-3']) await page.getByTestId(`corr-add-${name}`).click();
  await expect(page.getByTestId('corr-order-count')).toHaveText('3');
  const sec = page.getByTestId('corr-section');
  await expect(sec).toHaveAttribute('data-scheme', 'catuneanu');
  const types = await sec.getAttribute('data-top-types');
  expect(types).toContain('Mid Shale:MFS');
  expect(types).toContain('Base Sand:SU');
  expect(types).toContain('Top Dome:formation_top');
  // the beforeEach init script clears the preference on every load; a second init script, registered after it, sets Exxon
  await page.addInitScript(() => { window.localStorage.setItem('strat.scheme', 'exxon'); });
  await page.reload();
  await expect(page.getByText('Well Correlation').first()).toBeVisible();
  for (const name of ['KETA-1', 'KETA-2', 'KETA-3']) await page.getByTestId(`corr-add-${name}`).click();
  await expect(page.getByTestId('corr-section')).toHaveAttribute('data-scheme', 'exxon');
});

test('ST1: the seeded lithology log edits and saves; a core photo uploads into the depth strip', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('strat-well-KETA-1').click();
  await page.getByTestId('strat-view-intervals').click();
  await expect(page.getByTestId('strat-intervals-editor')).toBeVisible();
  await expect(page.getByTestId(/^strat-intervals-row-/)).toHaveCount(3);
  await expect(page.getByTestId('strat-intervals-code-1')).toHaveValue('sandstone');
  await expect(page.getByTestId('strat-intervals-thickness')).toContainText('Sandstone 160.0 m');
  // split the lower shale: add a limestone below 1700
  await page.getByTestId('strat-intervals-base-2').fill('1700');
  await page.getByTestId('strat-intervals-add').click();
  await page.getByTestId('strat-intervals-base-3').fill('1750');
  await page.getByTestId('strat-intervals-code-3').selectOption('limestone');
  await page.getByTestId('strat-intervals-save').click();
  await expect(page.getByTestId('strat-status')).toHaveText('4 lithology intervals saved on KETA-1.');
  await expect(page.getByTestId('strat-intervals-thickness')).toContainText('Limestone 50.0 m');
  // an overlap is refused with the engine message
  await page.getByTestId('strat-intervals-top-3').fill('1690');
  await page.getByTestId('strat-intervals-save').click();
  await expect(page.getByTestId('strat-intervals-problems')).toContainText('overlaps');

  // core photos
  await page.getByTestId('strat-view-core').click();
  await expect(page.getByTestId('strat-core-empty')).toBeVisible();
  await page.getByTestId('strat-core-file').setInputFiles({ name: 'box1.png', mimeType: 'image/png', buffer: PNG });
  await page.getByTestId('strat-core-top').fill('1500');
  await page.getByTestId('strat-core-base').fill('1503');
  await page.getByTestId('strat-core-caption').fill('Box 1');
  await page.getByTestId('strat-core-upload').click();
  await expect(page.getByTestId('strat-status')).toHaveText('Core photo added to KETA-1 (1500 to 1503 m).');
  await expect(page.getByTestId(/^strat-core-row-/)).toHaveCount(1);
  await expect(page.getByTestId('strat-core-strip')).toBeVisible();
  await expect(page.getByTestId(/^strat-core-strip-img-/)).toHaveCount(1);
});

test('ST1: a LAS 3.0 file with core and lithology blocks imports its intervals in Well Data Manager', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await expect(page.getByTestId('wdm-well-row')).toHaveCount(1);   // the seeded shared well: the harness is up
  await page.getByTestId('wdm-open-las').click();
  await page.getByTestId('wdm-las-file').setInputFiles(LAS3);
  await expect(page.getByTestId('wdm-las-intervals')).toContainText('Import 6 intervals from the core description and lithology blocks');
  await expect(page.getByTestId('wdm-las-intervals-check')).toBeChecked();
  await page.getByTestId('wdm-las-x').fill('501000');
  await page.getByTestId('wdm-las-y').fill('6700200');
  await page.getByTestId('wdm-las-import').click();
  await expect(page.getByTestId('wdm-detail-name')).toHaveText('KETA L3-2');
  await page.getByTestId('wdm-detail-tab-intervals').click();
  await expect(page.getByTestId(/^wdm-intervals-row-/)).toHaveCount(3);          // lithology: limestone, dolomite, MARBLE
  await expect(page.getByTestId('wdm-intervals-code-0')).toHaveValue('limestone');
  await page.getByTestId('wdm-intervals-kind').selectOption('core_description');
  await expect(page.getByTestId(/^wdm-intervals-row-/)).toHaveCount(3);          // core: feet converted to metres
  await expect(page.getByTestId('wdm-intervals-top-0')).toHaveValue(/^1500\.0/);
  await expect(page.getByTestId('wdm-intervals-grain-0')).toHaveValue('f_sand');
});

test('ST2: the shared section opens in the studio; stretch datum, implied tracts, ghost curve, record tracts', async ({ page }) => {
  await openStudio(page);
  // the sample's Top Dome is a plain formation top between the BSFR and the MFS, so no tract is implied yet;
  // type it MFS on KETA-1 and the BSFR above it bounds a highstand
  await page.getByTestId('strat-well-KETA-1').click();
  await page.getByTestId('strat-top-type-Top Dome').selectOption('MFS');
  await page.getByTestId('strat-tops-save').click();
  await expect(page.getByTestId('strat-status')).toHaveText('1 top typed on KETA-1.');
  await page.getByTestId('strat-view-section').click();
  const sec = page.getByTestId('corr-section');
  await expect(sec).toBeVisible();
  await expect(page.getByTestId('strat-section-summary')).toContainText('3 wells');
  await expect(sec).toHaveAttribute('data-band-count', '1');
  // stratigraphic flattening between two surfaces
  await page.getByTestId('strat-datum-mode').selectOption('stretch');
  await page.getByTestId('strat-datum-upper').selectOption('Top Dome');
  await page.getByTestId('strat-datum-lower').selectOption('Base Sand');
  await expect(sec).toHaveAttribute('data-datum-mode', 'stretch');
  // ghost curve: KETA-1's first track on KETA-2, shifted
  await page.getByTestId('strat-ghost-source').selectOption('corr-w1');
  await page.getByTestId('strat-ghost-target').selectOption('corr-w2');
  await page.getByTestId('strat-ghost-shift').fill('40');
  await expect(sec).toHaveAttribute('data-ghost', 'corr-w1>corr-w2:40');
  await expect(page.getByTestId('strat-ghost-shift-value')).toHaveText('+40 m');
  // record the implied tracts as shared intervals on the own wells
  await page.getByTestId('strat-record-tracts').click();
  await expect(page.getByTestId('strat-status')).toHaveText('Recorded 1 systems tract on 2 wells.');
  await page.getByTestId('strat-save-view').click();
  await expect(page.getByTestId('strat-status')).toHaveText('Stratigraphy view saved.');
  // the recorded tracts are visible in the Intervals view of KETA-1
  await page.getByTestId('strat-well-KETA-1').click();
  await page.getByTestId('strat-view-intervals').click();
  await page.getByTestId('strat-intervals-kind').selectOption('systems_tract');
  await expect(page.getByTestId(/^strat-intervals-row-/)).toHaveCount(1);
});

test('ST2: typing SU, MRS and MFS on a well gives LST, TST and HST fills and a Wheeler chart', async ({ page }) => {
  await openStudio(page);
  // KETA-1 today: Top Marker BSFR (4 Ma), Top Dome plain, Mid Shale MFS (5 Ma), Base Sand SU (10 Ma, hiatus to 14)
  await page.getByTestId('strat-well-KETA-1').click();
  await page.getByTestId('strat-top-type-Top Dome').selectOption('MFS');
  await page.getByTestId('strat-top-age-Top Dome').fill('5');
  await page.getByTestId('strat-top-type-Mid Shale').selectOption('MRS');
  await page.getByTestId('strat-top-age-Mid Shale').fill('8');
  await page.getByTestId('strat-tops-save').click();
  await expect(page.getByTestId('strat-status')).toHaveText('2 tops typed on KETA-1.');
  await expect(page.getByTestId('strat-top-tract-Top Marker')).toHaveText('HST');
  await expect(page.getByTestId('strat-top-tract-Top Dome')).toHaveText('TST');
  await expect(page.getByTestId('strat-top-tract-Mid Shale')).toHaveText('LST');
  // the section fills the three tracts on KETA-1 (KETA-2's Top Dome is still untyped, so nothing there)
  await page.getByTestId('strat-view-section').click();
  await expect(page.getByTestId('corr-section')).toHaveAttribute('data-band-count', '3');
  // Wheeler: KETA-1 now has HST (4 to 5), TST (5 to 8), LST (8 to 10), hiatus (10 to 14)
  await page.getByTestId('strat-view-wheeler').click();
  const chart = page.getByTestId('strat-wheeler-chart');
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('data-age-max', '14');
  await expect(page.getByTestId('strat-wheeler-cell-KETA-1-0')).toHaveAttribute('data-tract', 'HST');
  await expect(page.getByTestId('strat-wheeler-cell-KETA-1-1')).toHaveAttribute('data-tract', 'TST');
  await expect(page.getByTestId('strat-wheeler-cell-KETA-1-2')).toHaveAttribute('data-tract', 'LST');
  await expect(page.getByTestId('strat-wheeler-cell-KETA-1-3')).toHaveAttribute('data-kind', 'hiatus');
  // the Exxon display relabels the cells without changing what is stored
  await page.getByTestId('strat-scheme').selectOption('exxon');
  await expect(page.getByTestId('strat-wheeler-cell-KETA-1-1')).toContainText('TST');
  await expect(page.getByTestId('strat-wheeler-cell-KETA-1-1')).toHaveAttribute('data-tract', 'TST');
});

test('ST3: the Ages view shows the two rates and the hiatus, a biozone range becomes datums, Send to Basin builds a model', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('strat-well-KETA-1').click();
  await page.getByTestId('strat-view-ages').click();
  await expect(page.getByTestId('strat-ages-view')).toBeVisible();
  // Top Marker (4 Ma) to Mid Shale (5 Ma): 140 m in 1 Ma; Mid Shale to Base Sand (10 Ma): 80 m in 5 Ma; hiatus 10 to 14
  await expect(page.getByTestId('strat-agedepth-plot')).toHaveAttribute('data-segments', '2');
  await expect(page.getByTestId('strat-agedepth-segment-0')).toHaveAttribute('data-rate', '140.000');
  await expect(page.getByTestId('strat-agedepth-segment-1')).toHaveAttribute('data-rate', '16.000');
  await expect(page.getByTestId('strat-hiatus-0')).toContainText('10 to 14');
  await expect(page.getByTestId('strat-stage-Mid Shale')).toContainText('Zanclean');
  // a biozone range in the Intervals view, then datums from it
  await page.getByTestId('strat-view-intervals').click();
  await page.getByTestId('strat-intervals-kind').selectOption('biozone_interval');
  await page.getByTestId('strat-intervals-add').click();
  await page.getByTestId('strat-intervals-top-0').fill('1500');
  await page.getByTestId('strat-intervals-base-0').fill('1560');
  await page.getByTestId('strat-intervals-code-0').fill('NN12');
  await page.getByTestId('strat-intervals-scheme-0').fill('NN');
  await page.getByTestId('strat-intervals-agetop-0').fill('5.6');
  await page.getByTestId('strat-intervals-agebase-0').fill('8.3');
  await page.getByTestId('strat-intervals-save').click();
  await expect(page.getByTestId('strat-status')).toHaveText('1 biozone interval saved on KETA-1.');
  await page.getByTestId('strat-view-ages').click();
  await page.getByTestId('strat-biozone-datums').click();
  await expect(page.getByTestId('strat-status')).toHaveText('2 biozone datums added as typed tops on KETA-1.');
  await expect(page.getByTestId('strat-stage-NN12 top')).toContainText('biozone');
  // the handoff
  await page.getByTestId('strat-send-basin').click();
  await expect(page.getByTestId('strat-status')).toContainText('Basin model "KETA-1 stratigraphy" created');
  await expect(page.getByTestId('strat-open-basin')).toHaveAttribute('href', '/dev/basinflow-genesis');
});
