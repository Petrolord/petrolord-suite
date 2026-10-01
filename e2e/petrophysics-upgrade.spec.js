// AppUpgrade PETRO-U1 (practitioner lens) browser checks for Petrophysics
// Studio on the /dev harness: PL6 (three viewports, light and dark, tracks
// and crossplots drawn, depth downward), PL3 (unit toggle converts the
// zone card), PL6/PL7 (every deliverable read back: CSV columns, LAS
// through the Suite's own parser, PDF through pdftotext, PNG header),
// PL4 (published state), PL10 (a 20,000 ft, 30-curve well and a 20-well
// batch, timed). Screens land in test-results/petro-upgrade/ for review.
//
//   E2E_BASE_URL=http://127.0.0.1:8340 npx playwright test e2e/petrophysics-upgrade.spec.js

import { test, expect } from '@playwright/test';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { parseLas } from '../packages/engines/engines/welldata/lasParse.js';
import { seedUnitView } from './helpers/unitView.js';

// Since the Suite unit profile (#830) the harness opens in feet (signed out:
// the built-in oilfield preset). The type well, the goldens and the expected
// values here are metres, so each tab starts on a metric view override; the
// tests that exercise feet switch through the in-app toggle.
test.beforeEach(async ({ page }) => { await seedUnitView(page, 'petrophysics'); });

const SHOTS = 'test-results/petro-upgrade';

async function openKeta(page, query = '') {
  await page.goto(`/dev/petrophysics-studio${query}`);
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();
  await expect(page.getByTestId('petro-zone-net-SAND A')).toBeVisible();
}

/** Fraction of sampled pixels that are not near-white in a canvas. */
const inkOf = (page, testid) => page.getByTestId(testid).evaluate((c) => {
  const ctx = c.getContext('2d');
  const { width: w, height: h } = c;
  const d = ctx.getImageData(0, 0, w, h).data;
  let ink = 0; let n = 0;
  for (let y = 0; y < h; y += 7) {
    for (let x = 0; x < w; x += 7) {
      const i = (y * w + x) * 4;
      n += 1;
      if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) ink += 1;
    }
  }
  return ink / n;
});

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${scheme}: tracks drawn on white, depth downward, zone card with TVT`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await openKeta(page);
      if (scheme === 'dark') {
        await page.getByTestId('theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
      }
      const canvas = page.getByTestId('petro-tracks-canvas');
      await expect(canvas).toBeVisible();
      expect(await inkOf(page, 'petro-tracks-canvas')).toBeGreaterThan(0.05);
      // white chart paper in both themes: the top-left plot corner
      const corner = await canvas.evaluate((c) => Array.from(c.getContext('2d').getImageData(Math.floor(c.width * 0.6), Math.floor(c.height * 0.9), 1, 1).data));
      expect(corner[0] + corner[1] + corner[2]).toBeGreaterThan(600);
      // depth increases downward: the navigator's window top is above its base
      const nav = page.locator('[data-view-top]').first();
      if (await nav.count()) {
        const top = Number(await nav.getAttribute('data-view-top'));
        const base = Number(await nav.getAttribute('data-view-base'));
        expect(base).toBeGreaterThan(top);
      }
      // KETA is deviated: the card carries the true vertical thickness
      if (w >= 1366) {
        await expect(page.getByTestId('petro-zone-tvt-SAND A')).toContainText('TVT');
        await expect(page.getByTestId('petro-zone-netres-SAND A')).toContainText('net res');
      }
      await page.screenshot({ path: `${SHOTS}/tracks-${w}-${scheme}.png` });
      if (w >= 1366) {
        await page.getByTestId('petro-view-crossplot').click();
        const xp = page.locator('canvas').filter({ hasNot: page.getByTestId('petro-tracks-canvas') }).first();
        await expect(xp).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/crossplot-${w}-${scheme}.png` });
      }
    });
  }
}

test('PL3: the depth unit toggle converts the zone card, never relabels it', async ({ page }) => {
  await openKeta(page);
  const m = parseFloat(await page.getByTestId('petro-zone-net-SAND A').innerText());
  await page.getByTestId('petro-depth-unit').click();
  await expect(page.getByTestId('petro-depth-unit')).toContainText('depth: ft');
  await expect.poll(async () => parseFloat(await page.getByTestId('petro-zone-net-SAND A').innerText())).toBeCloseTo(m / 0.3048, 0);
});

test('PL6/PL7: every deliverable opens and reads back', async ({ page }) => {
  await openKeta(page);
  await page.getByTestId('petro-export').click();
  await expect(page.getByTestId('petro-export-dialog')).toBeVisible();
  await page.getByTestId('petro-export-header-company').fill('Lordsway Energy');
  await page.getByTestId('petro-export-header-field').fill('Keta');
  await page.getByTestId('petro-export-header-analyst').fill('A. Tester');
  const grab = async (testid) => {
    const dl = page.waitForEvent('download');
    await page.getByTestId(testid).click();
    return fs.readFileSync(await (await dl).path());
  };

  const zones = (await grab('petro-export-zones')).toString('utf8').split('\n');
  expect(zones[0]).toContain('net_res_m,gross_tvt_m,net_tvt_m,hcpv_m,sw_avg_thickness_wtd');
  const row = zones[1].split(',');
  const cardNet = parseFloat(await page.getByTestId('petro-zone-net-SAND A').innerText());
  expect(Number(row[4])).toBeCloseTo(cardNet, 1);

  const csv = (await grab('petro-export-csv')).toString('utf8');
  expect(csv.split('\n')[0]).toMatch(/PHIE/);

  const las = parseLas((await grab('petro-export-las')).toString('utf8'));
  const mnems = las.curves.map((c) => c.mnemonic);
  for (const k of ['DEPT', 'GR', 'VSH', 'PHIT', 'PHIE', 'SW', 'KPERM', 'PAY']) expect(mnems).toContain(k);
  expect(las.curves.find((c) => c.mnemonic === 'NPHI').unit.toUpperCase()).toBe('V/V');

  const pdfPath = `${SHOTS}/report.pdf`;
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(pdfPath, await grab('petro-export-pdf'));
  const text = execFileSync('pdftotext', ['-layout', pdfPath, '-']).toString('utf8');
  for (const s of ['Lordsway Energy', 'Keta', 'A. Tester', 'KETA TYPE-1', 'KB 30.00 m', 'Porosity: phi shale', 'Net pay TVT', 'pore-volume weighted']) {
    expect(text).toContain(s);
  }
  expect(text).not.toMatch(/Æ|P o r o s i t y/);

  const png = await grab('petro-export-png');
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(png.readUInt32BE(16)).toBeGreaterThan(600); // width, 2x render
  // the header fields are remembered for the next report
  await page.reload();
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();
  await page.getByTestId('petro-export').click();
  await expect(page.getByTestId('petro-export-header-analyst')).toHaveValue('A. Tester');
});

test('PL10: a 20,000 ft well at 0.5 ft with 30 curves, and a 20-well batch', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.__lt = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask', buffered: true });
  });
  await page.goto('/dev/petrophysics-studio?scaleWell=1&extraWells=20');
  await page.locator('[data-well-name="SCALE-20K"]').waitFor();
  await page.evaluate(() => { window.__lt = []; });
  const t0 = Date.now();
  await page.locator('[data-well-name="SCALE-20K"]').click();
  await expect(page.getByTestId('petro-zone-net-WHOLE WELL')).toBeVisible({ timeout: 60000 });
  const openMs = Date.now() - t0;
  const longest = await page.evaluate(() => Math.max(0, ...window.__lt));
  console.log(`PL10 open 40,001 samples x 30 curves: ${openMs} ms, longest main-thread task ${Math.round(longest)} ms`);
  expect(openMs).toBeLessThan(10000);
  expect(await inkOf(page, 'petro-tracks-canvas')).toBeGreaterThan(0.05);

  await page.getByTestId('petro-batch').click();
  await page.getByTestId('petro-batch-all').check();
  const t1 = Date.now();
  await page.getByTestId('petro-batch-run').click();
  await expect(page.getByTestId('petro-batch-result-KETA COPY-20')).toContainText('published', { timeout: 120000 });
  const batchMs = Date.now() - t1;
  console.log(`PL10 batch over ${await page.getByTestId('petro-batch-well').count()} owned wells: ${batchMs} ms`);
  await expect(page.getByTestId('petro-batch-result-SCALE-20K')).toContainText('zone summar');
});
