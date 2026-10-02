// Fluid Systems Studio, Reservoir upgrade round app 1 (FLUID-U1;
// docs/upgrade/FluidSystemsStudio-UPGRADE.md). On the /dev harness, signed
// out, so the unit profile is the built-in oilfield preset.
//
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: KPI cards, the
//        five property plots on white with the Petrolord mark, the Report
//        tab, no page errors and no sideways page scroll.
//   RL   the report door: identification and sources typed on the Report
//        tab, the PDF downloaded and read back with pdftotext, pdfinfo and
//        pdfimages (header, inputs with sources, methods, limits, figures).
//   PL3  the unit switch converts every door and card; a field takes
//        "93.5" key by key and a cleared field stays cleared (PL11); the
//        CSV says its units and where it came from.
//   PL2  hostile P-T profile files: units from the header or chosen at the
//        door, a read-back, and the same answer as the psia and degF twin.
//   PL5  projects as earlier releases saved them open and report.
//   PL9  the chain: a saved Fluid project is sent to Well Test Analysis
//        Studio; the Well Test report names the upstream correlation; on a
//        fresh visit of the same address the block is read again from the
//        saved project by id.
//   PL4  a tuned compositional fluid says so only while the fit describes
//        the inputs.
//
// Evidence goes under test-results/ only.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { Buffer } from 'buffer';

const OUT = 'test-results/fluid-systems-upgrade';
fs.mkdirSync(OUT, { recursive: true });
const HOSTILE = path.join('e2e', 'fixtures', 'fluid-systems', 'hostile');
const hostile = (name) => fs.readFileSync(path.join(HOSTILE, name), 'utf8');

const isNarrow = (page) => (page.viewportSize()?.width ?? 1280) < 768;
async function openRail(page) {
  if (isNarrow(page)) await page.getByRole('button', { name: 'Show left panel' }).click();
}
async function closeRail(page) {
  if (isNarrow(page)) await page.getByRole('button', { name: 'Close panel' }).first().click();
}
const noPageScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openApp(page, query = '') {
  await page.goto(`/dev/fluid-systems-studio${query}`, { timeout: 120000 });
  // a cold harness can take a while to open on a loaded box
  await expect(page.getByText('Oil FVF @ Pb')).toBeVisible({ timeout: 120000 });
}

const kpi = (page, title) => page.getByText(title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
const resultTab = (page, name) => page.getByRole('tab', { name }).last();

function readPdfFile(file) {
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  const images = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }).split('\n').slice(2).filter((l) => l.trim());
  return { text, flat: text.replace(/\s+/g, ' '), pages: Number(/Pages:\s+(\d+)/.exec(info)[1]), images };
}

async function exportPdf(page, name) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('fluid-export-pdf').click();
  const download = await downloadPromise;
  const file = path.join(OUT, name);
  await download.saveAs(file);
  return { file, name: download.suggestedFilename(), ...readPdfFile(file) };
}

async function createProject(page, name) {
  await openRail(page);
  await page.getByRole('button', { name: 'Create new project' }).click();
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText(`Project "${name}" created`)).toBeVisible();
  await closeRail(page);
}

// A gauge file for Well Test: importing it leaves the fluid inputs alone
// (the sample button would reset them, and with them the intake).
async function importGauge(page) {
  const rows = ['Elapsed (hr),BHP (psia)'];
  for (let i = 0; i < 60; i += 1) {
    const hr = 0.01 * 1.18 ** i;
    rows.push(`${hr.toFixed(5)},${(4530 + 60 * Math.log10(1 + 400 * hr)).toFixed(2)}`);
  }
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'gauge.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
  await expect(page.getByTestId('wts-import-mapping')).toContainText('60 readings loaded');
}

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${scheme}: cards, plots on white, the report door`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page);
      if (scheme === 'dark') {
        await page.getByTestId('theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
      }
      // each KPI value sits inside its card, with its unit
      for (const [title, value, unit] of [['Bubble Point', '2998', 'psia'], ['Oil FVF @ Pb', '1.372', 'RB/STB'], ['Solution GOR', '650', 'scf/STB']]) {
        const card = kpi(page, title);
        await expect(card).toContainText(unit);
        const cb = await card.boundingBox();
        const vb = await card.getByText(value, { exact: true }).boundingBox();
        expect(vb.x + vb.width).toBeLessThanOrEqual(cb.x + cb.width + 0.5);
      }
      // five property plots, each drawn, on white, with the Petrolord mark
      const charts = page.locator('[data-testid^="pvt-chart-"]');
      await expect(charts).toHaveCount(5);
      for (const id of ['bo', 'rs', 'muo', 'z', 'bg']) {
        const chart = page.getByTestId(`pvt-chart-${id}`);
        await chart.scrollIntoViewIfNeeded();
        await expect(chart).toHaveAttribute('data-points', '41');
        await expect.poll(() => chart.locator('.recharts-line-curve').count()).toBeGreaterThan(0);
        const d = await chart.locator('.recharts-line-curve').first().getAttribute('d');
        expect(d.length).toBeGreaterThan(200);
        const frame = chart.locator('[data-canvas="chart"]');
        expect(await frame.evaluate((f) => getComputedStyle(f).backgroundColor)).toBe('rgb(255, 255, 255)');
        await expect(frame.locator('img[alt="Petrolord"]')).toBeAttached();
        // the bubble point is marked and labelled
        await expect(chart.getByText('Pb 2,998 psia')).toBeAttached();
      }
      expect(await noPageScroll(page)).toBe(true);

      await resultTab(page, 'Report').click();
      const tab = page.getByTestId('fluid-report-tab');
      await expect(tab).toBeVisible();
      await expect(page.getByTestId('fluid-export-pdf')).toBeVisible();
      await expect(page.getByTestId('fluid-report-header')).toContainText('Unsaved workspace');
      await expect(page.getByTestId('fluid-report-header')).toContainText('n/a');
      await expect(page.getByTestId('fluid-report-inputs')).toContainText('Assumed. Sample fluid value, not field data');
      await expect(page.getByTestId('fluid-report-methods')).toContainText('Standing');
      await expect(page.getByTestId('fluid-report-limits')).toContainText('Published range');
      await expect(page.getByTestId('fluid-report-figures')).toContainText('Plotted');
      await expect(page.getByTestId('fluid-report-contract')).toContainText('pvt-1');
      // wide tables scroll inside their card, never the page
      expect(await noPageScroll(page)).toBe(true);
      await page.screenshot({ path: path.join(OUT, `pl6-${w}-${scheme}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
}

test('RL: the exported PDF carries what a reviewer signs against, read back', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page);
  await resultTab(page, 'Report').click();
  await page.locator('#id-company').fill('Lordsway Energy');
  await page.locator('#id-field').fill('Ekene');
  await page.locator('#id-licence').fill('OML 143');
  await page.locator('#id-reservoir').fill('E-2000 sand');
  await page.locator('#id-sampleName').fill('BHS-2 oil');
  await page.locator('#id-labReport').fill('RFL-2026-0412');
  await page.locator('#id-analyst').fill('A. Analyst');
  // state one source the way a reviewer would ask
  const api = page.getByTestId('source-api');
  await api.getByLabel('API gravity source').click();
  await page.getByRole('option', { name: 'Measured (lab)' }).click();
  await api.getByLabel('API gravity note').fill('Stock-tank oil, report RFL-2026-0412');
  await expect(page.getByTestId('fluid-report-inputs')).toContainText('Measured (lab). Stock-tank oil, report RFL-2026-0412');

  const pdf = await exportPdf(page, 'report-black-oil.pdf');
  expect(pdf.name).toBe('Fluid_Report_BHS-2_oil.pdf');
  expect(pdf.pages).toBeGreaterThanOrEqual(8);
  // RL4 identification
  for (const s of ['Company Lordsway Energy', 'Field Ekene', 'Licence or block OML 143', 'Reservoir or zone E-2000 sand', 'Sample or fluid BHS-2 oil', 'Lab report RFL-2026-0412', 'Analyst A. Analyst', 'Well n/a']) expect(pdf.flat).toContain(s);
  expect(pdf.flat).toMatch(/Display units Oilfield \(psia, degF\); Bg in RB\/Mscf/);
  expect(pdf.flat).toMatch(/Build Petrolord Suite/);
  // RL1 inputs with unit and source
  expect(pdf.flat).toMatch(/API gravity of the stock-tank oil 32\.0 degAPI Measured \(lab\)\. Stock-tank oil, report RFL-2026-0412/);
  expect(pdf.flat).toMatch(/Solution GOR at the bubble point Rsb 650\.0 scf\/STB Assumed\. Sample fluid value, not field data/);
  expect(pdf.flat).toMatch(/Bubble point pressure \(optional input\) n\/a psia Not provided: solved from the solution GOR/);
  // the method behind every property
  for (const s of ['Bubble point pressure', 'Solution GOR Rs', 'Oil formation volume factor Bo', 'Dead oil viscosity', 'Undersaturated oil viscosity', 'Gas deviation factor Z', 'Gas viscosity', 'Water formation volume factor Bw', 'Water viscosity']) expect(pdf.flat).toContain(s);
  expect(pdf.flat).toMatch(/Method used for each property/);
  expect(pdf.flat).toMatch(/Lee-Gonzalez-Eakin/);
  expect(pdf.flat).toMatch(/McCain \(1990\)/);
  // basis, limits, contract
  expect(pdf.flat).toMatch(/Liberation basis Black-oil correlations on a surface separation \(flash\) basis/);
  expect(pdf.flat).toMatch(/Limits of this analysis/);
  expect(pdf.flat).toMatch(/Inputs outside a published range/);
  expect(pdf.flat).toMatch(/PVT contract pvt-1/);
  // the screen's headline numbers, to the digit
  expect(pdf.flat).toMatch(/Bubble point pressure Pb 2,998 psia/);
  expect(pdf.flat).toMatch(/Oil formation volume factor at Pb 1\.3718 RB\/STB/);
  expect(pdf.flat).toMatch(/Oil viscosity at Pb 0\.5613 cP/);
  // RL6 figures: five plots with the mark embedded, the conditional ones with their reason
  for (const n of [1, 2, 3, 4, 5]) expect(pdf.flat).toMatch(new RegExp(`Figure ${n}\\. .* against pressure`));
  expect(pdf.flat).toMatch(/Figure 6\. Laboratory values against the model Does not apply/);
  expect(pdf.flat).toMatch(/Figure 7\. Pressure and temperature phase envelope Does not apply/);
  expect(pdf.flat).toMatch(/Figure 8\. Hydrate screening against the flowline profile/);
  expect(pdf.flat).toMatch(/41 points, the series of the screen chart/);
  expect(pdf.images.length).toBeGreaterThanOrEqual(6);
  expect(pdf.flat).toMatch(/Page 1 of \d+/);
  expect(errors).toEqual([]);
});

test('PL3 and PL11: the unit switch converts every door; typing is key by key', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page);
  // the signed-out profile is oilfield
  await expect(page.getByTestId('unit-temp')).toHaveText('degF');
  await expect(page.locator('#temp')).toHaveValue('200');
  await page.getByTestId('fluid-unit-system').click();
  await page.getByRole('option', { name: 'SI' }).click();
  await expect(page.getByTestId('unit-temp')).toHaveText('degC');
  await expect(page.getByTestId('unit-pb')).toHaveText('kPa (abs)');
  await expect(page.getByTestId('unit-gor')).toHaveText('m3/m3');
  await expect(page.locator('#temp')).toHaveValue('93.33333');
  await expect(kpi(page, 'Bubble Point')).toContainText('20670');
  await expect(kpi(page, 'Bubble Point')).toContainText('kPa (abs)');
  await expect(kpi(page, 'Solution GOR')).toContainText('115.8');
  // the same bubble point on the card and on the plot
  await expect(page.getByTestId('pvt-chart-bo').getByText(/Pb 20,670 kPa \(abs\)/)).toBeAttached();
  await expect(page.getByTestId('pvt-chart-bg').getByText('Bg (m3/m3)').first()).toBeAttached();

  // key by key: "93.5" is never rewritten under the cursor, and a cleared field stays cleared
  const temp = page.locator('#temp');
  await temp.click();
  await temp.press('Control+a');
  await temp.press('Backspace');
  await expect(temp).toHaveValue('');
  for (const key of ['9', '3', '.', '5']) await temp.press(key);
  await expect(temp).toHaveValue('93.5');
  await temp.blur();
  await expect(temp).toHaveValue('93.5');
  // 93.5 degC is 200.3 degF: back in oilfield units the field shows the stored value
  await page.getByTestId('fluid-unit-system').click();
  await page.getByRole('option', { name: 'Oilfield' }).click();
  await expect(temp).toHaveValue('200.3');
  await expect(kpi(page, 'Bubble Point')).toContainText('psia');

  // the CSV says its units and its source
  await page.getByTestId('fluid-unit-system').click();
  await page.getByRole('option', { name: 'SI' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PVT CSV' }).click();
  const file = path.join(OUT, 'pvt-si.csv');
  await (await dl).saveAs(file);
  const csv = fs.readFileSync(file, 'utf8').split('\n');
  expect(csv[0]).toBe('# PVT contract: pvt-1');
  expect(csv.join('\n')).toMatch(/# Method, Solution GOR Rs: Standing \(Standing \(1947\)\)/);
  expect(csv.join('\n')).toMatch(/# Display units of this file: pressure kPa \(abs\); temperature degC/);
  const head = csv.find((l) => !l.startsWith('#'));
  expect(head).toBe('Pressure (kPa (abs)),Rs (m3/m3),Bo (m3/m3),Bg (m3/m3),Z,Oil viscosity (mPa.s),Gas viscosity (mPa.s),co (1/kPa),Bw (m3/m3),Water viscosity (mPa.s),Region');
  expect(errors).toEqual([]);
});

test('PL2 and RL10: hostile P-T profile files are read, read back, and equal their twin', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page);
  await page.getByRole('tab', { name: 'Flow Assurance' }).first().click();
  const box = page.locator('#pt-profile');
  const back = page.getByTestId('pt-readback');
  const tiles = async () => {
    await resultTab(page, 'Flow Assurance').click();
    const card = page.getByText('Flow assurance screening').locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    return (await card.locator('.text-base.font-bold').allInnerTexts()).join(' | ');
  };

  await box.fill(hostile('twin-psia-degF.csv'));
  await expect(back).toContainText('6 points read. Pressure in psia (as chosen); temperature in degF (as chosen).');
  const twin = await tiles();
  expect(twin).toMatch(/50\.0 degF/);

  // bar and degC with a header, tab separated: the header decides, the selectors lock
  await box.fill(hostile('tabs-header-bar-degC.txt'));
  await expect(back).toContainText('Pressure in bar (abs) (read from the header); temperature in degC (read from the header).');
  await expect(page.getByTestId('pt-pressure-unit')).toBeDisabled();
  expect(await tiles()).toBe(twin);

  // no header: read as psia and degF the answer is wrong, and choosing the unit at the door makes it right
  await box.fill(hostile('no-header-bar-degC.txt'));
  await expect(back).toContainText('Pressure in psia (as chosen)');
  expect(await tiles()).not.toBe(twin);
  await page.getByTestId('pt-pressure-unit').click();
  await page.getByRole('option', { name: 'bar (abs)' }).click();
  await page.getByTestId('pt-temperature-unit').click();
  await page.getByRole('option', { name: 'degC' }).click();
  await expect(back).toContainText('Pressure in bar (abs) (as chosen); temperature in degC (as chosen).');
  expect(await tiles()).toBe(twin);

  // semicolons with comma decimals, swapped columns in kPa, gauge pressure
  await page.getByTestId('pt-pressure-unit').click();
  await page.getByRole('option', { name: 'psia' }).click();
  await page.getByTestId('pt-temperature-unit').click();
  await page.getByRole('option', { name: 'degF' }).click();
  for (const name of ['semicolon-comma-decimals.csv', 'swapped-columns-kpa.csv', 'spaces-psig.txt']) {
    await box.fill(hostile(name));
    await expect(back).toContainText('6 points read');
    expect(await tiles()).toBe(twin);
  }
  await expect(back).toContainText('brought to absolute with 14.696 psi');

  // nothing is dropped silently
  await box.fill(hostile('hostile-mixed.txt'));
  await expect(back).toContainText('3 points read, 5 lines not read.');
  await expect(back).toContainText('Line 3 not read: Not two numbers');
  await expect(back).toContainText('Line 6 not read: Four comma-separated values');
  await expect(back).toContainText('Line 7 not read: Pressure is not above zero absolute');
  expect(errors).toEqual([]);
});

test('PL5: projects as earlier releases saved them open, compute and report', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page, '?saved=1');
  for (const [name, expectText, model] of [
    ['Pre-shell project (2026-07)', 'Vasquez-Beggs', 'PVT, black-oil correlations'],
    ['Ekene E-2000 oil (saved 2026-09)', 'saved before the app kept the record of the match', 'PVT, equation of state (PR78)'],
  ]) {
    await page.getByRole('combobox', { name: 'Project' }).click();
    await page.getByRole('option', { name }).click();
    await expect(page.getByText('Oil FVF @ Pb')).toBeVisible();
    // an old project opens in oilfield units, as it was written, with no sample label
    await expect(page.getByTestId('unit-temp')).toHaveText('degF');
    await expect(page.getByTestId('fluid-sample-banner')).toHaveCount(0);
    await resultTab(page, 'Report').click();
    const header = page.getByTestId('fluid-report-header');
    await expect(header).toContainText(name);
    await expect(header).toContainText(model);
    await expect(header).toContainText('n/a');
    await expect(page.getByTestId('fluid-report-tab')).toContainText(expectText);
    await expect(page.getByTestId('fluid-report-inputs')).toContainText('Entered, source not stated');
    const pdf = await exportPdf(page, `saved-${name.replace(/[^a-z0-9]+/gi, '-')}.pdf`);
    expect(pdf.pages).toBeGreaterThanOrEqual(7);
    expect(pdf.flat).toContain(`Project ${name}`);
    expect(pdf.flat).toMatch(/Field n\/a/);
    expect(pdf.flat).not.toMatch(/undefined|NaN/);
  }
  expect(errors).toEqual([]);
});

test('PL9 and RL11: the chain to Well Test, and delivery that survives a refresh', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  // without a project the handoff says it would not survive a refresh
  await expect(page.getByTestId('fluid-handoff-note')).toContainText('not saved as a project yet');
  // choose another correlation pair, so the names in Well Test are not the defaults
  await page.getByRole('tab', { name: 'Correlations' }).click();
  await page.getByRole('combobox').filter({ hasText: 'Standing (default)' }).click();
  await page.getByRole('option', { name: 'Glaso' }).click();
  await createProject(page, 'Ekene chain fluid');
  await expect(page.getByTestId('fluid-handoff-note')).toContainText('This fluid is a saved project');
  const bo = (await kpi(page, 'Oil FVF @ Pb').locator('.text-2xl').innerText()).trim();

  await page.getByRole('button', { name: 'Send to Well Test Analysis Studio' }).click();
  await expect(page).toHaveURL(/\/dev\/well-test-analysis-studio\?fluidProject=/);
  await expect(page.getByText(/Fluid properties received from Fluid Systems Studio: Bo, viscosity/)).toBeVisible({ timeout: 120000 });
  await importGauge(page);
  await page.getByRole('tab', { name: 'Report' }).click();
  const inputs = page.getByTestId('wts-report-inputs');
  const source = /Correlation: Glaso, at the bubble point, from Fluid Systems Studio project "Ekene chain fluid" \(\d{4}-\d\d-\d\d \d\d:\d\d UTC\)/;
  await expect(inputs).toContainText(source);
  await expect(inputs).toContainText(/Correlation: Beggs-Robinson, at the bubble point, from Fluid Systems Studio project "Ekene chain fluid"/);
  await expect(inputs).toContainText(Number(bo).toFixed(2));

  // Opening the same address afresh (a copied link, a new visit) carries no
  // router state: the block is read again from the saved project by its id.
  // (A reload in the same tab keeps the router state in the browser history,
  // so the first check is that a reload still works; the fresh visit is the
  // one that needs the saved project.)
  const address = page.url();
  await page.reload();
  await expect(page.getByText(/Fluid properties received from Fluid Systems Studio: Bo, viscosity/)).toBeVisible({ timeout: 120000 });
  await page.goto('about:blank');
  await page.goto(address);
  expect(await page.evaluate(() => window.history.state?.usr?.fluidStudioData ?? null)).toBeNull();
  await expect(page.getByText(/Fluid properties read from the saved Fluid Systems Studio project "Ekene chain fluid": Bo, viscosity/)).toBeVisible({ timeout: 120000 });
  await importGauge(page);
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('wts-report-inputs')).toContainText(source);

  // the Well Test PDF names the upstream correlation and project
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export PDF report/i }).click();
  const file = path.join(OUT, 'chain-well-test.pdf');
  await (await downloadPromise).saveAs(file);
  const pdf = readPdfFile(file);
  expect(pdf.flat).toMatch(/Reservoir and fluid inputs/);
  expect(pdf.flat).toMatch(/Correlation: Glaso, at the bubble point, from Fluid Systems Studio/);
  expect(pdf.flat).toMatch(/Ekene chain fluid/);
  expect(errors).toEqual([]);
});

test('PL4 and RL8: a tuned fluid is reported as tuned only while the fit describes the inputs', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole('combobox').filter({ hasText: 'Black oil correlations' }).click();
  await page.getByRole('option', { name: /Compositional PR78 EOS/ }).click();
  await expect(page.getByTestId('fluid-kpi-basis')).toContainText('compositional table');
  await resultTab(page, 'Compositional').click();
  await page.locator('#lt-psat').fill('2750');
  await page.getByRole('button', { name: 'Tune to lab data' }).click();
  await expect(page.getByText('Error after tune')).toBeVisible({ timeout: 120000 });
  await expect(page.getByTestId('fluid-lab-vs-model')).toContainText('Lab Psat 2,750 psia');
  // trace the envelope so the report can draw it
  await page.getByRole('button', { name: 'Trace envelope' }).click();
  await expect(page.getByText(/Saturation pressure at 200 degF/)).toBeVisible({ timeout: 120000 });

  await resultTab(page, 'Report').click();
  const tuning = page.getByTestId('fluid-report-tuning');
  await expect(tuning).toContainText('The C7+ fraction was regressed to the measured values below');
  await expect(tuning).toContainText('Saturation pressure at 200.0 degF');
  await expect(page.getByTestId('fluid-report-figures')).toContainText('Pressure and temperature phase envelopePlotted');
  const pdf = await exportPdf(page, 'report-eos-tuned.pdf');
  expect(pdf.flat).toMatch(/Analysis type PVT, equation of state \(PR78\)/);
  expect(pdf.flat).toMatch(/Lab values matched/);
  expect(pdf.flat).toMatch(/Lab tuning C7\+ tuned to lab data/);
  expect(pdf.flat).toMatch(/Figure 7\. Pressure and temperature phase envelope Bubble points/);
  // the measured saturation pressure is drawn on the model curves, as on the screen
  expect(pdf.flat).toMatch(/Figure 6\. Laboratory values against the model/);
  expect(pdf.flat).toMatch(/Lab Psat 2,750 psia/);
  expect(pdf.flat).toMatch(/Model curves with the measured saturation pressure as the dotted line\. The model is tuned to these values/);

  // a measured value moves after the fit: the claim is withdrawn on the Report tab
  await resultTab(page, 'Compositional').click();
  await page.locator('#lt-psat').fill('2800');
  await resultTab(page, 'Report').click();
  await expect(tuning).toContainText('changed after the fit');
  await expect(tuning).not.toContainText('was regressed to the measured values below');
  expect(errors).toEqual([]);
});
