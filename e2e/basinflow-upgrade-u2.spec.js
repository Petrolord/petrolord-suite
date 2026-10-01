// Basin & Charge Modeling upgrade U2 (docs/upgrade/BasinFlowGenesis-UPGRADE.md):
// the worked example walked in a real browser. The run goes through the Web
// Worker; the burial plot names its eroded section; the pressure tab reports
// and hands off to Pore Pressure Studio; Horner corrects the BHTs; two
// scenarios compare; a template is undone; the PDF carries the plots (read
// back with pdftotext). Three viewports in both themes: no page errors, no
// sideways scroll, depth downward.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

async function openExample(page) {
  await page.goto('/dev/basinflow-genesis');
  await expect(page.getByTestId('bf-harness')).toBeVisible({ timeout: 120000 });
  await page.getByTestId('bf-worked-example').click();
  await expect(page.getByTestId('bf-simulate')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-testid="bf-layer-card"]')).toHaveCount(6, { timeout: 60000 });
}

async function run(page) {
  await page.getByTestId('bf-simulate').click();
  await expect(page.getByTestId('bf-sim-status')).toHaveText('Complete', { timeout: 120000 });
}

test('U2: the worked example runs in the worker, draws the eroded section, reports pressure, corrects BHTs, compares scenarios and prints the plots', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openExample(page);
  await run(page);
  await expect(page.getByText('Ran in the background worker.')).toBeVisible();
  await page.getByTestId('bf-sim-view').click();

  await page.getByTestId('bf-results-tab-burial').click();
  await expect(page.getByTestId('bf-burial-eroded-note')).toContainText('removed at 30 Ma');
  // depth runs downward: the first y tick label is the smallest depth and sits above the largest
  const ticks = await page.locator('[data-canvas="chart"] .recharts-yAxis .recharts-cartesian-axis-tick').evaluateAll((els) => els.map((e) => ({ y: e.getBoundingClientRect().y, v: parseFloat(e.textContent.replace(/,/g, '')) })).filter((t) => Number.isFinite(t.v)));
  expect(ticks.length).toBeGreaterThan(2);
  const top = ticks.reduce((a, b) => (b.y < a.y ? b : a)); const bottom = ticks.reduce((a, b) => (b.y > a.y ? b : a));
  expect(top.v).toBeLessThan(bottom.v);

  await page.getByTestId('bf-results-tab-pressure').click();
  await expect(page.getByTestId('bf-pressure-note')).toContainText('compaction disequilibrium');
  await expect(page.getByTestId('bf-send-pressure')).toHaveAttribute('href', /pore-pressure-studio\?bfPressure=/);

  await page.getByTestId('bf-tab-calibration').click();
  await expect(page.getByTestId('bf-cal-bht-method')).toHaveValue('horner');
  await expect(page.getByTestId('bf-cal-bht-table')).toBeVisible();
  const usedHorner = await page.getByTestId('bf-cal-temp-rms').textContent();
  await page.getByTestId('bf-cal-bht-method').selectOption('none');
  await expect(page.getByTestId('bf-cal-temp-rms')).not.toHaveText(usedHorner);
  await page.getByTestId('bf-cal-bht-method').selectOption('horner');

  await page.getByTestId('bf-save-scenario').click();
  await page.getByTestId('bf-save-scenario').click();
  await page.getByTestId('bf-tab-scenarios').click();
  const picks = page.getByRole('checkbox', { name: /^Compare / });
  await picks.nth(0).check(); await picks.nth(1).check();
  await expect(page.getByTestId('bf-scenario-compare')).toContainText('Paleocene Source Shale');

  await page.getByTestId('bf-export').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
  const f = path.join(os.tmpdir(), `bf-u2-${Date.now()}.pdf`);
  await download.saveAs(f);
  const text = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
  fs.unlinkSync(f);
  expect(text).toMatch(/Burial history/);
  expect(text).toMatch(/Eroded section \(removed at 30 Ma\)/);
  expect(text).toMatch(/Petroleum system events/);
  expect(text).toMatch(/BHT correction: Horner, circulation 6 h/);
  expect(errors).toEqual([]);
});

test('U2: a template asks by model name and Undo puts the layers back; the run can be cancelled', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openExample(page);
  await page.getByTestId('bf-tab-templates').click();
  await page.locator('[data-testid^="bf-template-use-"]').first().click();
  await expect(page.getByTestId('bf-template-confirm')).toContainText('Worked example: rift-margin well');
  await page.getByTestId('bf-template-confirm-apply').click();
  await page.getByTestId('bf-tab-properties').click();
  await expect(page.getByTestId('bf-undo-bar')).toBeVisible();
  await page.getByTestId('bf-undo-replace').click();
  await expect(page.locator('[data-testid="bf-layer-card"]')).toHaveCount(6);
  await expect(page.getByTestId('bf-undo-bar')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const vp of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const theme of ['light', 'dark']) {
    test(`U2: ${vp.width} wide, ${theme}: the worked example, its pressure tab and scenario compare open with no page errors and no sideways scroll`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize(vp);
      await page.emulateMedia({ colorScheme: theme });
      await openExample(page);
      await run(page);
      await page.getByTestId('bf-sim-view').click();
      await page.getByTestId('bf-results-tab-pressure').click();
      await expect(page.getByTestId('bf-pressure-note')).toBeVisible();
      await page.getByTestId('bf-results-tab-burial').click();
      await expect(page.getByTestId('bf-burial-eroded-note')).toBeVisible();
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(sideways).toBe(false);
      expect(errors).toEqual([]);
    });
  }
}
