// Project Data Inventory (owner request 2026-10-11) in a real browser, on
// the QI Studio and Petrophysics Studio dev harnesses (in-memory backends).
// The matrix states come from what each backend holds; the presentation
// view opens and closes; PNG, PDF and CSV download; both themes at the
// tester viewport 1366x768 with no page error and no sideways scroll; and
// the tabs and views the recorded videos open are where they were.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import { execFileSync } from 'child_process';

const VIEWPORT = { width: 1366, height: 768 };
test.describe.configure({ timeout: 360000 });
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const RECORDED_QI_TABS = ['setup', 'inventory', 'usability', 'qc', 'ties', 'prestack', 'avo', 'inversion', 'simultaneous', 'properties', 'prospects', 'issues', 'feasibility', 'report'];

async function openQi(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize(VIEWPORT);
  await page.goto('/dev/qi-studio', { waitUntil: 'commit' });
  await expect(page.getByTestId('qi-well-qi-w1')).toBeVisible({ timeout: 300000 });
  return errors;
}

test('QI Studio: the recorded tabs are unchanged and Data matrix comes last', async ({ page }) => {
  const errors = await openQi(page);
  const ids = await page.getByRole('tab').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(ids).toEqual([...RECORDED_QI_TABS, 'datainventory'].map((k) => `qi-tab-${k}`));
  await expect(page.getByTestId('qi-tab-setup')).toHaveAttribute('aria-selected', 'true');
  // the recorded tabs sit on one line at the recording viewport
  await page.setViewportSize({ width: 1440, height: 810 });
  const heights = await page.getByRole('tab').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
  expect(errors).toEqual([]);
});

test('QI Studio: the matrix, notes, presentation view and the three exports', async ({ page }) => {
  const errors = await openQi(page);
  for (const w of ['qi-w1', 'qi-w2', 'qi-w3']) await page.getByTestId(`qi-well-${w}`).click();
  await page.getByTestId('qi-target-SAND A').click({ timeout: 30000 });
  await page.getByTestId('qi-tab-datainventory').click();
  await expect(page.getByTestId('pdi-board')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('pdi-scan-state')).toContainText(/Coverage from \d+ curves' samples/, { timeout: 60000 });
  await expect(page.getByTestId('pdi-cell-KETA-1-dts')).toHaveAttribute('data-status', 'complete');
  await expect(page.getByTestId('pdi-cell-AKOMA-2-dts')).toHaveAttribute('data-status', 'missing');
  await expect(page.getByTestId('pdi-cell-BONSU-3-rhob')).toHaveAttribute('data-status', 'derived');
  await expect(page.getByTestId('pdi-note-shear-none')).toContainText('local shear trend calibrated on KETA-1');
  await page.getByTestId('pdi-cell-AKOMA-2-dts').click();
  await expect(page.getByTestId('pdi-cell-detail')).toContainText('No shear slowness curve on this well');

  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pdi-export-csv').click()]);
  const csvText = fs.readFileSync(await csv.path(), 'utf8');
  expect(csvText).toContain('\nWELLS\n');
  expect(csvText).toContain('KETA-1');

  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pdi-export-pdf').click()]);
  const text = execFileSync('pdftotext', ['-layout', await pdf.path(), '-'], { encoding: 'utf8' });
  expect(text).toContain('PROJECT DATA INVENTORY');
  expect(text).toContain('Notes: impact, workaround, uncertainty and mitigation');

  await page.getByTestId('pdi-present-open').click();
  await expect(page.getByTestId('pdi-board-present')).toBeVisible();
  const [png] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByTestId('pdi-present-png').click()]);
  const head = fs.readFileSync(await png.path()).subarray(0, 24);
  expect(head.subarray(1, 4).toString()).toBe('PNG');
  expect(head.readUInt32BE(16)).toBe(3840); // 1920 at scale 2
  await page.getByTestId('pdi-present-close').click();
  await expect(page.getByTestId('pdi-present')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`QI Studio and Petrophysics Studio inventory at 1366x768, ${theme}: no page error, no sideways scroll`, async ({ page }) => {
    const errors = await openQi(page);
    if (theme === 'dark') await page.getByTestId('theme-toggle').click();
    await page.getByTestId('qi-tab-datainventory').click();
    await expect(page.getByTestId('pdi-board')).toBeVisible({ timeout: 60000 });
    expect(await sideways(page)).toBe(false);
    // the board is white chart paper in both themes
    expect(await page.getByTestId('pdi-board').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');

    await page.goto('/dev/petrophysics-studio', { waitUntil: 'commit' });
    await expect(page.getByTestId('petro-view-tracks')).toBeVisible({ timeout: 300000 });
    await page.getByTestId('petro-view-inventory').click();
    await expect(page.getByTestId('pdi-board')).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('pdi-cell-KETA TYPE-1-gr')).toHaveAttribute('data-status', 'complete');
    expect(await sideways(page)).toBe(false);
    expect(errors).toEqual([]);
  });
}
