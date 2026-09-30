// AppUpgrade Step 1 for Well Correlation (docs/upgrade/WellCorrelation-UPGRADE.md):
// the practitioner-lens checks that need a real browser, on the /dev harness.
// The evidence kit lives in e2e/fixtures/wc (regenerate with
// `node e2e/fixtures/wc/generate.mjs`); hostile wells and saved sections reach
// the harness through window.__CORR_SEED__ before the page loads.
//   PL2/PL3 hostile wells: US-feet and UTM wells, no KB, no survey, bottom-up
//   PL5     one saved section per release, a deleted well, a newer build
//   PL6     1366x768, 1440x900 and 390 wide, light and dark: no page scroll,
//           the section has ink, depth increases downward
//   PL7     the PNG carries a three-line header band (read back from the file)
//   PL10    30 and 50 wells of ten curves each
// SHOTS=<dir> saves screenshots for the review.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(here, 'fixtures', 'wc');
const hostile = JSON.parse(fs.readFileSync(path.join(FIX, 'hostile', 'wells.json'), 'utf8'));
const saved = (f) => JSON.parse(fs.readFileSync(path.join(FIX, 'saved', f), 'utf8'));
const SHOTS = process.env.SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `wc-u1-${name}.png`) }); };

async function open(page, { wells = [], section = null, query = '' } = {}) {
  await page.addInitScript((seed) => { window.__CORR_SEED__ = seed; }, { wells, section });
  await page.goto(`/dev/well-correlation${query}`);
  await expect(page.getByTestId('corr-explorer')).toBeVisible({ timeout: 60000 });
}
const notes = async (page) => Object.fromEntries((await page.getByTestId('corr-section').getAttribute('data-well-notes'))
  .split(';').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));

/** Share of non-white pixels in the section canvas (a blank section is 0). */
const ink = (page) => page.getByTestId('corr-section-canvas').evaluate((c) => {
  const ctx = c.getContext('2d');
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let n = 0;
  for (let i = 0; i < data.length; i += 16) if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) n++;
  return n / (data.length / 16);
});

test('PL2/PL3: hostile wells say how their depth was drawn; spacing by distance honours the CRS', async ({ page }) => {
  await open(page, { wells: hostile, query: '?sample=0&wells=hw-g1-upward,hw-ft-a,hw-ft-b,hw-utm,hw-nokb,hw-nosurvey,hw-case' });
  await expect(page.getByTestId('corr-section-canvas')).toBeVisible();
  await expect(page.getByTestId('corr-map-frames')).toContainText('Mixed coordinate systems');
  await page.getByTestId('corr-depth-ref').selectOption('tvdss');
  await expect.poll(async () => (await notes(page))['IDU 7']).toContain('no KB: TVDSS = TVD');
  const n = await notes(page);
  expect(n['IDU 9']).toContain('no survey: vertical');
  // the G1-era bottom-up well is read top-down and drawn in TVDSS (it used to fall back to MD)
  expect(n['BONGA G1-UP']).toContain('stored bottom-up: read top-down');
  expect(n['BONGA G1-UP']).not.toContain('not monotonic');

  // mixed CRSs: spacing by distance stays equal, says why, and every column is on the canvas
  await page.getByTestId('corr-spacing').selectOption('proportional');
  await expect(page.getByTestId('corr-status')).toContainText('Spacing by distance is off: the wells are in different coordinate systems');
  const sec = page.getByTestId('corr-section');
  await expect(sec).toHaveAttribute('data-spacing', 'equal');
  const box = await page.getByTestId('corr-section-canvas').boundingBox();
  const xs = (await sec.getAttribute('data-col-x')).split(',').map(Number);
  const ws = (await sec.getAttribute('data-col-w')).split(',').map(Number);
  expect(xs).toHaveLength(7);
  // U2-002: seven wells no longer squeeze into the window; columns past the right
  // edge are reached with the horizontal scrollbar (never lost without one)
  if (Number(await sec.getAttribute('data-max-scroll')) > 0) {
    await expect(page.getByTestId('corr-hscroll')).toBeVisible();
    expect(ws.every((w) => w === 140)).toBe(true);
  } else xs.forEach((x, i) => expect(x + ws[i]).toBeLessThanOrEqual(box.width + 1));
  await shot(page, 'hostile-tvdss');

  // one frame in US survey feet: spacing by distance is drawn
  for (const name of ['BONGA G1-UP', 'OKAN PX-4', 'IDU 7', 'IDU 9', 'IDU 11']) await page.getByTestId(`corr-remove-${name}`).click();
  await expect(page.getByTestId('corr-order-count')).toHaveText('2');
  await expect(sec).toHaveAttribute('data-spacing', 'proportional');
});

test('PL5: saved sections from each release open; a gone well and a newer build are handled', async ({ page, context }) => {
  for (const f of ['section-g3-2026-07-13.json', 'section-wc2-2026-09-03.json', 'section-st2-2026-09-06.json']) {
    const p = await context.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await open(p, { section: saved(f) });
    await expect(p.getByTestId('corr-status')).toContainText('Restored saved section');
    await expect(p.getByTestId('corr-order-count')).toHaveText('3');
    await expect(p.getByTestId('corr-section-canvas')).toBeVisible();
    expect(await ink(p)).toBeGreaterThan(0.02);
    expect(errors).toEqual([]);
    if (f.startsWith('section-wc2')) {
      await expect(p.getByTestId('corr-depth-status')).toContainText('depth ft · TVDSS · My GR and RT');
      await expect(p.getByTestId('corr-section')).toHaveAttribute('data-spacing', 'proportional');
    }
    if (f.startsWith('section-st2')) {
      await expect(p.getByTestId('corr-section')).toHaveAttribute('data-datum-mode', 'stretch');
    }
    await expect(p.getByTestId('corr-unsaved')).toHaveCount(0);
    await p.close();
  }

  await open(page, { section: saved('section-missing-well.json') });
  await expect(page.getByTestId('corr-status')).toContainText('1 of its 3 wells is no longer in your registry');
  await expect(page.getByTestId('corr-order-count')).toHaveText('2');

  const p2 = await context.newPage();
  await open(p2, { section: saved('section-newer-build.json') });
  await expect(p2.getByTestId('corr-status')).toContainText('newer version of Petrolord');
  await expect(p2.getByTestId(/^corr-add-/)).toHaveCount(3);
  await p2.getByTestId('corr-save').click();
  await expect(p2.getByTestId('corr-status')).toContainText('Section not saved');
});

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6 at ${w}x${h} ${theme}: no page scroll, section drawn, depth downward`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page, { query: '?wells=corr-w1,corr-w2,corr-w3' });
      if (theme === 'dark') await page.getByTestId('theme-toggle').click();
      await expect(page.getByTestId('corr-section-canvas')).toBeVisible();
      await expect.poll(() => ink(page)).toBeGreaterThan(0.02);
      const sec = page.getByTestId('corr-section');
      expect(Number(await sec.getAttribute('data-view-top'))).toBeLessThan(Number(await sec.getAttribute('data-view-base')));
      // the log paper stays white in both themes
      const bg = await page.getByTestId('corr-section-canvas').evaluate((c) => Array.from(c.getContext('2d').getImageData(c.width - 80, c.height - 3, 1, 1).data));
      expect(bg.slice(0, 3).every((v) => v > 240)).toBe(true);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw).toBeLessThanOrEqual(w);
      await shot(page, `${w}-${theme}`);
    });
  }
}

test('PL7: the PNG header band holds the title and three caption lines', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, { query: '?wells=corr-w1,corr-w2,corr-w3' });
  await expect(page.getByTestId('corr-section-canvas')).toBeVisible();
  await page.getByTestId('corr-report-field').fill('Keta Field');
  await page.getByTestId('corr-report-analyst').fill('A. Analyst');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('corr-export-png').click()]);
  const buf = fs.readFileSync(await dl.path());
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  const pngW = buf.readUInt32BE(16);
  const pngH = buf.readUInt32BE(20);
  const { cw, ch, dpr } = await page.getByTestId('corr-section-canvas').evaluate((c) => ({ cw: c.width, ch: c.height, dpr: window.devicePixelRatio || 1 }));
  expect(pngW).toBe(cw);
  expect(pngH).toBe(ch + Math.round((34 + 14 * 3) * dpr));
  await expect(page.getByTestId('corr-status')).toContainText('with its header');
});

for (const n of [30, 50]) {
  test(`PL10: ${n} wells of ten curves open and pan`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const ids = Array.from({ length: n }, (_, k) => `scale-${k}`).join(',');
    const t0 = Date.now();
    await open(page, { query: `?sample=0&scaleWells=${n}&wells=${ids}` });
    await expect(page.getByTestId('corr-order-count')).toHaveText(String(n), { timeout: 120000 });
    await expect(page.getByTestId('corr-section-canvas')).toBeVisible();
    await expect.poll(() => ink(page), { timeout: 60000 }).toBeGreaterThan(0.02);
    const openMs = Date.now() - t0;
    // one wheel zoom and a pan, timed on the main thread
    const box = await page.getByTestId('corr-section-canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const t1 = Date.now();
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => Number(await page.getByTestId('corr-section').getAttribute('data-view-base'))).toBeLessThan(3000);
    const zoomMs = Date.now() - t1;
    const colW = (await page.getByTestId('corr-section').getAttribute('data-col-w')).split(',').map(Number);
    console.log(`PL10 ${n} wells: open ${openMs} ms, zoom ${zoomMs} ms, column width ${colW[0]} px`);
    await shot(page, `scale-${n}`);
    expect(openMs).toBeLessThan(90000);
  });
}
