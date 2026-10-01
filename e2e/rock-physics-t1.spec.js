// Rock Physics Studio senior test T1 on the /dev harness: depth runs down
// the velocity log plot, the gas Vp is shown, the AVO panel compares the
// in-situ interface with the lower rock carrying fluid B, and the tuning
// thickness is stated in depth.

import { test, expect } from '@playwright/test';
import { EMPTY_VALUE } from '../src/lib/emptyValue.js';

// RP-U1-012: the harness opens on the Suite unit profile (oilfield since
// #830), while these assertions read the oracle in SI. Start each page on a
// metric view override (sessionStorage, the useAppUnits session rule) once per
// tab, so a test that chooses units and reloads keeps its choice.
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

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/rock-physics-studio');
  await page.locator('[data-well-name="KETA RP-1"]').click();
  await expect(page.getByTestId('rp-curve-inventory')).toBeVisible({ timeout: 60000 });
});

test('T1-001/002: depth increases down the log plot; gas Vp is computed', async ({ page }) => {
  const tick = async (t) => (await page.locator('.recharts-cartesian-axis-tick-value', { hasText: new RegExp(`^${t}$`) }).first().boundingBox()).y;
  expect(await tick('2020')).toBeLessThan(await tick('2040'));
  const gasRow = page.locator('tr', { hasText: 'B (substitute)' });
  await expect(gasRow).not.toContainText(EMPTY_VALUE);
});

test('T1-E1: fluid replacement AVO shows the lower rock with fluid B', async ({ page }) => {
  await page.getByTestId('rp-view-avo').click();
  await page.getByTestId('rp-avo-top-select').selectOption({ label: 'Top GAS SAND (2060 m)' });
  // as scenario A = brine, the gas sand cannot be un-substituted: the reason shows
  await expect(page.getByText(/Fluid replacement: no sample in the window could be substituted/)).toBeVisible();
  // the realistic question: in situ gas, what if it were wet?
  await page.getByTestId('rp-param-fluidA-sw').fill('0');
  await page.getByTestId('rp-param-fluidB-sw').fill('1');
  await page.getByTestId('rp-apply-params').click();
  await expect(page.getByTestId('rp-avo-replaced')).toContainText('with brine in place of gas');
  const a = Number(await page.getByTestId('rp-avo-a').textContent());
  const aB = Number(await page.getByTestId('rp-avo-a-b').textContent());
  expect(Number.isFinite(aB)).toBe(true);
  expect(aB).not.toBe(a);
  await page.screenshot({ path: 'test-results/rp-t1-avo.png' });
});

test('T1-E2: tuning thickness in depth from the wedge velocity', async ({ page }) => {
  await page.getByTestId('rp-view-wedge').click();
  await expect(page.getByTestId('rp-wedge-tuning')).toHaveText('16');
  // 16 ms two-way at 2500 m/s = 20.0 m
  await expect(page.getByTestId('rp-wedge-tuning-depth')).toContainText('20.0 m at 2500 m/s');
  await page.getByTestId('rp-wedge-vp').fill('3000');
  await expect(page.getByTestId('rp-wedge-tuning-depth')).toContainText('24.0 m at 3000 m/s');
});
