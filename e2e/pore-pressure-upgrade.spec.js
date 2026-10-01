// Pore Pressure Studio upgrade U1 (docs/upgrade/PorePressureStudio-UPGRADE.md)
// on the /dev harness: what the prognosis rests on is said and changes with
// the event, the NCT picks are drawn, publish is held on an unset offshore
// datum, the reviewer PDF reads back, every saved release opens, the page
// holds at three viewports in both themes, and the dock takes typing.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import { execFileSync } from 'child_process';

async function openWell(page, query = '') {
  await page.goto(`/dev/pore-pressure-studio${query}`);
  await expect(page.getByTestId('pp-well-row')).toHaveCount(1);
  await page.getByTestId('pp-well-row').click();
  await expect(page.getByTestId('pp-prognosis-chart')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('pp-unit-pressure').selectOption('MPa');
  await page.getByTestId('pp-unit-depth').selectOption('m');
}

test('PL4: the notes follow the events (NCT fit, a hand edit, calibration)', async ({ page }) => {
  await openWell(page);
  await expect(page.getByTestId('pp-note-nct')).toBeVisible();
  await expect(page.getByTestId('pp-note-calibration')).toContainText('Not calibrated');
  await expect(page.getByTestId('pp-note-datum')).toHaveCount(0);

  await page.getByTestId('pp-view-nct').click();
  for (const z of [500, 1000, 1500, 2000]) {
    await page.getByTestId('pp-pick-depth').fill(String(z));
    await page.getByTestId('pp-add-pick').click();
  }
  // PP-U1-014: the picks are drawn (a Scatter drew nothing in this layout)
  await expect(page.getByTestId('pp-nct-chart').locator('circle[fill="#e76f51"]')).toHaveCount(4);
  await page.getByTestId('pp-fit-nct').click();
  await page.getByTestId('pp-view-prognosis').click();
  await expect(page.getByTestId('pp-note-nct')).toHaveCount(0);

  // a hand-edited trend is no longer the fitted one
  await page.getByTestId('pp-param-cnct').fill('0.0005');
  await page.getByTestId('pp-apply-params').click();
  await expect(page.getByTestId('pp-note-nct')).toBeVisible();

  await page.getByTestId('pp-param-cal').fill('3000, 34.5');
  await page.getByTestId('pp-apply-params').click();
  await expect(page.getByTestId('pp-note-calibration')).toContainText(/misfit RMS \d+\.\d\d MPa/);
  await expect(page.getByTestId('pp-note-calibration')).toContainText('extrapolated beyond the deepest point');
});

test('PP-U1-003: an unset offshore mudline is said and holds the publish', async ({ page }) => {
  await openWell(page);
  await page.getByTestId('pp-param-mudline').fill('0');
  await page.getByTestId('pp-apply-params').click();
  await expect(page.getByTestId('pp-note-datum')).toContainText('Set the mudline MD');
  await expect(page.getByTestId('pp-publish')).toHaveAttribute('data-blocked', 'true');
  await expect(page.getByTestId('pp-publish')).toBeDisabled(); // aria-disabled, with the reason as its title
  await page.getByTestId('pp-publish').dispatchEvent('click');
  await expect(page.getByTestId('pp-status')).toContainText('Set the mudline MD in Parameters first');
  await page.getByTestId('pp-param-mudline').fill('130');
  await page.getByTestId('pp-apply-params').click();
  await expect(page.getByTestId('pp-note-datum')).toHaveCount(0);
  await page.getByTestId('pp-publish').click();
  await expect(page.getByTestId('pp-status')).toHaveText('Published PP/FP/OBG to the well registry.');
});

test('PP-U1-008: the PDF carries the reviewer block and reads back', async ({ page }) => {
  await openWell(page);
  await page.getByTestId('pp-param-field').fill('Keta');
  await page.getByTestId('pp-param-analyst').fill('E2E Analyst');
  await page.getByTestId('pp-apply-params').click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId('pp-export-pdf').click()]);
  const text = execFileSync('pdftotext', ['-layout', await download.path(), '-'], { encoding: 'utf8' });
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/pp-u1-report.txt', text);
  expect(text).toMatch(/Well: ORACLE PP-1 \| Field: Keta \| Analyst: E2E Analyst/);
  expect(text).toMatch(/EMW datum: RKB/);
  expect(text).toMatch(/NOT fitted on this source/);
  expect(text).toMatch(/Calibration: none/);
  await expect(page.getByTestId('pp-status')).toHaveText('Prognosis PDF downloaded.');
});

for (const key of ['pp0', 't1', 'u1']) {
  test(`PL5: the ${key} saved release reopens its well and computes`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/dev/pore-pressure-studio?saved=${key}`);
    await expect(page.getByTestId('pp-prognosis-chart')).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('pp-readout-pp')).toHaveText(/^PP \d/);
    expect(errors).toEqual([]);
  });
}

test('PL5: the p3 release opens on the well list; its old datum is said', async ({ page }) => {
  await openWell(page, '?saved=p3');
  await expect(page.getByTestId('pp-note-datum')).toBeVisible();
});

for (const vp of [{ w: 1366, h: 768 }, { w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6: ${vp.w}x${vp.h} ${theme}: no page errors, no sideways scroll, the chart draws downward`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/dev/pore-pressure-studio');
      if (theme === 'dark') await page.getByTestId('theme-toggle').click();
      await page.getByTestId('pp-well-row').click();
      await expect(page.getByTestId('pp-prognosis-chart')).toBeVisible({ timeout: 60000 });
      await expect(page.getByTestId('pp-prognosis-chart').locator('.recharts-line-curve').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      if (vp.w >= 1366) {
        const save = await page.getByTestId('pp-save-project').boundingBox();
        expect(save.x + save.width).toBeLessThanOrEqual(vp.w);
      }
      await page.screenshot({ path: `test-results/pp-u1-${vp.w}-${theme}.png` });
      expect(errors).toEqual([]);
    });
  }
}

test('PL11: dock fields typed key by key keep a decimal point and a cleared field', async ({ page }) => {
  await openWell(page);
  const wd = page.getByTestId('pp-param-wd');
  await wd.fill('');
  await wd.pressSequentially('100.5', { delay: 40 });
  await expect(wd).toHaveValue('100.5');
  const nu = page.getByTestId('pp-param-nu');
  await nu.fill('');
  await expect(nu).toHaveValue('');
  await nu.pressSequentially('0.42', { delay: 40 });
  await expect(nu).toHaveValue('0.42');
  const depth = page.getByTestId('pp-readout-depth');
  await depth.fill('');
  await depth.pressSequentially('2500.5', { delay: 40 });
  await expect(depth).toHaveValue('2500.5');
});
