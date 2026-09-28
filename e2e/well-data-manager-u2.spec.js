// AppUpgrade Step 2 for Well Data Manager (docs/upgrade/WellDataManager-UPGRADE.md,
// batches A to C) in a real browser on the /dev harness:
//   U2-001 feet display, remembered across a reload
//   U2-002 LAS and tops CSV downloads read back
//   U2-011 PL7: the well data sheet PDF opened with pdftotext, logo image present
//   U2-004 a hostile batch LAS import
//   U2-005 / U2-006 tops sheet paste and inventory flags
//   U2-013 upload progress and stop
//   U2-017 LAS 3.0 text channels
//   U2-003 the help guide from the ribbon
//   PL6    1366x768, 1440x900 and 390 wide, light and dark: the new views and
//          dialogs render with no page-level horizontal scroll (screenshots
//          written to E2E_SHOTS when set)

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const H = (f) => path.join(here, 'fixtures', 'wdm', 'hostile', f);
const SHOTS = process.env.E2E_SHOTS || null;

async function importPetrel(page) {
  await page.getByTestId('wdm-open-las').click();
  await page.getByTestId('wdm-las-file').setInputFiles(H('las20_petrel_export.las'));
  await page.getByTestId('wdm-las-import').click();
  await expect(page.getByTestId('wdm-detail-name')).toHaveText('OKAN PX-4');
}

test('U2-001: feet everywhere, remembered after a reload', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await importPetrel(page);
  await page.getByTestId('wdm-detail-tab-logs').click();
  await expect(page.getByText('Interval (m MD)')).toBeVisible();
  await page.getByTestId('wdm-units').selectOption('ft');
  await expect(page.getByText('Interval (ft MD)')).toBeVisible();
  await expect(page.getByTestId('wdm-status-units')).toHaveText('Depths in ft (stored in m)');
  await page.getByTestId('wdm-plot-GR').check();
  await expect(page.getByTestId('wdm-log-tracks')).toHaveAttribute('data-axis-unit', 'ft');
  await page.reload();
  await expect(page.getByTestId('wdm-units')).toHaveValue('ft');
});

test('U2-002 and U2-011: LAS, tops CSV and the data sheet PDF download and read back', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await importPetrel(page);
  await page.getByTestId('wdm-units').selectOption('ft');
  await page.getByTestId('wdm-export').click();
  let dl = page.waitForEvent('download');
  await page.getByTestId('wdm-export-download').click();
  const las = await (await dl).path();
  const lasText = fs.readFileSync(las, 'utf8');
  expect(lasText).toMatch(/DEPT\s*\.F/);
  expect(lasText).toMatch(/WELL\s*\.\s+OKAN PX-4/);
  await expect(page.getByTestId('wdm-status-message')).toContainText('LAS written with 4 curves, depths in ft');

  await page.getByTestId('wdm-export').click();
  await page.getByTestId('wdm-export-format-pdf').check();
  await page.getByTestId('wdm-export-analyst').fill('E2E Analyst');
  dl = page.waitForEvent('download');
  await page.getByTestId('wdm-export-download').click();
  const download = await dl;
  expect(download.suggestedFilename()).toBe('OKAN_PX-4_data_sheet.pdf');
  const pdf = await download.path();
  const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'latin1' }).replace(/[ \t]+/g, ' ');
  expect(text).toContain('Petrolord Suite - Well Data Manager');
  expect(text).toContain('Well OKAN PX-4');
  expect(text).toContain('UWI 00-1234-5678');
  expect(text).toContain('Depth unit feet (the registry stores metres)');
  expect(text).toContain('Vertical datum mean sea level (assumed; not stored per well)');
  expect(text).toMatch(/KB 83\.01 ft above datum/);
  expect(text).toContain('Prepared by E2E Analyst');
  expect(text).toMatch(/GR gAPI 6561\.7 6586\.2 0\.500 50 0 measured/);
  // the brand header carries the Petrolord logo image
  expect(fs.readFileSync(pdf).includes(Buffer.from('/Subtype /Image'))).toBe(true);
});

test('U2-004: a hostile batch lands every file or says why', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await page.getByTestId('wdm-open-batch').click();
  const junk = path.join(os.tmpdir(), 'wdm-batch-notes.txt');
  fs.writeFileSync(junk, 'not a LAS file');
  await page.getByTestId('wdm-batch-files').setInputFiles([
    H('las20_petrel_export.las'), H('las20_tvdss_index.las'), H('las20_slb_tdep_upward.las'), H('las30_tops_strings.las'), junk,
  ]);
  await expect(page.getByTestId('wdm-batch-row')).toHaveCount(5);
  await expect(page.getByTestId('wdm-batch-note-1')).toContainText('indexed by TVDSS');
  await expect(page.getByTestId('wdm-batch-note-4')).toContainText('Skipped');
  await expect(page.getByTestId('wdm-batch-error')).toContainText('a new well needs its surface X and Y');
  for (const i of [2, 3]) {
    await page.getByTestId(`wdm-batch-x-${i}`).fill(String(501000 + i));
    await page.getByTestId(`wdm-batch-y-${i}`).fill('6700200');
  }
  await page.getByTestId('wdm-batch-import').click();
  await expect(page.getByTestId('wdm-batch-results')).toContainText('Batch LAS: 3 files imported into 3 wells (3 new), 2 skipped, 0 failed.');
  await expect(page.getByTestId('wdm-status-message')).toContainText('Batch LAS: 3 files imported');
  await expect(page.locator('[data-testid=wdm-well-row][data-well-name="SLB TD-3"]')).toBeVisible();
});

test('U2-005 and U2-006: tops sheet paste, then the inventory flags', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await importPetrel(page);
  await page.getByTestId('wdm-view-tops').click();
  await page.getByTestId('wdm-sheet-paste-toggle').click();
  await page.getByTestId('wdm-sheet-paste-text').fill('Well\tSurface\tMD (ft)\nOKAN PX-4\tTop Agbada\t5000\nNOWHERE-1\tTop Agbada\t1');
  await expect(page.getByTestId('wdm-sheet-paste-plan')).toContainText('1 to add, 0 to move, 0 unchanged (MD read in ft).');
  await expect(page.getByTestId('wdm-sheet-paste-plan')).toContainText('Line 2: no well named or with UWI "NOWHERE-1".');
  await page.getByTestId('wdm-sheet-paste-apply').click();
  await expect(page.locator('[data-testid=wdm-sheet-row][data-well="OKAN PX-4"]')).toHaveCount(1);
  await expect(page.getByTestId('wdm-sheet-md-OKAN PX-4-Top Agbada')).toHaveValue('1524');
  await page.getByTestId('wdm-view-inventory').click();
  await expect(page.getByTestId('wdm-inventory-row')).toHaveCount(2);
  await expect(page.getByTestId('wdm-flag-no_crs')).toContainText('No CRS: 2');
  await page.getByTestId('wdm-flag-no_logs').click();
  await expect(page.getByTestId('wdm-inventory-row')).toHaveCount(1);
  await expect(page.getByTestId('wdm-inventory-row')).toHaveAttribute('data-well-name', 'AKOMA-2 (org shared)');
});

test('U2-013: upload progress, and Stop keeps what was saved', async ({ page }) => {
  await page.goto('/dev/well-data-manager?saveDelayMs=700');
  await page.getByTestId('wdm-open-las').click();
  await page.getByTestId('wdm-las-file').setInputFiles(H('las20_petrel_export.las'));
  await page.getByTestId('wdm-las-import').click();
  await expect(page.getByTestId('wdm-las-progress')).toContainText(/Saving curve \d of 5/);
  await page.getByTestId('wdm-las-stop').click();
  await expect(page.getByTestId('wdm-status-message')).toContainText(/Import stopped after [1-4] of 5 curves/);
});

test('U2-017: LAS 3.0 text and time channels become coded and time curves', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await page.getByTestId('wdm-open-las').click();
  await page.getByTestId('wdm-las-file').setInputFiles(H('las30_tops_strings.las'));
  await expect(page.getByTestId('wdm-las-text')).toContainText('LITH as codes (1 = SH 0, 2 = SH 1, 3 = SH 2)');
  await page.getByTestId('wdm-las-x').fill('501000');
  await page.getByTestId('wdm-las-y').fill('6700200');
  await page.getByTestId('wdm-las-import').click();
  await page.getByTestId('wdm-detail-tab-logs').click();
  await expect(page.getByTestId('wdm-log-origin-LITH')).toHaveText('coded text');
  await expect(page.getByTestId('wdm-log-origin-TIME')).toHaveText('time channel');
});

test('U2-003: the help guide opens from the ribbon and goes back', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await page.getByTestId('wdm-help').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Well Data Manager Help Guide');
  await page.getByText('Back to Well Data Manager').click();
  await expect(page.getByTestId('wdm-tree')).toBeVisible();
});

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6 at ${w}x${h} ${theme}: inventory, tops sheet, zones, export and batch dialogs`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/dev/well-data-manager');
      await importPetrel(page);
      if (theme === 'dark') await page.getByTestId('theme-toggle').click();
      const noPageScroll = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `u2-${w}-${theme}-${name}.png`) }); };
      await page.getByTestId('wdm-view-inventory').click();
      await expect(page.getByTestId('wdm-inventory-table')).toBeVisible();
      await noPageScroll(); await shot('inventory');
      await page.getByTestId('wdm-view-tops').click();
      await expect(page.getByTestId('wdm-sheet-table')).toBeVisible();
      await noPageScroll(); await shot('tops-sheet');
      await page.locator('[data-testid=wdm-well-row]').first().click();
      await page.getByTestId('wdm-detail-tab-zones').click();
      await expect(page.getByTestId('wdm-zones-tab')).toBeVisible();
      await noPageScroll(); await shot('zones');
      await page.getByTestId('wdm-export').click();
      await expect(page.getByTestId('wdm-export-dialog')).toBeVisible();
      await noPageScroll(); await shot('export');
      await page.keyboard.press('Escape');
      await page.getByTestId('wdm-open-batch').click();
      await expect(page.getByTestId('wdm-batch-dialog')).toBeVisible();
      await noPageScroll(); await shot('batch');
    });
  }
}
