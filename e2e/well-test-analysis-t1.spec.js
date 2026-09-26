// Well Test Analysis Studio senior test T1 on the /dev harness (in-memory
// Supabase). The semilog line defaults to the detected radial flow (the
// sample buildup, truth k 85 md and skin 6.5, used to give k 23 md over the
// whole record), Lee (1982) Example 2.1 is recovered through the UI (k 48
// md, skin 1.43, p* 1950 psi), and the untouched default match is never
// reported as an interpretation.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

const kpi = (page, title) =>
  page.locator('div', { hasText: new RegExp(`^${title}$`, 'i') }).locator('xpath=following-sibling::div[1]').first();

test('T1: auto Horner window on radial flow; default match not reported', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/well-test-analysis-studio', { timeout: 120000 });
  await page.getByRole('button', { name: /Sample/i }).click({ timeout: 60000 });

  await page.getByRole('tab', { name: 'Specialized' }).click();
  await expect(page.getByTestId('wts-semilog-auto')).toBeVisible();
  const k = parseFloat(await kpi(page, 'Permeability k').innerText());
  expect(k).toBeGreaterThan(85 * 0.95);
  expect(k).toBeLessThan(85 * 1.05);
  await expect(page.getByTestId('wts-derived-source')).toContainText('semilog line');

  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('wts-report-no-match')).toBeVisible();
  await expect(page.getByTestId('wts-report-source')).toContainText('semilog straight line');
  await expect(page.getByText('sqrt(t) slope')).toHaveCount(0); // no linear flow in this test

  await page.getByRole('tab', { name: 'Match' }).click();
  await page.getByRole('button', { name: /Auto-fit model/i }).click();
  await expect(page.getByText('Converged').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('wts-derived-source')).toContainText('working match');
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByTestId('wts-report-no-match')).toHaveCount(0);
  await expect(kpi(page, 'kh')).toHaveText(/^3,8\d\d/); // written out, not 3.80e+3
});

test('T1: Lee (1982) Example 2.1 buildup through the UI', async ({ page }) => {
  test.setTimeout(180000);
  const pts = [[1, 1764.0], [2, 1793.51], [4, 1822.46], [6, 1838.94], [8, 1850.33], [12, 1865.82], [16, 1876.3], [24, 1890.13], [36, 1902.62], [48, 1910.54], [60, 1916.09], [72, 1920.23]];
  const f = path.join(os.tmpdir(), 'wta-t1-lee21.csv');
  fs.writeFileSync(f, `dt_hr,pws_psi\n${pts.map((p) => p.join(',')).join('\n')}`);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/well-test-analysis-studio', { timeout: 120000 });
  await page.getByText('Import CSV').first().waitFor({ timeout: 60000 });
  await page.locator('input[type=file]').first().setInputFiles(f);
  const field = (re) => page.locator('div.space-y-1', { has: page.locator('label', { hasText: re }) }).locator('input').first();
  for (const [re, v] of [[/^Producing time tp/, '72'], [/^Flowing pressure at shut-in/, '1150'], [/^Net thickness h/, '22'],
    [/^Porosity/, '0.2'], [/^Wellbore radius rw/, '0.3'], [/^Total ct/, '0.00002'], [/^Oil FVF B/, '1.3'],
    [/^Viscosity/, '1'], [/^Rate q/, '500'], [/^Initial pressure pi/, '1950']]) {
    await field(re).fill(v);
  }
  await page.getByRole('tab', { name: 'Specialized' }).click();
  await expect(kpi(page, 'Permeability k')).toHaveText(/^48\.0/);
  await expect(kpi(page, 'Skin')).toHaveText(/^1\.43/);
  await expect(kpi(page, 'p\\*')).toHaveText(/^1950\.[0-9]/);
});
