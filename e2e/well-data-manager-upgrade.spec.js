// AppUpgrade Step 1 for Well Data Manager (docs/upgrade/WellDataManager-UPGRADE.md):
// the practitioner-lens checks that need a real browser. The hostile files
// live in e2e/fixtures/wdm/hostile/ (regenerate with `node generate.mjs`).
//   PL2  hostile imports: bottom-up TDEP, TVDSS index, Petrel export, LAS 3.0 tops
//   PL4  a log delete takes a second click
//   PL6  1366x768, 1440x900 and 390 wide: no page-level horizontal scroll,
//        the log quick view is not blank and its depth axis reads downward
//   PL10 a 150,000-row, 20-curve LAS parses off the main thread

import { test, expect } from '@playwright/test';
import path from 'path';
import { writeFileSync } from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { seedUnitView } from './helpers/unitView.js';
import { bigLas } from './fixtures/wdm/hostile/generate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const H = (f) => path.join(here, 'fixtures', 'wdm', 'hostile', f);

// Since the Suite unit profile (#830) the harness opens in feet (signed out:
// the built-in oilfield preset). The fixtures, typed depths and expected
// values here are metres, so each tab starts on a metric view override.
test.beforeEach(async ({ page }) => { await seedUnitView(page, 'well-data-manager'); });

async function openLas(page, file) {
  await page.getByTestId('wdm-open-las').click();
  await page.getByTestId('wdm-las-file').setInputFiles(H(file));
}

test('PL2: bottom-up TDEP reverses and names its index; TVDSS index refused; Petrel XY offered', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await expect(page.getByTestId('wdm-well-row')).toHaveCount(1);

  await openLas(page, 'las20_tvdss_index.las');
  await expect(page.getByTestId('wdm-las-error')).toContainText('indexed by TVDSS (a vertical depth)');
  await expect(page.getByTestId('wdm-las-summary')).toHaveCount(0);

  await page.getByTestId('wdm-las-file').setInputFiles(H('las20_petrel_export.las'));
  await expect(page.getByTestId('wdm-las-x')).toHaveValue('512345.6');
  await expect(page.getByTestId('wdm-las-y')).toHaveValue('498765.4');
  await expect(page.getByTestId('wdm-las-kb')).toHaveValue('25.3');
  await expect(page.getByTestId('wdm-las-xy-from-file')).toBeVisible();

  await page.getByTestId('wdm-las-file').setInputFiles(H('las20_slb_tdep_upward.las'));
  await expect(page.getByTestId('wdm-las-index-note')).toContainText('Logged bottom-up');
  await expect(page.getByTestId('wdm-las-summary')).toContainText('2133.6–2142.6 m · step 0.152 m · 3 curves');
  await expect(page.getByTestId('wdm-las-td')).toHaveValue('2142.59');
  await page.getByTestId('wdm-las-x').fill('501000');
  await page.getByTestId('wdm-las-y').fill('6700200');
  await page.getByTestId('wdm-las-import').click();
  await expect(page.getByTestId('wdm-detail-name')).toHaveText('SLB TD-3');
  await expect(page.getByTestId('wdm-status-message')).toContainText('Imported 3 curves and the depth index');
  await page.getByTestId('wdm-detail-tab-logs').click();
  const gr = page.locator('[data-testid=wdm-log-row][data-mnemonic="GR"]');
  await expect(gr).toContainText('2133.6 – 2142.6');
  await expect(gr).toContainText('0.152'); // a regular step again, not "irregular"
});

test('PL2: LAS 3.0 Tops block lands as tops with MD, TVD and TVDSS', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await openLas(page, 'las30_tops_strings.las');
  await expect(page.getByTestId('wdm-las-tops-check')).toBeChecked();
  await page.getByTestId('wdm-las-x').fill('501000');
  await page.getByTestId('wdm-las-y').fill('6700200');
  await page.getByTestId('wdm-las-kb').fill('20');
  await page.getByTestId('wdm-las-import').click();
  await expect(page.getByTestId('wdm-status-message')).toContainText('2 tops from the Tops block');
  await page.getByTestId('wdm-detail-tab-tops').click();
  await expect(page.getByTestId('wdm-top-row')).toHaveCount(2);
  await expect(page.getByTestId('wdm-top-tvd-Upper Sand')).toHaveText('1501.0');
  await expect(page.getByTestId('wdm-top-tvdss-Upper Sand')).toHaveText('1481.0');
  await expect(page.getByTestId('wdm-tops-kb-note')).toHaveCount(0);
});

test('PL4: deleting a log asks first', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await openLas(page, 'las20_petrel_export.las');
  await page.getByTestId('wdm-las-import').click();
  await page.getByTestId('wdm-detail-tab-logs').click();
  await expect(page.getByTestId('wdm-log-row')).toHaveCount(5);
  await page.getByTestId('wdm-log-delete-NPHI').click();
  await expect(page.getByTestId('wdm-log-confirm-NPHI')).toContainText('Delete NPHI and its samples?');
  await expect(page.getByTestId('wdm-log-row')).toHaveCount(5);
  await page.getByTestId('wdm-log-delete-yes-NPHI').click();
  await expect(page.getByTestId('wdm-log-row')).toHaveCount(4);
});

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  test(`PL6 at ${w}x${h}: no page scroll; quick view drawn, depth increasing downward`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dev/well-data-manager');
    await openLas(page, 'las20_petrel_export.las');
    await page.getByTestId('wdm-las-import').click();
    await page.getByTestId('wdm-detail-tab-logs').click();
    await page.getByTestId('wdm-plot-GR').check();
    const canvas = page.getByTestId('wdm-log-tracks');
    await expect(canvas).toBeVisible();
    const probe = await canvas.evaluate((c) => {
      const ctx = c.getContext('2d');
      const { width, height } = c;
      const img = ctx.getImageData(0, 0, width, height).data;
      let ink = 0;
      for (let i = 0; i < img.length; i += 4) if (img[i] < 200 || img[i + 1] < 200 || img[i + 2] < 200) ink++;
      return { ink, width, height };
    });
    expect(probe.ink).toBeGreaterThan(500); // a curve, frame and labels, not a blank sheet
    const top = Number(await canvas.getAttribute('data-depth-top'));
    const bottom = Number(await canvas.getAttribute('data-depth-bottom'));
    expect(await canvas.getAttribute('data-depth-axis')).toBe('md');
    expect(top).toBeCloseTo(2000, 1);
    expect(bottom).toBeGreaterThan(top);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scroll).toBeLessThanOrEqual(0);
  });
}

test('PL10: a 150,000-row, 20-curve LAS parses in the worker without freezing the page', async ({ page }) => {
  const big = path.join(os.tmpdir(), 'wdm-upg-big.las');
  writeFileSync(big, bigLas({ rows: 150000, curves: 20 }));
  await page.goto('/dev/well-data-manager');
  await page.getByTestId('wdm-open-las').click();
  await page.evaluate(() => {
    window.__gaps = []; let last = performance.now();
    window.__iv = setInterval(() => { const n = performance.now(); window.__gaps.push(n - last); last = n; }, 50);
  });
  const t0 = Date.now();
  await page.getByTestId('wdm-las-file').setInputFiles(big);
  await expect(page.getByTestId('wdm-las-curve-POTA')).toBeVisible({ timeout: 60000 });
  const ms = Date.now() - t0;
  const maxGap = await page.evaluate(() => { clearInterval(window.__iv); return Math.max(...window.__gaps); });
  console.log(`PL10: 150k rows x 19 curves parsed and previewed in ${ms} ms; longest main-thread gap ${Math.round(maxGap)} ms`);
  expect(maxGap).toBeLessThan(500);
});

test('PL3: LAS door XY typed in metres into a US-feet CRS convert, and the header names the unit', async ({ page }) => {
  await page.goto('/dev/well-data-manager');
  await openLas(page, 'las20_bom_crlf.las'); // a Windows file (BOM + CRLF) with no coordinates
  await expect(page.getByTestId('wdm-las-summary')).toContainText('1 curve');
  await page.getByText('Choose a coordinate reference system').click();
  await page.getByPlaceholder('Search name, EPSG code or region').fill('2274');
  await page.getByTestId('crs-search-results').getByText('EPSG:2274').first().click();
  // the CRS works in US survey feet; the user types metres and says so
  await expect(page.getByTestId('wdm-las-xyunit-note')).toContainText('US survey feet');
  await page.getByTestId('wdm-las-x').fill('600000');
  await page.getByTestId('wdm-las-y').fill('200000');
  await expect(page.getByTestId('wdm-las-xyunit')).toHaveValue('m');
  await page.getByTestId('wdm-las-import').click();
  await expect(page.getByTestId('wdm-detail-name')).toHaveText('WIN-1');
  await page.getByTestId('wdm-detail-tab-header').click();
  await expect(page.getByText('Surface X (ftUS, EPSG:2274)')).toBeVisible();
  // 600,000 m = 1,968,500 US survey feet (1 ftUS = 1200/3937 m); before the fix 600000 was stored as feet
  await expect(page.getByTestId('wdm-detail')).toContainText('1968500.0');
});
