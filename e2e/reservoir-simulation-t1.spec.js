// Reservoir Simulation Studio senior test T1 on the /dev harness: in-memory
// Supabase plus a stand-in for the OPM Flow worker that completes runs with
// summaries OPM Flow 2026.04 really produced (SPE1CASE1; the Builder's
// default deck). Results open on the newest completed run, a noise-level
// water cut reads as zero, and a failing deck surfaces its error and log.
import { test, expect } from '@playwright/test';

async function newCase(page, name) {
  await page.getByTitle(/Create new/i).first().click({ timeout: 60000 });
  await page.getByRole('dialog').getByRole('textbox').first().fill(name);
  await page.getByRole('dialog').getByRole('button', { name: /^Create case$/ }).click();
  await expect(page.getByText(`Case "${name}" created`)).toBeVisible();
}

test('T1: SPE1 template runs and the results open on the newest run', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/reservoir-simulation-studio', { timeout: 120000 });
  await newCase(page, 'SPE1 check');
  await page.getByRole('button', { name: 'Use template' }).first().click();
  await expect(page.getByTestId('deck-editor')).toContainText('SPE1', { timeout: 20000 });

  await page.getByRole('tab', { name: 'Runs' }).click();
  await expect(page.getByText('Runs: SPE1 check')).toBeVisible();
  await page.getByRole('button', { name: /Run simulation/ }).click();
  await expect(page.getByText('complete', { exact: true })).toBeVisible({ timeout: 30000 });

  await page.getByRole('tab', { name: 'Results' }).click();
  await expect(page.getByTestId('results-run-select')).not.toHaveValue('');
  await expect(page.getByText('FOPR: Field oil rate')).toBeVisible();
  await expect(page.getByText('start 2015-01-01')).toBeVisible();
});

test('T1: builder deck; dry water cut on a zero-based axis; failed run shows its log', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/reservoir-simulation-studio', { timeout: 120000 });
  await newCase(page, 'Built model');
  await page.getByRole('tab', { name: 'Builder' }).click();
  await page.getByRole('button', { name: /Generate deck/ }).click();
  await expect(page.getByText(/Model generated \(Pb/)).toBeVisible();
  await page.getByRole('tab', { name: 'Runs' }).click();
  await page.getByRole('button', { name: /Run simulation/ }).click();
  await expect(page.getByText('complete', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('tab', { name: 'Results' }).click();
  const wct = page.locator('div.rounded-lg', { has: page.getByText('FWCT: Field water cut') }).first();
  await expect(wct.getByText('0.1', { exact: true })).toBeVisible(); // axis floor, not a 1.8e-5 scale

  // failing deck: the stand-in fails any deck carrying HARNESS_FAIL
  await page.getByRole('tab', { name: 'Deck' }).click();
  const ed = page.getByTestId('deck-editor');
  await ed.click();
  await ed.press('Control+Home');
  await ed.type('HARNESS_FAIL\n');
  await page.getByRole('button', { name: /Save deck/ }).click();
  await page.waitForTimeout(800);
  await page.getByRole('tab', { name: 'Runs' }).click();
  await page.getByRole('button', { name: /Run simulation/ }).click();
  await expect(page.getByText('failed', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Problem with keyword HARNESS_FAIL/).first()).toBeVisible();
});
