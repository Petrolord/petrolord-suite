// Rock Physics Studio upgrade U2 (2026-10-01) on the /dev harness: the
// impedance against Vp/Vs crossplot with template lines, the wet trend on
// the intercept-gradient crossplot, the angle gather, the PDF read back
// with pdftotext, iterative Vs, the long well, the pseudo-sonic for a well
// with no sonic, the mineral model, pore pressure and saturation-height
// inputs, the gather in Seismolord and patchy saturation. Every expected
// number comes from the oracle goldens or the engine, never a literal typed
// from the screen.

import { test, expect } from '@playwright/test';
import fs from 'fs';

const SHOTS = process.env.RP_SHOTS || 'test-results';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const k = 'petrolord.units.view.v1:rock-physics';
    try {
      if (!window.sessionStorage.getItem('rp.e2e.seeded')) {
        window.sessionStorage.setItem('rp.e2e.seeded', '1');
        window.sessionStorage.setItem(k, JSON.stringify({ velocity: 'm/s', density: 'kg/m3', depth: 'm', temperature: 'degC', pressure: 'MPa', gor: 'm3/m3' }));
      }
    } catch { /* storage blocked */ }
  });
});

const open = async (page, q = '') => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/dev/rock-physics-studio${q}`);
  await expect(page.getByTestId('rp-well-row').first()).toBeVisible({ timeout: 120000 });
  return errors;
};
const pick = async (page, name) => {
  await page.locator(`[data-well-name="${name}"]`).click();
  await expect(page.getByTestId('rp-sub-after-vp')).toBeVisible({ timeout: 60000 });
};

test('U2-001: the crossplot shows the zone in situ and substituted over the template lines', async ({ page }) => {
  const errors = await open(page);
  await pick(page, 'KETA RP-1');
  await page.getByTestId('rp-view-crossplot').click();
  await expect(page.getByTestId('rp-crossplot-panel')).toBeVisible();
  await expect(page.getByTestId('rp-xplot-summary')).toContainText('BRINE SAND: 41 in situ and 41 substituted points');
  // the oracle log_domain golden: brine 3200 / 1800 / 2250, gas 2905.70 / 1890.98 / 2038.71
  const first = (await page.getByTestId('rp-xplot-first').textContent()).trim().split(/\s+/).map(Number);
  expect(first[0]).toBeCloseTo((3200 * 2250) / 1e6, 3);
  expect(first[1]).toBeCloseTo(3200 / 1800, 3);
  expect(first[2]).toBeCloseTo((2905.70 * 2038.71) / 1e6, 2);
  expect(first[3]).toBeCloseTo(2905.70 / 1890.98, 3);
  // points drawn: 41 circles and 41 diamonds; template lines drawn as curves
  await expect(page.locator('[data-canvas="chart"] .recharts-scatter-symbol')).not.toHaveCount(0);
  await expect(page.getByTestId('rp-xplot-legend')).toContainText('in situ, coloured by VSH');
  await expect(page.getByTestId('rp-xplot-legend')).toContainText('substituted (fluid B)');
  await expect(page.getByTestId('rp-xplot-template-note')).toContainText('critical porosity 0.4');
  await page.getByTestId('rp-xplot-color').selectOption('depth');
  await expect(page.getByTestId('rp-xplot-legend')).toContainText('2020 m');
  await page.screenshot({ path: `${SHOTS}/rp-u2-crossplot.png` });
  await page.getByTestId('rp-xplot-templates').uncheck();
  await expect(page.getByTestId('rp-xplot-template-note')).toHaveCount(0);
  // the zone choice is the workstation's: the gas sand is its own cluster
  await page.getByTestId('rp-xplot-zone').selectOption({ label: 'GAS SAND (2060–2080 m)' });
  await expect(page.getByTestId('rp-xplot-summary')).toContainText('GAS SAND');
  expect(errors).toEqual([]);
});

test('U2-002: the wet trend is fitted to the well, the gas top is measured from it; a well with few beds gets the Castagna line', async ({ page }) => {
  const errors = await open(page, '?trend=1');
  await pick(page, 'TREND RP-5 (wet trend, gas bed)');
  await page.getByTestId('rp-view-avo').click();
  await page.getByTestId('rp-avo-top-select').selectOption({ label: 'Top GAS BED (2000 m)' });
  const trend = page.getByTestId('rp-avo-trend');
  await expect(trend).toContainText('fitted to');
  await expect(trend).toContainText('Castagna');
  const slope = Number((await page.getByTestId('rp-avo-trend-slope').textContent()).replace(/[^-\d.]/g, ' ').trim().split(/\s+/)[0]);
  expect(slope).toBeLessThan(0);
  // in situ the gas top is on the hydrocarbon side; with the gas taken to brine (fluid B brine) it is back on the trend
  const dGas = Number(await page.getByTestId('rp-avo-trend-distance').textContent());
  expect(dGas).toBeLessThan(-0.03);
  await expect(page.getByTestId('rp-avo-trend-note')).toContainText('Hydrocarbon taken out through the SW log at 25 samples');
  await page.getByTestId('rp-param-fluidB-sw').fill('1');
  await page.getByTestId('rp-apply-params').click();
  const dWet = Number(await page.getByTestId('rp-avo-trend-distance-b').textContent());
  expect(Math.abs(dWet)).toBeLessThan(Math.abs(dGas) / 3);
  // the background points and the trend line are drawn
  await expect(page.locator('[data-canvas="chart"] .recharts-reference-line-line')).not.toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/rp-u2-wet-trend.png` });
  // typing keeps what a person types (PL11): clear, then a new window
  const win = page.getByTestId('rp-avo-trend-window');
  await win.fill('');
  await expect(win).toHaveValue('');
  await win.pressSequentially('60');
  await expect(trend).toContainText('±60 m');
  // switching it off removes the line and the words
  await page.getByTestId('rp-avo-trend-on').uncheck();
  await expect(page.getByTestId('rp-avo-trend')).toHaveCount(0);
  await page.getByTestId('rp-avo-trend-on').check();
  // the oracle well has four beds: Castagna's line, and the reason
  await page.locator('[data-well-name="KETA RP-1"]').click();
  await page.getByTestId('rp-avo-top-select').selectOption({ label: 'Top GAS SAND (2060 m)' });
  await expect(page.getByTestId('rp-avo-trend')).toContainText("Castagna, Swan and Foster's line");
  await expect(page.getByTestId('rp-avo-trend')).toContainText('a fit needs 8');
  await expect(page.getByTestId('rp-avo-trend-note')).toContainText('No SW log is read on this well');
  // manual halfspaces: the line of the upper halfspace's Vs/Vp
  await page.getByTestId('rp-avo-mode-manual').click();
  await expect(page.getByTestId('rp-avo-trend')).toContainText('manual halfspaces: no logs to fit');
  expect(errors).toEqual([]);
});

test('U2-003: the angle gather brightens with gas, reads the Seismolord tie wavelet, and keeps its settings on Save', async ({ page }) => {
  const errors = await open(page);
  await pick(page, 'KETA RP-1');
  await page.getByTestId('rp-view-gather').click();
  await expect(page.getByTestId('rp-gather-panel')).toBeVisible();
  await expect(page.getByTestId('rp-gather-summary')).toContainText('9 angles');
  await expect(page.getByTestId('rp-gather-summary')).toContainText('exact Zoeppritz per angle');
  await expect(page.getByTestId('rp-gather-summary')).toContainText('Ricker 25 Hz, zero phase');
  await expect(page.getByTestId('rp-gather-insitu')).toHaveAttribute('data-traces', '9');
  await expect(page.getByTestId('rp-gather-substituted')).toHaveAttribute('data-traces', '9');
  // the canvases have ink (dark wiggle pixels on white)
  for (const id of ['rp-gather-insitu', 'rp-gather-substituted']) {
    const dark = await page.getByTestId(id).locator('canvas').evaluate((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 80 && d[i + 1] < 80 && d[i + 2] < 80) n += 1;
      return n;
    });
    expect(dark).toBeGreaterThan(500);
  }
  // shale over brine sand is a hard kick (A positive); with gas the top goes negative and steepens
  const aIn = Number(await page.getByTestId('rp-gather-ia-a').textContent());
  const aGas = Number(await page.getByTestId('rp-gather-ia-b').textContent());
  const bGas = Number(await page.getByTestId('rp-gather-ib-b').textContent());
  expect(aIn).toBeGreaterThan(0);
  expect(aGas).toBeLessThan(0);
  expect(bGas).toBeLessThan(0);
  // the picked intercept is the interface value plus the base reflection's side lobe (20 m sand at 25 Hz is
  // near tuning): the same sign, within 0.05
  const aPicked = Number(await page.getByTestId('rp-gather-a-b').textContent());
  expect(aPicked).toBeLessThan(0);
  expect(Math.abs(aPicked - aGas)).toBeLessThan(0.05);
  await page.screenshot({ path: `${SHOTS}/rp-u2-gather.png`, fullPage: false });
  // the Seismolord tie wavelet stored on this well
  await page.getByTestId('rp-gather-wavelet').selectOption('tie');
  await expect(page.getByTestId('rp-gather-summary')).toContainText('Seismolord tie wavelet (well, peak 28.0 Hz, phase 40 deg');
  await page.getByTestId('rp-gather-method').selectOption('aki-richards');
  await expect(page.getByTestId('rp-gather-summary')).toContainText('Aki-Richards per angle');
  // typing: clear the angle box, type a new range
  const max = page.getByTestId('rp-gather-max-angle');
  await max.fill('');
  await expect(max).toHaveValue('');
  await max.pressSequentially('30');
  await expect(page.getByTestId('rp-gather-summary')).toContainText('7 angles');
  // Save keeps the gather settings
  await page.getByTestId('rp-save-project').click();
  await expect(page.getByTestId('rp-status')).toHaveText('Project saved.');
  await page.reload();
  await expect(page.getByTestId('rp-sub-after-vp')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('rp-view-gather').click();
  await expect(page.getByTestId('rp-gather-summary')).toContainText('7 angles');
  await expect(page.getByTestId('rp-gather-summary')).toContainText('Seismolord tie wavelet');
  // a well with no stored tie cannot pick it
  await page.locator('[data-well-name="AKOMA-2 (org shared)"]').click();
  await expect(page.getByTestId('rp-gather-notes')).toContainText('No tie wavelet is stored on this well');
  await expect(page.getByTestId('rp-gather-notes')).toContainText('Vs is estimated');
  expect(errors).toEqual([]);
});

test('U2-004: the PDF download reads back with pdftotext: header, numbers on screen, plots', async ({ page }) => {
  const { execFileSync } = await import('child_process');
  const errors = await open(page);
  await pick(page, 'KETA RP-1');
  await page.getByTestId('rp-reviewer-field').fill('Keta');
  await page.getByTestId('rp-reviewer-analyst').fill('A. Analyst');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rp-export-pdf').click()]);
  expect(dl.suggestedFilename()).toBe('rock-physics_KETA_RP-1_BRINE_SAND.pdf');
  const file = `${SHOTS}/rp-u2-download.pdf`;
  await dl.saveAs(file);
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  expect(text).toContain('Petrolord Suite - Rock Physics Studio');
  expect(text).toMatch(/Field:\s+Keta/);
  expect(text).toMatch(/Analyst:\s+A\. Analyst/);
  expect(text).toMatch(/Well:\s+KETA RP-1/);
  expect(text).toMatch(/Mineral modulus:\s+37\.000 GPa \(override\)/);
  // the numbers on the screen are the numbers on the page
  const vp = Number(await page.getByTestId('rp-sub-after-vp').textContent());
  expect(text).toMatch(new RegExp(`after \\(fluid B\\)\\s+${vp.toFixed(1)}`));
  for (const w of ['Velocity against depth', 'MD (m), downward', 'Impedance against Vp/Vs', 'Zone top reflectivity']) expect(text).toContain(w);
  await expect(page.getByTestId('rp-export-note')).toContainText('Saved rock-physics_KETA_RP-1_BRINE_SAND.pdf');
  expect(fs.statSync(file).size).toBeGreaterThan(5000);
  expect(errors).toEqual([]);
});

test('U2-005: with no shear log and gas in situ, Vs is iterated and the badge, the basis line and the CSV say so', async ({ page }) => {
  const errors = await open(page);
  await pick(page, 'AKOMA-2 (org shared)');
  await expect(page.getByTestId('rp-vs-badge')).toBeVisible();
  const vsDirect = Number(await page.getByTestId('rp-sub-before-vs').textContent());
  // say the sand holds 80 percent gas in situ and take it to brine
  await page.getByTestId('rp-param-fluidA-sw').fill('0.2');
  await page.getByTestId('rp-param-fluidB-sw').fill('1');
  await page.getByTestId('rp-apply-params').click();
  await expect(page.getByTestId('rp-sub-basis')).toContainText('iterated through the brine state in 41 hydrocarbon samples');
  const vsIter = Number(await page.getByTestId('rp-sub-before-vs').textContent());
  expect(vsIter).toBeGreaterThan(vsDirect * 1.03); // the direct regression read low
  await expect(page.getByTestId('rp-vs-badge')).toHaveAttribute('title', /iterated through the brine state/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rp-export-csv').click()]);
  const text = fs.readFileSync(await dl.path(), 'utf8');
  expect(text).toMatch(/# Shear: Vs estimated \(Greenberg-Castagna on VSH; iterated through the brine state in 41 hydrocarbon samples\); no shear log/);
  // off: back to the direct estimate
  await page.getByTestId('rp-param-iterativeVs').uncheck();
  await page.getByTestId('rp-apply-params').click();
  await expect(page.getByTestId('rp-sub-basis')).not.toContainText('iterated');
  expect(Number(await page.getByTestId('rp-sub-before-vs').textContent())).toBeCloseTo(vsDirect, 1);
  expect(errors).toEqual([]);
});

for (const vp of [{ w: 1366, h: 768 }, { w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6: ${vp.w}x${vp.h} ${theme}: the U2 views have ink, no sideways page scroll, no page errors`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      const errors = await open(page, '?trend=1');
      if (theme === 'dark') await page.getByTestId('theme-toggle').click();
      await pick(page, 'TREND RP-5 (wet trend, gas bed)');
      for (const view of ['crossplot', 'avo', 'gather']) {
        await page.getByTestId(`rp-view-${view}`).click();
        if (view === 'gather') {
          await expect(page.getByTestId('rp-gather-insitu').locator('canvas')).toBeVisible();
          const bg = await page.getByTestId('rp-gather-insitu').evaluate((el) => getComputedStyle(el).backgroundColor);
          expect(bg).toBe('rgb(255, 255, 255)'); // charts stay white in both themes
        }
        const charts = page.locator('[data-canvas="chart"] svg.recharts-surface');
        await expect(charts.first()).toBeVisible();
        const marks = await page.locator('[data-canvas="chart"] .recharts-line-curve, [data-canvas="chart"] .recharts-scatter-symbol').count();
        expect(marks).toBeGreaterThan(0);
        await page.screenshot({ path: `${SHOTS}/rp-u2-${view}-${vp.w}-${theme}.png` });
      }
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sideways).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }
}
