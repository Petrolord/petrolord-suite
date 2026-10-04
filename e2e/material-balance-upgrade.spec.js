// Material Balance Studio, Reservoir upgrade round app 2 (MBAL-U1;
// docs/upgrade/MaterialBalanceStudio-UPGRADE.md). On the /dev harness,
// signed out, so the unit profile is the built-in oilfield preset. The
// harness holds an in-memory copy of the rb_* tables seeded with three
// published cases and runs the canonical engine in the browser through the
// edge function's own row mapping. Every page load starts from the seed.
//
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: the Run card, the
//        diagnostic plots, the Report tab; no page error, no sideways scroll.
//   RL   the report door: identification, datum and sources typed on the
//        Report tab, the PDF downloaded and read back with pdftotext and
//        pdfinfo (header, inputs with sources, regression statement, drive
//        indices, cross-check, limits, figure captions).
//   PL2  hostile production files: units from the header or chosen at the
//        door, day-first dates asked and never guessed, a file with no
//        header refused until its columns are placed, a read-back of what
//        was left out, and the same answer as the oilfield twin.
//   PL4  a stale run: an input edit withdraws the result and the report; a
//        report-only edit does not.
//   PL3  the unit switch converts the rail, the doors and the plots; a field
//        takes "2.5" key by key and a cleared field stays cleared (PL11).
//   PL9  PVT taken from a saved Fluid Systems Studio project through the
//        pvt-1 contract, with its provenance; a table that does not cover
//        the case is refused with the reason.
//   PL5  a case as the release before this one stored it opens, says its
//        result is an earlier run, and is whole after one new run.
//   Sharing: a case a colleague shared opens read-only; Save a copy makes
//        the reader's own.
//
// Evidence goes under test-results/ only.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { seedUnitView } from './helpers/unitView.js';

const OUT = 'test-results/material-balance-upgrade';
fs.mkdirSync(OUT, { recursive: true });
const HOSTILE = path.join('e2e', 'fixtures', 'material-balance', 'hostile');
const SAVED = path.join('e2e', 'fixtures', 'material-balance', 'saved', 'case-2026-09-before-u1.json');
const BASE = '/dev/material-balance-studio';
const AHMED = 'case-ahmed-11-3';
const DAKE = 'case-dake-9-2';
const PLETCHER = 'case-pletcher-gas';
const SHARED = 'case-colleague-shared';

const noPageScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const tab = (page, name) => page.locator('header').getByText(name, { exact: true });

async function openCase(page, id, tabName = 'run') {
  await page.goto(`${BASE}/cases/${id}?tab=${tabName}`, { timeout: 120000 });
  // a cold harness can take a while to open on a loaded box
  await expect(page.getByTestId('mbal-theme-scope')).toBeVisible({ timeout: 120000 });
}
async function run(page) {
  await page.getByRole('button', { name: 'Run MBAL' }).click();
  await expect(page.getByTestId('mbal-result-title')).toHaveText('Latest result', { timeout: 60000 });
}

function readPdfFile(file) {
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  return { text, flat: text.replace(/\s+/g, ' '), pages: Number(/Pages:\s+(\d+)/.exec(info)[1]) };
}
async function exportPdf(page, name) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('mbal-export-pdf').click();
  const download = await downloadPromise;
  const file = path.join(OUT, name);
  await download.saveAs(file);
  return { file, name: download.suggestedFilename(), ...readPdfFile(file) };
}

test.describe('PL6: three viewports, both themes', () => {
  for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
    for (const dark of [false, true]) {
      test(`${w}x${h} ${dark ? 'dark' : 'light'}: run, plots and report hold together`, async ({ page }) => {
        test.setTimeout(240000);
        const errors = watchErrors(page);
        await page.setViewportSize({ width: w, height: h });
        await openCase(page, DAKE);
        if (dark) {
          await page.getByTestId('theme-toggle').click();
          await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
        }
        await run(page);
        await expect(page.getByTestId('mbal-result-card')).toContainText('OOIP');
        await expect(page.getByTestId('mbal-result-card')).toContainText('MMSTB');
        await page.screenshot({ path: path.join(OUT, `run-${w}-${dark ? 'dark' : 'light'}.png`) });
        expect(await noPageScroll(page)).toBe(true);

        await tab(page, 'Plots').click();
        // the regression plot is in the space the engine regressed in, with its line and its points
        const reg = page.getByTestId('mbal-plot-regression');
        await expect(reg).toBeVisible();
        await expect(page.getByTestId('mbal-plot-notes-regression')).toContainText('intercept');
        for (const id of ['campbell', 'pressure', 'influx', 'drive']) await expect(page.getByTestId(`mbal-plot-${id}`)).toBeVisible();
        // every chart sits on white with the Petrolord mark, whatever the theme
        const bg = await reg.locator('.recharts-wrapper').first().evaluate((el) => {
          let n = el; let c = 'rgba(0, 0, 0, 0)';
          while (n && (c === 'rgba(0, 0, 0, 0)' || c === 'transparent')) { c = getComputedStyle(n).backgroundColor; n = n.parentElement; }
          return c;
        });
        expect(bg).toBe('rgb(255, 255, 255)');
        await page.screenshot({ path: path.join(OUT, `plots-${w}-${dark ? 'dark' : 'light'}.png`) });
        expect(await noPageScroll(page)).toBe(true);

        await tab(page, 'Report').click();
        await expect(page.getByTestId('mbal-export-pdf')).toBeEnabled();
        await expect(page.getByTestId('mbal-report-preview')).toBeVisible();
        await page.screenshot({ path: path.join(OUT, `report-${w}-${dark ? 'dark' : 'light'}.png`) });
        expect(await noPageScroll(page)).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
});

test.describe('the report door', () => {
  test('oil with an aquifer: what is typed on the Report tab is in the file, with every input, the statement, the limits and the figures', async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 1366, height: 768 });
    await openCase(page, DAKE);
    await run(page);
    await tab(page, 'Report').click();
    await page.getByTestId('mbal-id-company').fill('Lordsway Energy');
    await page.getByTestId('mbal-id-licence').fill('OML 143');
    await page.getByTestId('mbal-id-zone').fill('E-2000 sand');
    await page.getByTestId('mbal-id-analyst').fill('A. Okafor');
    await page.getByTestId('mbal-datum-depth').fill('9200');
    await page.getByTestId('mbal-gauge-depth').fill('9050');
    await page.getByTestId('mbal-study-save').click();
    // report details are not inputs of the run: the result stays current
    await expect(page.getByTestId('mbal-export-pdf')).toBeEnabled();
    await expect(page.getByTestId('mbal-stale-run')).toHaveCount(0);

    const pdf = await exportPdf(page, 'report-dake.pdf');
    expect(pdf.name).toMatch(/\.pdf$/);
    expect(pdf.pages).toBeGreaterThanOrEqual(6);
    // identification
    for (const s of ['Lordsway Energy', 'OML 143', 'E-2000 sand', 'A. Okafor', 'Dake Exercise 9.2']) expect(pdf.flat).toContain(s);
    // inputs with units and sources; the datum as stated, with no correction
    expect(pdf.flat).toMatch(/Inputs of the analysis/);
    expect(pdf.flat).toMatch(/Initial reservoir pressure pi\s+2,740\.0\s+psia/);
    expect(pdf.flat).toMatch(/Pressure datum depth\s+9,200\.0\s+ft TVDSS\s+Entered on the Report tab/);
    expect(pdf.flat).toMatch(/No correction to datum is applied/);
    // the regression statement, the aquifer model and the drive indices with their convention
    expect(pdf.flat).toMatch(/Carter-Tracy/);
    expect(pdf.flat).toMatch(/ordinary least squares/i);
    expect(pdf.flat).toMatch(/hydrocarbon voidage/);
    expect(pdf.flat).toMatch(/Rock and connate water \(CDI\)/);
    // the in-place volume by each method, the limits, and the figures
    expect(pdf.flat).toMatch(/Volumetric/);
    expect(pdf.flat).toMatch(/Limits of this analysis/);
    expect(pdf.flat).toMatch(/Tank model: the reservoir is one cell/);
    const captions = [...pdf.flat.matchAll(/Figure \d+[.:]/g)].map((m) => m[0]);
    expect(new Set(captions).size).toBeGreaterThanOrEqual(5);
    // nothing in e-notation from 1,000 up, and no placeholder but n/a
    expect(pdf.flat).not.toMatch(/\d\.\d+e\+\d/);
    expect(pdf.flat).not.toMatch(/undefined|NaN|\[object/);

    // the series file says its units and where it came from
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('mbal-export-csv').click();
    const csv = await downloadPromise;
    const csvFile = path.join(OUT, 'series-dake.csv');
    await csv.saveAs(csvFile);
    const csvText = fs.readFileSync(csvFile, 'utf8');
    expect(csvText.split('\n')[0]).toMatch(/^# /);
    expect(csvText).toMatch(/pressure_psia/);
  });

  test('gas p/z case in metric units: the file prints in the display units and names the basis', async ({ page }) => {
    test.setTimeout(240000);
    await seedUnitView(page, 'material-balance', { pressure: 'kPa', temperature: 'degC', liquid: 'm3', gas: 'm3', length: 'm' });
    await page.setViewportSize({ width: 1366, height: 768 });
    await openCase(page, PLETCHER);
    // 6,411 psia is 44,202 kPa abs
    await expect(page.getByTestId('mbal-case-summary')).toContainText('44,202 kPa abs');
    await run(page);
    await tab(page, 'Report').click();
    await expect(page.getByTestId('mbal-report-units')).toContainText('kPa abs');
    const pdf = await exportPdf(page, 'report-pletcher-metric.pdf');
    expect(pdf.flat).toMatch(/kPa abs/);
    expect(pdf.flat).toMatch(/sm3/);
    expect(pdf.flat).toMatch(/44,202/);
    expect(pdf.flat).toMatch(/p\/z/i);
    expect(pdf.flat).toMatch(/Excluded by the analyst/);
    expect(pdf.flat).not.toMatch(/\bpsia\b.*Initial reservoir pressure/);
  });
});

test.describe('PL2: hostile production files at the Data door', () => {
  const load = async (page, file) => {
    await openCase(page, AHMED, 'data');
    await page.getByTestId('mbal-data-file').setInputFiles(path.join(HOSTILE, file));
    await expect(page.getByTestId('mbal-import-door')).toBeVisible({ timeout: 30000 });
  };
  const saveAndRun = async (page) => {
    await page.getByTestId('mbal-data-save').click();
    await expect(page.getByTestId('mbal-data-count')).toContainText('13 rows', { timeout: 30000 });
    await tab(page, 'Run').click();
    await run(page);
    // the free-intercept Havlena-Odeh answer of Ahmed's Table 11-3, whatever the file looked like
    await expect(page.getByTestId('mbal-result-card')).toContainText('291.31 MMSTB');
  };

  test('the twin in other units (gauge kPa, thousand and million sm3) gives the same oil in place', async ({ page }) => {
    await load(page, '03-other-units-kpag-sm3.csv');
    await expect(page.getByTestId('mbal-import-unit-pressure_psia')).toHaveValue('kPag');
    await expect(page.getByTestId('mbal-import-unit-cum_oil_stb')).toHaveValue('10^3 m3');
    await expect(page.getByTestId('mbal-import-warnings')).toContainText('Gauge pressures were raised by an atmospheric pressure');
    await saveAndRun(page);
  });

  test('semicolons with decimal commas, another column order with extra columns, and tabs with thousands separators: the same answer', async ({ page }) => {
    test.setTimeout(300000);
    for (const [file, says] of [
      ['04-semicolon-decimal-comma.csv', 'split by semicolon; decimal comma'],
      ['02-other-order-extra-columns.csv', 'split by comma'],
      ['10-tab-thousands.txt', 'split by tab'],
    ]) {
      await load(page, file);
      await expect(page.getByTestId('mbal-import-counts')).toContainText('13 rows read');
      await expect(page.getByTestId('mbal-import-counts')).toContainText(says);
      await saveAndRun(page);
    }
  });

  test('a tank history laid out as a vendor tool exports it: the units row is read, gauge pressures are raised, the title line is listed', async ({ page }) => {
    await load(page, '11-vendor-style-tank-history.txt');
    await expect(page.getByTestId('mbal-import-unit-pressure_psia')).toHaveValue('psig');
    await expect(page.getByTestId('mbal-import-unit-cum_oil_stb')).toHaveValue('MMSTB');
    await expect(page.getByTestId('mbal-import-unit-cum_water_inj_stb')).toHaveValue('MMSTB');
    await expect(page.getByTestId('mbal-import-skipped')).toContainText('Line 1: text before the table');
    await expect(page.getByTestId('mbal-import-warnings')).toContainText('Gauge pressures were raised');
    await page.getByTestId('mbal-data-save').click();
    // 3,670.304 psig and 14.696 psi of atmosphere are 3,685 psia
    await expect(page.getByTestId('mbal-data-table')).toContainText('3,685', { timeout: 30000 });
  });

  test('dates nothing settles are asked for and never guessed; the choice is shown and can be changed', async ({ page }) => {
    await load(page, '06-ambiguous-dates.csv');
    await expect(page.getByTestId('mbal-import-questions')).toContainText('could be day first or month first');
    await expect(page.getByTestId('mbal-data-save')).toBeDisabled();
    await page.getByTestId('mbal-import-date-order').selectOption({ index: 1 });
    await expect(page.getByTestId('mbal-import-date-chosen')).toBeVisible();
    await expect(page.getByTestId('mbal-data-save')).toBeEnabled();
    // a file whose dates settle themselves asks nothing
    await load(page, '05-day-first-dates.csv');
    await expect(page.getByTestId('mbal-import-questions')).toHaveCount(0);
    await expect(page.getByTestId('mbal-data-save')).toBeEnabled();
  });

  test('a file with no header is refused until its pressure column is placed; left-out lines are listed with the reason', async ({ page }) => {
    await load(page, '07-no-header.csv');
    await expect(page.getByTestId('mbal-pending-status')).toContainText('no row of column names');
    await expect(page.getByTestId('mbal-data-save')).toBeDisabled();
    await page.getByTestId('mbal-import-col-pressure_psia').selectOption({ label: 'Column 2' });
    // an oil case needs its oil production too, and the door says so
    await expect(page.getByTestId('mbal-import-errors')).toContainText('It needs a cumulative oil column');
    await expect(page.getByTestId('mbal-data-save')).toBeDisabled();
    await page.getByTestId('mbal-import-col-cum_oil_stb').selectOption({ label: 'Column 3' });
    await expect(page.getByTestId('mbal-import-warnings')).toContainText('the file names no unit');
    await expect(page.getByTestId('mbal-data-save')).toBeEnabled();

    await load(page, '09-title-totals-blanks.csv');
    await expect(page.getByTestId('mbal-import-counts')).toContainText('13 rows read; 6 lines of the file left out');
    const skipped = page.getByTestId('mbal-import-skipped');
    for (const reason of ['text before the table', 'comment line', 'repeated header', 'totals row', 'no pressure on this row']) await expect(skipped).toContainText(reason);
  });

  test('twenty years of monthly surveys are read whole; injection columns are told from production and are in the balance (MBAL-U2-002)', async ({ page }) => {
    await load(page, '12-monthly-twenty-years.csv');
    await expect(page.getByTestId('mbal-import-counts')).toContainText('241 rows read');
    await load(page, '08-injection-before-production.csv');
    await expect(page.getByTestId('mbal-import-unit-cum_water_inj_stb')).toHaveValue('MSTB');
    await page.getByTestId('mbal-data-save').click();
    await expect(page.getByTestId('mbal-data-injection')).toBeVisible({ timeout: 30000 });
    await tab(page, 'Run').click();
    await expect(page.getByTestId('mbal-injection-note')).toContainText('Injection is in the balance');
  });
});

test.describe('PL4: only what happened is claimed', () => {
  test('an input edit withdraws the result and the report; a new run restores them', async ({ page }) => {
    await openCase(page, DAKE);
    await run(page);
    await tab(page, 'PVT').click();
    // MBAL-U1-011: a case whose PVT comes with its data rows needs no table, and its PVT tab saves
    await expect(page.getByTestId('mbal-pvt-rows-carry')).toBeVisible();
    await page.getByTestId('mbal-pvt-cf').fill('5e-6');
    await page.getByTestId('mbal-pvt-save').click();
    await expect(page.getByTestId('mbal-pvt-save')).toHaveCount(0, { timeout: 15000 }); // saved: nothing left to save
    await expect(page.getByTestId('mbal-stale-run')).toHaveCount(0); // the PVT tab is not a result tab
    await tab(page, 'Run').click();
    await expect(page.getByTestId('mbal-result-title')).toHaveText('Earlier result, inputs changed since', { timeout: 15000 });
    await expect(page.getByTestId('mbal-stale-run')).toContainText('earlier run');
    await tab(page, 'Report').click();
    await expect(page.getByTestId('mbal-export-pdf')).toBeDisabled();
    await expect(page.getByTestId('mbal-report-stale')).toBeVisible();
    await tab(page, 'Run').click();
    await run(page);
    await tab(page, 'Report').click();
    await expect(page.getByTestId('mbal-export-pdf')).toBeEnabled();
  });
});

test.describe('PL3 and PL11: units at every door, and fields a person can type in', () => {
  test('the switch converts the rail and the doors; a field takes a number key by key and stays cleared', async ({ page }) => {
    await openCase(page, DAKE, 'pvt');
    await expect(page.getByTestId('mbal-case-summary')).toContainText('2,740 psia');
    await page.getByTestId('mbal-units').getByRole('button', { name: 'Metric' }).click();
    // 2,740 psia is 18,892 kPa abs; 200 degF is 93 degC
    await expect(page.getByTestId('mbal-case-summary')).toContainText('18,892 kPa abs');
    await expect(page.getByTestId('mbal-case-summary')).toContainText('93 degC');
    await expect(page.getByTestId('mbal-units-line')).toContainText('sm3');
    // 4e-6 1/psi is 5.801510e-7 1/kPa
    await expect(page.getByTestId('mbal-pvt-cf')).toHaveValue(/^5\.80151e-7$/);

    const api = page.getByTestId('mbal-pvt-api');
    await api.click();
    await api.fill('');
    await expect(api).toHaveValue('');
    for (const [key, shown] of [['2', '2'], ['.', '2.'], ['5', '2.5']]) {
      await api.press(key);
      await expect(api).toHaveValue(shown);
    }
    await api.fill('');
    await api.blur();
    await expect(api).toHaveValue(''); // a cleared field is not snapped back to a number

    await page.getByTestId('mbal-units').getByRole('button', { name: 'Oilfield' }).click();
    await expect(page.getByTestId('mbal-case-summary')).toContainText('2,740 psia');
  });
});

test.describe('PL9: PVT from Fluid Systems Studio through the pvt-1 contract', () => {
  test('a covering table is taken with its provenance; a table that stops below the case and a project with no block are refused with the reason', async ({ page }) => {
    await openCase(page, DAKE, 'pvt');
    const card = page.getByTestId('mbal-pvt-intake');
    await expect(card).toBeVisible();
    await page.getByTestId('mbal-pvt-intake-project').selectOption('fluid-legacy-no-block');
    await page.getByTestId('mbal-pvt-intake-take').click();
    await expect(page.getByTestId('mbal-pvt-intake-message')).toContainText('saved before it carried its PVT block');

    await page.getByTestId('mbal-pvt-intake-project').selectOption('fluid-wedge');
    await page.getByTestId('mbal-pvt-intake-take').click();
    await expect(page.getByText('Source as the report will state it:')).toContainText('Table from Fluid Systems Studio, project "Wedge reservoir oil PVT"');
    await expect(page.getByText('Source as the report will state it:')).toContainText('Standing, scaled to the entered bubble point (Rs)');

    // the Ahmed case starts at 3,685 psia and that fluid's table ends at 3,500
    await openCase(page, AHMED, 'pvt');
    await page.getByTestId('mbal-pvt-intake-project').selectOption('fluid-ahmed-11-3');
    await page.getByTestId('mbal-pvt-intake-take').click();
    await expect(page.getByTestId('mbal-pvt-intake-message')).toContainText('runs from 15 to 3,500 psia');
    await expect(page.getByTestId('mbal-pvt-intake-message')).toContainText('The table is not taken');
  });
});

test.describe('PL5: a case saved by the release before this one', () => {
  test('opens, names its result as an earlier run, and is whole after one new run', async ({ page }) => {
    const saved = JSON.parse(fs.readFileSync(SAVED, 'utf8'));
    const { about: _about, ...rows } = saved;
    await page.addInitScript((extra) => {
      try { window.sessionStorage.setItem('mbal.harness.extra', JSON.stringify(extra)); } catch { /* storage blocked */ }
    }, rows);
    const errors = watchErrors(page);
    await openCase(page, saved.rb_cases[0].id);
    await expect(page.getByTestId('mbal-case-summary')).toContainText('Saved in September');
    await expect(page.getByTestId('mbal-result-card')).toContainText('291.31 MMSTB');
    await expect(page.getByTestId('mbal-result-title')).toHaveText('Earlier result, inputs changed since');
    await expect(page.getByTestId('mbal-stale-run')).toContainText('before the studio kept a record');
    await tab(page, 'Plots').click();
    await expect(page.getByTestId('mbal-plot-regression')).toBeVisible();
    await tab(page, 'Report').click();
    await expect(page.getByTestId('mbal-export-pdf')).toBeDisabled();
    await tab(page, 'Run').click();
    await run(page);
    await expect(page.getByTestId('mbal-result-card')).toContainText('291.31 MMSTB');
    await tab(page, 'Report').click();
    const pdf = await exportPdf(page, 'report-saved-case.pdf');
    expect(pdf.flat).toContain('Saved in September');
    expect(errors).toEqual([]);
  });
});

test.describe('record sharing, for viewing', () => {
  test('a case a colleague shared opens read-only with her result; a run is refused; Save a copy makes my own', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openCase(page, SHARED);
    await expect(page.getByTestId('mbal-read-only')).toContainText('Shared by Ada Colleague for viewing');
    await expect(page.getByTestId('shared-by')).toContainText('Shared by Ada Colleague');
    await expect(page.getByTestId('mbal-edit-case')).toHaveCount(0);
    await expect(page.getByTestId('mbal-result-card')).toContainText('291.31 MMSTB');
    await page.getByRole('button', { name: 'Run MBAL' }).click();
    await expect(page.getByText('Could not create run config')).toBeVisible({ timeout: 15000 });
    // her report is there to read
    await tab(page, 'Report').click();
    await expect(page.getByTestId('mbal-export-pdf')).toBeEnabled();

    await page.getByTestId('save-copy').click();
    await expect(page.getByTestId('mbal-case-summary')).toContainText('North flank oil (shared by Ada) (copy)', { timeout: 30000 });
    await expect(page.getByTestId('mbal-read-only')).toHaveCount(0);
    await expect(page.getByTestId('share-switch')).toBeVisible();
    await tab(page, 'Run').click();
    await run(page); // my copy, my run
    await expect(page.getByTestId('mbal-result-card')).toContainText('291.31 MMSTB');
  });

  test('the owner shares a case and takes it back', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openCase(page, AHMED);
    await page.getByTestId('share-switch').click();
    // MBAL-U2-001: colleagues can now be let edit, one person at a time
    await expect(page.getByTestId('share-access')).toHaveValue('view');
    await page.getByTestId('share-access').selectOption('edit');
    // the owner is the one editing it now, so the tabs stay writable
    await expect(page.getByTestId('done-editing')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('mbal-read-only')).toHaveCount(0);
    await page.getByTestId('done-editing').click();
    await expect(page.getByTestId('mbal-read-only')).toContainText('Start editing first', { timeout: 15000 });
    await page.getByTestId('start-editing').click();
    await expect(page.getByTestId('mbal-read-only')).toHaveCount(0, { timeout: 15000 });
    await page.getByTestId('history-button').click();
    await expect(page.getByText('Started editing').first()).toBeVisible();
    await page.getByTestId('share-switch').click();
    await expect(page.getByTestId('share-access')).toHaveCount(0);
  });
});

test.describe('MBAL U2: Step 2 Batch A and B on the harness', () => {
  test('excluded timesteps: a point left out from the data table with a reason, the run uses it, and the report lists it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCase(page, AHMED, 'data');
    await page.getByTestId('mbal-exclusion-exclude-2').click();
    await page.getByTestId('mbal-exclusion-input-2').fill('Survey not built up');
    await page.getByTestId('mbal-exclusion-confirm-2').click();
    await expect(page.getByTestId('mbal-exclusion-reason-2')).toContainText('Survey not built up');
    await tab(page, 'Run').click();
    await run(page);
    await expect(page.getByTestId('mbal-result-card')).toContainText('11 points in the fit');
    // restore from the regression plot
    await tab(page, 'Plots').click();
    await expect(page.getByTestId('mbal-plot-regression')).toBeVisible({ timeout: 30000 });
    await tab(page, 'Report').click();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByTestId('mbal-export-pdf').click()]);
    const file = path.join(OUT, 'u2-exclusions.pdf');
    await download.saveAs(file);
    const pdf = readPdfFile(file);
    expect(pdf.flat).toMatch(/Timesteps excluded by the analyst/);
    expect(pdf.flat).toMatch(/Survey not built up/);
    expect(pdf.flat).toMatch(/Summary Item Value/);
  });

  test('the sender: Cross-check in ReservoirCalc Pro names the case by id; a stale run is not sent', async ({ page }) => {
    await openCase(page, AHMED);
    await run(page);
    await expect(page.getByTestId('mbal-send-rcp')).toBeEnabled();
    await expect(page.getByTestId('mbal-send')).toContainText('contract mbal-1');
    // EOR-U2-002: Send to EOR Screening names the same case by id
    await page.getByTestId('mbal-send-eor').click();
    await expect(page).toHaveURL(/\/eor-screening\?mbalCase=|\/dev\/studio\/eor\?mbalCase=/);
  });

  test('the volumetric estimate is taken from a saved ReservoirCalc Pro project, and the source is printed', async ({ page }) => {
    await openCase(page, AHMED);
    await page.getByTestId('mbal-volumetric-from-rcp').click();
    await page.getByTestId('mbal-volumetric-project').selectOption({ label: 'Main sand volumetrics' });
    await page.getByTestId('mbal-volumetric-take').click();
    await expect(page.getByTestId('mbal-volumetric-value')).toContainText('226.27 MMSTB', { timeout: 15000 });
    await expect(page.getByTestId('mbal-volumetric-source')).toContainText('ReservoirCalc Pro project "Main sand volumetrics"');
  });

  test('pressures are taken from a saved VRR project onto the dated rows, with what changes shown first', async ({ page }) => {
    await openCase(page, AHMED, 'data');
    await page.getByTestId('mbal-vrr-open').click();
    await page.getByTestId('mbal-vrr-project').selectOption({ label: 'East pattern surveillance' });
    await expect(page.getByTestId('mbal-vrr-plan')).toContainText('Timestep 5, 2015-01-01');
    await expect(page.getByTestId('mbal-vrr-plan')).toContainText('Surveys on no dated row of this case: 2030-01');
    await page.getByTestId('mbal-vrr-take').click();
    await expect(page.getByTestId('mbal-vrr-taken')).toContainText('Pressures of timesteps 5, 10', { timeout: 30000 });
  });
});
