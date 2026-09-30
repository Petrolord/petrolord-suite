// Mapping & Surface Studio upgrade Step 1 (MAP-U1, 2026-09-30) in a real
// browser: every saved release opens (PL5), the hostile Petrel CPS-3
// imports (PL2), a TVD map publishes as an attribute (MAP-U1-002), a
// US-feet frame gives the metre GRV (MAP-U1-001), three viewports in
// light and dark have ink and no page scroll (PL6), the PNG carries the
// reviewer header (PL7), and 500 / 2,000 wells grid (PL10).
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SAVED = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'e2e/fixtures/map/saved/surfaces.json'), 'utf8'));
const HOSTILE = path.join(process.cwd(), 'e2e/fixtures/map/hostile');
const SHOTS = process.env.MAP_SHOTS || '/tmp/claude-0/map-upg';

const seed = (page) => page.addInitScript((s) => { window.__MAP_SEED__ = s; }, SAVED);
const errorsOf = (page) => { const errs = []; page.on('pageerror', (e) => errs.push(e.message)); return errs; };
const gridTopDome = async (page) => {
  await page.getByTestId('map-source').selectOption('top:Top Dome');
  await page.getByTestId('map-cell').fill('150');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Gridded', { timeout: 120000 });
};
/** Fraction of canvas pixels that differ from the corner: 0 = blank. */
const inkOf = (page) => page.getByTestId('map-canvas').evaluate((c) => {
  const ctx = c.getContext('2d');
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const [r0, g0, b0] = data;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) if (Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) > 30) n += 1;
  return n / (data.length / 16);
});

test('PL5: every saved release opens on this build', async ({ page }) => {
  const errs = errorsOf(page);
  await seed(page);
  await page.goto('/dev/mapping-surface-studio');
  for (const s of SAVED.surfaces) {
    await page.locator(`[data-testid="map-surface-row"][data-surface-name="${s.row.name}"]`).click();
    await expect(page.getByTestId('map-status')).toContainText(`${s.row.name}:`);
    await expect(page.getByTestId('map-status')).toContainText('live nodes');
    expect(await inkOf(page)).toBeGreaterThan(0.05);
  }
  expect(errs).toEqual([]);
});

test('MAP-U1-001: a US-feet frame and a metre frame of one dome give one GRV', async ({ page }) => {
  await seed(page);
  await page.goto('/dev/mapping-surface-studio');
  await page.getByTestId('map-depth-unit').click(); // metres
  const grvOf = async (name) => {
    await page.locator(`[data-testid="map-surface-row"][data-surface-name="${name}"]`).click();
    await expect(page.getByTestId('map-status')).toContainText('live nodes');
    await page.getByTestId('map-grv-contact').fill('-1540');
    await page.getByTestId('map-grv-run').click();
    const t = await page.getByTestId('map-grv-result').textContent();
    return { t, v: Number(t.match(/\(([\d.,]+) million m³\)/)[1].replace(/,/g, '')) };
  };
  const m = await grvOf('T1 Top Dome structure');
  const ft = await grvOf('U1 state plane structure');
  expect(ft.t).toContain('US survey feet');
  expect(ft.v).toBeCloseTo(m.v, 1);
});

test('PL2 and MAP-U1-003: a Petrel CPS-3 imports through the dialog and says what it skipped', async ({ page }) => {
  await page.goto('/dev/mapping-surface-studio');
  await page.getByTestId('map-import').click();
  await page.getByTestId('map-import-file').setInputFiles(path.join(HOSTILE, 'petrel_cps3_depth_m.cps'));
  await expect(page.getByTestId('map-import-notes')).toContainText('Petrel name line');
  await page.getByTestId('map-import-unit').selectOption('m');
  await page.getByTestId('map-import-run').click();
  await expect(page.getByTestId('map-status')).toContainText('Imported');
  await page.getByTestId('map-import').click();
  await page.getByTestId('map-import-file').setInputFiles(path.join(HOSTILE, 'xyz_depth_ft_first.csv'));
  await expect(page.getByTestId('map-import-notes')).toContainText('Z = Depth (ft)');
  await expect(page.getByTestId('map-import-unit')).toHaveValue('ft');
});

test('MAP-U1-002: a TVD top map publishes as an attribute', async ({ page }) => {
  await page.goto('/dev/mapping-surface-studio');
  await page.getByTestId('map-source').selectOption('top:Top Dome');
  await page.getByTestId('map-depth-ref').selectOption('tvd');
  await page.getByTestId('map-grid-run').click();
  await expect(page.getByTestId('map-status')).toContainText('TVD below KB, m, an attribute');
  await page.getByTestId('map-publish').click();
  const row = page.locator('[data-testid="map-surface-row"][data-surface-name="Top Dome TVD (below KB, m)"]');
  await expect(row.getByTestId('map-row-badge')).toContainText('attr');
});

test('PL7: the PNG carries the reviewer header', async ({ page }) => {
  await page.goto('/dev/mapping-surface-studio');
  await gridTopDome(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('map-export-png').click()]);
  const file = path.join(SHOTS, 'u1-export.png');
  await download.saveAs(file);
  const buf = fs.readFileSync(file);
  expect(buf.slice(1, 4).toString()).toBe('PNG');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const box = await page.getByTestId('map-canvas').boundingBox();
  // three caption lines: the band is (34 + 3 x 14) css px at 2x over the map
  expect(h - Math.round(box.height) * 2).toBeGreaterThanOrEqual((34 + 3 * 14) * 2 - 2);
  expect(w).toBe(Math.round(box.width) * 2);
});

for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6: ${w}x${h} ${theme}: the map has ink, the page does not scroll sideways`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const errs = errorsOf(page);
      await page.goto('/dev/mapping-surface-studio');
      if (theme === 'dark') await page.getByRole('button', { name: /Switch to dark theme/ }).click();
      await gridTopDome(page);
      expect(await inkOf(page)).toBeGreaterThan(0.2);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(1);
      await page.screenshot({ path: path.join(SHOTS, `u1-${w}x${h}-${theme}.png`) });
      expect(errs).toEqual([]);
    });
  }
}

for (const n of [500, 2000]) {
  test(`PL10: ${n} more wells grid in the worker`, async ({ page }) => {
    await page.goto(`/dev/mapping-surface-studio?scaleWells=${n}`);
    await page.getByTestId('map-source').selectOption('top:Top Dome');
    await page.getByTestId('map-cell').fill('50');
    const t0 = Date.now();
    await page.getByTestId('map-grid-run').click();
    await expect(page.getByTestId('map-status')).toContainText('Gridded', { timeout: 170000 });
    const ms = Date.now() - t0;
    console.log(`PL10 ${n + 5} wells at 50 m: ${ms} ms; status: ${await page.getByTestId('map-status').textContent()}`);
    expect(await inkOf(page)).toBeGreaterThan(0.2);
  });
}
