// Well Spacing Optimizer, Reservoir upgrade round app 12 (WS-U1;
// docs/upgrade/WellSpacingOptimizer-UPGRADE.md). On the /dev/studio harness,
// signed out (the unit profile is the built-in oilfield preset); the harness
// seeds a Well Test project (wta-1), a Material Balance case (mbal-1), a
// Decline Curve Analysis forecast (dca-forecast-1) and four registry wells,
// and a Fluid Systems project (pvt-1) is put in the tab's harness store.
//
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: the Study and
//        Report tabs, four charts on white with the Petrolord mark clear of
//        the X axis, no page errors, no sideways page scroll, no em dash.
//   RL   the report door: identification typed, the PDF downloaded and read
//        back with pdftotext, pdfinfo and pdfimages.
//   PL9  the chain: pvt-1, wta-1, mbal-1, dca-forecast-1 and the registry
//        wells taken by id; cards "As received", then "Edited after intake";
//        the sources and the four figures in the PDF.
//   PL3  SI: 60 ft shows 18.288 m; 402.336 m between wells at 40 acres
//        (16.19 ha/well); "18." typed key by key stays.
//
// Evidence goes under test-results/ only.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUT = 'test-results/well-spacing-upgrade';
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
  await page.goto('/dev/studio/well-spacing', { timeout: 120000 });
  await expect(page.getByRole('button', { name: 'Load example field' })).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: 'Load example field' }).click();
  await expect(page.getByTestId('ws-case-table')).toBeVisible({ timeout: 30000 });
}
function readPdfFile(file) {
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  const images = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }).split('\n').slice(2).filter((l) => l.trim());
  return { text, flat: text.replace(/\s+/g, ' '), pages: Number(/Pages:\s+(\d+)/.exec(info)[1]), images };
}
async function exportPdf(page, name) {
  await page.getByTestId('ws-tab-report').click();
  const p = page.waitForEvent('download');
  await page.getByTestId('ws-report-export').click();
  const d = await p;
  const file = path.join(OUT, name);
  await d.saveAs(file);
  return readPdfFile(file);
}

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${theme}: both tabs, four charts on white with the mark, no sideways scroll`, async ({ page }) => {
      test.setTimeout(180000);
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await openApp(page);
      if (theme === 'dark') {
        await page.getByTestId('theme-toggle').first().click();
        await expect(page.getByTestId('wso-theme-scope').locator('xpath=ancestor-or-self::*[@data-pl-theme="dark"]').first()).toBeAttached();
      }
      const charts = page.locator('[data-canvas="chart"]');
      await expect(charts).toHaveCount(4);
      for (let i = 0; i < 4; i += 1) {
        const c = charts.nth(i);
        expect(await c.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
        const logo = c.locator('img[alt="Petrolord"]');
        await expect(logo).toBeVisible();
        // the mark sits above the X axis tick labels (WS-U1-012)
        const lb = await logo.boundingBox();
        const ticks = await c.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
        if (ticks.length) expect(lb.y + lb.height).toBeLessThanOrEqual(Math.min(...ticks) + 1);
      }
      expect(await noPageScroll(page)).toBe(true);
      await page.screenshot({ path: path.join(OUT, `study-${w}-${theme}.png`), fullPage: true });
      await page.getByTestId('ws-tab-report').click();
      await expect(page.getByTestId('ws-report-inputs')).toBeVisible();
      expect(await noPageScroll(page)).toBe(true);
      await page.screenshot({ path: path.join(OUT, `report-${w}-${theme}.png`), fullPage: true });
      expect(await page.evaluate(() => document.body.innerText.includes('—'))).toBe(false);
      expect(errors).toEqual([]);
    });
  }
}

test('honest status: the table follows every edit, and a blank input says what it needs', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  const row40 = page.getByTestId('ws-case-table').locator('tbody tr').nth(2); // 20, 30, 40 acres
  await expect(row40).toContainText('1,885.8');
  await expect(page.getByTestId('ws-case-table')).toContainText('NPV (US$ MM)');
  await page.getByTestId('ws-oilPrice').fill('60');
  await expect(row40).not.toContainText('1,885.8');
  await page.getByTestId('ws-porosity').fill('');
  await expect(page.getByTestId('ws-errors')).toContainText('Porosity is required');
  await expect(page.getByTestId('ws-case-table')).toHaveCount(0);
});

test('RL report door: identification typed, the PDF read back', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByTestId('ws-tab-report').click();
  await page.getByLabel('Field', { exact: true }).fill('Ekene');
  await page.getByLabel('Analyst').fill('A. Analyst');
  const pdf = await exportPdf(page, 'ws-sample.pdf');
  expect(pdf.pages).toBeGreaterThanOrEqual(5);
  for (const s of ['Well Spacing Report', 'Ekene', 'A. Analyst', 'Spacing cases', 'Economics of each case, by part', 'Incremental economics', 'Inputs and their sources', 'Drainage geometry, timing and deliverability', 'Cross-checks', 'Methods and references', 'Limits of this analysis', 'Figure 1. EUR and oil produced per well against spacing', 'Figure 2. Field NPV against the number of wells', 'Figure 3. Plan initial rate and deliverable rate against spacing', 'Figure 4. Wells taken from the registry']) {
    expect(pdf.flat).toContain(s);
  }
  expect(pdf.flat).toMatch(/Assumed: the built-in sample value of the app/);
  expect(pdf.flat).toMatch(/1,885.8/);
  expect(pdf.flat).toMatch(/Does not apply: no wells were taken from the registry/);
  expect(pdf.images.length).toBeGreaterThanOrEqual(1); // the Petrolord mark
});

test('PL9 chain: pvt-1, wta-1, mbal-1, dca-forecast-1 and registry wells by id; edited after intake; in the PDF', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByTestId('ws-pick-wta').selectOption({ index: 1 });
  await page.getByTestId('ws-take-wta').click();
  await expect(page.getByTestId('ws-intake-card-wta')).toHaveAttribute('data-status', 'As received');
  await expect(page.getByTestId('ws-permeability')).toHaveValue('182.4');
  await expect(page.getByTestId('ws-reservoirPressure')).toHaveValue('3985');
  await page.getByTestId('ws-pick-pvt').selectOption({ index: 1 });
  await page.getByTestId('ws-take-pvt').click();
  await expect(page.getByTestId('pvt-intake-status')).toHaveText('As received');
  await expect(page.getByTestId('ws-oilGravity')).toHaveValue('40.7');
  await page.getByTestId('ws-pick-mbal').selectOption({ index: 1 });
  await page.getByTestId('ws-take-mbal').click();
  await expect(page.getByTestId('ws-intake-card-mbal')).toContainText('Ekene E-2000');
  await page.getByTestId('ws-pick-dca').selectOption({ index: 1 });
  await page.getByTestId('ws-take-dca').click();
  await expect(page.getByTestId('ws-intake-card-dca')).toHaveAttribute('data-status', 'As received');
  for (const n of ['EK-1', 'EK-2', 'EK-3', 'EK-4']) await page.getByTestId(`ws-well-${n}`).check();
  await page.getByTestId('ws-take-wells').click();
  await expect(page.getByTestId('ws-intake-card-wells')).toContainText('4 wells taken');
  await expect(page.getByTestId('ws-cross-table')).toContainText('4 wells; nearest neighbour 1,320 to 1,320 ft');
  await page.getByTestId('ws-permeability').fill('120');
  await expect(page.getByTestId('ws-intake-card-wta')).toHaveAttribute('data-status', 'Edited after intake');
  const pdf = await exportPdf(page, 'ws-chain.pdf');
  expect(pdf.flat).toMatch(/Input of the fluid model, Fluid Systems Studio, project "Good Oil Well No. 4 PVT"/);
  expect(pdf.flat).toMatch(/at 3985 psia, the stated average reservoir pressure/);
  expect(pdf.flat).toMatch(/Edited in this app after the intake \(received 182.4\)/);
  expect(pdf.flat).toMatch(/Havlena-Odeh regression/);
  expect(pdf.flat).toMatch(/project "Ekene decline" \(Decline Curve Analysis\)/);
  expect(pdf.flat).toMatch(/Figure 4. Wells taken from the registry/);
  expect(pdf.flat).toMatch(/EK-1, EK-2, EK-3, EK-4/);
});

test('PL3 units: SI shows converted values; a decimal typed in SI stays', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page);
  await page.getByTestId('ws-unit-system').click();
  await page.getByRole('option', { name: 'SI' }).click();
  const h = page.getByTestId('ws-avgNetPayThickness');
  await expect(h).toHaveValue('18.288');
  await expect(page.getByTestId('ws-case-table')).toContainText('Spacing (ha/well)');
  await expect(page.getByTestId('ws-case-table')).toContainText('402.3');
  await h.fill('');
  await h.pressSequentially('18.');
  await expect(h).toHaveValue('18.');
  await h.pressSequentially('288');
  await h.blur();
  await expect(h).toHaveValue('18.288');
  await expect(page.getByTestId('ws-case-table').locator('tr').nth(1)).toContainText('1,174.8');
});

// ---- WS-U2 (Step 2) ----

test('WS-U2-001 rate limit: on by default with before and after; the switch off gives the unlimited decline back', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await expect(page.getByTestId('ws-rate-limit-state')).toContainText('The rate limit is on. It binds at 12 of 15 spacings.');
  const row100 = page.getByTestId('ws-rate-limit-table').getByRole('row', { name: /^100 653.4 / });
  await expect(row100).toContainText('2,316.6');
  await expect(row100).toContainText('1,892.6');
  await expect(row100).toContainText('-424.0');
  await expect(page.getByTestId('ws-case-table')).toContainText('1,892.6');
  await page.getByTestId('ws-rateLimit').selectOption('off');
  await expect(page.getByTestId('ws-rate-limit-state')).toContainText('The rate limit is off.');
  await expect(page.getByTestId('ws-case-table')).toContainText('2,316.6');
  await expect(page.getByTestId('ws-case-table')).not.toContainText('1,892.6');
  await page.screenshot({ path: `${OUT}/u2-rate-limit.png`, fullPage: false });
  expect(errors).toEqual([]);
});

test('WS-U2-004 ws-case-1: a spacing case opens in Forecast Scenario Hub as a profile case and in EPE as a file, each with its source', async ({ page }) => {
  test.setTimeout(600000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = watchErrors(page);
  await openApp(page);
  await expect(page.getByTestId('ws-send-refusal')).toContainText('Create or open a project first');
  await page.getByRole('button', { name: 'Create new project' }).first().click();
  await page.getByLabel('Project name').fill('Ekene spacing');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('ws-send-refusal')).toContainText('Choose the case to send', { timeout: 60000 });
  await page.getByTestId('ws-send-spacing').selectOption('80');
  await page.getByTestId('ws-send-start').fill('2027-01-01');
  await expect(page.getByTestId('ws-send-basis')).toContainText('rate-limited at 297.7 STB/d a well for 4.69 years');
  await page.getByTestId('ws-send-hub').click();
  await expect(page).toHaveURL(/\/dev\/forecast-scenario-hub/, { timeout: 60000 });
  await expect(page.getByText('Case comparison')).toBeVisible({ timeout: 240000 });
  const source = page.locator('[data-testid$="-source"]').first();
  await expect(source).toContainText('case 80 acres a well (62 wells, Example field) from 2027-01-01, project "Ekene spacing" (Well Spacing Optimizer)');
  await expect(page.locator('[data-testid$="-source-state"]').first()).toContainText('Unchanged since it was received', { timeout: 60000 });
  await page.screenshot({ path: `${OUT}/u2-004-hub.png` });
  const id = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('harness.saved_well_spacing_projects.v1') || '[]')[0]?.id);
  expect(id).toBeTruthy();
  await page.goto(`/dev/epe/cases/c1?wsProject=${id}`, { timeout: 240000 });
  await expect(page.getByTestId('epe-ws-list')).toContainText('Ekene spacing', { timeout: 120000 });
  await page.getByTestId('epe-ws-import').click();
  await expect(page.getByTestId('epe-ws-provenance')).toContainText('Wells on stream: 62 in year 1', { timeout: 60000 });
  await expect(page.getByTestId('epe-ws-source-state')).toContainText('Unchanged since it was received', { timeout: 60000 });
  await page.screenshot({ path: `${OUT}/u2-004-epe.png` });
  expect(errors).toEqual([]);
});
