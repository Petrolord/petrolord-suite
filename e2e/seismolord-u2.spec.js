// Seismolord upgrade U2 (Step 2 batches) in a real browser, against the
// auth-free /dev/seismolord-u2 harness (synthetic volume, no DB).
// Run: E2E_BASE_URL=http://127.0.0.1:8370 npx playwright test e2e/seismolord-u2.spec.js --workers=1

import fs from 'fs';
import { execFileSync } from 'child_process';
import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

const pdfText = (file) => execFileSync('pdftotext', ['-layout', file, '-']).toString();

async function openHarness(page, vp, theme) {
  await page.setViewportSize(vp);
  await page.addInitScript((t) => {
    try { for (const k of Object.keys(localStorage)) if (/theme/i.test(k)) localStorage.setItem(k, t); } catch { /* none */ }
  }, theme);
  await page.goto('/dev/seismolord-u2');
  await expect(page.getByTestId('u2-status')).toHaveText('ready', { timeout: 60000 });
}

for (const vp of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
  for (const theme of ['light', 'dark']) {
    test(`U2-001 ${vp.width}x${vp.height} ${theme}: section-with-a-well plot carries legend, company and analyst`, async ({ page }, info) => {
      await openHarness(page, vp, theme);
      // no page scroll; the seismic canvas stays dark
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(scroll).toBeLessThanOrEqual(0);
      await expect(page.locator('[data-canvas="dark"]').first()).toBeVisible();

      // negative control: a line with no well refuses the template with the reason
      await page.getByTestId('u2-line-index').fill('5');
      await page.getByTestId('u2-open-plot').click();
      const dialog = page.getByRole('dialog');
      await dialog.getByTestId('plot-template').selectOption('section_well');
      await dialog.getByRole('button', { name: /Generate PDF/ }).click();
      await expect(dialog.getByTestId('plot-template-problems')).toContainText('No well is drawn on this line');
      await page.keyboard.press('Escape');

      // the line through the well
      await page.getByTestId('u2-line-index').fill('32');
      await page.waitForTimeout(500);
      await page.getByTestId('u2-open-plot').click();
      await dialog.getByTestId('plot-template').selectOption('section_well');
      await dialog.getByLabel('Company').fill('Lordsway Energy');
      await dialog.getByLabel('Analyst').fill('A. Asaolu');
      const [dl] = await Promise.all([
        page.waitForEvent('download'),
        dialog.getByRole('button', { name: /Generate PDF/ }).click(),
      ]);
      expect(dl.suggestedFilename()).toBe('seismolord-u2_synthetic-section-well.pdf');
      const file = info.outputPath('section.pdf');
      await dl.saveAs(file);
      const text = pdfText(file);
      expect(text).toContain('Company: Lordsway Energy');
      expect(text).toContain('Analyst: A. Asaolu');
      expect(text).toContain('Legend');
      expect(text).toContain('Top Reservoir');
      expect(text).toContain('Fault F1');
      expect(text).toContain('OKAN-1');
      expect(text).toContain('Inline 1032');
      // saved per user
      expect(await page.evaluate(() => window.__plotIdentity)).toEqual({ company: 'Lordsway Energy', analyst: 'A. Asaolu' });
      fs.copyFileSync(file, `/tmp/claude-0/seis-upg2/u2-001-${vp.width}-${theme}.pdf`);
    });
  }
}

test('U2-001: map with contours and wells, legend states the contour interval', async ({ page }, info) => {
  await openHarness(page, { width: 1440, height: 900 }, 'light');
  await page.getByTestId('u2-open-plot').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByTestId('plot-template').selectOption('map_contours_wells');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: /Generate PDF/ }).click(),
  ]);
  const file = info.outputPath('map.pdf');
  await dl.saveAs(file);
  const text = pdfText(file);
  expect(text).toMatch(/Top Reservoir, interval \d/);
  expect(text).toContain('OKAN-1');
  expect(text).toContain('Analyst: Harness Analyst');
});
