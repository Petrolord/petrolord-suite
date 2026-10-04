// Voidage Replacement Monitor, Reservoir upgrade round app 7 (VRR-U1;
// docs/upgrade/VoidageReplacementMonitor-UPGRADE.md). On the /dev/studio
// harness, signed out, so the unit profile is the built-in oilfield preset.
//
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: every tab, charts
//        on white with the Petrolord mark, the Report tab, no page errors,
//        no sideways page scroll, no em dash.
//   RL   the report door: identification typed on the Report tab, the PDF
//        downloaded and read back with pdftotext, pdfinfo and pdfimages; the
//        ledger CSV with its provenance header.
//   PL2  hostile files: rates on monthly rows, ambiguous dates asked,
//        "Water Inj (bbl)", a kPa pressure file; each reads to its twin.
//   PL9  the pvt-1 chain: a Fluid Systems Studio project saved in the same
//        tab, its table taken into the monitor by id, the shared intake card
//        "As received" then "Edited after intake"; the periods on the table.
//   PL3  the unit switch converts the KPI (62,865 RB is 9,995 rm3); a survey
//        typed key by key in kPa.
//
// Evidence goes under test-results/ only.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUT = 'test-results/vrr-upgrade';
fs.mkdirSync(OUT, { recursive: true });
const HOSTILE = path.join('e2e', 'fixtures', 'vrr', 'hostile');

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

async function openApp(page) {
  await page.goto('/dev/studio/vrr', { timeout: 120000 });
  await expect(page.getByText('Import per-well data')).toBeVisible({ timeout: 120000 });
}

async function sampleWithSurveys(page) {
  await tab(page, 'Data & PVT').click();
  await page.getByRole('button', { name: 'Sample wells' }).click();
  await expect(page.getByText('Monthly field ledger')).toBeVisible({ timeout: 60000 });
  await tab(page, 'Pressure').click();
  await openRail(page);
  await page.getByRole('button', { name: 'Sample surveys' }).click();
  await closeRail(page);
  await expect(page.getByText('VRR vs reservoir pressure')).toBeVisible({ timeout: 60000 });
}

function readPdfFile(file) {
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  const images = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }).split('\n').slice(2).filter((l) => l.trim());
  return { text, flat: text.replace(/\s+/g, ' '), pages: Number(/Pages:\s+(\d+)/.exec(info)[1]), images };
}

async function download(page, testId, name) {
  const p = page.waitForEvent('download');
  await page.getByTestId(testId).click();
  const d = await p;
  const file = path.join(OUT, name);
  await d.saveAs(file);
  return { file, name: d.suggestedFilename() };
}

async function importLedger(page, file, { accept = true } = {}) {
  await page.getByTestId('vrr-ledger-file').setInputFiles(path.join(HOSTILE, file));
  await expect(page.getByTestId('vrr-import-readback')).toBeVisible({ timeout: 60000 });
  if (accept) {
    await page.getByTestId('vrr-import-accept').click();
    await expect(page.getByText('Monthly field ledger')).toBeVisible();
  }
}

// the produced and injected voidage KPI tiles of the right rail, as text
async function kpis(page) {
  const body = await page.locator('body').innerText();
  const prod = /Total Produced Voidage\s+([\d,]+)/i.exec(body)?.[1];
  const inj = /Total Injected Voidage\s+([\d,]+)/i.exec(body)?.[1];
  return { prod, inj };
}

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${scheme}: every tab, charts on white, the report tab`, async ({ page }) => {
      test.setTimeout(240000);
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page);
      if (scheme === 'dark') {
        await page.getByTestId('theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
      }
      await sampleWithSurveys(page);
      for (const name of ['Data & PVT', 'VRR Dashboard', 'Pressure', 'Patterns', 'Report']) {
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
      await expect(page.getByTestId('vrr-report-tab')).toBeVisible();
      await expect(page.getByTestId('vrr-report-inputs')).toContainText('Assumed: the starting value of the app (1.25 RB/STB), not field data');
      await expect(page.getByTestId('vrr-report-ledger')).toContainText('62,865');
      await expect(page.getByTestId('vrr-report-limits')).toContainText('FVFs are held constant over the record');
      expect(await noPageScroll(page)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test('RL: the exported PDF and the ledger CSV carry what a reviewer signs against', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await sampleWithSurveys(page);
  await tab(page, 'Report').click();
  await page.locator('#vrr-id-company').fill('Lordsway Energy');
  await page.locator('#vrr-id-field').fill('Ekene');
  await page.locator('#vrr-id-reservoir').fill('E-2000');
  await page.locator('#vrr-id-analyst').fill('A. Analyst');
  const { file } = await download(page, 'vrr-report-export', 'vrr-report.pdf');
  const pdf = readPdfFile(file);
  expect(pdf.pages).toBeGreaterThanOrEqual(5);
  expect(pdf.flat).toMatch(/Voidage Replacement Report Petrolord Voidage Replacement Monitor/);
  expect(pdf.flat).toMatch(/Company Lordsway Energy/);
  expect(pdf.flat).toMatch(/Field Ekene/);
  expect(pdf.flat).toMatch(/Inputs and their sources/);
  expect(pdf.flat).toMatch(/Average reservoir pressure surveys 2 psia/);
  expect(pdf.flat).toMatch(/Voidage ledger by period/);
  expect(pdf.flat).toMatch(/Total 50,625 12,240 0 62,865 54,060 5,400 59,460 n\/a 0\.9458/);
  expect(pdf.flat).toMatch(/Limits of this analysis/);
  for (const t of ['Voidage replacement ratio by period', 'Reservoir voidage by term', 'Reservoir pressure history', 'Production and injection rates']) {
    expect(pdf.flat).toContain(`Figure`);
    expect(pdf.flat).toContain(t);
  }
  expect(pdf.flat).toMatch(/Page 1 of \d/);
  expect(pdf.images.length).toBeGreaterThan(0); // the Petrolord mark in the plots
  const csv = await download(page, 'vrr-ledger-csv', 'vrr-ledger.csv');
  const text = fs.readFileSync(csv.file, 'utf8');
  expect(text.split('\n')[0]).toBe('# Petrolord Voidage Replacement Monitor: voidage ledger by period');
  expect(text).toMatch(/\nperiod,oil_STB,/);
  expect(text).toMatch(/\ntotal,.*,62865,/);
  expect(errors).toEqual([]);
});

test('PL2: hostile ledger and pressure files read to their twins, or ask', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await importLedger(page, 'twin-ledger.csv');
  const twin = await kpis(page);
  expect(twin.prod).toBeTruthy();

  // daily rates on monthly rows (VRR-U1-003): the units come from the header and the voidage matches the twin
  await importLedger(page, 'h03-rates-on-monthly-rows.csv', { accept: false });
  await expect(page.getByTestId('vrr-unit-oil_stb')).toHaveValue('bbl/d');
  await expect(page.getByTestId('vrr-import-readback')).toContainText('calendar days of the month');
  await page.getByTestId('vrr-import-accept').click();
  expect(await kpis(page)).toEqual(twin);

  // ambiguous day and month: asked, then read
  await importLedger(page, 'h02-ambiguous-dates.csv', { accept: false });
  await expect(page.getByTestId('vrr-import-question')).toContainText('day first or month first');
  await expect(page.getByTestId('vrr-import-accept')).toBeDisabled();
  await page.getByRole('button', { name: 'Day first' }).click();
  await page.getByTestId('vrr-import-accept').click();
  expect(await kpis(page)).toEqual(twin);

  // "Water Injected (bbl)", a preamble, a totals row (VRR-U1-001)
  await importLedger(page, 'h05-preamble-shuffled-totals.csv', { accept: false });
  await expect(page.getByTestId('vrr-import-readback')).toContainText('Cum Oil (STB)');
  await page.getByTestId('vrr-import-accept').click();
  expect(await kpis(page)).toEqual(twin);

  // a kPa pressure file (VRR-U1-006)
  await tab(page, 'Pressure').click();
  await page.getByTestId('vrr-pressure-file').setInputFiles(path.join(HOSTILE, 'p01-kpa.csv'));
  await expect(page.getByTestId('vrr-pressure-unit')).toHaveValue('kPa');
  await page.getByTestId('vrr-pressure-accept').click();
  await expect(page.getByLabel('Survey 1 pressure (psia)')).toHaveValue(/^3000(\.0000\d*)?$/); // the file holds kPa to 4 decimals
  expect(errors).toEqual([]);
});

test('PL9: the pvt-1 chain from a Fluid Systems Studio project saved in the same tab', async ({ page }) => {
  test.setTimeout(360000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dev/fluid-systems-studio', { timeout: 120000 });
  await expect(page.getByText('Oil FVF @ Pb')).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: 'Create new project' }).click();
  await page.getByLabel('Project name').fill('Ekene VRR fluid');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText('Project "Ekene VRR fluid" created')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(1000);
  await openApp(page);
  await sampleWithSurveys(page);
  await tab(page, 'Data & PVT').click();
  const pick = page.getByTestId('vrr-fluid-project');
  await expect(pick).toContainText('Ekene VRR fluid', { timeout: 60000 });
  await pick.selectOption({ index: 1 });
  await page.getByTestId('vrr-fluid-pressure').fill('2900');
  await page.getByTestId('vrr-fluid-take').click();
  await expect(page.getByTestId('pvt-intake-status')).toHaveText('As received', { timeout: 60000 });
  await expect(page.getByTestId('pvt-intake-source')).toContainText('Ekene VRR fluid');
  const bo = Number(await page.getByTestId('vrr-fvf-Bo').inputValue());
  expect(bo).toBeGreaterThan(1);
  await page.getByTestId('vrr-fvf-Bo').fill(String((bo + 0.05).toFixed(3)));
  await expect(page.getByTestId('pvt-intake-status')).toHaveText('Edited after intake');
  // the periods run on the table at their pressure
  await tab(page, 'Pressure').click();
  await expect(page.getByText(/pressure-dependent FVFs active \(Fluid project table\)/)).toBeVisible();
  await tab(page, 'Report').click();
  await expect(page.getByTestId('vrr-report-inputs')).toContainText('interpolated in the PVT table');
  await expect(page.getByTestId('vrr-report-inputs')).toContainText('Edited in this app after the handoff');
  expect(errors).toEqual([]);
});

test('PL3: the unit switch converts; a survey typed key by key in kPa is stored in psia', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await sampleWithSurveys(page);
  expect((await kpis(page)).prod).toBe('62,865');
  await page.getByTestId('vrr-unit-system').click();
  await page.getByRole('option', { name: 'SI' }).click();
  expect((await kpis(page)).prod).toBe('9,995');
  await expect(page.getByText('rm3').first()).toBeVisible();
  const p = page.getByLabel('Survey 1 pressure (kPa)');
  await p.fill('');
  await p.pressSequentially('20684.');
  await expect(p).toHaveValue('20684.');
  await p.pressSequentially('27');
  await expect(p).toHaveValue('20684.27');
  await p.blur();
  await page.getByTestId('vrr-unit-system').click();
  await page.getByRole('option', { name: 'Oilfield' }).click();
  // 20,684.27 kPa is 2,999.9997 psia
  await expect(page.getByLabel('Survey 1 pressure (psia)')).toHaveValue(/^2999\.999\d*$/);
  expect(errors).toEqual([]);
});
