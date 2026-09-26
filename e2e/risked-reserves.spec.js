// Risked Reserves Valuation T1 acceptance on the /dev harness (no auth):
// import the two risked ReservoirCalc Pro prospects, read Pc, EMV and the
// portfolio, edit an input, see a bad volume named, export the CSV.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { window.localStorage.removeItem('rrv.prospects.v1'); } catch (e) { /* ignore */ } });
});

test('import, value, edit and export', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/risked-reserves');
  await expect(page.getByTestId('rrv-empty')).toBeVisible();
  await page.getByTestId('rrv-import').click();
  await expect(page.getByTestId('rrv-status')).toContainText('Imported 2 prospects');
  await expect(page.getByTestId('rrv-pc-Ekene North')).toHaveText(/%$/);
  await expect(page.getByTestId('rrv-expectation-chart')).toBeVisible();
  await expect(page.getByTestId('rrv-portfolio')).toContainText('Portfolio of 2 independent prospects');
  const before = await page.getByTestId('rrv-emv-Ekene North').textContent();
  await page.getByTestId('rrv-unitValue-Ekene North').fill('12');
  await expect(page.getByTestId('rrv-emv-Ekene North')).not.toHaveText(before);
  await page.getByTestId('rrv-p10-Ekene Deep').fill('20');
  await expect(page.getByTestId('rrv-emv-Ekene Deep')).toContainText('check inputs');
  await page.getByTestId('rrv-row-Ekene Deep').click();
  await expect(page.getByTestId('rrv-problem')).toContainText('P90 is the low case');
  await expect(page.getByTestId('rrv-portfolio')).toContainText('1 left out');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rrv-csv').click()]);
  expect(dl.suggestedFilename()).toBe('risked-valuation.csv');
  await page.getByTestId('rrv-row-Ekene North').click();
  await expect(page.getByTestId('rrv-portfolio')).toContainText('1 left out');
  await page.screenshot({ path: 'test-results/rrv-t1.png', fullPage: false });
});
