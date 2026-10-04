// Reservoir Simulation Studio upgrade, Step 1 (SIM-U1), on the /dev harness:
// in-memory Supabase and a stand-in for the OPM Flow worker that completes
// runs with summaries the worker really built (OPM Flow 2026.04, with the PRT
// diagnostics). Checks: three viewports in both themes with the report tab;
// the exported PDF read back; the builder form kept across tabs and cases;
// the Fluid and SCAL intakes by id into the deck; the hostile deck door.
// Writes only under test-results/.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUT = 'test-results/simulation-upgrade';
fs.mkdirSync(OUT, { recursive: true });
const HOSTILE = path.join('e2e', 'fixtures', 'simulation', 'hostile');
const WF = path.join('e2e', 'fixtures', 'waterflood');
const SCAL_ROWS = fs.readFileSync(path.join(WF, 'scal-rows.json'), 'utf8');
const FLUID_ROWS = fs.readFileSync(path.join(WF, 'fluid-rows.json'), 'utf8');
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

async function openApp(page, query = '') {
  await page.goto(`/dev/reservoir-simulation-studio${query}`, { timeout: 120000 });
  await expect(tab(page, 'Deck')).toBeVisible({ timeout: 120000 });
}
async function newCase(page, name) {
  await openRail(page);
  await page.getByTitle(/Create new/i).first().click({ timeout: 60000 });
  await page.getByRole('dialog').getByRole('textbox').first().fill(name);
  await page.getByRole('dialog').getByRole('button', { name: /^Create case$/ }).click();
  await expect(page.getByText(`Case "${name}" created`)).toBeVisible();
  await closeRail(page);
}
async function runSpe1(page, name = 'SPE1 check') {
  await newCase(page, name);
  await tab(page, 'Deck').click();
  await page.getByRole('button', { name: 'Use template' }).first().click();
  await expect(page.getByTestId('deck-editor')).toContainText('SPE1', { timeout: 20000 });
  await tab(page, 'Runs').click();
  await page.getByTestId('queue-run').click();
  await expect(page.getByText('complete', { exact: true })).toBeVisible({ timeout: 30000 });
}
function readPdfFile(file) {
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  return { text, flat: text.replace(/\s+/g, ' '), pages: Number(/Pages:\s+(\d+)/.exec(info)[1]) };
}

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${scheme}: runs, results on white, the report tab`, async ({ page }) => {
      test.setTimeout(240000);
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page);
      if (scheme === 'dark') {
        await page.getByTestId('theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
      }
      await runSpe1(page);
      for (const name of ['Deck', 'Builder', 'Runs', 'Results', 'Report']) {
        await tab(page, name).click();
        await page.waitForTimeout(300);
        expect(await noPageScroll(page), `${name}: sideways page scroll`).toBe(true);
        const frames = page.locator('[data-canvas="chart"]');
        for (let i = 0; i < await frames.count(); i += 1) {
          const f = frames.nth(i);
          expect(await f.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
        }
        expect(await page.locator('body').innerText()).not.toMatch(/—/);
        await page.screenshot({ path: path.join(OUT, `pl6-${w}-${scheme}-${name}.png`) });
      }
      await expect(page.getByTestId('report-mb-text')).toContainText('The balance closes at report step 120');
      await expect(page.getByTestId('report-convergence')).toContainText('313 (wasted 0)');
      await expect(page.getByTestId('report-provenance')).toContainText('vps-sim-worker-1');
      await tab(page, 'Results').click();
      await expect(page.getByTestId('sim-run-status')).toContainText('Material balance closes');
      expect(errors).toEqual([]);
    });
  }
}

test('RL: the exported PDF carries the balance, convergence, provenance and figures', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await runSpe1(page, 'SPE1 report');
  await tab(page, 'Report').click();
  const p = page.waitForEvent('download');
  await page.getByTestId('report-export').click();
  const d = await p;
  const file = path.join(OUT, 'spe1-report.pdf');
  await d.saveAs(file);
  expect(d.suggestedFilename()).toBe('Simulation_Report_SPE1_report.pdf');
  const pdf = readPdfFile(file);
  expect(pdf.pages).toBeGreaterThanOrEqual(5);
  expect(pdf.flat).toMatch(/Reservoir Simulation Report/);
  expect(pdf.flat).toMatch(/Case SPE1 report/);
  expect(pdf.flat).toMatch(/The balance closes at report step 120/);
  expect(pdf.flat).toMatch(/Newton iterations 313 \(wasted 0\)/);
  expect(pdf.flat).toMatch(/OPM Flow 2026\.04/);
  expect(pdf.flat).toMatch(/Figure 1\. Field production rates/);
  expect(pdf.flat).toMatch(/Figure 6\. History match: observed against simulated Does not apply/);
  // the CSV: units row and provenance lines
  const c = page.waitForEvent('download');
  await page.getByTestId('report-csv').click();
  const csvFile = path.join(OUT, 'spe1-results.csv');
  await (await c).saveAs(csvFile);
  const csv = fs.readFileSync(csvFile, 'utf8').split('\n');
  expect(csv[0]).toMatch(/^# Reservoir Simulation Studio results: case "SPE1 report"/);
  const header = csv.findIndex((l) => l.startsWith('date,days,'));
  expect(csv[header + 1]).toMatch(/^,days,STB\/d,Mscf\/STB/);
  expect(errors).toEqual([]);
});

test('PL5: the builder form is kept across tabs and cases (saved with the case)', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newCase(page, 'Form A');
  await tab(page, 'Builder').click();
  const title = page.locator('[data-testid="sim-builder"] input').nth(5);   // after the five identification fields
  await title.fill('KEEP ME');
  await expect(page.getByTestId('sim-form-save')).toHaveAttribute('data-state', 'saved', { timeout: 10000 });
  await tab(page, 'Runs').click();
  await tab(page, 'Builder').click();
  await expect(page.locator('[data-testid="sim-builder"] input').nth(5)).toHaveValue('KEEP ME');
  await newCase(page, 'Form B');
  await tab(page, 'Builder').click();
  await expect(page.locator('[data-testid="sim-builder"] input').nth(5)).toHaveValue('My first simulation model');
  // back to the first case: its saved form
  await openRail(page);
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Form A' }).click();
  await closeRail(page);
  await expect(page.locator('[data-testid="sim-builder"] input').nth(5)).toHaveValue('KEEP ME', { timeout: 10000 });
  expect(errors).toEqual([]);
});

test('RL11: PVT from Fluid Systems Studio and curves from SCAL Studio, by id, into the deck', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.addInitScript(({ scal, fluid }) => {
    try {
      window.sessionStorage.setItem('harness.saved_scal_projects.v1', scal);
      window.sessionStorage.setItem('harness.saved_fluid_studio_projects.v1', fluid);
    } catch { /* storage blocked */ }
  }, { scal: SCAL_ROWS, fluid: FLUID_ROWS });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, `?fluidProject=${FLUID_ID}&scalProject=${SCAL_ID}`);
  await newCase(page, 'Intakes');
  await tab(page, 'Builder').click();
  await expect(page.getByTestId('sim-fluid-project')).toHaveValue(FLUID_ID);
  await page.getByTestId('sim-fluid-take').click();
  await expect(page.getByTestId('pvt-intake-card').first()).toContainText('Good Oil Well No. 4 PVT');
  await expect(page.getByTestId('sim-pvt-source')).toHaveValue('fluid');
  await expect(page.getByTestId('sim-scal-project')).toHaveValue(SCAL_ID);
  await page.getByTestId('sim-scal-take').click();
  await expect(page.getByTestId('kr-intake-card')).toBeVisible();
  await expect(page.getByTestId('sim-kr-source')).toHaveValue('scal');
  await page.getByTestId('generate-deck').click();
  await expect(page.getByText(/Model generated \(Pb/)).toBeVisible({ timeout: 20000 });
  await tab(page, 'Deck').click();
  const deck = page.getByTestId('deck-editor');
  await expect(deck).toContainText('-- PVT (PVTO, PVDG, PVTW, DENSITY oil and gas): pvt-1 from Fluid Systems Studio project "Good Oil Well No. 4 PVT"');
  await expect(deck).toContainText('-- SWOF, SGOF: kr-1 from SCAL Studio project');
  await expect(deck).toContainText("RPTSCHED\n  'RESTART=0' 'FIP=1' 'WELLS=1' /");
  expect(errors).toEqual([]);
});

test('PL2: the deck door refuses two main decks and embedded Python, and reads a CRLF deck back', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newCase(page, 'Hostile');
  await tab(page, 'Deck').click();
  const input = page.getByTestId('deck-file-input');
  await input.setInputFiles([path.join(HOSTILE, 'A.DATA'), path.join(HOSTILE, 'B.DATA')]);
  await expect(page.getByTestId('deck-read-back')).toContainText('2 main deck files were picked (A.DATA, B.DATA)');
  await input.setInputFiles(path.join(HOSTILE, 'pyaction.DATA'));
  await expect(page.getByTestId('deck-read-back')).toContainText('PYACTION (embedded Python)');
  await input.setInputFiles(path.join(HOSTILE, 'spe1-crlf-lowercase.data'));
  await expect(page.getByTestId('deck-read-back')).toContainText('Main deck: spe1-crlf-lowercase.data, FIELD units, 10 x 10 x 3 grid, 2 wells.');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- Step 2 --

test('U2-002 sim-forecast-1: a completed run opens in Forecast Scenario Hub as a profile case and in EPE as a file, each with its source', async ({ page }) => {
  test.setTimeout(600000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await runSpe1(page, 'SPE1 send');
  await tab(page, 'Results').click();
  await expect(page.getByTestId('sim-send-basis')).toContainText('The deck is FIELD: no conversion; oil from FOPR, every time step; no water rate in the summary', { timeout: 60000 });
  // the SPE1 deck has no history phase: the prediction choice is off
  await expect(page.getByTestId('sim-send-phase-prediction')).toBeDisabled();
  await page.waitForTimeout(1200); // the harness copies the runs to the tab session
  await page.getByTestId('sim-send-hub').click();
  await expect(page).toHaveURL(/\/dev\/forecast-scenario-hub/, { timeout: 60000 });
  await expect(page.getByText('Case comparison')).toBeVisible({ timeout: 240000 });
  await expect(page.locator('[data-testid$="-profile"]').first()).toBeVisible({ timeout: 60000 });
  const source = page.locator('[data-testid$="-source"]').first();
  await expect(source).toContainText('of case "SPE1 send" (Reservoir Simulation Studio), the whole run from 2015-01-01');
  await expect(page.locator('[data-testid$="-source-state"]').first()).toContainText('Unchanged since it was received', { timeout: 60000 });
  await page.screenshot({ path: path.join(OUT, 'u2-002-hub.png') });
  // Petroleum Economics Studio reads the same run by id
  const ids = await page.evaluate(() => {
    const s = JSON.parse(window.sessionStorage.getItem('harness.sim_cases_runs.v1') || '{}');
    const run = (s.sim_runs || []).find((r) => r.status === 'complete');
    return { caseId: run?.case_id, runId: run?.id };
  });
  expect(ids.runId).toBeTruthy();
  await page.goto(`/dev/epe/cases/c1?simCase=${ids.caseId}&simRun=${ids.runId}&simPhase=run`, { timeout: 240000 });
  await expect(page.getByTestId('epe-sim-list')).toContainText('SPE1 send', { timeout: 120000 });
  await page.getByTestId('epe-sim-import').click();
  await expect(page.getByTestId('epe-sim-provenance')).toContainText('of case "SPE1 send" (Reservoir Simulation Studio)', { timeout: 60000 });
  await expect(page.getByTestId('epe-sim-provenance')).toContainText('no gas rate in the run');
  await expect(page.getByTestId('epe-sim-source-state')).toContainText('Unchanged since it was received', { timeout: 60000 });
  await page.screenshot({ path: path.join(OUT, 'u2-002-epe.png') });
  expect(errors).toEqual([]);
});

const BHP_CSV = [
  'date, well, oil (STB/d), water (STB/d), gas (Mscf/d), bhp (psia)',
  '2025-01-01, PROD1, 2000, 0, 1600, 3600', '2025-01-01, INJ1, , 2500, , 4700',
  '2025-02-01, PROD1, 2000, 0, 1600, 3450', '2025-02-01, INJ1, , 2500, , 4750',
  '2025-03-01, PROD1, 1900, 20, 1520, 3330', '2025-03-01, INJ1, , 2500, ,',
  '2025-04-01, PROD1, 1800, 40, 1440, 3260', '2025-04-01, INJ1, , 2500, , 4800',
  '2025-05-01, PROD1, 1800, 60, 1440,', '2025-05-01, INJ1, , 2500, ,',
  '2025-06-01, PROD1, 1700, 80, 1360, 3180', '2025-06-01, INJ1, , 2500, , 4820',
].join('\n');

test('U2-001 BHP history match: observed pressures through the per-well door, WBHPH in the deck, the mismatch in the report and the PDF', async ({ page }) => {
  test.setTimeout(400000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newCase(page, 'BHP match');
  await tab(page, 'Builder').click();
  await page.getByTestId('history-enabled').check();
  await page.getByTestId('history-source').selectOption('perwell');
  await page.getByTestId('history-csv').fill(BHP_CSV);
  await page.getByTestId('history-csv-import').click();
  await expect(page.getByTestId('history-read-back')).toContainText('written as the observed BHP of the period (WBHPH)');
  await expect(page.getByTestId('history-well-summary')).toContainText('PROD1');
  await page.getByTestId('generate-deck').click();
  await expect(page.getByText(/Model generated \(Pb/)).toBeVisible({ timeout: 20000 });
  await tab(page, 'Deck').click();
  await expect(page.getByTestId('deck-editor')).toContainText("'PROD1' 'OPEN' 'ORAT' 2000 0 1600 3* 3600 /");
  await expect(page.getByTestId('deck-editor')).toContainText('WBHPH');
  await tab(page, 'Runs').click();
  await page.getByTestId('queue-run').click();
  await expect(page.getByText('complete', { exact: true })).toBeVisible({ timeout: 30000 });
  await tab(page, 'Report').click();
  await expect(page.getByTestId('report-bhp')).toContainText('All wells', { timeout: 30000 });
  await expect(page.getByTestId('report-bhp-text')).toContainText(/RMS mismatch [\d,.]+ psia over 9 points in 2 wells/);
  // the builder form that made the deck knows the observed periods; the run's WBHPH is checked against it
  await expect(page.getByTestId('report-bhp-text')).toContainText("the run's WBHPH equals it at all 15 time steps (the simulator read the pressures as written)");
  await page.screenshot({ path: path.join(OUT, 'u2-001-report.png'), fullPage: false });
  const p = page.waitForEvent('download');
  await page.getByTestId('report-export').click();
  const file = path.join(OUT, 'bhp-report.pdf');
  await (await p).saveAs(file);
  const pdf = readPdfFile(file);
  expect(pdf.flat).toMatch(/Bottomhole pressure match \(history phase\)/);
  expect(pdf.flat).toMatch(/Figure 7\. Bottomhole pressure match/);
  expect(errors).toEqual([]);
});

test('U2-005 run compare: two runs of a case overlaid on the calendar, the difference table, in the report', async ({ page }) => {
  test.setTimeout(400000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await runSpe1(page, 'Compare');
  // a second run of the same deck
  await page.getByTestId('queue-run').click();
  await expect(page.getByText('complete', { exact: true })).toHaveCount(2, { timeout: 30000 });
  await tab(page, 'Results').click();
  const picks = page.getByTestId('sim-compare-picks').locator('input[type="checkbox"]');
  await expect(picks).toHaveCount(2, { timeout: 30000 });
  await expect(page.getByTestId('sim-compare-why')).toContainText('Pick two or more completed runs');
  await picks.nth(0).check();
  await picks.nth(1).check();
  const table = page.getByTestId('sim-compare-table');
  await expect(table).toContainText('Cumulative oil produced', { timeout: 30000 });
  await expect(table).toContainText('the same deck as the base');
  await page.getByTestId('sim-compare-vector').selectOption('FPR');
  await page.screenshot({ path: path.join(OUT, 'u2-005-results.png'), fullPage: true });
  expect(await noPageScroll(page)).toBe(true);
  await tab(page, 'Report').click();
  await expect(page.getByTestId('report-compare')).toContainText('Difference');
  const p = page.waitForEvent('download');
  await page.getByTestId('report-export').click();
  const file = path.join(OUT, 'compare-report.pdf');
  await (await p).saveAs(file);
  const pdf = readPdfFile(file);
  expect(pdf.flat).toMatch(/Run comparison/);
  expect(pdf.flat).toMatch(/Figure \d+\. Run comparison/);
  expect(errors).toEqual([]);
});

test('U2-003 three-phase oil kr: Stone II chosen in the builder reaches the deck and the report', async ({ page }) => {
  test.setTimeout(300000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await newCase(page, 'Stone II');
  await tab(page, 'Builder').click();
  await page.getByTestId('sim-three-phase').selectOption('stone2');
  await page.getByTestId('generate-deck').click();
  await expect(page.getByText(/Model generated \(Pb/)).toBeVisible({ timeout: 20000 });
  await tab(page, 'Deck').click();
  await expect(page.getByTestId('deck-editor')).toContainText('-- Three-phase oil kr: STONE2 (Stone 1973, the second model), chosen in the deck builder');
  await expect(page.getByTestId('deck-editor')).toContainText('\nSTONE2\n');
  await tab(page, 'Runs').click();
  await page.getByTestId('queue-run').click();
  await expect(page.getByText('complete', { exact: true })).toBeVisible({ timeout: 30000 });
  await tab(page, 'Report').click();
  await expect(page.getByTestId('report-deck')).toContainText("STONE2: Stone's second model (Stone 1973, STONE2), as the deck asks");
  await expect(page.getByTestId('report-inputs')).toContainText('Three-phase oil kr model');
  expect(errors).toEqual([]);
});

test('U2-004 aquifer: a Carter-Tracy aquifer taken by id from a Material Balance case, in the deck, the run and the report', async ({ page }) => {
  test.setTimeout(400000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, '?mbal=1&mbalAquifer=case-dake-9-2');
  await newCase(page, 'Aquifer');
  await tab(page, 'Builder').click();
  await page.getByTestId('sim-aquifer-enabled').check();
  await expect(page.getByTestId('sim-aquifer-case')).toHaveValue('case-dake-9-2');
  await page.getByTestId('sim-aquifer-take').click();
  await expect(page.getByTestId('sim-aquifer-source')).toContainText('Dake Exercise 9.2 (water drive)');
  await expect(page.getByTestId('sim-aquifer-model')).toHaveValue('carter_tracy');
  await expect(page.getByTestId('sim-aquifer-k_md')).toHaveValue('200');
  await expect(page.getByTestId('sim-aquifer-reD')).toHaveValue('5');
  await page.getByTestId('generate-deck').click();
  await expect(page.getByText(/Model generated \(Pb/)).toBeVisible({ timeout: 20000 });
  await tab(page, 'Deck').click();
  const deck = page.getByTestId('deck-editor');
  await expect(deck).toContainText('-- Aquifer source: mbal-1 from Material Balance Studio case "Dake Exercise 9.2 (water drive)"');
  await expect(deck).toContainText('AQUTAB');
  await expect(deck).toContainText("AQUANCON\n  1 1 1 1 10 1 3 'I-' /");
  await tab(page, 'Runs').click();
  await page.getByTestId('queue-run').click();
  await expect(page.getByText('complete', { exact: true })).toBeVisible({ timeout: 30000 });
  await tab(page, 'Results').click();
  await expect(page.getByText('AAQT: Aquifer cumulative influx')).toBeVisible({ timeout: 30000 });
  await tab(page, 'Report').click();
  await expect(page.getByTestId('report-inputs')).toContainText('Aquifer permeability k');
  await expect(page.getByTestId('report-inputs')).toContainText('mbal-1 from Material Balance Studio case "Dake Exercise 9.2 (water drive)"');
  const p = page.waitForEvent('download');
  await page.getByTestId('report-export').click();
  const file = path.join(OUT, 'aquifer-report.pdf');
  await (await p).saveAs(file);
  const pdf = readPdfFile(file);
  expect(pdf.flat).toMatch(/Aquifer influx and pressure/);
  expect(pdf.flat).toMatch(/Dake's Exercise 9\.2 aquifer: OPM Flow's influx and the Material Balance engine's agree within 1 percent/);
  expect(errors).toEqual([]);
});
