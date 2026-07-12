// Wells W3 acceptance in the UI path: the REAL WellTiePanel on a known
// layer cake (truth 1600 / 2600 m/s, perturbed start 1400 / 3000) —
// pairing tops with horizons and fitting must recover the truth
// exactly, show honest before/after residuals, and hand the fitted
// model back only on explicit Apply.

import { test, expect } from '@playwright/test';

test('pair → Fit recovers the known cake; Apply hands over the fitted model', async ({ page }) => {
  await page.goto('/dev/seismolord-welltie');
  await expect(page.getByTestId('welltie')).toBeVisible();

  await page.getByTestId('welltie-pair-TopA').selectOption('hz1');
  await page.getByTestId('welltie-pair-TopB').selectOption('hz2');
  await page.getByTestId('welltie-fit').click();

  await expect(page.getByTestId('welltie-result')).toBeVisible();
  // exact recovery: consistent ties + linear-in-V0 structure
  await expect(page.getByTestId('welltie-model'))
    .toHaveText('Layer cake, 2 layers (1600 / 2600 m/s at layer tops)');
  await expect(page.getByTestId('welltie-rms')).toContainText('→ 0.0 m');
  await expect(page.getByTestId('welltie-rms')).toContainText('(4 ties)');
  // honest before residuals: the perturbed model misses by metres
  const rows = await page.getByTestId('welltie-residuals').locator('tr').count();
  expect(rows).toBe(4);

  // nothing applied until the explicit Save
  await expect(page.getByTestId('harness-applied')).toHaveText('-');
  await page.getByTestId('welltie-apply').click();
  await expect(page.getByTestId('harness-applied')).toContainText('"v0":1600');
  await expect(page.getByTestId('harness-applied')).toContainText('"v0":2600');
  // W4: the calibration provenance rides along for wells_used in exports
  await expect(page.getByTestId('harness-applied'))
    .toContainText('"wells":["W-A","W-B"]');
  await expect(page.getByTestId('harness-applied')).toContainText('"source":"well_tie"');
});

test('pairing only one top fits the sampled layer and reports the unsampled one', async ({ page }) => {
  await page.goto('/dev/seismolord-welltie');
  await page.getByTestId('welltie-pair-TopA').selectOption('hz1');
  await page.getByTestId('welltie-fit').click();
  await expect(page.getByTestId('welltie-result')).toBeVisible();
  await expect(page.getByTestId('welltie-model')).toContainText('1600 / 3000');
  await expect(page.getByTestId('welltie-result')).toContainText('not sampled');
});
