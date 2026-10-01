// Rock Physics Studio upgrade U1 (practitioner lens, 2026-10-01) on the
// /dev harness: the hostile vendor export reads right and says how; the
// zone substitution honours the SW log, the clay and the Gassmann limits;
// the CSV a reviewer signs is read back from the download; Save keeps the
// well and zone across a reload; inputs keep what a person types; three
// viewports in both themes have ink and no sideways scroll; a 5000 m well
// stays responsive.

import { test, expect } from '@playwright/test';
import fs from 'fs';

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
  await expect(page.getByTestId('rp-well-row').first()).toBeVisible({ timeout: 60000 });
  return errors;
};

test('U1-002/003/004/005/006: the hostile vendor export reads right, says how, and substitutes within the limits', async ({ page }) => {
  const errors = await open(page, '?hostile=1');
  await page.locator('[data-well-name="HOSTILE RP-4 (vendor export)"]').click();
  const inv = page.getByTestId('rp-curve-inventory');
  await expect(inv).toContainText('DEPT · TDEP');
  await expect(inv).toContainText('RHOB · RHOZ (KG/M3)');
  await expect(inv).toContainText('PHIT · PHIT');
  const notes = page.getByTestId('rp-read-notes');
  await expect(notes).toContainText('DTCO has no unit');
  await expect(notes).toContainText('read as us/ft');
  await expect(notes).toContainText('DTSM has no unit: read as us/ft');
  await expect(notes).toContainText('only percent can mean');
  await expect(notes).toContainText('-999 or below read as null');
  // the in-situ means are the fixture's own numbers (sand 3150/2700 m/s)
  await expect(page.getByTestId('rp-sub-basis')).toContainText('PHIT (total porosity)');
  await expect(page.getByTestId('rp-sub-basis')).toContainText('fluid A Sw: from the SW log');
  // 2045 to 2050 m is shaly (VSH 0.6): 10 samples left in situ, said
  await expect(page.getByTestId('rp-sub-header')).toContainText('10 left in situ (outside the Gassmann limits)');
  const before = Number(await page.getByTestId('rp-sub-before-vp').textContent());
  expect(before).toBeGreaterThan(2700);
  expect(before).toBeLessThan(3150);
  // brine over the gas leg (fluid B gas by default): B is slower, never 3.28x
  const after = Number(await page.getByTestId('rp-sub-after-vp').textContent());
  expect(after).toBeLessThan(before);
  expect(after).toBeGreaterThan(2000);
  await expect(page.getByTestId('rp-sub-before-vpvs')).not.toHaveText('n/a');
  expect(errors).toEqual([]);
});

test('U1-010: the CSV download carries the reviewer header and the screen numbers', async ({ page }) => {
  await open(page);
  await page.locator('[data-well-name="KETA RP-1"]').click();
  await expect(page.getByTestId('rp-sub-after-vp')).toBeVisible();
  await page.getByTestId('rp-reviewer-field').fill('Keta');
  await page.getByTestId('rp-reviewer-analyst').fill('A. Analyst');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rp-export-csv').click()]);
  expect(dl.suggestedFilename()).toBe('rock-physics_KETA_RP-1_BRINE_SAND.csv');
  const text = fs.readFileSync(await dl.path(), 'utf8');
  expect(text).toContain('# Field: Keta');
  expect(text).toContain('# Analyst: A. Analyst');
  expect(text).toContain('# Well: KETA RP-1');
  expect(text).toContain('# Mineral modulus: 37.000 GPa (override)');
  const firstRow = text.split('\n').find((l) => /^2020/.test(l)).split(',');
  const shown = Number(await page.getByTestId('rp-sub-after-vp').textContent());
  expect(Number(firstRow[2])).toBeCloseTo(shown, 1);
});

test('U1-001/013: Save keeps the well and the zone across a reload', async ({ page }) => {
  await open(page);
  await page.locator('[data-well-name="KETA RP-1"]').click();
  await page.getByTestId('rp-zone-select').selectOption({ label: 'GAS SAND (2060–2080 m)' });
  await page.getByTestId('rp-save-project').click();
  await expect(page.getByTestId('rp-status')).toHaveText('Project saved.');
  await page.reload();
  await expect(page.getByTestId('rp-curve-inventory')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('rp-zone-select')).toHaveValue(/zone/);
  await expect(page.getByTestId('rp-sub-before-vp')).toHaveText('2540.00');
});

test('U1-011: inputs keep what a person types', async ({ page }) => {
  await open(page);
  await page.getByTestId('rp-view-wedge').click();
  const rc = page.getByTestId('rp-wedge-rcbase');
  await rc.fill('');
  await rc.pressSequentially('-0.15');
  await expect(rc).toHaveValue('-0.15');
  await rc.fill('');
  await expect(page.getByTestId('rp-wedge-error')).toBeVisible();
  await expect(rc).toHaveValue('');
  await rc.pressSequentially('-0.1');
  await expect(page.getByTestId('rp-wedge-tuning')).toHaveText('16');
  await page.getByTestId('rp-view-avo').click();
  await page.getByTestId('rp-avo-mode-manual').click();
  const th = page.getByTestId('rp-avo-theta-max');
  await th.fill('');
  await expect(th).toHaveValue('');
  await th.pressSequentially('35');
  await expect(th).toHaveValue('35');
});

test('U1-014: past the critical angle the AVO panel says so', async ({ page }) => {
  await open(page);
  await page.getByTestId('rp-view-avo').click();
  await page.getByTestId('rp-avo-mode-manual').click();
  await page.getByTestId('rp-avo-lower-vp').fill('4000');
  await page.getByTestId('rp-avo-lower-vs').fill('2300');
  // inside the default 40 degrees nothing is said; open the range past 46.5
  await expect(page.getByTestId('rp-avo-critical')).toHaveCount(0);
  await page.getByTestId('rp-avo-theta-max').fill('60');
  await expect(page.getByTestId('rp-avo-critical')).toContainText('Critical angle 46.5');
  await expect(page.getByTestId('rp-avo-upper-vpvs')).toHaveText((2900 / 1330).toFixed(3));
});

for (const vp of [{ w: 1366, h: 768 }, { w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6: ${vp.w}x${vp.h} ${theme}: charts have ink, no sideways page scroll`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      const errors = await open(page);
      if (theme === 'dark') await page.getByTestId('theme-toggle').click();
      await page.locator('[data-well-name="KETA RP-1"]').click();
      await expect(page.getByTestId('rp-sub-after-vp')).toBeVisible();
      for (const view of ['fluids', 'avo', 'wedge']) {
        await page.getByTestId(`rp-view-${view}`).click();
        if (view === 'avo') await page.getByTestId('rp-avo-top-select').selectOption({ label: 'Top GAS SAND (2060 m)' });
        const charts = page.locator('[data-canvas="chart"] svg.recharts-surface');
        await expect(charts.first()).toBeVisible();
        const paths = await page.locator('[data-canvas="chart"] .recharts-line-curve, [data-canvas="chart"] .recharts-scatter-symbol').count();
        expect(paths).toBeGreaterThan(0);
        await page.screenshot({ path: `${process.env.RP_SHOTS || 'test-results'}/rp-u1-${view}-${vp.w}-${theme}.png` });
      }
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sideways).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }
}

test('PL10: a 5000 m well (32,809 samples) loads and substitutes a 4000 m zone without freezing', async ({ page }) => {
  await open(page, '?long=1');
  const t0 = Date.now();
  await page.locator('[data-well-name="LONG RP-3 (5000 m)"]').click();
  await expect(page.getByTestId('rp-sub-after-vp')).toBeVisible({ timeout: 60000 });
  const loadMs = Date.now() - t0;
  await expect(page.getByTestId('rp-chart-decimated')).toContainText('of 26247 samples drawn');
  // U2-014: the thinning keeps each bucket's extremes
  await expect(page.getByTestId('rp-chart-decimated')).toContainText('minimum and maximum Vp of each of 1000 depth buckets');
  // the page answers a click while the chart is on screen
  const t1 = Date.now();
  await page.getByTestId('rp-view-wedge').click();
  await expect(page.getByTestId('rp-wedge-panel')).toBeVisible();
  const clickMs = Date.now() - t1;
  console.log(`PL10 long well: load+substitute+draw ${loadMs} ms, next click ${clickMs} ms`);
  expect(loadMs).toBeLessThan(15000);
  expect(clickMs).toBeLessThan(3000);
});
