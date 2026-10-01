// Basin & Charge Modeling upgrade U1 (docs/upgrade/BasinFlowGenesis-UPGRADE.md):
// the practitioner's walk on the harness. KETA-2 (dated, deviated, with a
// lithology log) builds a dated TVD column with an erosion surface; a layer
// is made a source rock in Expert mode; the run ends at 0 Ma; the notes say
// what the engine skipped; the reviewer PDF is downloaded and read; three
// viewports in both themes have no page errors.

import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

async function openExpert(page) {
  await page.goto('/dev/basinflow-genesis');
  await expect(page.getByTestId('bf-harness')).toBeVisible({ timeout: 120000 });
  await page.getByTestId('bf-mode-expert').click();
  await expect(page.getByTestId('bf-simulate')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-testid="bf-layer-card"]')).toHaveCount(4, { timeout: 60000 });
}

test('U1: KETA-2 builds a dated TVD column; a source rock set in Expert mode; notes, run and the reviewer PDF', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openExpert(page);
  await page.getByTestId('bf-tab-import').click();
  await page.getByTestId('bf-import-tab-registry').click();
  await page.getByTestId('bf-registry-well').selectOption({ label: 'KETA-2 (5 tops)' });
  await expect(page.getByTestId('bf-registry-preview')).toContainText('33.9 to 28.1');
  await expect(page.getByTestId('bf-registry-notes')).toContainText('TVD');
  await page.getByTestId('bf-registry-apply').click();
  await page.getByTestId('bf-tab-properties').click();
  await expect(page.locator('[data-testid="bf-layer-card"]')).toHaveCount(5);

  const card = page.locator('[data-testid="bf-layer-card"][data-layer-name="Top Paleocene Source"]');
  await card.getByTestId('bf-layer-details-toggle').click();
  await card.getByTestId('bf-layer-source').check();
  await card.getByTestId('bf-layer-toc').fill('4');
  await card.getByTestId('bf-layer-hi').fill('500');
  await expect(card.getByTestId('bf-layer-source-badge')).toContainText('TOC 4 wt %, HI 500');

  await page.getByTestId('bf-simulate').click();
  await expect(page.getByTestId('bf-sim-status')).toHaveText('Complete', { timeout: 60000 });
  await page.getByTestId('bf-sim-view').click();
  await expect(page.locator('[data-testid="bf-model-note"][data-note="erosion-unknown"]')).toContainText('Top Oligocene Shale');
  await page.getByTestId('bf-results-tab-summary').click();
  await expect(page.getByTestId('bf-present-table')).toContainText('Top Miocene');
  await expect(page.getByTestId('bf-results-stale')).toHaveCount(0);

  await page.getByTestId('bf-export').click();
  await page.getByTestId('bf-report-field').fill('Keta');
  await page.getByTestId('bf-report-analyst').fill('A. Analyst');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
  const f = path.join(os.tmpdir(), `bf-u1-${Date.now()}.pdf`);
  await download.saveAs(f);
  const text = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
  fs.unlinkSync(f);
  expect(text).toMatch(/Well: KETA-2 \| Field: Keta \| Analyst: A\. Analyst/);
  expect(text).toMatch(/Erosion: Top Oligocene Shale 23\.03 Ma amount unknown, NOT modelled/);
  expect(text).toMatch(/Top Paleocene Source/);
  expect(errors).toEqual([]);
});

for (const vp of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const theme of ['light', 'dark']) {
    test(`U1: ${vp.width} wide, ${theme}: Expert mode and the results open with no page errors and no sideways scroll`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize(vp);
      await page.emulateMedia({ colorScheme: theme });
      await openExpert(page);
      await page.getByTestId('bf-simulate').click();
      await expect(page.getByTestId('bf-sim-status')).toHaveText('Complete', { timeout: 60000 });
      await page.getByTestId('bf-sim-view').click();
      await page.getByTestId('bf-results-tab-burial').click();
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(sideways).toBe(false);
      expect(errors).toEqual([]);
    });
  }
}
