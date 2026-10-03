// Decline Curve Analysis senior test T1 on the /dev harness (in-memory
// Supabase): a synthetic hyperbolic well (qi 1000 bbl/d, Di 0.08/month,
// b 0.5, 36 months, 2 percent noise) is fitted and forecast; remaining
// reserves start at the last history date and EUR adds what was produced.
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

function csv() {
  let s = 'date,oil_rate_bopd\n';
  for (let m = 0; m < 36; m++) {
    const d = new Date(Date.UTC(2023, m, 1)).toISOString().slice(0, 10);
    const q = 1000 / (1 + 0.5 * 0.08 * (m + 0.5)) ** 2 * (1 + 0.02 * Math.sin(m * 7));
    s += `${d},${q.toFixed(2)}\n`;
  }
  const f = path.join(os.tmpdir(), 'dca-t1-hyp.csv');
  fs.writeFileSync(f, s);
  return f;
}

test('T1: remaining reserves after the last data, EUR, linear date axis', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/dca', { timeout: 120000 });
  await page.getByTitle(/Create new project/i).first().click({ timeout: 60000 });
  await page.getByPlaceholder(/name/i).last().fill('T1 hyperbolic');
  await page.getByRole('button', { name: /^Create project$/i }).click();
  const wellRow = page.getByText('Select Well').locator('xpath=ancestor::div[contains(@class,"flex")][1]');
  await wellRow.locator('button').last().click();
  await page.getByPlaceholder('Well Name').fill('HYP-1');
  await page.getByRole('button', { name: 'Add Well' }).click();
  await page.locator('input[type=file]').setInputFiles(csv());
  // DCA-U1: the door shows what it read before anything is imported
  await page.getByTestId('dca-import-commit').click();
  await page.getByRole('button', { name: 'Fit Model' }).click();
  await expect(page.getByText(/fit completed/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Generate Forecast' }).click();
  await expect(page.getByText('Forecast completed successfully').first()).toBeVisible({ timeout: 20000 });
  await page.getByText('Forecast Results', { exact: true }).click();
  const remaining = Number((await page.getByTestId('dca-remaining').textContent()).replace(/,/g, ''));
  const eur = Number((await page.getByTestId('dca-eur-total').textContent()).replace(/,/g, ''));
  // closed form with the true curve: about 210,000 bbl in the ten years after the last data;
  // the curve from first production (the old number) is about 612,000
  expect(remaining).toBeGreaterThan(170000);
  expect(remaining).toBeLessThan(250000);
  expect(eur).toBeGreaterThan(remaining + 380000);
  await expect(page.getByTestId('dca-time-to-limit')).toHaveText('10.0 yrs');
  await page.getByText('Model Fit', { exact: true }).click();
  await expect(page.locator('.recharts-xAxis').getByText(/T00:00/)).toHaveCount(0);
  await page.waitForTimeout(2500);
  await page.locator('#dca-main-plot').screenshot({ path: 'test-results/dca-t1-plot.png' });
});
