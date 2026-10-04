// Recovery Factor Estimator, Reservoir upgrade round app 10 (RF-U1;
// docs/upgrade/RecoveryFactorEstimator-UPGRADE.md). On the /dev/studio
// harness, signed out, so the unit profile is the built-in oilfield preset.
//
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: both tabs, the
//        chart on white with the Petrolord mark, no page errors, no sideways
//        page scroll, no em dash.
//   RL   the report door: identification typed on the Report tab, the PDF
//        downloaded and read back with pdftotext, pdfinfo and pdfimages.
//   RL11 the OOIP of a Material Balance case (mbal-1) and the PVT of a Fluid
//        project (pvt-1), both read by id from seeded rows; the report names
//        both sources; an edit after the intake is said.
//   PL1  the API water-drive estimate on the sample (k in darcies) and a p/z
//        case with abandonment above initial pressure withheld with a reason.
//   PL3  SI display: known conversions on screen, a typed decimal survives.
//
// Evidence goes under test-results/ only.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUT = 'test-results/recovery-factor-upgrade';
fs.mkdirSync(OUT, { recursive: true });
const FLUID_ROWS = fs.readFileSync(path.join('e2e', 'fixtures', 'waterflood', 'fluid-rows.json'), 'utf8');
const FLUID_ID = JSON.parse(FLUID_ROWS)[0].id;
const MBAL = JSON.parse(fs.readFileSync(path.join('e2e', 'fixtures', 'recovery-factor', 'mbal-rows.json'), 'utf8'));
const { expected: MBAL_EXPECTED, ...MBAL_TABLES } = MBAL;
const MBAL_CASE = MBAL_TABLES.rb_cases[0].id;

const isNarrow = (page) => (page.viewportSize()?.width ?? 1280) < 768;
async function openRail(page) {
  if (isNarrow(page)) await page.getByRole('button', { name: 'Show left panel' }).click();
}
const noPageScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const tab = (page, name) => page.getByRole('tab', { name, exact: true }).first();
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
async function seed(page) {
  await page.addInitScript(({ fluid, mbal }) => {
    try {
      window.sessionStorage.setItem('harness.saved_fluid_studio_projects.v1', fluid);
      window.sessionStorage.setItem('harness.rf.mbal_rows.v1', mbal);
    } catch { /* storage blocked */ }
  }, { fluid: FLUID_ROWS, mbal: JSON.stringify(MBAL_TABLES) });
}
async function openApp(page, query = '') {
  await page.goto(`/dev/studio/recovery-factor${query}`, { timeout: 120000 });
  await expect(page.getByText('Recoverable reserves range')).toBeVisible({ timeout: 120000 });
}
function readPdfFile(file) {
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  const images = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }).split('\n').slice(2).filter((l) => l.trim());
  return { text, flat: text.replace(/\s+/g, ' '), pages: Number(/Pages:\s+(\d+)/.exec(info)[1]), images };
}
async function exportPdf(page, name) {
  await tab(page, 'Report').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('rf-export-pdf').click();
  const download = await downloadPromise;
  const file = path.join(OUT, name);
  await download.saveAs(file);
  return { file, name: download.suggestedFilename(), ...readPdfFile(file) };
}

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${scheme}: both tabs, the chart on white, no sideways scroll`, async ({ page }) => {
      test.setTimeout(240000);
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page);
      if (scheme === 'dark') {
        await page.getByTestId('theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
      }
      for (const name of ['Estimate', 'Report']) {
        await tab(page, name).click();
        await page.waitForTimeout(200);
        expect(await noPageScroll(page), `${name}: sideways page scroll`).toBe(true);
        const frames = page.locator('[data-canvas="chart"]');
        for (let i = 0; i < await frames.count(); i += 1) {
          expect(await frames.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
        }
        expect(await page.locator('body').innerText()).not.toMatch(/—/);
        await page.screenshot({ path: path.join(OUT, `pl6-${w}-${scheme}-${name}.png`) });
      }
      expect(errors).toEqual([]);
    });
  }
}

test('RL report door: identification, the headline with its basis, inputs with sources, figures, limits', async ({ page }) => {
  test.setTimeout(240000);
  await openApp(page);
  await page.getByRole('button', { name: 'API (1967): water drive' }).click();
  await tab(page, 'Report').click();
  await page.getByTestId('rf-id-company').fill('Ekene Energy');
  await page.getByTestId('rf-id-field').fill('Ekene');
  await page.getByTestId('rf-id-reservoir').fill('E-2000 sand');
  await page.getByTestId('rf-id-analyst').fill('A. Engineer');
  const pdf = await exportPdf(page, 'report.pdf');
  expect(pdf.name).toMatch(/^Recovery_Factor_Report_.*\.pdf$/);
  expect(pdf.pages).toBeGreaterThanOrEqual(4);
  for (const s of [
    'Recovery Factor Report', 'Company Ekene Energy', 'Analyst A. Engineer', 'Case data Sample data shipped with the app',
    'Recovery factor 42.3 percent', 'fraction of OOIP at stock-tank (standard) conditions', 'not P90 and P10',
    'OOIP by its parts', 'The method by its parts', 'enters as 0.15 darcy', 'Inputs and their sources', 'Sample value of the app',
    'Validation in this build', 'Limits of this analysis', 'Figure 1. Recoverable volume: analog range edges and the estimate',
    'Figure 3. The correlation by its factors',
  ]) expect(pdf.flat).toContain(s);
  expect(pdf.flat).toMatch(/Page 1 of \d+/);
  expect(pdf.images.length).toBeGreaterThan(0); // the Petrolord mark on the plots
});

test('RL11 the OOIP of a Material Balance case and the PVT of a Fluid project, read by id, named in the report', async ({ page }) => {
  test.setTimeout(240000);
  await seed(page);
  await openApp(page, `?mbalCase=${MBAL_CASE}&fluidProject=${FLUID_ID}`);
  // the picker opens on the case named in the address
  await expect(page.getByTestId('rf-mbal-case')).toHaveValue(MBAL_CASE);
  await page.getByTestId('rf-inplace-take').click();
  const mm = (MBAL_EXPECTED.value / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 });
  await expect(page.getByTestId('rf-kpi-inplace')).toHaveText(`${mm} MMSTB`);
  await expect(page.getByTestId('rf-inplace-record')).toContainText('OOIP by material balance, Material Balance Studio case "Ahmed Example 11-3');
  // the PVT of the Fluid project at pi (4,200 psia on the sample)
  await page.getByRole('button', { name: 'API (1967): water drive' }).click();
  await expect(page.getByTestId('rf-fluid-project')).toHaveValue(FLUID_ID);
  await page.getByTestId('rf-fluid-take').click();
  await expect(page.getByTestId('pvt-intake-status')).toHaveText('As received');
  await page.getByTestId('rf-corr-muoi').fill('0.9');
  await expect(page.getByTestId('pvt-intake-status')).not.toHaveText('As received');
  const pdf = await exportPdf(page, 'intakes.pdf');
  expect(pdf.flat).toContain('In-place volume received from another app');
  expect(pdf.flat).toContain('Material Balance Studio (contract mbal-1)');
  expect(pdf.flat).toContain('pvt-1 block received from Fluid Systems Studio');
  expect(pdf.flat).toContain('Good Oil Well No. 4 PVT');
  expect(pdf.flat).toMatch(/Edited in this app after the intake \(received [\d.]+\)/);
});

test('PL1 a p/z case with abandonment above the initial pressure is withheld with its reason', async ({ page }) => {
  test.setTimeout(240000);
  await openApp(page);
  await page.getByRole('button', { name: 'gas', exact: true }).click();
  await page.getByRole('button', { name: 'p/z depletion (exact)' }).click();
  await page.getByTestId('rf-corr-pa').fill('5000');
  await expect(page.getByTestId('rf-withheld')).toContainText('outside 0 to 100 percent');
  await expect(page.getByTestId('rf-kpi-rf')).toHaveText('n/a');
  await expect(page.getByTestId('rf-flags')).toContainText('is not below the initial pressure');
});

test('PL3 SI display: known conversions, and a decimal typed in kPa survives', async ({ page }) => {
  test.setTimeout(240000);
  await openApp(page);
  await page.getByTestId('rf-unit-system').click();
  await page.getByRole('option', { name: 'SI' }).click();
  // 43.39 MMSTB x 0.158987 = 6.9 10^6 sm3; 1,200 acres = 485.6 ha
  await expect(page.getByTestId('rf-kpi-inplace')).toHaveText(/^6\.9 10\^6 sm3$/);
  await expect(page.getByTestId('rf-vol-area')).toHaveValue('485.6228');
  await page.getByRole('button', { name: 'API (1967): water drive' }).click();
  const pi = page.getByTestId('rf-corr-pi');
  await pi.fill('');
  await pi.pressSequentially('28958.', { delay: 20 });
  await expect(pi).toHaveValue('28958.');
  await pi.pressSequentially('2', { delay: 20 });
  await expect(pi).toHaveValue('28958.2');
});
