// AppUpgrade PETRO-U2 (Step 2 batches) browser checks for Petrophysics
// Studio on the /dev harness: every new door at 1366x768, 1440x900 and 390
// wide in light and dark (no horizontal page scroll at 390, charts on white
// paper), and the deliverables read back (PDF through pdftotext and
// pdfimages). Screens land in test-results/petro-u2/ for review.
//
//   E2E_BASE_URL=http://127.0.0.1:8340 npx playwright test e2e/petrophysics-u2.spec.js

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const SHOTS = process.env.PETRO_SHOTS || 'test-results/petro-u2';
const HOSTILE = 'e2e/fixtures/petro/hostile';
fs.mkdirSync(SHOTS, { recursive: true });

async function openKeta(page, query = '') {
  await page.goto(`/dev/petrophysics-studio${query}`);
  await page.locator('[data-well-name="KETA TYPE-1"]').click();
  await expect(page.getByTestId('petro-curve-inventory')).toBeVisible();
  await expect(page.getByTestId('petro-zone-net-SAND A')).toBeAttached();
}

const noPageScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function setScheme(page, scheme) {
  if (scheme !== 'dark') return;
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-pl-active-theme', 'dark');
}

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${scheme}: sensitivity, input units and zone import doors`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await openKeta(page);
      await setScheme(page, scheme);
      expect(await noPageScroll(page)).toBe(true);
      // U2-005: three sweeps on white paper, each with its current cutoff
      await page.getByTestId('petro-sensitivity-open').click();
      await expect(page.getByTestId('petro-sensitivity-dialog')).toBeVisible();
      for (const k of ['cutPhi', 'cutVsh', 'cutSw']) {
        const chart = page.getByTestId(`petro-sensitivity-chart-${k}`);
        await expect(chart).toBeVisible();
        await expect(page.getByTestId(`petro-sensitivity-chart-${k}-current`)).toBeAttached();
        const pts = await chart.locator('polyline[data-series="net_m"]').getAttribute('points');
        expect(pts.split(' ').length).toBeGreaterThan(10);
        const bg = await chart.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(bg).toBe('rgb(255, 255, 255)');
      }
      expect(await noPageScroll(page)).toBe(true);
      await page.screenshot({ path: `${SHOTS}/sensitivity-${w}-${scheme}.png` });
      await page.keyboard.press('Escape');
      // U2-001: the input units table
      await page.getByTestId('petro-input-units-open').click();
      await expect(page.getByTestId('petro-input-units-row-RHOB')).toBeVisible();
      expect(await noPageScroll(page)).toBe(true);
      await page.screenshot({ path: `${SHOTS}/input-units-${w}-${scheme}.png` });
      await page.keyboard.press('Escape');
      // U2-004: the import door
      await page.getByTestId('petro-zone-mode-import').scrollIntoViewIfNeeded();
      await page.getByTestId('petro-zone-mode-import').click();
      await expect(page.getByTestId('petro-zone-import-text')).toBeVisible();
      expect(await noPageScroll(page)).toBe(true);
    });
  }
}

test('U2-002: parameters typed in us/ft and degF, stored in SI, an exact round trip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKeta(page);
  await page.getByTestId('petro-param-units-field').click();
  await expect(page.getByTestId('petro-param-dtMa')).toHaveValue('55.4736');
  await expect(page.getByTestId('petro-params')).toContainText('Δt matrix (µs/ft)');
  // Apply stays off: nothing changed
  await expect(page.getByTestId('petro-params-apply')).toBeDisabled();
  await page.getByTestId('petro-param-dtMa').fill('55.5');
  await page.getByTestId('petro-params-apply').click();
  await page.getByTestId('petro-param-units-si').click();
  await expect(page.getByTestId('petro-param-dtMa')).toHaveValue(String(Number((55.5 / 0.3048).toPrecision(12))));
  await page.getByTestId('petro-param-units-field').click();
  await expect(page.getByTestId('petro-param-dtMa')).toHaveValue('55.5');
  await page.screenshot({ path: `${SHOTS}/param-units-field.png` });
});

test('U2-004: a Techlog zonation file and a pasted one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKeta(page);
  await page.getByTestId('petro-zone-mode-import').click();
  await page.getByTestId('petro-zone-import-file').setInputFiles(path.join(HOSTILE, 'zones_techlog_export_ft.csv'));
  await expect(page.getByTestId('petro-zone-import-summary')).toContainText('depths in ft MD from the header');
  await expect(page.getByTestId('petro-zone-import-preview')).toContainText('Outside the logged interval');
  await page.getByTestId('petro-zone-import-text').fill('Well;Zone;Top MD (m);Base MD (m)\nKETA TYPE-1;SAND U2;2031,5;2045,0\nOTHER;X;1;2\n');
  await expect(page.getByTestId('petro-zone-import-summary')).toContainText('Read 1 zone, 1 row skipped');
  await page.screenshot({ path: `${SHOTS}/zone-import.png` });
  await page.getByTestId('petro-zone-import-apply').click();
  await expect(page.getByTestId('petro-zone-net-SAND U2')).toBeAttached({ timeout: 15000 });
  await expect(page.getByTestId('petro-status')).toContainText('Created 1 zone from the pasted zonation');
});

test('U2-003 + U2-005: the PDF carries the sensitivity table and a log plot page per zone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKeta(page);
  await page.getByTestId('petro-export').click();
  await expect(page.getByTestId('petro-export-cpi-note')).toContainText('1 page');
  await page.getByTestId('petro-export-header-company').fill('Lordsway Energy');
  const dl = page.waitForEvent('download');
  await page.getByTestId('petro-export-pdf').click();
  const pdfPath = `${SHOTS}/report-u2.pdf`;
  fs.writeFileSync(pdfPath, fs.readFileSync(await (await dl).path()));
  const text = execFileSync('pdftotext', ['-layout', pdfPath, '-']).toString('utf8');
  expect(text).toContain('Cutoff sensitivity');
  expect(text).toMatch(/\*0\.08: /);
  const pages = text.split('\f');
  const cpiNo = pages.findIndex((p) => p.includes('Log plot (CPI): SAND A')) + 1;
  expect(cpiNo).toBeGreaterThan(0);
  expect(pages[cpiNo - 1]).toContain('Lordsway Energy');
  // the track picture on that page, at the 2x page render (1520 x 2000)
  const list = execFileSync('pdfimages', ['-list', pdfPath]).toString('utf8').split('\n').slice(2).filter(Boolean);
  const img = list.map((l) => l.trim().split(/\s+/)).find((c) => Number(c[0]) === cpiNo && Number(c[3]) === 1520);
  expect(img).toBeTruthy();
  // and it is not blank: extract it and look at its size
  const outDir = fs.mkdtempSync(path.join(SHOTS, 'img-'));
  execFileSync('pdfimages', ['-png', '-f', String(cpiNo), '-l', String(cpiNo), pdfPath, path.join(outDir, 'p')]);
  const biggest = Math.max(...fs.readdirSync(outDir).map((f) => fs.statSync(path.join(outDir, f)).size));
  expect(biggest).toBeGreaterThan(30000);
  // from the crossplot view the report says why the pages are missing
  await page.keyboard.press('Escape');
  await page.getByTestId('petro-view-crossplot').click();
  await page.getByTestId('petro-export').click();
  await expect(page.getByTestId('petro-export-cpi-note')).toContainText('Open the Tracks or Split view first');
});

test('U2-007 + U2-010: core calibration and saturation-height on white paper', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKeta(page);
  await page.getByTestId('petro-core').click();
  await expect(page.getByTestId('petro-core-found')).toContainText('CPOR, CKH');
  expect(await page.getByTestId('petro-core-plug').count()).toBeGreaterThan(5);
  expect(await page.getByTestId('petro-core-crossplot').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.screenshot({ path: `${SHOTS}/core-dialog.png` });
  await page.getByTestId('petro-core-tracks').click();
  await expect(page.getByTestId('petro-status')).toContainText('Core calibration layout is active');
  await page.screenshot({ path: `${SHOTS}/core-tracks.png` });
  await page.getByTestId('petro-shm').click();
  await expect(page.getByTestId('petro-shm-fwl')).toHaveValue('2060');
  await page.getByTestId('petro-shm-run').click();
  await expect(page.getByTestId('petro-shm-row-SAND A')).toContainText('0.');
  await page.screenshot({ path: `${SHOTS}/shm-dialog.png` });
  await page.getByTestId('petro-shm-tracks').click();
  await expect(page.getByTestId('petro-status')).toContainText('saturation-height layout is active');
  await page.screenshot({ path: `${SHOTS}/shm-tracks.png` });
});

test('U2-011: 100 draws on the 20,000 ft well, timed', async ({ page }) => {
  test.setTimeout(600000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dev/petrophysics-studio?scaleWell=1');
  await page.locator('[data-well-name="SCALE-20K"]').click();
  await expect(page.getByTestId('petro-zone-net-WHOLE WELL')).toBeAttached({ timeout: 120000 });
  await page.getByTestId('petro-probabilistic').click();
  await page.getByTestId('petro-prob-n').selectOption('100');
  const t0 = Date.now();
  await page.getByTestId('petro-prob-run').click();
  await expect(page.getByTestId('petro-status')).toContainText('Probabilistic run done: 100 realisations', { timeout: 480000 });
  const ms = Date.now() - t0;
  const cores = await page.evaluate(() => navigator.hardwareConcurrency);
  console.log(`U2-011 probabilistic 100 draws x 40,001 samples: ${ms} ms on ${cores} cores; status: ${await page.getByTestId('petro-status').innerText()}`);
  await expect(page.getByTestId('petro-prob-hcpv-WHOLE WELL-p50')).not.toHaveText('n/a');
  // the programme target is under 10 s; the gate by default is the Step 1
  // baseline (53.5 s, PETRO-U1-033) so a regression fails. On a quiet
  // machine run with PETRO_TIMING_BUDGET_MS=10000 to check the target.
  expect(ms).toBeLessThan(Number(process.env.PETRO_TIMING_BUDGET_MS || 53500));
});
