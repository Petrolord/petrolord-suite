// Stratigraphy Studio ST0 acceptance on the /dev harness (no auth): the
// column editor, typed surfaces on a well, the terminology display option
// with its fallback badge, and the cross-app half of the criterion: the
// Well Correlation section draws the sample section's typed tops by type
// (read from its data-top-types attribute) and relabels them under Exxon.

import { test, expect } from '@playwright/test';

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
