// Decline Curve Analysis and Forecast Scenario Hub, Reservoir upgrade round
// app 3 (DCA-U1; docs/upgrade/DeclineCurveAnalysis-UPGRADE.md). On the /dev
// harnesses, signed out, so the unit profile is the built-in oilfield preset.
// Saved DCA projects live in the tab's sessionStorage, so the hub harness
// reads a forecast sent from /dev/dca by id.
//
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: the Model Fit tab
//        with its plots on white with the mark, the Report tab; no page
//        error, no sideways scroll.
//   RL   the report door: the PDF downloaded and read back with pdftotext
//        and pdfinfo (identification, inputs with sources, EUR in its parts,
//        the decline basis, figure captions, limits).
//   PL2  hostile files: monthly volumes, day-first dates asked, a volume
//        unit with no time asked, two wells refused; the twin's rates.
//   PL4  a stale fit: a window edit withdraws it, the report refuses, and
//        putting the window back restores it.
//   PL9  the sender: the forecast opens as a case in Forecast Scenario Hub
//        with its source and basis, survives a reload, and the hub's
//        cumulative equals DCA's remaining volume.
//
// Evidence goes under test-results/ only.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUT = 'test-results/dca-upgrade';
fs.mkdirSync(OUT, { recursive: true });
const HOSTILE = path.join('e2e', 'fixtures', 'dca', 'hostile');

const noPageScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
function readPdfFile(file) {
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  return { text, flat: text.replace(/\s+/g, ' '), pages: Number(/Pages:\s+(\d+)/.exec(info)[1]) };
}

async function openDca(page) {
  await page.goto('/dev/dca', { timeout: 240000 });
  await expect(page.getByTestId('dca-theme-scope')).toBeVisible({ timeout: 240000 });
}
async function newProject(page, name) {
  await page.getByTitle(/Create new project/i).first().click({ timeout: 60000 });
  await page.getByPlaceholder(/name/i).last().fill(name);
  await page.getByRole('button', { name: /^Create project$/i }).click();
}
// the rails start closed below the lg breakpoint; on a phone they float over the page
const narrow = (page) => (page.viewportSize()?.width || 1366) < 1024;
async function leftRail(page) {
  if (!narrow(page)) return;
  const open = page.getByRole('button', { name: 'Show left panel' });
  if (await open.isVisible().catch(() => false)) await open.click();
}
async function closeRails(page) {
  if (!narrow(page)) return;
  // the header toggle closes the left rail; a collapsed rail's own close button is not clickable
  const hide = page.getByRole('button', { name: 'Hide left panel' });
  if (await hide.isVisible().catch(() => false)) await hide.click();
}
async function sampleFitted(page, name = 'Sample') {
  await openDca(page);
  await leftRail(page);
  await newProject(page, name);
  await page.getByTestId('dca-add-sample-well').click();
  await page.getByRole('button', { name: 'Fit Model' }).click();
  await expect(page.getByTestId('dca-di-kpi')).toHaveText(/\d/, { timeout: 60000 });
  await page.getByRole('button', { name: 'Generate Forecast' }).click();
  // the KPI card holds the remaining volume once the forecast is in (a toast can come and go on a slow runner)
  await expect(page.getByTestId('dca-kpi-remaining')).toHaveText(/\d/, { timeout: 60000 });
  await closeRails(page);
}
async function addWellWith(page, file, wellName) {
  await page.getByRole('button', { name: 'Add well', exact: true }).click();
  await page.getByPlaceholder('Well Name').fill(wellName);
  await page.getByRole('dialog').getByRole('button', { name: 'Add Well', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(path.join(HOSTILE, file));
  await expect(page.getByTestId('dca-import-door')).toBeVisible({ timeout: 30000 });
}

test.describe('PL6: three viewports, both themes', () => {
  for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
    for (const dark of [false, true]) {
      test(`${w}x${h} ${dark ? 'dark' : 'light'}: fit, plots and report hold together`, async ({ page }) => {
        test.setTimeout(300000);
        const errors = watchErrors(page);
        await page.setViewportSize({ width: w, height: h });
        await sampleFitted(page, `View ${w}`);
        if (dark) {
          await page.getByTestId('theme-toggle').first().click();
          await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
        }
        await page.getByRole('tab', { name: 'Model Fit' }).click();
        const plot = page.locator('#dca-main-plot');
        await expect(plot).toBeVisible();
        // the chart standard: white in both themes, with the mark
        const bg = await plot.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(bg).toMatch(/rgb\(255, 255, 255\)/);
        await expect(plot.locator('img[alt*="Petrolord" i]').first()).toBeVisible();
        // the fit window is drawn, and the line is not blank
        await expect(plot.locator('.recharts-reference-area')).toHaveCount(1);
        expect(await plot.locator('.recharts-line path').count()).toBeGreaterThan(0);
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, `fit-${w}-${dark ? 'dark' : 'light'}.png`) });
        for (const v of ['ratecum', 'cum']) {
          await page.getByTestId(`dca-view-${v}`).click();
          await expect(plot).toHaveAttribute('data-view', v);
        }
        await page.getByRole('tab', { name: 'Report' }).click();
        await expect(page.getByTestId('dca-report-eur')).toBeVisible();
        await page.screenshot({ path: path.join(OUT, `report-${w}-${dark ? 'dark' : 'light'}.png`) });
        expect(await noPageScroll(page)).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
});

test('RL: the report door, read back from the downloaded PDF', async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await sampleFitted(page, 'Report door');
  await page.getByRole('tab', { name: 'Report' }).click();
  await page.getByTestId('dca-id-analyst').fill('E2E Analyst');
  await page.getByTestId('dca-id-company').fill('E2E Company');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('dca-report-export').click();
  const download = await downloadPromise;
  const file = path.join(OUT, 'dca-sample-report.pdf');
  await download.saveAs(file);
  const pdf = readPdfFile(file);
  expect(pdf.pages).toBeGreaterThanOrEqual(5);
  for (const s of ['Decline Curve Analysis Report', 'Company E2E Company', 'Analyst E2E Analyst', 'Well Ekene-1 (sample)', 'Data cut-off 2022-12-01',
    'Inputs', 'Source and quality', 'EUR (produced + remaining)', 'Nominal, per year 43.83 %/yr', 'Limits of this analysis',
    'Figure 1. Rate against time (log rate)', 'Figure 2. Rate against cumulative production', 'Figure 3. Cumulative production against time',
    'Figure 4. EUR distribution (Monte Carlo)', 'Does not apply: the forecast is deterministic']) {
    expect(pdf.flat).toContain(s);
  }
  // EUR closes on its parts, and sits at the closed form 91,667 bbl within half a percent
  const n = (re) => Number(pdf.flat.match(re)[1].replace(/,/g, ''));
  const produced = n(/Produced to the data cut-off \(2022-12-01\) ([\d,]+) bbl/);
  const remaining = n(/Remaining, data cut-off to the economic limit ([\d,]+) bbl/);
  const eur = n(/EUR \(produced \+ remaining\) ([\d,]+) bbl/);
  expect(Math.abs(produced + remaining - eur)).toBeLessThanOrEqual(1);
  expect(Math.abs(eur - 91666.7) / 91666.7).toBeLessThan(0.005);
});

test('PL4: a window edit withdraws the fit and the report; putting it back restores them', async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await sampleFitted(page, 'Stale');
  const start = page.locator('input[type=date]').first();
  await start.fill('2020-06-01');
  await expect(page.getByTestId('dca-stale')).toContainText('the fit window changed');
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('dca-report-refusal')).toContainText('This fit is out of date');
  await expect(page.getByTestId('dca-report-export')).toBeDisabled();
  await start.fill('2020-01-01');
  await expect(page.getByTestId('dca-report-eur')).toBeVisible();
});

test.describe('PL2: the hostile file set at the door', () => {
  test('monthly volumes read as the twin; day-first asked; a bare volume unit asked; two wells refused', async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDca(page);
    await newProject(page, 'Hostile');
    await addWellWith(page, '05-monthly-volumes.csv', 'Volumes');
    await expect(page.getByTestId('dca-import-columns')).toContainText('bbl in the month (volume)');
    await page.getByTestId('dca-import-commit').click();
    await page.getByRole('button', { name: 'Fit Model' }).click();
    await expect(page.getByTestId('dca-di-kpi')).toHaveText(/\d/, { timeout: 60000 });
    // the twin: 120 bbl/d at the start
    await expect(page.getByTestId('dca-plot-annotation')).toContainText(/qi: 120(\.0)? bbl\/d/);

    await addWellWith(page, '03-day-first-unsettled.csv', 'Day first');
    await expect(page.getByTestId('dca-import-question-dateOrder')).toBeVisible();
    await expect(page.getByTestId('dca-import-commit')).toBeDisabled();
    await page.getByRole('button', { name: 'Day first' }).click();
    await expect(page.getByTestId('dca-import-commit')).toBeEnabled();
    await page.getByTestId('dca-import-door').getByRole('button', { name: 'Cancel' }).click();

    await page.locator('input[type=file]').setInputFiles(path.join(HOSTILE, '06-bare-volume-unit.csv'));
    await expect(page.getByTestId('dca-import-question-rateOrVolume')).toBeVisible();
    await page.getByTestId('dca-import-door').getByRole('button', { name: 'Cancel' }).click();

    await page.locator('input[type=file]').setInputFiles(path.join(HOSTILE, '09-two-wells.csv'));
    await expect(page.getByTestId('dca-import-refusal')).toContainText('2 wells (Ekene-1, Ekene-3)');
    await page.screenshot({ path: path.join(OUT, 'hostile-two-wells.png') });
  });
});

test('PL9: the forecast goes to Forecast Scenario Hub as a case with its source, and survives a reload', async ({ page }) => {
  test.setTimeout(600000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await sampleFitted(page, 'Sender');
  const remainingText = await page.getByTestId('dca-send-basis').textContent();
  const remaining = Number(/Remaining ([\d,]+) bbl/.exec(remainingText)[1].replace(/,/g, ''));
  // on the harness the send goes to the hub harness, which reads the saved project by id
  await page.getByTestId('dca-send-hub').click();
  await expect(page).toHaveURL(/\/dev\/forecast-scenario-hub/, { timeout: 60000 });
  await expect(page.getByText('Case comparison')).toBeVisible({ timeout: 240000 });
  const source = page.locator('[data-testid$="-source"]').first();
  await expect(source).toContainText('From Ekene-1 (sample), oil, Exponential fitted');
  await expect(source).toContainText('nominal (a year of 365.25 days) at the data cut-off 2022-12-01');
  await expect(page.locator('[data-testid$="-source-state"]').first()).toContainText('Unchanged since it was received');
  // the hub's cumulative to the limit is DCA's remaining volume (MMbbl to two decimals)
  const id = (await source.getAttribute('data-testid')).replace(/^fsh-/, '').replace(/-source$/, '');
  const cumh = Number(await page.getByTestId(`fsh-cumh-${id}`).textContent());
  expect(Math.abs(cumh - remaining / 1e6)).toBeLessThanOrEqual(0.005 + 1e-9);
  await page.getByPlaceholder(/Save scenario set/).fill('From DCA');
  await page.getByRole('button', { name: 'Save scenario set' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'hub-case-from-dca.png') });
  // the saved set keeps the source through a reload of the page
  await page.goto('/dev/forecast-scenario-hub', { timeout: 240000 });
  await expect(page.getByText('Case comparison')).toBeVisible({ timeout: 240000 });
  await page.getByRole('button', { name: /^Load$/ }).click();
  await page.getByRole('dialog').getByText('From DCA').click();
  await expect(page.locator('[data-testid$="-source"]').first()).toContainText('From Ekene-1 (sample), oil');
});
