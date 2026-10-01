// Pore Pressure Studio upgrade U2 (docs/upgrade/PorePressureStudio-UPGRADE.md,
// Step 2 build) on the /dev harness: casing seats drawn, a hostile calibration
// file imported, resistivity Eaton on the oracle well, the depth frame, the
// semi-log NCT with shale picks, the Bowers crossplot, the PDF plot read back,
// the worked example, and every new view at three viewports in both themes.

import { test, expect } from '@playwright/test';
import path from 'path';
import { execFileSync } from 'child_process';

// the shared 4-CPU box runs several agents: a cold harness load takes 45 to 110 s
test.describe.configure({ timeout: 400000 });

const HOSTILE = path.join(process.cwd(), 'e2e', 'fixtures', 'porepressure', 'hostile');

async function openWell(page, query = '') {
  await page.goto(`/dev/pore-pressure-studio${query}`);
  await expect(page.getByTestId('pp-well-row')).toHaveCount(1, { timeout: 150000 });
  await page.getByTestId('pp-well-row').click();
  await expect(page.getByTestId('pp-prognosis-chart')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('pp-unit-pressure').selectOption('MPa');
  await page.getByTestId('pp-unit-depth').selectOption('m');
}

async function ticksRunDown(scope) {
  const ticks = scope.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value');
  await expect(ticks.first()).toBeVisible();
  const rows = [];
  for (const t of await ticks.all()) {
    const v = Number((await t.textContent()).replace(/,/g, ''));
    const box = await t.boundingBox();
    if (Number.isFinite(v) && box) rows.push({ v, y: box.y });
  }
  rows.sort((a, b) => a.v - b.v);
  expect(rows.length).toBeGreaterThan(2);
  for (let i = 1; i < rows.length; i++) expect(rows[i].y).toBeGreaterThan(rows[i - 1].y);
}

test('U2-003 and U2-011: margins give a casing shoe on the chart and in the PDF plot', async ({ page }) => {
  await openWell(page);
  await page.getByTestId('pp-param-nu').fill('0.25');
  await page.getByTestId('pp-apply-params').click();
  await expect(page.getByTestId('pp-casing-seats')).toHaveAttribute('data-seats', '1');
  await expect(page.getByTestId('pp-casing-seat-0')).toContainText('shoe at least');
  const chart = page.getByTestId('pp-prognosis-chart');
  await expect(chart.locator('.recharts-reference-line')).toHaveCount(1);
  await expect(chart.getByText('Mud weight (PP + trip margin)')).toBeVisible();
  await ticksRunDown(chart);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId('pp-export-pdf').click()]);
  const text = execFileSync('pdftotext', ['-layout', await download.path(), '-'], { encoding: 'utf8' });
  expect(text).toMatch(/Casing seats \(bottom-up from TD/);
  expect(text).toContain('Shoe 1');
  expect(text).toContain('Design FG (FG - kick)');
  expect(text).toContain('Depth (m below mudline)');
});

test('U2-002: a hostile RFT/MDT table (semicolons, comma decimals, TVDSS, psi, nulls) is read and drawn', async ({ page }) => {
  await openWell(page);
  await page.getByTestId('pp-cal-import-open').click();
  await page.getByTestId('pp-cal-import-file').setInputFiles(path.join(HOSTILE, 'rft_mdt_tvdss_psi_semicolon_comma.csv'));
  await expect(page.getByTestId('pp-cal-import-read-summary')).toContainText('6 rows');
  await expect(page.getByTestId('pp-cal-depthref')).toHaveValue('tvdss');
  await expect(page.getByTestId('pp-cal-valueunit')).toHaveValue('psi');
  await expect(page.getByTestId('pp-cal-import-preview')).toHaveAttribute('data-read', '4');
  await expect(page.getByTestId('pp-cal-import-skipped')).toContainText('vendor null');
  await page.getByTestId('pp-cal-import-add').click();
  await expect(page.getByTestId('pp-prognosis-chart')).toHaveAttribute('data-cal', '4');
  await expect(page.getByTestId('pp-note-calibration')).toContainText(/4 points, PP misfit RMS 0\.0\d MPa/);
  await expect(page.getByTestId('pp-prognosis-chart').locator('circle[fill="#e76f51"]')).toHaveCount(4);
});

test('U2-001: resistivity Eaton on the oracle well reads the same pore pressure as sonic', async ({ page }) => {
  await openWell(page);
  await page.getByTestId('pp-readout-depth').fill('3500');
  const sonic = await page.getByTestId('pp-readout-pp').textContent();
  await page.getByTestId('pp-method-eaton-resistivity').click();
  await expect(page.getByTestId('pp-param-eatonnres')).toHaveValue('1.2');
  await page.getByTestId('pp-apply-params').click();
  await expect(page.getByTestId('pp-note-nct')).toContainText('Resistivity trend not fitted');
  await expect(page.getByTestId('pp-readout-pp')).toHaveText(sonic);
  await page.getByTestId('pp-view-nct').click();
  await expect(page.getByTestId('pp-nct-chart')).toHaveAttribute('data-trend', 'res');
});

test('U2-004: TVDSS reads the same sample 100 m deeper and the axis says TVDSS', async ({ page }) => {
  await openWell(page);
  await page.getByTestId('pp-readout-depth').fill('3500');
  const pp = await page.getByTestId('pp-readout-pp').textContent();
  await page.getByTestId('pp-depth-ref').selectOption('tvdss');
  await expect(page.getByTestId('pp-readout-ref')).toHaveText('m TVDSS:');
  await expect(page.getByTestId('pp-readout-depth')).toHaveValue('3600');
  await expect(page.getByTestId('pp-readout-pp')).toHaveText(pp);
  const chart = page.getByTestId('pp-prognosis-chart');
  await expect(chart.getByText('Depth (m TVDSS)')).toBeVisible();
  await ticksRunDown(chart);
});

test('U2-005: semi-log NCT, shale picks on the VSH, a trend break', async ({ page }) => {
  await openWell(page);
  await page.getByTestId('pp-view-nct').click();
  const chart = page.getByTestId('pp-nct-chart');
  await expect(chart).toHaveAttribute('data-log', 'true');
  // a log axis: tick position is linear in log(value) (equal ratios, equal widths)
  const ticks = [];
  for (const t of await chart.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').all()) {
    const v = Number((await t.textContent()).replace(/,/g, ''));
    const box = await t.boundingBox();
    if (v > 0 && box) ticks.push({ v, x: box.x + box.width / 2 });
  }
  ticks.sort((p, q) => p.v - q.v);
  expect(ticks.length).toBeGreaterThanOrEqual(3);
  const k = (ticks[ticks.length - 1].x - ticks[0].x) / Math.log(ticks[ticks.length - 1].v / ticks[0].v);
  for (const t of ticks) expect(Math.abs(t.x - ticks[0].x - k * Math.log(t.v / ticks[0].v))).toBeLessThan(3);
  await page.getByTestId('pp-shale-from').fill('200');
  await page.getByTestId('pp-shale-to').fill('2390');
  await page.getByTestId('pp-shale-every').fill('200');
  await page.getByTestId('pp-auto-pick').click();
  await expect(chart.locator('circle[fill="#e76f51"]')).toHaveCount(11);
  await page.getByTestId('pp-break-depth').fill('1500');
  await page.getByTestId('pp-add-break').click();
  await expect(chart.locator('.recharts-reference-line')).toHaveCount(1);
  await page.getByTestId('pp-fit-nct').click();
  await expect(page.getByTestId('pp-status')).toContainText('NCT fitted: the base trend, the segment from 1500 m');
  await ticksRunDown(chart);
});

test('U2-007: the crossplot draws and sets Bowers unloading', async ({ page }) => {
  await openWell(page);
  await page.getByTestId('pp-view-crossplot').click();
  const chart = page.getByTestId('pp-xp-chart');
  await expect(chart.locator('.recharts-scatter-symbol').first()).toBeVisible();
  expect(await chart.locator('.recharts-scatter-symbol').count()).toBeGreaterThan(100);
  await page.getByTestId('pp-xp-use').click();
  await expect(page.getByTestId('pp-status')).toContainText('Bowers unloading set from the crossplot');
});

test('U2-010: the worked example opens on its well with the banner and the shoe', async ({ page }) => {
  await page.goto('/dev/pore-pressure-studio');
  await page.getByTestId('pp-open-example').click({ timeout: 150000 });
  await expect(page.getByTestId('pp-example-banner')).toBeVisible();
  await expect(page.getByTestId('pp-casing-seats')).toHaveAttribute('data-seats', '1', { timeout: 60000 });
  await expect(page.getByTestId('pp-publish')).toHaveCount(0);
});

for (const vp of [{ w: 1366, h: 768 }, { w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6 U2: ${vp.w}x${vp.h} ${theme}: prognosis with shoe, NCT, crossplot: no page errors, no sideways scroll`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/dev/pore-pressure-studio?example=1');
      if (theme === 'dark') await page.getByTestId('theme-toggle').click();
      await expect(page.getByTestId('pp-prognosis-chart')).toBeVisible({ timeout: 200000 });
      for (const view of ['prognosis', 'nct', 'crossplot']) {
        await page.getByTestId(`pp-view-${view}`).click();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        await page.screenshot({ path: `test-results/pp-u2-${view}-${vp.w}-${theme}.png` });
      }
      expect(errors).toEqual([]);
    });
  }
}
