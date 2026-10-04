// EOR Screening, Reservoir upgrade round app 11 (EOR-U1;
// docs/upgrade/EorScreening-UPGRADE.md). On the /dev/studio harness, signed
// out (the unit profile is the built-in oilfield preset); the harness seeds a
// Well Test project (wta-1) and a Material Balance case (mbal-1), and a
// Fluid Systems project (pvt-1) is put in the tab's harness store.
//
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: the Screening and
//        Report tabs, the chart on white with the Petrolord mark, no page
//        errors, no sideways page scroll, no em dash.
//   RL   the report door: identification typed, the PDF downloaded and read
//        back with pdftotext, pdfinfo and pdfimages.
//   PL9  the chain: pvt-1, wta-1 and mbal-1 taken by id; the cards "As
//        received", then "Edited after intake"; the sources in the PDF.
//   PL3  SI: 5,200 ft shows 1584.96 m; 1371.6 m typed key by key is 4,500 ft
//        and steam's depth verdict passes on the line.
//
// Evidence goes under test-results/ only.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUT = 'test-results/eor-upgrade';
fs.mkdirSync(OUT, { recursive: true });
const FLUID_ROWS = fs.readFileSync(path.join('e2e', 'fixtures', 'waterflood', 'fluid-rows.json'), 'utf8');

const noPageScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
async function openApp(page) {
  await page.addInitScript((f) => { try { window.sessionStorage.setItem('harness.saved_fluid_studio_projects.v1', f); } catch { /* blocked */ } }, FLUID_ROWS);
  await page.goto('/dev/studio/eor', { timeout: 120000 });
  await expect(page.getByText('Method ranking')).toBeVisible({ timeout: 120000 });
}
function readPdfFile(file) {
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  const images = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }).split('\n').slice(2).filter((l) => l.trim());
  return { text, flat: text.replace(/\s+/g, ' '), pages: Number(/Pages:\s+(\d+)/.exec(info)[1]), images };
}
async function exportPdf(page, name) {
  await page.getByTestId('eor-tab-report').click();
  const p = page.waitForEvent('download');
  await page.getByTestId('eor-report-export').click();
  const d = await p;
  const file = path.join(OUT, name);
  await d.saveAs(file);
  return readPdfFile(file);
}

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${theme}: both tabs, chart on white with the mark, no sideways scroll`, async ({ page }) => {
      test.setTimeout(180000);
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await openApp(page);
      if (theme === 'dark') await page.getByTestId('theme-toggle').first().click();
      const chart = page.locator('[data-canvas="chart"]').first();
      await expect(chart).toBeVisible();
      expect(await chart.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
      await expect(chart.locator('img[alt="Petrolord"]').first()).toBeVisible();
      expect(await noPageScroll(page)).toBe(true);
      await page.screenshot({ path: path.join(OUT, `screening-${w}-${theme}.png`), fullPage: true });
      await page.getByTestId('eor-tab-report').click();
      await expect(page.getByTestId('eor-report-ranking')).toBeVisible();
      expect(await noPageScroll(page)).toBe(true);
      await page.screenshot({ path: path.join(OUT, `report-${w}-${theme}.png`), fullPage: true });
      expect(await page.evaluate(() => document.body.innerText.includes('—'))).toBe(false);
      expect(errors).toEqual([]);
    });
  }
}

test('RL report door: identification typed, the PDF read back', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByTestId('eor-tab-report').click();
  await page.getByLabel('Field').fill('Ekene');
  await page.getByLabel('Analyst').fill('A. Analyst');
  const pdf = await exportPdf(page, 'eor-sample.pdf');
  expect(pdf.pages).toBeGreaterThanOrEqual(5);
  for (const s of ['EOR Screening Report', 'Ekene', 'A. Analyst', 'Ranking of the methods', 'Inputs and their sources', 'SPE-35385-PA', 'SPE-39234-PA', 'Limits of this analysis', 'Figure 1. Share of screened criteria that pass, by method', 'Figure 2. Oil gravity and depth against the CO2 miscible minimum depth']) {
    expect(pdf.flat).toContain(s);
  }
  expect(pdf.flat).toMatch(/Assumed: the built-in sample value of the app/);
  expect(pdf.flat).toMatch(/Micellar\/polymer, ASP & alkaline: marginal/);
  expect(pdf.images.length).toBeGreaterThanOrEqual(1); // the Petrolord mark
});

test('PL9 chain: pvt-1, wta-1 and mbal-1 taken by id, edited after intake, in the PDF', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByTestId('eor-pick-pvt').selectOption({ index: 1 });
  await page.getByTestId('eor-pvt-pressure').fill('3400');
  await page.getByTestId('eor-take-pvt').click();
  await expect(page.getByTestId('pvt-intake-status')).toHaveText('As received');
  await expect(page.getByTestId('eor-gravityApi')).toHaveValue('40.7');
  await page.getByTestId('eor-pick-wta').selectOption({ index: 1 });
  await page.getByTestId('eor-take-wta').click();
  await expect(page.getByTestId('eor-intake-card-wta')).toHaveAttribute('data-status', 'As received');
  await expect(page.getByTestId('eor-permeabilityMd')).toHaveValue('182.4');
  await page.getByTestId('eor-pick-mbal').selectOption({ index: 1 });
  await page.getByTestId('eor-take-mbal').click();
  await expect(page.getByTestId('eor-intake-card-mbal')).toContainText('Ekene E-2000');
  await page.getByTestId('eor-permeabilityMd').fill('120');
  await expect(page.getByTestId('eor-intake-card-wta')).toHaveAttribute('data-status', 'Edited after intake');
  const pdf = await exportPdf(page, 'eor-chain.pdf');
  expect(pdf.flat).toMatch(/Input of the fluid model, Fluid Systems Studio, project "Good Oil Well No. 4 PVT"/);
  expect(pdf.flat).toMatch(/at 3400 psia, the stated reservoir pressure/);
  expect(pdf.flat).toMatch(/Edited in this app after the intake \(received 182.4\)/);
  expect(pdf.flat).toMatch(/Havlena-Odeh regression, slope/);
});

test('PL3 units: SI shows converted values; a limit typed in SI is on the limit', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page);
  await page.getByTestId('eor-unit-system').click();
  await page.getByRole('option', { name: 'SI' }).click();
  const depth = page.getByTestId('eor-depthFt');
  await expect(depth).toHaveValue('1584.96');
  await depth.fill('');
  await depth.pressSequentially('1371.');
  await expect(depth).toHaveValue('1371.');
  await depth.pressSequentially('6');
  await depth.blur();
  await expect(depth).toHaveValue('1371.6');
  await page.getByTestId('eor-method-steam').getByRole('button').first().click();
  const row = page.getByTestId('eor-method-steam').locator('tr', { hasText: 'Depth' });
  await expect(row).toContainText('pass');
  await expect(row).toContainText('1,372 m');
});

// EOR-U2-002: a sender names its saved record in the address; EOR chooses it
// and reads it by id when Take values is pressed.
test('U2-002 sent here: the Well Test project named in the address is chosen and taken by id', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dev/studio/eor?wellTestProject=wt0e0000-0000-4000-8000-0000000e0e01&mbalCase=rb0e0000-0000-4000-8000-0000000e0e01', { timeout: 120000 });
  await expect(page.getByText('Method ranking')).toBeVisible({ timeout: 120000 });
  await expect(page.getByTestId('eor-intake-named-wta')).toContainText('Sent here from Well Test Analysis Studio');
  await expect(page.getByTestId('eor-intake-named-mbal')).toBeVisible();
  await expect(page.getByTestId('eor-intake-named-pvt')).toHaveCount(0);
  await expect(page.getByTestId('eor-pick-wta')).toHaveValue('wt0e0000-0000-4000-8000-0000000e0e01');
  await page.getByTestId('eor-take-wta').click();
  await expect(page.getByTestId('eor-permeabilityMd')).toHaveValue('182.4');
  await expect(page.getByTestId('eor-intake-named-wta')).toHaveCount(0);
});

// EOR-U2-001: the CO2 MMP check against reservoir pressure, beside the Taber verdicts.
test('U2-001 MMP: composition and pressure give miscible or immiscible; the report prints the rows', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await expect(page.getByTestId('eor-mmp')).toHaveAttribute('data-status', 'not made');
  await page.getByTestId('eor-temperatureF').fill('190');
  await page.getByTestId('eor-volatilesMolPct').fill('20.19');
  await page.getByTestId('eor-intermediatesMolPct').fill('39.94');
  await page.getByTestId('eor-reservoirPressurePsia').fill('3500');
  await expect(page.getByTestId('eor-mmp')).toHaveAttribute('data-verdict', 'miscible');
  await expect(page.getByTestId('eor-mmp-minimum')).toHaveText('2,949 psia');
  await page.getByTestId('eor-reservoirPressurePsia').fill('2500');
  await expect(page.getByTestId('eor-mmp')).toHaveAttribute('data-verdict', 'immiscible');
  await page.getByTestId('eor-tab-report').click();
  await expect(page.getByTestId('eor-report-mmp')).toContainText('Zhu et al. (2025)');
  await expect(page.getByTestId('eor-report-mmp')).toContainText('Immiscible: the reservoir pressure is below the MMP');
  expect(await page.evaluate(() => document.body.innerText.includes('—'))).toBe(false);
});

// EOR-U2-007: distance to each limit, as information beside the verdict.
test('U2-007 distance to the limit: the sample CO2 depth sits 2,400 ft above its 2,800 ft band', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByTestId('eor-method-co2').getByRole('button').first().click();
  await expect(page.getByTestId('eor-distance-co2-depth')).toHaveText('2,400 ft above the minimum 2,800 ft (86 %)');
  await expect(page.getByTestId('eor-distance-co2-formation')).toHaveText('n/a');
});

// EOR-U2-006: the range of current projects (Part 2, Tables 1 to 7) beside each limit.
test('U2-006 range of current projects: polymer depth and the sample inside or outside', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByTestId('eor-method-co2').getByRole('button').first().click();
  await expect(page.getByTestId('eor-range-co2-gravity')).toHaveText('27 to 44 degAPI (inside)');
  await expect(page.getByTestId('eor-range-co2-depth')).toHaveText('n/a');
});
