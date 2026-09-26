// Data Quality Studio senior test T1 on the /dev harness. A 120-day
// production table with planted defects: spikes x3 (days 30, 61, 95), a
// frozen oil run (70-76), negatives (40, 41), blanks (50-52), 30-hour days
// (20, 88); hours_on is otherwise a clean 24. Every planted defect is
// flagged, the clean hours column is not called frozen, and the charts draw
// their axes.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

function planted() {
  let s = 'date,oil,water,hours_on\n';
  let frozen = null;
  for (let d = 0; d < 120; d += 1) {
    const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
    let oil = 1000 * Math.exp(-0.004 * d) * (1 + 0.01 * Math.sin(d * 1.7));
    if ([30, 61, 95].includes(d)) oil *= 3;
    if (d >= 70 && d <= 76) { if (frozen === null) frozen = oil; oil = frozen; }
    if (d === 40 || d === 41) oil = -50;
    const hours = d === 20 || d === 88 ? 30 : 24;
    s += `${date},${d >= 50 && d <= 52 ? '' : oil.toFixed(2)},${(200 + d * 1.5 + 3 * Math.sin(d)).toFixed(2)},${hours}\n`;
  }
  const f = path.join(os.tmpdir(), 'dq-t1.csv');
  fs.writeFileSync(f, s);
  return f;
}

test('T1: planted defects found, hours not frozen, axes drawn', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/data-quality-studio', { timeout: 120000 });
  await page.getByText('Upload', { exact: true }).first().click({ timeout: 60000 });
  await page.getByTestId('upload-input').setInputFiles(planted());
  await page.getByTestId('index-col').selectOption({ index: 1 });
  await page.getByTestId('use-upload').click();
  await expect(page.getByTestId('frozen-hours')).toContainText('hours_on is left out');
  await page.getByTestId('run-qc').click();
  await page.getByRole('tab', { name: 'Scorecard and flags' }).click();
  const table = page.locator('table').filter({ hasText: 'Reason' });
  await expect(table).toContainText('samples 50 to 52 are missing');
  await expect(table).toContainText('7 values in a row from entry 70 to 76');
  await expect(table).toContainText('value 30 is above the maximum 24');
  await expect(table).toContainText('rate -50 is negative');
  await expect(table).not.toContainText(/values in a row from entry \d+ to \d+ stay at 24/);
  await page.getByRole('tab', { name: 'Charts' }).click();
  await expect(page.getByTestId('chart-series').or(page.locator('svg.recharts-surface').first())
    .locator('.recharts-cartesian-axis-tick-value').first()).toBeVisible();
});
