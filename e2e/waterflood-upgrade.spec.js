// Waterflood Design Studio, Reservoir upgrade round app 6 (WF-U1;
// docs/upgrade/WaterfloodDesignStudio-UPGRADE.md). On the /dev/studio
// harness, signed out, so the unit profile is the built-in oilfield preset.
//
//   PL6  1366x768, 1440x900 and 390 wide, light and dark: every tab, charts
//        on white with the Petrolord mark, no page errors, no sideways page
//        scroll, no em dash.
//   RL   the report door: identification typed on the Report tab, the PDF
//        downloaded and read back with pdftotext, pdfinfo and pdfimages.
//   PL2  hostile surveillance files: day-first with decimal commas and SI
//        headers read to the same totals; an ambiguous file asks.
//   RL11 kr-1 by id (?scalProject=) and pvt-1 by id from seeded SCAL and Fluid
//        projects; the cards say "As received", then "Edited after intake";
//        the report names both sources.
//   PL5  a project saved by an earlier release opens on the endpoint basis.
//
// Evidence goes under test-results/ only.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUT = 'test-results/waterflood-upgrade';
fs.mkdirSync(OUT, { recursive: true });
const FIX = path.join('e2e', 'fixtures', 'waterflood');
const HOSTILE = path.join(FIX, 'hostile');
const SCAL_ROWS = fs.readFileSync(path.join(FIX, 'scal-rows.json'), 'utf8');
const FLUID_ROWS = fs.readFileSync(path.join(FIX, 'fluid-rows.json'), 'utf8');
const SCAL_ID = JSON.parse(SCAL_ROWS)[0].id;
const FLUID_ID = JSON.parse(FLUID_ROWS)[0].id;

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
async function seedProjects(page) {
  await page.addInitScript(({ scal, fluid }) => {
    try {
      window.sessionStorage.setItem('harness.saved_scal_projects.v1', scal);
      window.sessionStorage.setItem('harness.saved_fluid_studio_projects.v1', fluid);
    } catch { /* storage blocked */ }
  }, { scal: SCAL_ROWS, fluid: FLUID_ROWS });
}
async function openApp(page, query = '') {
  await page.goto(`/dev/studio/waterflood${query}`, { timeout: 120000 });
  await expect(page.getByText('Mobility ratio M').first()).toBeVisible({ timeout: 120000 });
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
  await page.getByTestId('wds-export-pdf').click();
  const download = await downloadPromise;
  const file = path.join(OUT, name);
  await download.saveAs(file);
  return { file, name: download.suggestedFilename(), ...readPdfFile(file) };
}
async function importFile(page, name) {
  await tab(page, 'Surveillance').click();
  await openRail(page);
  await page.getByTestId('wds-surveillance-file').setInputFiles(path.join(HOSTILE, name));
}

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${scheme}: every tab, charts on white, no sideways scroll`, async ({ page }) => {
      test.setTimeout(240000);
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page);
      if (scheme === 'dark') {
        await page.getByTestId('theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
      }
      for (const name of ['Displacement', 'Layered Sweep', 'Pattern Forecast', 'Uncertainty', 'Surveillance', 'Scenarios', 'Report']) {
        await tab(page, name).click();
        if (name === 'Surveillance') {
          await openRail(page);
          await page.getByRole('button', { name: 'Sample', exact: true }).click();
          await closeRail(page);
          await expect(page.getByText('Hall Plot Analysis')).toBeVisible();
        }
        await page.waitForTimeout(200);
        expect(await noPageScroll(page), `${name}: sideways page scroll`).toBe(true);
        const frames = page.locator('[data-canvas="chart"]');
        for (let i = 0; i < await frames.count(); i += 1) {
          const f = frames.nth(i);
          expect(await f.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
        }
        expect(await page.locator('body').innerText()).not.toMatch(/—/);
        await page.screenshot({ path: path.join(OUT, `pl6-${w}-${scheme}-${name.replace(/\W+/g, '')}.png`) });
      }
      expect(errors).toEqual([]);
    });
  }
}

test('RL report door: identification, inputs with sources, figures, limits', async ({ page }) => {
  test.setTimeout(240000);
  await openApp(page);
  await tab(page, 'Surveillance').click();
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await tab(page, 'Report').click();
  await page.getByTestId('wds-id-company').fill('Ekene Energy');
  await page.getByTestId('wds-id-field').fill('Ekene');
  await page.getByTestId('wds-id-analyst').fill('A. Engineer');
  const pdf = await exportPdf(page, 'report.pdf');
  expect(pdf.name).toMatch(/^Waterflood_Report_.*\.pdf$/);
  expect(pdf.pages).toBeGreaterThanOrEqual(8);
  for (const s of ['Waterflood Design Report', 'Company Ekene Energy', 'Analyst A. Engineer', 'Inputs and their sources', 'Recovery ER = ED x EA x EV', 'Hall plot slope windows', 'Limits of this analysis', 'Figure 2. Fractional flow with the Welge tangent', 'Hall plot: INJ-1']) {
    expect(pdf.flat).toContain(s);
  }
  expect(pdf.flat).toMatch(/Page 1 of \d+/);
  expect(pdf.images.length).toBeGreaterThan(0); // the Petrolord mark on the plots
});

test('PL2 hostile files: day-first with decimal commas and SI headers give the same totals; ambiguous dates ask', async ({ page }) => {
  test.setTimeout(240000);
  await openApp(page);
  const totals = async () => (await page.getByText('Key Performance Indicators').locator('..').locator('..').innerText());
  await importFile(page, 'base-iso.csv');
  await expect(page.getByTestId('wds-door-readback')).toContainText('80 of 80 rows read');
  const base = await totals();
  await importFile(page, 'dayfirst-semicolon-comma.csv');
  await expect(page.getByTestId('wds-door-readback')).toContainText('day first');
  expect(await totals()).toBe(base);
  await importFile(page, 'si-units.csv');
  await expect(page.getByTestId('wds-door-readback')).toContainText('kPa (from the header)');
  expect(await totals()).toBe(base);
  await importFile(page, 'ambiguous-dates.csv');
  await expect(page.getByTestId('wds-door-question')).toContainText('day first or month first');
  await page.getByRole('button', { name: 'Day first' }).click();
  await expect(page.getByTestId('wds-door-readback')).toContainText('48 of 48 rows read');
  await page.screenshot({ path: path.join(OUT, 'pl2-hostile.png') });
});

test('RL11 kr-1 and pvt-1 by id: cards, edits, the report names both sources', async ({ page }) => {
  test.setTimeout(240000);
  await seedProjects(page);
  await openApp(page, `?scalProject=${SCAL_ID}`);
  await expect(page.getByTestId('kr-intake-card')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('kr-intake-card')).toContainText('Ekene E-2000 SCAL');
  await tab(page, 'Pattern Forecast').click();
  await openRail(page);
  const panel = page.getByTestId('wds-pvt-intake-pattern');
  await panel.getByTestId('wds-fluid-project').selectOption(FLUID_ID);
  await panel.getByTestId('wds-fluid-pressure').fill('2500');
  await panel.getByTestId('wds-fluid-take').click();
  await expect(panel.getByTestId('pvt-intake-status')).toHaveText('As received');
  await page.getByTestId('wds-Bo').fill('1.4');
  await expect(panel.getByTestId('pvt-intake-status')).toHaveText('Edited after intake');
  await closeRail(page);
  const pdf = await exportPdf(page, 'report-intakes.pdf');
  expect(pdf.flat).toMatch(/SCAL Studio kr-1/);
  expect(pdf.flat).toMatch(/Good Oil Well No\. 4 PVT/);
  expect(pdf.flat).toMatch(/Edited in this app after the intake \(received/);
  expect(pdf.flat).toContain('pvt-1 block received from Fluid Systems Studio');
});

test('PL3 SI display: inputs convert, a field takes "7." key by key', async ({ page }) => {
  test.setTimeout(180000);
  await openApp(page);
  await tab(page, 'Pattern Forecast').click();
  await openRail(page);
  await page.getByTestId('wds-unit-system').click();
  await page.getByRole('option', { name: 'SI' }).click();
  await expect(page.getByTestId('wds-h_ft')).toHaveValue('7.62');
  await page.getByTestId('wds-h_ft').fill('');
  await page.getByTestId('wds-h_ft').pressSequentially('7.');
  await expect(page.getByTestId('wds-h_ft')).toHaveValue('7.');
  await page.getByTestId('wds-h_ft').pressSequentially('62');
  await page.getByTestId('wds-h_ft').blur();
  await expect(page.getByTestId('wds-h_ft')).toHaveValue('7.62');
});

test('PL5 a project saved by an earlier release opens on the endpoint basis and says so', async ({ page }) => {
  test.setTimeout(180000);
  await openApp(page, '?saved=1');
  await openRail(page);
  await page.getByRole('combobox', { name: 'Project' }).click();
  await page.getByRole('option', { name: /Saved before October 2026/ }).click();
  await tab(page, 'Pattern Forecast').click();
  await openRail(page);
  await expect(page.getByTestId('wds-mobility-basis')).toContainText('saved before October 2026');
});

// ---- Step 2 (WF-U2; docs/upgrade/WaterfloodDesignStudio-UPGRADE.md section 9) ----
const VRR_ROWS = fs.readFileSync(path.join(FIX, 'vrr-rows.json'), 'utf8');
async function createProject(page, name) {
  await openRail(page);
  await page.getByRole('button', { name: 'Create new project' }).first().click();
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('combobox', { name: 'Project' })).toContainText(name, { timeout: 60000 });
  await closeRail(page);
}

test('U2-001 wf-forecast-1: the pattern forecast opens in Forecast Scenario Hub as a profile case and in EPE as a file, each with its source', async ({ page }) => {
  test.setTimeout(600000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await createProject(page, 'Ekene P-1 flood');
  await tab(page, 'Pattern Forecast').click();
  await openRail(page);
  await expect(page.getByTestId('wds-send-refusal')).toContainText('Set the flood start date');
  await page.getByTestId('wds-flood-start').fill('2027-01-01');
  await expect(page.getByTestId('wds-send-basis')).toContainText("Craig's basis");
  await page.getByTestId('wds-send-hub').click();
  await expect(page).toHaveURL(/\/dev\/forecast-scenario-hub/, { timeout: 60000 });
  await expect(page.getByText('Case comparison')).toBeVisible({ timeout: 240000 });
  await expect(page.locator('[data-testid$="-profile"]').first()).toBeVisible();
  const source = page.locator('[data-testid$="-source"]').first();
  await expect(source).toContainText('five-spot forecast from 2027-01-01, project "Ekene P-1 flood" (Waterflood Design Studio)');
  await expect(page.locator('[data-testid$="-source-state"]').first()).toContainText('Unchanged since it was received', { timeout: 60000 });
  await page.screenshot({ path: path.join(OUT, 'u2-001-hub.png') });
  // Petroleum Economics Studio reads the same saved project by id
  const id = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('harness.saved_waterflood_design_projects.v1') || '[]')[0]?.id);
  expect(id).toBeTruthy();
  await page.goto(`/dev/epe/cases/c1?wfProject=${id}`, { timeout: 240000 });
  await expect(page.getByTestId('epe-wf-list')).toContainText('Ekene P-1 flood', { timeout: 120000 });
  await page.getByTestId('epe-wf-import').click();
  await expect(page.getByTestId('epe-wf-provenance')).toContainText('five-spot forecast from 2027-01-01', { timeout: 60000 });
  await expect(page.getByTestId('epe-wf-source-state')).toContainText('Unchanged since it was received', { timeout: 60000 });
  await page.screenshot({ path: path.join(OUT, 'u2-001-epe.png') });
});

test('U2-002 a staggered line drive: the pattern reaches the forecast and the report', async ({ page }) => {
  test.setTimeout(240000);
  await openApp(page);
  await tab(page, 'Pattern Forecast').click();
  await openRail(page);
  await page.getByTestId('wds-pattern-type-select').selectOption('staggered-line');
  await expect(page.getByTestId('wds-pattern-type')).toContainText('Ahmed eq. 14-67');
  await closeRail(page);
  const pdf = await exportPdf(page, 'report-staggered.pdf');
  expect(pdf.flat).toMatch(/Flood pattern Staggered line/);
  expect(pdf.flat).toMatch(/staggered\b.*line drive pattern forecast/);
  expect(pdf.flat).toContain('Fassihi (1986) regression of the Dyes, Caudle and Erickson (1954) charts');
});

test('U2-003 Hall windows chosen by date and on the plot, with a reason, printed in the report', async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await tab(page, 'Surveillance').click();
  await page.getByRole('button', { name: 'Sample', exact: true }).click();
  await expect(page.getByText('Hall Plot Analysis')).toBeVisible();
  const ed = page.getByTestId('hall-editor-INJ-1');
  await expect(page.getByTestId('hall-INJ-1-apply')).toBeDisabled();
  // the recent window picked on the plot: two points of INJ-1
  await page.getByTestId('hall-INJ-1-recent-pick').click();
  const pts = page.locator('.recharts-scatter').first().locator('.recharts-scatter-symbol');
  await pts.nth(60).click({ force: true });
  await pts.nth(89).click({ force: true });
  await expect(page.getByTestId('hall-INJ-1-recent-from')).toHaveValue('2024-03-01');
  await expect(page.getByTestId('hall-INJ-1-recent-to')).toHaveValue('2024-03-30');
  await page.getByTestId('hall-INJ-1-baseline-from').fill('2024-01-01');
  await page.getByTestId('hall-INJ-1-baseline-to').fill('2024-01-31');
  await page.getByTestId('hall-INJ-1-reason').fill('Before and after the March choke change');
  await page.getByTestId('hall-INJ-1-apply').click();
  await expect(page.getByTestId('hall-windows')).toContainText('Baseline window (chosen 2024-01-01 to 2024-01-31)');
  await expect(ed.getByTestId('hall-choice-INJ-1')).toContainText('Before and after the March choke change');
  await page.screenshot({ path: path.join(OUT, 'u2-003-hall.png') });
  const pdf = await exportPdf(page, 'report-hall-windows.pdf');
  expect(pdf.flat).toContain('Baseline window (chosen 2024-01-01 to 2024-01-31)');
  expect(pdf.flat).toMatch(/Why these .*Windows chosen \d{4}-\d{2}-\d{2}: Before and after the/);
  expect(pdf.flat).toContain('Recent window (chosen 2024-03-01 to 2024-03-30)');
});

test('U2-004 vrr-ledger-1: the history from a VRR Monitor project by id, with "changed since"', async ({ page }) => {
  test.setTimeout(240000);
  await page.addInitScript((rows) => { try { window.sessionStorage.setItem('harness.saved_vrr_projects.v1', rows); } catch { /* blocked */ } }, VRR_ROWS);
  await openApp(page);
  await tab(page, 'Surveillance').click();
  await openRail(page);
  await page.getByTestId('wds-from-vrr').click();
  await expect(page.getByTestId('wds-vrr-list')).toContainText('Ekene VRR ledger');
  await page.getByTestId('wds-vrr-list').getByRole('button', { name: 'Use' }).click();
  await expect(page.getByTestId('wds-door-readback')).toContainText('read by id');
  await expect(page.getByTestId('wds-door-readback')).toContainText('6 months (2025-01 to 2025-06)');
  await expect(page.getByTestId('wds-vrr-state')).toContainText('Unchanged since it was taken', { timeout: 60000 });
  await closeRail(page);
  await expect(page.getByText('Key Performance Indicators')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'u2-004-vrr.png') });
});

test('U2-005 and U2-014: a seeded Monte Carlo in SI, the seed printed', async ({ page }) => {
  test.setTimeout(300000);
  await openApp(page);
  await tab(page, 'Pattern Forecast').click();
  await openRail(page);
  await page.getByTestId('wds-unit-system').click();
  await page.getByRole('option', { name: 'SI' }).click();
  await tab(page, 'Uncertainty').click();
  await openRail(page);
  await page.getByRole('switch', { name: /Vary Pattern area/ }).click();
  await expect(page.getByText('Pattern area (ha)')).toBeVisible();
  await expect(page.getByTestId('wds-mc-area_acres-mode')).toHaveValue('16.18743');
  await page.getByTestId('wds-mc-seed').fill('20261004');
  await page.getByRole('button', { name: 'Run' }).click();
  await closeRail(page);
  await expect(page.getByTestId('wds-mc-seed-used')).toContainText('Seed 20261004 (as entered)', { timeout: 120000 });
  await page.screenshot({ path: path.join(OUT, 'u2-005-mc.png') });
});
