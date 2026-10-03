// Risked Reserves Valuation upgrade U1 (practitioner and reviewer lenses,
// 2026-10-02) on the /dev harness, signed out, on the Suite unit profile
// (MMboe, the built-in oilfield preset).
//   chain   a prospect risked in ReservoirCalc Pro's own panel is imported,
//           valued, saved, and its report is downloaded and read back
//           (RL11, RL4, RL1, RL6, RL12, PL7, PL9)
//   saved   the account when it has the table, the browser with a note when
//           it does not, the T1 browser list, a reload (RL12, PL5)
//   handoff a change upstream after a reload, an edit marked, refresh (RL11)
//   door    typing key by key, the unit view, the CSV header (PL11, PL3, RL7)
//   look    three viewports in both themes (PL6)
// Step 2 (2026-10-02): the chain now ends in economics. A prospect risked in
// ReservoirCalc Pro is valued on the derived MEFS (U2-002), takes its value
// per barrel from a Petroleum Economics Studio run picked by id (U2-001),
// shows its tornado (U2-003), and its report is read back with all three;
// "Re-run prospect" goes to ReservoirCalc Pro and back (U2-006).
// Evidence is written under test-results/ only.

import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';

const OUT = 'test-results/risked-reserves-upgrade';
fs.mkdirSync(OUT, { recursive: true });

const open = async (page, query = '') => {
  await page.goto(`/dev/risked-reserves${query}`);
  await expect(page.getByTestId('rrv')).toBeVisible({ timeout: 90000 });
  await expect(page.getByTestId('rrv-save-state')).not.toHaveText(/Checking/);
};
const importAll = async (page) => {
  await expect(page.getByTestId('rrv-import')).toBeEnabled();
  await page.getByTestId('rrv-import').click();
};
const flat = (s) => s.replace(/\s+/g, ' ');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
});

test('chain: risk a prospect in ReservoirCalc Pro, import it, value it, save it, and read its report back', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '?chain=1');
  // the sending side: ReservoirCalc Pro's Prospect Risking panel, seeded by its Monte Carlo run
  const rcp = page.getByTestId('rrv-chain-rcp');
  await expect(rcp.getByTestId('vol-mean')).toHaveValue('44');
  await expect(rcp.getByTestId('pg-total')).toHaveText('23.5%');
  await rcp.getByTestId('prospect-name').fill('Chain North');
  await rcp.getByTestId('prospect-add').click();
  await expect(rcp.locator('[data-prospect-name="Chain North"]')).toBeVisible();

  // the receiving side reads the inventory again at the click
  await importAll(page);
  await expect(page.getByTestId('rrv-row-Chain North')).toBeVisible();
  await expect(page.getByTestId('rrv-note-Chain North')).toContainText('from ReservoirCalc Pro, saved ');
  await expect(page.getByTestId('rrv-pg-Chain North')).toHaveValue('0.2352');
  await expect(page.getByTestId('rrv-p90-Chain North')).toHaveValue('18');
  await expect(page.getByTestId('rrv-p10-Chain North')).toHaveValue('82');
  await page.getByTestId('rrv-row-Chain North').click();
  await expect(page.getByTestId('rrv-handoff-line')).toContainText('ReservoirCalc Pro prospect "Chain North"');
  await expect(page.getByTestId('rrv-handoff-line')).toContainText('The source record is unchanged since.');

  // value it: the MEFS is derived from the economics (U2-002); the value per
  // barrel comes from a Petroleum Economics Studio run picked by id (U2-001)
  await expect(page.getByTestId('rrv-mefs-Chain North')).toHaveAttribute('data-basis', 'derived');
  await page.getByTestId('rrv-tab-economics').click();
  await expect(page.getByTestId('rrv-value-size-chart')).toHaveAttribute('data-series', 'engine,line');
  await page.getByTestId('rrv-epe-pick').click();
  await expect(page.getByTestId('rrv-epe-row-epe-run-3')).toContainText('Cannot be used: This run has no results.');
  await page.getByTestId('rrv-epe-use-epe-run-1').click();
  await expect(page.getByTestId('rrv-value-basis')).toHaveAttribute('data-value', 'epe');
  await expect(page.getByTestId('rrv-unitValue-Chain North')).toHaveValue('12.6667');
  await expect(page.getByTestId('rrv-devCost-Chain North')).toHaveValue('320');
  await expect(page.getByTestId('rrv-mefs-Chain North')).toHaveValue('25.2632');
  await expect(page.getByTestId('rrv-epe-source-now')).toHaveText('The run is unchanged since its value was received.');
  // the tornado (U2-003)
  await page.getByTestId('rrv-tab-sensitivity').click();
  await expect(page.getByTestId('rrv-tornado')).toHaveAttribute('data-bars', '20');
  await expect(page.getByTestId('rrv-tornado').locator('.recharts-bar-rectangle')).toHaveCount(20);
  await page.getByTestId('rrv-tab-valuation').click();
  const emv = await page.getByTestId('rrv-emv-Chain North').textContent();
  const pc = await page.getByTestId('rrv-pc-Chain North').textContent();
  expect(emv).toMatch(/^-?[\d,]+\.\d$/);

  // save: one row on the (in-memory) account
  await expect(page.getByTestId('rrv-save-state')).toContainText('not saved to your account');
  await page.getByTestId('rrv-save').click();
  await expect(page.getByTestId('rrv-save-state')).toHaveText('Saved to your account');
  await expect(page.getByTestId('rrv-saved-Chain North')).toContainText('Petrolord account');

  // the report door
  await page.getByTestId('rrv-tab-report').click();
  await page.getByTestId('rrv-ident-company').fill('Lordsway Energy');
  await page.getByTestId('rrv-ident-licence').fill('OML 143');
  await page.getByTestId('rrv-ident-play').fill('Agbada stacked sands');
  await page.getByTestId('rrv-ident-analyst').fill('A. Analyst');
  await expect(page.getByTestId('rrv-header-Company')).toHaveText('Lordsway Energy');
  // the identification is part of the valuation: typing it makes the valuation unsaved, and Save keeps it
  await expect(page.getByTestId('rrv-header-Valuation saved')).toContainText('later edits are in this browser only');
  await page.getByTestId('rrv-save').click();
  await expect(page.getByTestId('rrv-save-state')).toHaveText('Saved to your account');
  await expect(page.getByTestId('rrv-header-Valuation saved')).toHaveText(/^Petrolord account, \d{4}-\d\d-\d\d \d\d:\d\d UTC$/);
  await expect(page.getByTestId('rrv-report-handoff')).toContainText('seed 777, 20,000 realizations');
  await expect(page.getByTestId('rrv-report-headline')).toContainText(emv);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('rrv-report-pdf').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('risked-valuation_Chain_North.pdf');
  const file = `${OUT}/chain-north.pdf`;
  await download.saveAs(file);
  await expect(page.getByTestId('rrv-status')).toContainText(/Downloaded the report for Chain North: \d+ pages, 5 plots\./);

  const text = flat(execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }));
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file], { encoding: 'utf8' }))[1]);
  expect(pages).toBeGreaterThanOrEqual(5);
  // RL4
  for (const s of ['Risked Prospect Valuation Report', 'Company Lordsway Energy', 'Prospect Chain North', 'Licence or block OML 143', 'Play Agbada stacked sands', 'Analyst A. Analyst', 'Build Petrolord Suite']) expect(text).toContain(s);
  expect(text).toMatch(/Display units Oilfield \(MMboe, \$\/boe, \$MM\)/);
  expect(text).toMatch(/Valuation saved Petrolord account, \d{4}-\d\d-\d\d \d\d:\d\d UTC Build/);
  // RL11: the upstream record, its run and its conventions, written by ReservoirCalc Pro and printed here
  for (const s of ['Source application ReservoirCalc Pro', 'Source record Prospect "Chain North"', 'Volumes sent in MMSTB', 'Volume basis Recoverable (prospective resources), success case',
    'Volumes method Monte Carlo in ReservoirCalc Pro', 'Source project and reservoir Project "Chain Block", reservoir "C-01 sand"',
    'Monte Carlo run 2026-10-02 09:30 UTC, seed 777, 20,000 realizations', 'Edited here after the handoff Nothing: every handed-over input is as received']) expect(text).toContain(s);
  expect(text).toMatch(/P90 is the low case and P10 the high case/);
  // RL1: inputs with unit and source; the derived MEFS and the received value say where they came from
  expect(text).toMatch(/Success-case volume P90 \(low\) 18 MMboe ReservoirCalc Pro prospect "Chain North"/);
  expect(text).toMatch(/MEFS 25\.2632 MMboe Derived: development cost over value per barrel \(D \/ u\)/);
  expect(text).toMatch(/12\.6667 \$\/boe Petroleum Economics Studio run "Base deck, 10%" of case "Ekene North development"/);
  expect(text).toMatch(/Exploration well cost W 25 \$MM Assumed: the starting default of 25 \$MM/);
  // U2-001, RL11: the economics handoff in full
  for (const s of ['Handoff from Petroleum Economics Studio', 'Source record Run "Base deck, 10%" of case "Ekene North development" (epe_runs epe-run-1)',
    'Price deck "Corporate base 2026": oil 72 $/bbl, gas 3.5 $/Mscf, condensate 68 $/bbl', 'Discount rate 10% real, end-year discounting',
    'Engine build Petroleum Economics Studio cash-flow engine 3.12.0', 'NPV per barrel, full cycle 5.55556 $/boe', 'Source record now Unchanged since it was received']) expect(text).toContain(s);
  // U2-002: the economics section and the value by field size, with the case's own size
  expect(text).toContain('Economics: the MEFS and the value of a discovery');
  expect(text).toMatch(/Value at the MEFS 0\.0 \$MM/);
  expect(text).toMatch(/The case 45\.0 250\.0/);
  // U2-003: the sensitivity table
  expect(text).toContain('Sensitivity of the EMV');
  expect(text).toContain('These are stated ranges, chosen by the analyst');
  expect(text).toMatch(/Recovery factor 28 %/);
  // RL2, RL3
  expect(text).toContain('Pg = trap x reservoir x charge x seal = 0.600 x 0.700 x 0.800 x 0.700 = 0.235');
  expect(text).toContain('EMV = Pg x [ u x E(V; V >= MEFS) - D x P(V >= MEFS) ] - W');
  // RL12, PL7: three headline numbers on the page are the numbers on the screen
  expect(text).toContain(`Expected monetary value EMV ${emv} $MM`);
  expect(text).toContain(`Commercial chance Pc ${pc}`);
  expect(text).toContain('Chance of geological success Pg 23.5%');
  // RL6: the plots, with the Petrolord mark embedded
  for (const s of ['Figure 1. Expectation curve of volume', 'Figure 2. Expectation curve of value', 'Figure 3. Value of a discovery against its size', 'Figure 4. Chance factors and the chance of success', 'Figure 5. Sensitivity of the EMV']) expect(text).toContain(s);
  expect(text).not.toContain('Not plotted: this application has no sensitivity analysis');
  const images = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }).split('\n').slice(2).filter((l) => l.trim());
  expect(images.length).toBeGreaterThanOrEqual(1);
  // RL9
  expect(text).toContain('Limits of this analysis');
  expect(text).toContain('Single prospect.');
  expect(errors).toEqual([]);
});

test('saved state: the account, the browser fallback with its note, the T1 browser list, a reload', async ({ page }) => {
  // before the table exists
  await open(page, '?table=off');
  await expect(page.getByTestId('rrv-storage-note')).toContainText('kept in this browser only: saving to your account is not switched on for this database yet');
  await expect(page.getByTestId('rrv-save')).toBeDisabled();
  await importAll(page);
  await page.getByTestId('rrv-mefs-Ekene North').fill('15');
  await page.reload();
  await expect(page.getByTestId('rrv-mefs-Ekene North')).toHaveValue('15', { timeout: 60000 });
  await expect(page.getByTestId('rrv-save-state')).toHaveText('Kept in this browser only');
  // the handoff survives the refresh: the source record is read again by id
  await page.getByTestId('rrv-row-Ekene North').click();
  await expect(page.getByTestId('rrv-handoff-line')).toContainText('ReservoirCalc Pro prospect "Ekene North", saved 2026-10-02 14:05 UTC. The source record is unchanged since.');

  // the table is there: the browser valuations wait for the first save
  await open(page);
  await expect(page.getByTestId('rrv-status')).toContainText('2 valuations kept in this browser are not on your account yet. Save to move them there.');
  await page.getByTestId('rrv-save').click();
  await expect(page.getByTestId('rrv-save-state')).toHaveText('Saved to your account');

  // a valuation already on the account opens from it
  await page.evaluate(() => window.localStorage.clear());
  await open(page, '?saved=1');
  await expect(page.getByTestId('rrv-mefs-Ekene North')).toHaveValue('15');
  await expect(page.getByTestId('rrv-saved-Ekene North')).toHaveText('Petrolord account, 2026-10-02 15:01 UTC');
  await page.getByTestId('rrv-tab-report').click();
  await expect(page.getByTestId('rrv-header-Licence or block')).toHaveText('OML 143');
  await expect(page.getByTestId('rrv-share')).toBeVisible();
});

test('PL5: the list the T1 build kept in the browser opens, with typed economics told from defaults', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem('e2e.rrv.t1')) return;
    window.sessionStorage.setItem('e2e.rrv.t1', '1');
    window.localStorage.setItem('rrv.prospects.v1', JSON.stringify([
      { id: 'rcp-prospect-1', source: 'rcp', rcpId: 'prospect-1', name: 'Ekene North', pg: 0.32, p90: 12, p50: 30, p10: 75, volumeNote: '', basis: 'recoverable', chargeNote: '', mefs: 15, unitValue: 9.5, devCost: 100, wellCost: 25 },
    ]));
  });
  await open(page, '?table=off');
  await expect(page.getByTestId('rrv-status')).toContainText('Opened 1 prospect kept in this browser by the earlier version.');
  await expect(page.getByTestId('rrv-unitValue-Ekene North')).toHaveValue('9.5');
  await expect(page.getByTestId('rrv-upstream-Ekene North')).toContainText('imported before the source record was kept');
  await page.getByTestId('rrv-refresh-Ekene North').click();
  await expect(page.getByTestId('rrv-upstream-Ekene North')).toHaveCount(0);
  await expect(page.getByTestId('rrv-mefs-Ekene North')).toHaveValue('15');
  await page.getByTestId('rrv-tab-report').click();
  await expect(page.getByTestId('rrv-report-inputs')).toContainText('Entered, source not stated');
  await expect(page.getByTestId('rrv-report-inputs')).toContainText('Assumed: the starting default of 100 $MM');
});

test('handoff: an edit is marked, and a change in ReservoirCalc Pro after the valuation is said and refreshed', async ({ page }) => {
  await open(page);
  await importAll(page);
  await page.getByTestId('rrv-p50-Ekene North').fill('34');
  await expect(page.getByTestId('rrv-p50-Ekene North')).toHaveAttribute('data-edited', 'true');
  await expect(page.getByTestId('rrv-note-Ekene North')).toContainText('edited here: P50 (sent 30)');
  await page.getByTestId('rrv-p50-Ekene North').fill('30');
  await expect(page.getByTestId('rrv-p50-Ekene North')).not.toHaveAttribute('data-edited', 'true');

  // ReservoirCalc Pro re-risks Ekene Deep (the harness account acts as the other tab)
  await page.evaluate(async () => {
    const b = window.__rrvHarness;
    const row = (await b.listProspects()).find((r) => r.name === 'Ekene Deep');
    await b.saveProspect({ id: row.id, name: row.name, pgFactors: { ...row.pg_factors, charge: 0.6 }, inputs: row.inputs, risked: { ...row.risked, pg: 0.216 } });
  });
  await page.getByTestId('rrv-import').click();
  await expect(page.getByTestId('rrv-upstream-Ekene Deep')).toContainText('The source prospect changed in ReservoirCalc Pro');
  await expect(page.getByTestId('rrv-upstream-Ekene Deep')).toContainText('(Pg 0.18 to 0.216)');
  await page.getByTestId('rrv-mefs-Ekene Deep').fill('30');
  await page.getByTestId('rrv-refresh-Ekene Deep').click();
  await expect(page.getByTestId('rrv-pg-Ekene Deep')).toHaveValue('0.216');
  await expect(page.getByTestId('rrv-mefs-Ekene Deep')).toHaveValue('30');
  await expect(page.getByTestId('rrv-upstream-Ekene Deep')).toHaveCount(0);
  await expect(page.getByTestId('rrv-status')).toContainText('Refreshed Ekene Deep from ReservoirCalc Pro');
});

test('doors: typing key by key, the unit view, and the CSV with its provenance header', async ({ page }) => {
  await open(page);
  await importAll(page);
  // PL11: a cleared Pg is named, never a zero; "0." stays as typed
  const pg = page.getByTestId('rrv-pg-Ekene North');
  await pg.click();
  await pg.press('Control+a');
  await pg.press('Backspace');
  await expect(pg).toHaveValue('');
  await expect(page.getByTestId('rrv-emv-Ekene North')).toContainText('check inputs');
  await expect(page.getByTestId('rrv-problem')).toContainText('Enter Pg, the geological chance of success');
  await pg.pressSequentially('0.');
  await expect(pg).toHaveValue('0.');
  await pg.pressSequentially('3');
  await expect(page.getByTestId('rrv-pc-Ekene North')).toHaveText(/^\d+\.\d%$/);
  await pg.press('Tab');
  await expect(pg).toHaveValue('0.3');

  // PL3: the profile default is MMboe; the metric view converts values and labels, and no result moves
  await expect(page.getByTestId('rrv-units')).toHaveValue('MMbbl');
  const emv = await page.getByTestId('rrv-emv-Ekene Deep').textContent();
  await page.getByTestId('rrv-units').selectOption('10^6 m3');
  await expect(page.getByTestId('rrv-p90-Ekene Deep')).toHaveValue('6.35949');
  // a value per barrel converts to a value per cubic metre (U2-002: derived from the model, so read before and after)
  await expect(page.getByTestId('rrv-unitValue-Ekene Deep')).toHaveValue(/^\d+(\.\d+)?$/);
  await expect(page.getByTestId('rrv-emv-Ekene Deep')).toHaveText(emv);
  await expect(page.getByTestId('rrv-portfolio')).toContainText('10^6 m3 oe');
  await expect(page.getByTestId('rrv-units-note')).toContainText('your unit profile asks for MMboe');

  // RL1, RL7: the CSV carries its units, conventions and sources
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rrv-csv').click()]);
  const csvFile = `${OUT}/risked-valuation.csv`;
  await dl.saveAs(csvFile);
  const csv = fs.readFileSync(csvFile, 'utf8');
  expect(csv).toMatch(/^# Risked Reserves Valuation, Petrolord Suite\n# Build: Petrolord Suite/);
  expect(csv).toContain('# Units: volumes 10^6 m3 oe (oil equivalent, gas at 6 Mscf per boe); value per barrel $/m3 oe; costs and values $MM');
  expect(csv).toContain('# Percentiles: P90 is the low case and P10 the high case');
  expect(csv).toMatch(/# Ekene Deep: ReservoirCalc Pro prospect "Ekene Deep", saved 2026-10-02 14:20 UTC, sent in MMSTB, basis recoverable/);
  expect(csv).toMatch(/\nprospect,source,pg,p90_mm_m3_oe,/);
  expect(csv).toContain('edited_after_handoff');
  await page.getByTestId('rrv-units').selectOption('MMbbl');
  await expect(page.getByTestId('rrv-p90-Ekene Deep')).toHaveValue('40');
});

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6: ${w} wide, ${theme}: valuation and report hold, the chart is drawn, no page errors, no sideways page scroll`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width: w, height: h });
      await open(page, '?shared=1');
      if (theme === 'dark') {
        await page.getByTestId('rrv-theme-scope').getByRole('button', { name: /theme|dark|light/i }).first().click();
        await expect(page.locator('[data-pl-theme="dark"]').first()).toBeVisible();
      }
      await importAll(page);
      await expect(page.getByTestId('rrv-row-Ekene North')).toBeVisible();
      await page.getByTestId('rrv-row-Ekene North').click();
      const chart = page.getByTestId('rrv-expectation-chart');
      await expect(chart).toBeVisible();
      // the chart is on white paper and holds both curves (the drawn paths, not an empty frame)
      await expect(chart).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(chart.locator('path.recharts-line-curve')).toHaveCount(2);
      const box = await chart.boundingBox();
      expect(box.width).toBeGreaterThan(250);
      expect(box.height).toBeGreaterThan(200);
      await expect(chart.getByTestId('rrv-chart-legend')).toContainText('Unrisked (success case)');
      // the axis title does not sit on the tick labels
      const title = await chart.locator('text', { hasText: 'Chance of at least this volume' }).first().boundingBox();
      const tick = await chart.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value').first().boundingBox();
      expect(title.x + title.width).toBeLessThanOrEqual(tick.x + 1);
      await page.screenshot({ path: `${OUT}/valuation-${w}-${theme}.png` });
      await page.getByTestId('rrv-tab-report').click();
      await expect(page.getByTestId('rrv-report-inputs')).toBeVisible();
      await expect(page.getByTestId('rrv-report-limits')).toContainText('Limits of this analysis');
      await page.screenshot({ path: `${OUT}/report-${w}-${theme}.png` });
      // the page itself never scrolls sideways (the table scrolls inside its card)
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
      // a colleague's shared valuation is listed read-only
      await expect(page.getByTestId('rrv-shared-head')).toContainText('Shared with me (1)');
      await expect(page.getByTestId('rrv-name-Ada Deep (shared)')).toBeDisabled();
      // its source prospect is in the shared inventory as it was received: no false alarm
      await expect(page.getByTestId('rrv-upstream-Ada Deep (shared)')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}

test('U2-002, U2-001: the economic model and a Petroleum Economics Studio run that changes after it was received', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await importAll(page);
  await page.getByTestId('rrv-row-Ekene North').click();
  await page.getByTestId('rrv-tab-economics').click();
  const chart = page.getByTestId('rrv-value-size-chart');
  await expect(chart).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(chart.locator('path.recharts-line-curve')).toHaveCount(2);
  await expect(page.getByTestId('rrv-econ-basis')).toContainText('Value at the MEFS0.0 $MM');
  // a dearer development moves the derived MEFS
  const mefs = await page.getByTestId('rrv-mefs-Ekene North').inputValue();
  await page.getByTestId('rrv-model-capex').fill('600');
  await expect(page.getByTestId('rrv-mefs-Ekene North')).not.toHaveValue(mefs);
  await page.screenshot({ path: `${OUT}/economics-model.png` });
  // take a run, then Petroleum Economics Studio re-runs it on a lower deck (the harness acts as that app)
  await page.getByTestId('rrv-epe-pick').click();
  await page.getByTestId('rrv-epe-use-epe-run-1').click();
  await page.getByTestId('rrv-save').click();
  await expect(page.getByTestId('rrv-save-state')).toHaveText('Saved to your account');
  await page.evaluate(() => window.__rrvHarness._setEpeRun('epe-run-1', (r) => ({ ...r, resultsAt: '2026-10-03T08:00:00.000Z', kpis: { ...r.kpis, npv: 205e6 } })));
  await page.reload();
  await expect(page.getByTestId('rrv')).toBeVisible({ timeout: 90000 });
  // a reload is a new harness account; the browser draft holds the valuation and the run is read again by id
  await expect(page.getByTestId('rrv-unitValue-Ekene North')).toHaveValue('12.6667', { timeout: 60000 });
  await page.getByTestId('rrv-row-Ekene North').click();
  await page.getByTestId('rrv-tab-economics').click();
  await expect(page.getByTestId('rrv-epe')).toHaveAttribute('data-state', /current|changed/);
  await page.screenshot({ path: `${OUT}/economics-epe.png` });
  expect(errors).toEqual([]);
});

test('U2-001: the link from a Petroleum Economics Studio run offers it to the selected prospect', async ({ page }) => {
  await open(page, '?epeRun=epe-run-2');
  await importAll(page);
  await expect(page.getByTestId('rrv-link-note')).toContainText('Petroleum Economics Studio sent run "Low deck, 12%"');
  await expect(page.getByTestId('rrv-epe-offer')).toContainText('9.02222 $/boe before capex, development 310 $MM, 12% real, end-year discounting');
  await page.getByTestId('rrv-epe-offer-use').click();
  await expect(page.getByTestId('rrv-unitValue-Ekene North')).toHaveValue('9.02222');
  await expect(page.getByTestId('rrv-link-note')).toHaveCount(0);
});

test('U2-001: the sending side, a run\'s results page in Petroleum Economics Studio', async ({ page }) => {
  await page.goto('/dev/epe/runs/r1');
  await expect(page.getByTestId('epe-unit-value')).toBeVisible({ timeout: 90000 });
  await expect(page.getByTestId('epe-unit-value-npv-per-boe')).toHaveText('2.74 USD/boe');
  await expect(page.getByTestId('epe-unit-value-u')).toHaveText('18.36 USD/boe');
  await expect(page.getByTestId('epe-unit-value-send')).toHaveAttribute('href', '/dashboard/apps/reservoir/risked-reserves-valuation?epeRun=r1');
  await page.getByTestId('epe-unit-value').screenshot({ path: `${OUT}/epe-sender-card.png` });
});

test('U2-006: Re-run prospect, from the valuation to ReservoirCalc Pro and back', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // the valuation's prospect has in-place volumes (flagged): the link opens ReservoirCalc Pro on it
  await open(page, '?saved=1');
  await page.evaluate(async () => {
    const b = window.__rrvHarness;
    const old = (await b.listProspects()).find((r) => r.name === 'Ekene North');
    await b.saveProspect({ id: old.id, name: old.name, pgFactors: old.pg_factors, inputs: { ...old.inputs, p50: 31 }, risked: old.risked });
  });
  await page.getByTestId('rrv-import').click();
  const link = page.getByTestId('rrv-rerun-Ekene North');
  await expect(link).toHaveAttribute('href', '/dev/reservoircalc-pro?rerunProspect=prospect-1&returnTo=%2Fdev%2Frisked-reserves');
  await link.click();
  // ReservoirCalc Pro: the project, the reservoir, the seed of the run behind it
  const bar = page.getByTestId('rcp-rerun');
  await expect(bar).toHaveAttribute('data-state', 'ready', { timeout: 90000 });
  await expect(page.getByTestId('rcp-rerun-message')).toContainText('Opened project "Ekene Block", reservoir "D-07 sand". The run behind "Ekene North" used seed 123 and 10,000 realizations');
  await expect(page.getByTestId('rcp-project-name')).toHaveText('Ekene Block');
  await expect(page.getByTestId('rcp-mc-seed')).toHaveValue('123');
  await page.screenshot({ path: `${OUT}/rerun-rcp.png` });
  await page.getByTestId('rcp-rerun-open-risking').click();
  await expect(page.getByTestId('prospect-name')).toHaveValue('Ekene North');
  await expect(page.getByTestId('prospect-rerun-note')).toContainText('Add to inventory saves the new record and retires the old one');
  await page.getByTestId('vol-mean').fill('41');
  await page.getByTestId('prospect-add').click();
  await expect(page.getByTestId('prospect-status')).toContainText('The record it replaces was retired');
  await expect(page.getByTestId('prospect-return-link')).toHaveAttribute('href', '/dev/risked-reserves?refresh=prospect-1');
  // back in the valuation (the harness database after that re-run): the valuation takes it
  await open(page, '?rerunDone=1&refresh=prospect-1');
  await expect(page.getByTestId('rrv-link-note')).toContainText('Back from ReservoirCalc Pro: Ekene North now takes the re-run record.');
  await expect(page.getByTestId('rrv-link-note')).toContainText('P90 12 to 14; P50 30 to 34; P10 75 to 80');
  await expect(page.getByTestId('rrv-p90-Ekene North')).toHaveValue('14');
  await expect(page.getByTestId('rrv-mefs-Ekene North')).toHaveValue('15'); // the analyst's own MEFS is kept
  expect(errors).toEqual([]);
});

test('U2-006: a colleague\'s shared prospect opens read-only with the reason', async ({ page }) => {
  await page.goto('/dev/reservoircalc-pro?rerunProspect=prospect-shared&shared=1&returnTo=/dev/risked-reserves');
  await expect(page.getByTestId('rcp-rerun')).toHaveAttribute('data-read-only', 'true', { timeout: 90000 });
  await expect(page.getByTestId('rcp-rerun-readonly')).toContainText('This prospect belongs to a colleague and is shared with you for viewing, so it opens read-only');
});
