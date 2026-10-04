// SCAL Studio, Reservoir upgrade round app 5 (SCAL-U1;
// docs/upgrade/SCALStudio-UPGRADE.md). On the /dev/studio harness, signed
// out, so the unit profile is the built-in oilfield preset.
//
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: every tab, charts
//        on white with the Petrolord mark, the Report tab, no page errors and
//        no sideways page scroll.
//   RL   the report door: identification and a source typed on the Report
//        tab, the PDF downloaded and read back with pdftotext, pdfinfo and
//        pdfimages (header, inputs with sources, pedigree, fits, limits,
//        figures, the kr-1 block).
//   PL2  hostile lab tables: the unit from the header or chosen at the door,
//        a read-back, the same Pc as the psi twin.
//   PL9  the chain: a saved SCAL project sent to Waterflood Design Studio;
//        Waterflood keeps the kr-1 source on its intake card; a fresh visit
//        of the same address reads the block again by project id.
//   PL3  the unit switch converts the cards; a field takes "2621." key by
//        key in SI.
//   PL5  projects as earlier releases saved them open and report n/a.
//
// Evidence goes under test-results/ only.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUT = 'test-results/scal-upgrade';
fs.mkdirSync(OUT, { recursive: true });
const HOSTILE = path.join('e2e', 'fixtures', 'scal', 'hostile');

const isNarrow = (page) => (page.viewportSize()?.width ?? 1280) < 768;
async function openRail(page) {
  if (isNarrow(page)) await page.getByRole('button', { name: 'Show left panel' }).click();
}
async function closeRail(page) {
  if (isNarrow(page)) await page.getByRole('button', { name: 'Close panel' }).first().click();
}
const noPageScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const tab = (page, name) => page.getByRole('tab', { name, exact: true }).first();

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openApp(page, query = '') {
  await page.goto(`/dev/studio/scal${query}`, { timeout: 120000 });
  await expect(page.getByText('Mobile saturation span').first()).toBeVisible({ timeout: 120000 });
}

function readPdfFile(file) {
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  const images = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }).split('\n').slice(2).filter((l) => l.trim());
  return { text, flat: text.replace(/\s+/g, ' '), pages: Number(/Pages:\s+(\d+)/.exec(info)[1]), images };
}

async function exportPdf(page, name) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('scal-export-pdf').click();
  const download = await downloadPromise;
  const file = path.join(OUT, name);
  await download.saveAs(file);
  return { file, name: download.suggestedFilename(), ...readPdfFile(file) };
}

async function createProject(page, name) {
  await openRail(page);
  await page.getByRole('button', { name: 'Create new project' }).first().click();
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: 'Create project' }).click();
  // the picker shows the new project (the toast can come and go under load)
  await expect(page.getByRole('combobox', { name: 'Project' })).toContainText(name, { timeout: 60000 });
  await closeRail(page);
}

// the demo pair, sample A's fit applied, the J averaged from both samples
async function fitAndAverage(page) {
  await tab(page, 'Lab Data').click();
  await openRail(page);
  await page.getByRole('button', { name: 'Demo pair' }).click();
  await page.getByText('Demo core A (synthetic)').first().click();
  await closeRail(page);
  await page.getByRole('button', { name: 'Use fit on the Curves tab' }).click();
  await tab(page, 'Capillary').click();
  await openRail(page);
  await page.getByRole('tab', { name: 'From samples' }).click();
  // the sample boxes only: "Fit Swirr" (SCAL-U2-006) stays as the user left it
  for (const cb of await page.locator('input[type=checkbox]:not([data-testid="scal-swirr-fit"])').all()) await cb.check();
  await closeRail(page);
}

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${scheme}: every tab, charts on white, the report door`, async ({ page }) => {
      test.setTimeout(240000);
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page);
      if (scheme === 'dark') {
        await page.getByTestId('theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
      }
      for (const name of ['Curves', 'Lab Data', 'Capillary', 'Height & Saturation', 'Report', 'Export']) {
        await tab(page, name).click();
        await page.waitForTimeout(200);
        expect(await noPageScroll(page), `${name}: sideways page scroll`).toBe(true);
        const frames = page.locator('[data-canvas="chart"]');
        for (let i = 0; i < await frames.count(); i += 1) {
          const f = frames.nth(i);
          expect(await f.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
          await expect(f.locator('img[alt="Petrolord"]')).toBeAttached();
        }
        expect(await page.locator('body').innerText()).not.toMatch(/—/);
        await page.screenshot({ path: path.join(OUT, `pl6-${w}-${scheme}-${name.replace(/\W+/g, '')}.png`) });
      }
      await tab(page, 'Report').click();
      await expect(page.getByTestId('scal-report-tab')).toBeVisible();
      await expect(page.getByTestId('scal-report-inputs')).toContainText('Assumed: the starting value of the app, not field data');
      await expect(page.getByTestId('scal-report-limits')).toContainText('No hysteresis');
      await expect(page.getByTestId('scal-report-contract')).toContainText('kr-1');
      expect(await noPageScroll(page)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test('RL: the exported PDF carries what a reviewer signs against, read back', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await fitAndAverage(page);
  await tab(page, 'Height & Saturation').click();
  await page.getByTestId('height-fwl_tvdss').fill('8600');
  await tab(page, 'Report').click();
  await page.locator('#scal-id-company').fill('Lordsway Energy');
  await page.locator('#scal-id-field').fill('Ekene');
  await page.locator('#scal-id-well').fill('Ekene-7');
  await page.locator('#scal-id-laboratory').fill('Core Lab Lagos');
  await page.locator('#scal-id-labReport').fill('SCAL-2026-0117');
  await page.locator('#scal-id-analyst').fill('A. Analyst');
  const k = page.getByTestId('scal-source-k_md');
  await k.getByLabel('Reservoir permeability k source').click();
  await page.getByRole('option', { name: 'Measured (lab)' }).click();
  await k.getByLabel('Reservoir permeability k note').fill('Core-log permeability, E-2000 average');
  const pdf = await exportPdf(page, 'scal-report.pdf');
  expect(pdf.name).toMatch(/^SCAL_Report_/);
  expect(pdf.pages).toBeGreaterThanOrEqual(10);
  for (const s of ['Special Core Analysis Report', 'Company Lordsway Energy', 'Field Ekene', 'Well Ekene-7', 'Laboratory Core Lab Lagos', 'Lab report number SCAL-2026-0117', 'Analyst A. Analyst', 'Display units Oilfield']) {
    expect(pdf.flat).toContain(s);
  }
  expect(pdf.flat).toMatch(/Reservoir permeability k 150 md Measured \(lab\)\. Core-log permeability, E-2000 average/);
  expect(pdf.flat).toMatch(/Fitted to the lab table of sample "Demo core A \(synthetic\)"/);
  expect(pdf.flat).toMatch(/Sample pedigree/);
  expect(pdf.flat).toMatch(/Corey fits to the lab kr tables/);
  expect(pdf.flat).toMatch(/Limits of this analysis/);
  expect(pdf.flat).toMatch(/kr-1 block handed to other apps/);
  // demo core A carries a gas-oil table since SCAL-U2-004: its lab figure comes before the J figures
  expect(pdf.flat).toMatch(/Figure 9\. Water saturation against height above the free water level/);
  expect(pdf.flat).toMatch(/FWL, 8600 ft TVDSS/);
  expect(pdf.flat).not.toMatch(/—/);
  // the Petrolord mark is embedded in the figures
  expect(pdf.images.length).toBeGreaterThanOrEqual(8);
  expect(errors).toEqual([]);
});

test('PL2: hostile lab tables read with units at the door, and say what they read', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await tab(page, 'Lab Data').click();
  await page.getByRole('button', { name: 'Add sample' }).click();
  // a kPa file whose header says so: read in kPa whatever the door says
  await page.locator('input[type="file"]').nth(1).setInputFiles(path.join(HOSTILE, 'pc-kpa-header.csv'));
  await expect(page.getByTestId('readback-pcImport')).toContainText('Pc read in kPa (from the header) and stored in psi');
  // a file with no unit and no header, kPa chosen at the door
  await page.getByTestId('import-pc-unit').click();
  await page.getByRole('option', { name: 'kPa' }).click();
  await page.locator('input[type="file"]').nth(1).setInputFiles(path.join(HOSTILE, 'pc-no-unit-no-header.txt'));
  await expect(page.getByTestId('readback-pcImport')).toContainText('Pc read in kPa (chosen at the door)');
  // a vendor export: title lines, a comment, an Average row, percent Sw
  await page.locator('input[type="file"]').nth(0).setInputFiles(path.join(HOSTILE, 'kr-vendor-export.csv'));
  const rb = page.getByTestId('readback-krImport');
  await expect(rb).toContainText('7 rows read');
  await expect(rb).toContainText('Sw read as a percent (from the header)');
  await expect(rb).toContainText('totals row');
  expect(errors).toEqual([]);
});

test('PL9: the kr-1 handoff into Waterflood, by router state and by project id', async ({ page }) => {
  test.setTimeout(480000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await createProject(page, 'Ekene E-2000 SCAL');
  await fitAndAverage(page);
  await tab(page, 'Export').click();
  await page.getByTestId('scal-send-waterflood').click();
  await expect(page).toHaveURL(/\/dev\/studio\/waterflood\?scalProject=/, { timeout: 120000 });
  const card = page.getByTestId('kr-intake-card');
  await expect(card).toBeVisible({ timeout: 120000 });
  await expect(page.getByTestId('kr-intake-source')).toContainText('SCAL Studio, project "Ekene E-2000 SCAL"');
  await expect(page.getByTestId('kr-intake-origin')).toContainText('Corey fitted to sample "Demo core A (synthetic)"');
  await expect(page.getByTestId('kr-intake-status')).toHaveText('As received');
  const url = page.url();
  // a fresh visit of the same address: a new navigation carries no router
  // state, so the block is read again by id (the harness keeps saved rows in
  // this tab's sessionStorage, so the visit stays in the tab)
  await page.goto('/dev/studio/scal', { timeout: 120000 });
  await page.goto(url, { timeout: 120000 });
  expect(await page.evaluate(() => window.history.state?.usr?.scalKr ?? null)).toBeNull();
  await expect(page.getByTestId('kr-intake-origin')).toContainText('Corey fitted to sample "Demo core A (synthetic)"', { timeout: 120000 });
  await page.screenshot({ path: path.join(OUT, 'pl9-waterflood-intake.png') });
  expect(errors).toEqual([]);
});

test('PL3 and PL11: SI converts the cards; a field takes "2621." key by key', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByTestId('scal-unit-system').click();
  await page.getByRole('option', { name: 'SI' }).click();
  await tab(page, 'Height & Saturation').click();
  // T1 oracle 31.8 ft at Sw 0.5 is 9.7 m
  await expect(page.getByText(/^9\.7\s*m$/)).toBeVisible();
  const fwl = page.getByTestId('height-fwl_tvdss');
  await fwl.click();
  await fwl.pressSequentially('2621.');
  await expect(fwl).toHaveValue('2621.');
  await fwl.pressSequentially('28');
  await fwl.blur();
  await expect(fwl).toHaveValue('2621.28');
  await expect(page.getByText(/FWL at 2621 m TVDSS/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('PL5: projects as earlier releases saved them open and report n/a', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, '?saved=1');
  await openRail(page);
  await page.getByRole('combobox', { name: /project/i }).first().click();
  await page.getByRole('option', { name: 'Obodo D-3 SCAL (saved 2026-09)' }).click();
  await closeRail(page);
  await tab(page, 'Report').click();
  await expect(page.getByTestId('scal-report-header')).toContainText('Obodo D-3 SCAL (saved 2026-09)');
  await expect(page.getByTestId('scal-report-header')).toContainText('n/a');
  await expect(page.getByTestId('scal-report-headline')).toContainText('8,620.0');
  const pdf = await exportPdf(page, 'scal-report-schema1.pdf');
  expect(pdf.flat).toMatch(/Field n\/a/);
  expect(errors).toEqual([]);
});


// ---------------------------------------------------------------------------
// SCAL U2 (Step 2 build, 2026-10-03)
// ---------------------------------------------------------------------------

const FIXTURES = path.join('e2e', 'fixtures', 'scal');

async function download(page, testId, name) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId(testId).click();
  const d = await downloadPromise;
  const file = path.join(OUT, name);
  await d.saveAs(file);
  return { name: d.suggestedFilename(), text: fs.readFileSync(file, 'utf8') };
}

test('U2-004, U2-011: the gas-oil door, an xlsx at the kr door, and the gas-oil fit applied', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await tab(page, 'Lab Data').click();
  await page.getByRole('button', { name: 'Add sample' }).click();
  // an Excel workbook: the cover sheet is passed over, the kr sheet read and named
  await page.locator('input[type="file"]').nth(0).setInputFiles(path.join(FIXTURES, 'kr-workbook.xlsx'));
  await expect(page.getByTestId('readback-krImport')).toContainText('Sheet "USS kr" of a workbook of 2 sheets. 7 rows read');
  // the gas-oil door, Sg in percent
  await page.getByTestId('import-go-file').setInputFiles(path.join(FIXTURES, 'go-table.csv'));
  await expect(page.getByTestId('readback-goImport')).toContainText('Sg read as a percent (from the header)');
  const card = page.getByTestId('scal-go-fit');
  await expect(card).toContainText('ng (fit)');
  await expect(card).toContainText('the working gas-oil set');
  await page.getByTestId('scal-apply-go-fit').click();
  await tab(page, 'Curves').click();
  await expect(page.getByTestId('scal-go-origin')).toHaveAttribute('data-origin', 'fitted');
  await expect(page.getByTestId('scal-go-origin')).toContainText('Fitted to the lab table of sample');
  expect(errors).toEqual([]);
});

test('U2-001, U2-002: SWOF and SGOF with Pc, and the gas-oil CSV, downloaded and read', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await tab(page, 'Export').click();
  const inc = await download(page, 'scal-deck-export', 'scal.inc');
  expect(inc.name).toMatch(/^scal-swof-sgof-.*\.inc$/);
  expect(inc.text).toMatch(/^-- Saturation functions exported by Petrolord SCAL Studio \(SWOF and SGOF, FIELD units\)\./);
  expect(inc.text).toMatch(/^SWOF$/m);
  expect(inc.text).toMatch(/^SGOF$/m);
  expect(inc.text).toMatch(/Pcow = Po - Pw/);
  // the first SWOF row is Swc with kro at its end point and a positive Pc
  const firstSwof = inc.text.split('\n')[inc.text.split('\n').indexOf('SWOF') + 1].trim().split(/\s+/).map(Number);
  expect(firstSwof[0]).toBe(0.2);
  expect(firstSwof[2]).toBe(0.9);
  expect(firstSwof[3]).toBeGreaterThan(0);
  expect(/^[\x09\x0a\x20-\x7e]*$/.test(inc.text)).toBe(true);
  // METRIC: Pc in bar
  await page.getByTestId('scal-deck-units').click();
  await page.getByRole('option', { name: /METRIC/ }).click();
  const metric = await download(page, 'scal-deck-export', 'scal-metric.inc');
  expect(metric.text).toMatch(/Pc in bar \(METRIC deck units\)/);
  // two connate waters: refused with the reason
  await tab(page, 'Curves').click();
  await openRail(page);
  await page.getByRole('tab', { name: 'Gas-oil' }).click();
  await page.getByTestId('corey-go-Swc').fill('0.25');
  await closeRail(page);
  await tab(page, 'Export').click();
  await expect(page.getByTestId('scal-deck-refused')).toContainText('one connate water');
  // the gas-oil CSV
  const go = await download(page, 'scal-csv-go', 'go.csv');
  expect(go.text.split('\n').find((l) => !l.startsWith('#'))).toBe('Sg,krg,krog');
  expect(go.text).toMatch(/^# Gas-oil set: Corey, parameters entered by the user/m);
  expect(errors).toEqual([]);
});

test('U2-006, U2-012: Swirr fitted on the demo pair; the PDF opens with the summary page', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await fitAndAverage(page);
  await openRail(page);
  await page.getByTestId('scal-swirr-fit').check();
  await expect(page.getByTestId('scal-swirr-fitted')).toContainText(/Fitted Swirr 0\.12\d \(95% CI/);
  await closeRail(page);
  await tab(page, 'Report').click();
  await expect(page.getByTestId('scal-report-summary')).toContainText('Lab data');
  const pdf = await exportPdf(page, 'scal-report-u2.pdf');
  const page1 = readPdfFile(pdf.file).text.split('\f')[0].replace(/\s+/g, ' ');
  expect(page1).toMatch(/Summary Item Value/);
  expect(page1).toMatch(/Swirr 0\.12\d* \(fitted with a and b\)/);
  expect(page1).not.toMatch(/Headline results/);
  expect(pdf.flat).toMatch(/Corey fits to the lab gas-oil tables/);
  expect(pdf.flat).toMatch(/Fitted with a and b to the pooled lab J of the included samples/);
  expect(errors).toEqual([]);
});

test('U2-005: water and oil gravities from a Fluid Systems Studio project saved in the same tab', async ({ page }) => {
  test.setTimeout(360000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dev/fluid-systems-studio', { timeout: 120000 });
  await expect(page.getByText('Oil FVF @ Pb')).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: 'Create new project' }).click();
  await page.getByLabel('Project name').fill('Ekene SCAL fluid');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText('Project "Ekene SCAL fluid" created')).toBeVisible({ timeout: 60000 });
  // let the harness copy the saved project into the tab's session store
  await page.waitForTimeout(1000);
  await openApp(page);
  await tab(page, 'Height & Saturation').click();
  const pick = page.getByTestId('scal-fluid-project');
  await expect(pick).toContainText('Ekene SCAL fluid', { timeout: 60000 });
  await pick.selectOption({ index: 1 });
  await page.getByTestId('scal-fluid-take').click();
  await expect(page.getByTestId('pvt-intake-status')).toHaveText('As received', { timeout: 60000 });
  await expect(page.getByTestId('pvt-intake-source')).toContainText('Ekene SCAL fluid');
  const gh = Number(await page.getByTestId('height-gammaHc').inputValue());
  expect(gh).toBeGreaterThan(0.5);
  expect(gh).toBeLessThan(0.95);
  await page.getByTestId('height-gammaHc').fill('0.7');
  await page.getByTestId('height-gammaHc').blur();
  await expect(page.getByTestId('pvt-intake-status')).toHaveText('Edited after intake');
  expect(errors).toEqual([]);
});
