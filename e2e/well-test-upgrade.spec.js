// Well Test Analysis Studio, Reservoir round Step 1 (WTA-U1, 2026-10-04;
// docs/upgrade/WellTestAnalysis-UPGRADE.md). On the /dev harness, signed out:
//
//   PL6  every tab at 1366x768, 1440x900 and 390 wide, light and dark: no
//        page errors, no sideways page scroll, charts on white; the Report
//        tab shows the new gauge and datum basis, the method and its limits
//        and the gauge readings used and left out.
//   PL7  the exported PDF read back: company, software build, gauge depth
//        and datum with no correction, the limits, the data used.
//   PL2  hostile files through the doors: a gauge file stamped day first in
//        psig; a production file with barg first, a German date column,
//        decimal commas and m3/d last.
//   PL3  the gas z-factor method is a stated choice, Dranchuk-Abou-Kassem
//        by default, named in the report.
//
// Evidence goes under test-results/ only.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUT = 'test-results/well-test-upgrade';
fs.mkdirSync(OUT, { recursive: true });
const HOSTILE = 'e2e/fixtures/welltest/hostile';

const isNarrow = (page) => (page.viewportSize()?.width ?? 1280) < 768;
async function openRail(page) {
  if (isNarrow(page)) await page.getByRole('button', { name: 'Show left panel' }).click();
}
async function closeRail(page) {
  if (isNarrow(page)) await page.getByRole('button', { name: 'Close panel' }).first().click();
}

async function open(page) {
  await page.goto('/dev/well-test-analysis-studio');
  await expect(page.getByRole('tab', { name: 'Data' })).toBeVisible({ timeout: 120000 });
}
async function openWithSample(page) {
  await open(page);
  await openRail(page);
  await page.getByRole('button', { name: /Sample/i }).click();
  await closeRail(page);
  await expect(page.getByText(/Points used/i)).toBeVisible();
}

const noPageScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function exportPdf(page, name) {
  await page.getByRole('tab', { name: 'Report' }).click();
  await openRail(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export PDF report/i }).click();
  const download = await downloadPromise;
  await closeRail(page);
  const file = path.join(OUT, name);
  await download.saveAs(file);
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  return { file, flat: text.replace(/\s+/g, ' '), pages: Number(/Pages:\s+(\d+)/.exec(info)[1]) };
}

const TABS = ['Data', 'Diagnostics', 'Match', 'Specialized', 'RTA', 'Report'];

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${scheme}: every tab opens clean, and the Report tab shows the U1 cards`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await openWithSample(page);
      if (scheme === 'dark') {
        await page.getByTestId('theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
      }
      for (const tab of TABS) {
        await page.getByRole('tab', { name: tab }).click();
        await page.waitForTimeout(400);
        expect(await noPageScroll(page), `${tab} scrolls sideways`).toBe(true);
        // every chart frame is white in both themes
        const frames = page.locator('[data-canvas="chart"]');
        for (let i = 0; i < await frames.count(); i += 1) {
          const bg = await frames.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor);
          expect(bg).toBe('rgb(255, 255, 255)');
        }
        await page.screenshot({ path: path.join(OUT, `${w}x${h}-${scheme}-${tab.toLowerCase()}.png`), fullPage: false });
      }
      await page.getByRole('tab', { name: 'Report' }).click();
      await expect(page.getByTestId('wts-report-basis')).toContainText('None applied: every pressure in this report is at the gauge depth');
      await expect(page.getByTestId('wts-report-limits')).toContainText('Constant wellbore storage');
      await expect(page.getByTestId('wts-report-datause')).toContainText('Analysis points');
      await expect(page.getByTestId('wts-report-identification')).toContainText('Software build');
      expect(errors).toEqual([]);
    });
  }
}

test('PL7: the PDF states company, build, gauge and datum, limits and the readings used', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithSample(page);
  await page.getByLabel('Company or operator').fill('Ekene Energy Ltd');
  await page.getByLabel('Gauge depth, MD').fill('9800');
  await page.getByLabel('Pressure datum, TVDSS').fill('9500');
  const pdf = await exportPdf(page, 'wta-u1-report.pdf');
  expect(pdf.flat).toMatch(/Company Ekene Energy Ltd/);
  expect(pdf.flat).toMatch(/Software build Petrolord Suite/);
  expect(pdf.flat).toMatch(/Gauge depth 9800 ft MD/);
  expect(pdf.flat).toMatch(/Pressure datum 9500 ft TVDSS/);
  expect(pdf.flat).toMatch(/Correction to the datum None applied/);
  expect(pdf.flat).toMatch(/Method and its limits/);
  expect(pdf.flat).toMatch(/Gauge data used and left out/);
  expect(pdf.pages).toBeGreaterThanOrEqual(5);
});

test('PL2: a gauge file stamped day first in psig is read day first, and the report says how it became absolute', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.locator('input[type="file"]').first().setInputFiles(path.join(HOSTILE, 'gauge-dayfirst-psig.csv'));
  const mapping = page.getByTestId('wts-import-mapping');
  await expect(mapping).toContainText('60 readings loaded');
  await expect(page.getByTestId('wts-import-date-order')).toBeVisible();
  await expect(page.getByLabel('Date order')).toContainText('Day first');
  const pdf = await exportPdf(page, 'wta-u1-dayfirst.pdf');
  expect(pdf.flat).toMatch(/read in psig; one standard atmosphere \(14\.696 psi\) was added to each reading/);
  expect(pdf.flat).toMatch(/gauge-dayfirst-psig\.csv: 60 readings read; time in date\/time stamps, dates day first/);
});

test('PL2: the RTA door reads a metric, day-first, decimal-comma production file by its headers', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithSample(page);
  await page.getByRole('tab', { name: 'RTA' }).click();
  await page.locator('input[type="file"]').first().setInputFiles(path.join(HOSTILE, 'rta-metric-dayfirst-semicolon.csv'));
  const back = page.getByTestId('wts-rta-readback');
  await expect(back).toContainText('40 rows read');
  await expect(back).toContainText('rate "Ölrate (m3/d)" in m3/d');
  await expect(back).toContainText('pressure "FBHP (barg)" in bar (gauge), one standard atmosphere added');
  await expect(back).toContainText('dates day first');
});

test('PL3: a gas test runs on Dranchuk-Abou-Kassem by default, and the report names it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithSample(page);
  await page.getByRole('combobox', { name: 'Fluid' }).click();
  await page.getByRole('option', { name: /Gas \(pseudo-pressure\)/ }).click();
  await expect(page.getByTestId('wts-z-method')).toContainText('Dranchuk-Abou-Kassem');
  const pdf = await exportPdf(page, 'wta-u1-gas.pdf');
  expect(pdf.flat).toMatch(/Dranchuk-Abou-Kassem z-factor/);
  expect(pdf.flat).toMatch(/Gas z-factor range Dranchuk-Abou-Kassem z-factor: Tpr/);
});

test('PL11 (WTA-U1-017): under SI a decimal typed key by key is kept, and the report converts it back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWithSample(page);
  await page.getByRole('combobox', { name: 'Unit system' }).click();
  await page.getByRole('option', { name: /SI \/ metric/ }).click();
  const h = page.getByLabel('Net thickness h');
  await h.fill('');
  await h.pressSequentially('13.7', { delay: 40 });
  await expect(h).toHaveValue('13.7');
  await h.blur();
  await expect(h).toHaveValue('13.7');
  const pdf = await exportPdf(page, 'wta-u1-si-typing.pdf');
  expect(pdf.flat).toMatch(/Net pay h 13\.7 m/);
});
