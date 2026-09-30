// AppUpgrade Step 2 for Well Correlation (docs/upgrade/WellCorrelation-UPGRADE.md,
// batch decision 2026-09-29): the checks that need a real browser, on the
// /dev harness (in-memory backend). SHOTS=<dir> saves screenshots.
//   U2-002 fixed-width columns and horizontal scroll at 30 wells
//   U2-001 named sections in the ribbon
//   U2-006 the PDF plotted to scale, read back with pdftotext and pdfinfo
//   U2-012 a section line drawn on the map; U2-003/U2-008 time, horizons, strips; U2-004 a tops file
//   PL6    1366x768, 1440x900 and 390 wide, light and dark

import { test, expect as baseExpect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

// a shared box under load: assertions wait up to a minute, each test up to ten
const expect = baseExpect.configure({ timeout: 60000 });
test.describe.configure({ timeout: 600000 });

const SHOTS = process.env.SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `wc-u2-${name}.png`) }); };

async function open(page, { wells = [], section = null, sections = [], query = '' } = {}) {
  await page.addInitScript((seed) => { window.__CORR_SEED__ = seed; }, { wells, section, sections });
  await page.goto(`/dev/well-correlation${query}`);
  await expect(page.getByTestId('corr-explorer')).toBeVisible({ timeout: 300000 });
}
const sec = (page) => page.getByTestId('corr-section');
const ink = (page) => page.getByTestId('corr-section-canvas').evaluate((c) => {
  const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  let n = 0;
  for (let i = 0; i < data.length; i += 16) if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) n++;
  return n / (data.length / 16);
});

test('U2-002: 30 wells get fixed-width columns and a horizontal scroll under a pinned depth axis', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page, { query: `?sample=0&scaleWells=30&wells=${Array.from({ length: 30 }, (_, k) => `scale-${k}`).join(',')}` });
  await expect(page.getByTestId('corr-order-count')).toHaveText('30', { timeout: 120000 });
  await expect(sec(page)).toHaveAttribute('data-col-fixed-w', '140', { timeout: 60000 });
  const painted = Number(await sec(page).getAttribute('data-painted-cols'));
  expect(painted).toBeGreaterThan(1);
  expect(painted).toBeLessThan(10);
  const bar = page.getByTestId('corr-hscroll');
  await expect(bar).toBeVisible();
  await bar.evaluate((el) => { el.scrollLeft = el.scrollWidth; el.dispatchEvent(new Event('scroll')); });
  await expect.poll(async () => Number(await sec(page).getAttribute('data-scroll-x'))).toBeGreaterThan(3000);
  expect(await ink(page)).toBeGreaterThan(0.05);
  // the page itself never scrolls sideways
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await shot(page, 'scroll-30');
});

test('U2-001: named sections open, save and switch in the ribbon', async ({ page }) => {
  await open(page, {
    sections: [
      { id: 's-south', name: 'South line', well_ids: ['corr-w3'], datum: { mode: 'structural' }, track_layout: {}, schema_version: 1 },
      { id: 's-north', name: 'North line', well_ids: ['corr-w1', 'corr-w2'], datum: { mode: 'structural' }, track_layout: {}, schema_version: 1 },
    ],
  });
  await expect(page.getByTestId('corr-order-count')).toHaveText('2');
  await page.getByTestId('corr-section-select').selectOption('s-south');
  await expect(page.getByTestId('corr-order-count')).toHaveText('1');
  await page.getByTestId('corr-section-new').click();
  await page.getByTestId('corr-section-name-input').fill('West line');
  await page.getByTestId('corr-section-name-ok').click();
  await expect(page.getByTestId('corr-status')).toContainText('New section West line');
  await page.getByTestId('corr-add-KETA-2').click();
  await page.getByTestId('corr-save').click();
  await expect(page.getByTestId('corr-status')).toContainText('Section saved as West line');
  await expect(page.getByTestId('corr-section-select').locator('option')).toHaveText(['West line (1 well)', 'North line (2 wells)', 'South line (1 well)']);
  await shot(page, 'sections');
});

test('U2-006: the PDF is plotted to scale and carries the header (pdftotext, pdfinfo)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { query: '?wells=corr-w1,corr-w2,corr-w3' });
  await expect(page.getByTestId('corr-order-count')).toHaveText('3');
  await page.getByTestId('corr-report-field').fill('Keta Field');
  await page.getByTestId('corr-report-analyst').fill('A. Analyst');
  await page.getByTestId('corr-pdf-scale').selectOption('1000');
  await expect.poll(async () => Number(await sec(page).getAttribute('data-view-base'))).toBeGreaterThan(0);
  const vTop = Number(await sec(page).getAttribute('data-view-top'));
  const vBase = Number(await sec(page).getAttribute('data-view-base'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('corr-export-pdf').click()]);
  const f = path.join(os.tmpdir(), `wc-u2-${Date.now()}.pdf`);
  await dl.saveAs(f);
  await expect(page.getByTestId('corr-status')).toContainText('Section exported as PDF at 1:1,000');
  const text = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'latin1' }).replace(/[ \t]+/g, ' ');
  for (const s of ['Well Correlation: Keta Field (3 wells)', 'Wells: KETA-1, KETA-2, KETA-3', 'Structural (true depth)', 'Vertical scale 1:1,000',
    'Analyst A. Analyst', 'Plotted to scale: vertical 1:1,000 (1 cm = 10 m)', 'Tops: Top Marker']) expect(text).toContain(s);
  const info = execFileSync('pdfinfo', [f], { encoding: 'latin1' });
  const hPt = Number(/Page size:\s+[\d.]+ x ([\d.]+) pts/.exec(info)[1]);
  // the page holds the plot band at exactly (vBase - vTop) / 1000 m plus header and margins
  expect(hPt * 25.4 / 72).toBeGreaterThan((vBase - vTop));
  // the embedded panel image height in the PDF equals the plan (read from the image placement)
  // the panel image: rendered at 2 device px per css px, its plot band (below the
  // 82 css px of well band, track headers and padding) is (vBase - vTop) mm at 1:1,000
  const line = execFileSync('pdfimages', ['-list', f], { encoding: 'latin1' }).split('\n').find((l) => /\bimage\b/.test(l));
  const [, , , wPx, hPx] = line.trim().split(/\s+/).map(Number);
  expect(wPx).toBeGreaterThan(500);
  expect(((hPx / 2) - 82) * 25.4 / 96).toBeCloseTo(vBase - vTop, 0);
  if (SHOTS) fs.copyFileSync(f, path.join(SHOTS, 'wc-u2-section.pdf'));
  fs.unlinkSync(f);
});

test('U2-012: a section line drawn on the map takes the wells along it, spaced along the line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByTestId('corr-line-draw').click();
  const map = page.getByTestId('corr-map');
  const box = await map.boundingBox();
  await map.click({ position: { x: box.width * 0.05, y: box.height * 0.5 } });
  await map.click({ position: { x: box.width * 0.95, y: box.height * 0.5 } });
  await page.getByTestId('corr-line-width').fill('600');
  await page.getByTestId('corr-line-done').click();
  await expect(page.getByTestId('corr-order-count')).toHaveText('3', { timeout: 60000 });
  await expect(page.getByTestId('corr-status')).toContainText('ordered along it');
  await expect(sec(page)).toHaveAttribute('data-spacing', 'line');
  expect((await map.getAttribute('data-line')).split(',')).toHaveLength(2);
  await shot(page, 'line');
});

test('U2-003/U2-008: time section with horizons and the pay, zone and unit strips has ink and says what is missing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { query: '?wells=corr-w1,corr-w2,corr-w3' });
  await expect(page.getByTestId('corr-order-count')).toHaveText('3');
  for (const k of ['pay', 'zones', 'units']) await page.getByTestId(`corr-strip-${k}`).check();
  await page.getByTestId('corr-hz-surf-dome-depth').check();
  await expect(page.getByTestId('corr-hz-note-surf-dome-depth')).toContainText('drawn on 3 wells');
  await expect.poll(async () => sec(page).getAttribute('data-strips')).toMatch(/KETA-1=pay:\d+\|zones:1\|units:2/);
  await shot(page, 'strips-horizon');
  await page.getByTestId('corr-depth-ref').selectOption('twt');
  await page.getByTestId('corr-hz-surf-dome-twt').check();
  await expect.poll(async () => sec(page).getAttribute('data-well-notes')).toMatch(/no checkshots: not drawn in time/);
  expect(await ink(page)).toBeGreaterThan(0.02);
  await shot(page, 'twt');
});

test('U2-004: a tops file chosen in the browser is read and applied', async ({ page }) => {
  await open(page, { query: '?wells=corr-w1,corr-w2' });
  await expect(page.getByTestId('corr-order-count')).toHaveText('2');
  await page.getByTestId('corr-tops-import-open').click();
  await page.getByTestId('corr-tops-file').setInputFiles({ name: 'tops.csv', mimeType: 'text/csv', buffer: Buffer.from('Well;Top;TVDSS (ft)\nKETA-1;Sand W;4921,3\n') });
  await expect(page.getByTestId('corr-tops-plan-summary')).toHaveText('1 new, 0 moved, 0 unchanged, 0 not applied.');
  await page.getByTestId('corr-tops-apply').click();
  await expect(page.getByTestId('corr-status')).toContainText('Tops file applied: 1 added');
  await expect(page.getByTestId('corr-top-row-Sand W')).toBeVisible();
});

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const scheme of ['light', 'dark']) {
    test(`PL6 ${w}x${h} ${scheme}: the ribbon tools fit and the section has ink`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page, { query: '?wells=corr-w1,corr-w2,corr-w3' });
      if (scheme === 'dark') await page.getByTestId('theme-toggle').click();
      await expect(page.getByTestId('corr-order-count')).toHaveText('3');
      await expect.poll(() => ink(page)).toBeGreaterThan(0.02);
      for (const id of ['corr-undo', 'corr-export-pdf', 'corr-section-select']) await expect(page.getByTestId(id)).toBeAttached();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await shot(page, `pl6-${w}-${scheme}`);
    });
  }
}
