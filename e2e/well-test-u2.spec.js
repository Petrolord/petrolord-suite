// Well Test Analysis Studio, Reservoir round Step 2 (WTA-U2, 2026-10-04;
// docs/upgrade/WellTestAnalysis-UPGRADE.md). On the /dev harness, signed out:
//
//   U2-010 PL10  a 388,800-reading gauge file is read in a Web Worker: the
//                page's own timer keeps ticking while it reads (no frame gap
//                near the 27 s freeze it had), progress shows, every reading
//                arrives; Cancel stops an import and loads nothing.
//   U2-002       the Match tab's wellbore storage select turns on Hegeman:
//                Ci/C and the change time join the parameters, the Report tab
//                prints both storages.
//   U2-004       a stated gradient corrects p* to the datum on the Report tab
//                and in the PDF; the analysis does not move.
//   U2-003       a gas test with two apparent skins at two rates splits s and D.
//
// Evidence goes under test-results/ only.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUT = 'test-results/well-test-u2';
fs.mkdirSync(OUT, { recursive: true });

async function open(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dev/well-test-analysis-studio');
  await expect(page.getByRole('tab', { name: 'Data' })).toBeVisible({ timeout: 120000 });
}
async function openWithSample(page) {
  await open(page);
  await page.getByRole('button', { name: /Sample/i }).click();
  await expect(page.getByText(/Points used/i)).toBeVisible();
}
async function exportPdf(page, name) {
  await page.getByRole('tab', { name: 'Report' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export PDF report/i }).click();
  const download = await downloadPromise;
  const file = path.join(OUT, name);
  await download.saveAs(file);
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
}

function bigGauge(n = 388800) {
  const lines = ['Time (hr),Pressure (psia)'];
  for (let s = 0; s < n; s += 1) lines.push(`${(s / 3600).toFixed(6)},${(4500 + Math.log1p(s)).toFixed(3)}`);
  return Buffer.from(lines.join('\n'));
}

async function heartbeatImport(page, { noWorker = false } = {}) {
  if (noWorker) await page.addInitScript(() => { delete window.Worker; });
  await open(page);
  // a heartbeat on the page's thread: the largest gap between ticks is the longest freeze
  await page.evaluate(() => {
    window.__beat = { last: performance.now(), maxGap: 0, on: false };
    setInterval(() => {
      const now = performance.now();
      if (window.__beat.on) window.__beat.maxGap = Math.max(window.__beat.maxGap, now - window.__beat.last);
      window.__beat.last = now;
    }, 50);
  });
  const buffer = bigGauge();
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'quartz-1s.csv', mimeType: 'text/csv', buffer });
  // on the page's thread the progress line has no chance to paint
  if (!noWorker) await expect(page.getByTestId('wts-import-progress')).toBeVisible();
  // measured from the moment the worker has the file (handing a 9 MB file to the page is the test's own cost)
  // to its last progress line: the gap is snapshotted each time the line changes, so the
  // analysis of the rows after the import (on the page's thread by design) is reported apart
  await page.evaluate(() => {
    window.__beat.on = true; window.__beat.last = performance.now(); window.__beat.maxGap = 0; window.__beat.atLastProgress = 0;
    const el = document.querySelector('[data-testid="wts-import-progress"]');
    window.__beat.sawPercent = false;
    if (el) {
      new MutationObserver(() => {
        window.__beat.atLastProgress = window.__beat.maxGap;
        if (/percent of/.test(el.textContent || '')) window.__beat.sawPercent = true;
      }).observe(el, { subtree: true, characterData: true, childList: true });
    }
  });
  await expect(page.getByTestId('wts-import-mapping')).toContainText('388800 readings loaded', { timeout: 120000 });
  await expect(page.getByTestId('wts-import-progress')).toBeHidden({ timeout: 120000 });
  const { atLastProgress: during, maxGap: withAnalysis, sawPercent } = await page.evaluate(() => window.__beat);
  return { during, withAnalysis, sawPercent };
}

test('U2-010: 388,800 readings are read in a worker while the page keeps ticking; without the worker it stops (negative control)', async ({ page, browser }) => {
  test.setTimeout(300000);
  const worker = await heartbeatImport(page);
  // the same file on the page's thread, in a fresh page with window.Worker removed: from the
  // file to the loaded mapping the page stops for the whole read
  const ctx = await browser.newContext();
  const bare = await ctx.newPage();
  const noWorker = await heartbeatImport(bare, { noWorker: true });
  await ctx.close();
  fs.writeFileSync(path.join(OUT, 'worker-heartbeat.json'), JSON.stringify({
    worker: { maxGapWhileReadingMs: worker.during, maxGapIncludingTheAnalysisAfterMs: worker.withAnalysis, progressShownInPercent: worker.sawPercent },
    withoutWorker: { maxGapIncludingTheAnalysisAfterMs: noWorker.withAnalysis },
  }, null, 2));
  expect(worker.during, 'longest gap between 50 ms ticks while the worker read').toBeLessThan(500);
  expect(noWorker.withAnalysis).toBeGreaterThan(1000);
  expect(noWorker.withAnalysis).toBeGreaterThan(3 * worker.during);
});

test('U2-010: Cancel stops an import and nothing is loaded', async ({ page }) => {
  test.setTimeout(240000);
  await open(page);
  // twice the size, so a fast runner cannot finish before the click
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'quartz-1s.csv', mimeType: 'text/csv', buffer: bigGauge(777600) });
  await expect(page.getByTestId('wts-import-progress')).toBeVisible();
  await page.getByTestId('wts-import-cancel').click();
  await expect(page.getByText(/Import of quartz-1s\.csv cancelled; nothing was loaded/)).toBeVisible();
  await expect(page.getByTestId('wts-import-mapping')).toHaveCount(0);
});

test('U2-002: Hegeman changing storage from the Match tab, both storages on the Report tab', async ({ page }) => {
  await openWithSample(page);
  await page.getByRole('tab', { name: 'Match' }).click();
  await page.getByTestId('wts-wellbore-model').click();
  await page.getByRole('option', { name: /Changing, Hegeman/ }).click();
  await expect(page.getByTestId('wts-wellbore-note')).toContainText('Hegeman, Hallford and Joseph (1993)');
  await expect(page.getByLabel(/Initial to final storage ratio/)).toBeVisible();
  await expect(page.getByLabel(/Storage change time/)).toBeVisible();
  await expect(page.getByTestId('wts-changing-storage')).toContainText('Initial storage Ci');
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('wts-report-limits')).toContainText('Changing wellbore storage, Hegeman');
  await page.screenshot({ path: path.join(OUT, 'hegeman-report.png') });
});

test('U2-004: a stated gradient corrects p* to the datum; the report says how', async ({ page }) => {
  await openWithSample(page);
  await page.getByLabel('Gauge depth, TVD').fill('9800');
  await page.getByLabel('Depth reference elevation above the datum').fill('100');
  await page.getByLabel('Pressure datum, TVDSS').fill('9900');
  await expect(page.getByTestId('wts-datum-readout')).toContainText('No gradient was stated');
  await page.getByLabel('Gradient, gauge to datum').fill('0.35');
  await page.getByLabel('Source of the gradient').fill('oil column from density');
  await expect(page.getByTestId('wts-datum-readout')).toContainText('Correction to the datum: +70.0 psi');
  const pdf = await exportPdf(page, 'wta-u2-datum.pdf');
  expect(pdf).toMatch(/Gradient, gauge to datum 0\.35 psi\/ft, oil column from density/);
  expect(pdf).toMatch(/Correction to the datum \+70 psi/);
  expect(pdf).toMatch(/p\* at the datum \(psi\)/);
});

test("U2-003: two apparent skins at two rates give s and D on the Specialized tab", async ({ page }) => {
  await openWithSample(page);
  await page.getByLabel('Fluid', { exact: true }).click();
  await page.getByRole('option', { name: /Gas/ }).click();
  await page.getByRole('tab', { name: 'Specialized' }).click();
  const box = page.getByTestId('wts-rate-skin');
  await box.getByRole('button', { name: /Add a rate/ }).click();
  await box.getByRole('button', { name: /Add a rate/ }).click();
  await page.getByLabel('Rate of skin point 1').fill('2000');
  await page.getByLabel('Apparent skin of point 1').fill('3');
  await page.getByLabel('Rate of skin point 2').fill('8000');
  await page.getByLabel('Apparent skin of point 2').fill('6');
  const result = page.getByTestId('wts-rate-skin-result');
  await expect(result).toContainText('5e-4');
  await expect(result).toContainText('s, intercept of the multi-rate line');
});
