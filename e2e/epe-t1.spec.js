// Petroleum Economics Studio senior test T1 on the /dev harness (the Ekene
// demo run computed by the engines cash flow): headline figures to three
// significant figures, the framework named in every title, zeros aligned,
// sunk history marked, the waterfall on the first valued year, and a PDF
// that carries every chart whichever tab is open.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/dev/epe/runs/r1');
  await expect(page.getByText('Cash Flow Analysis')).toBeVisible({ timeout: 60000 });
});

test('T1-001..004: NPV 1.98M, framework in the title, sunk history marked', async ({ page }) => {
  await expect(page.getByText('$1.98M').first()).toBeVisible();
  await expect(page.getByText('Cash Flow Profile (PIA 2021 to 2025, NTA 2025 from 2026)')).toBeVisible();
  await expect(page.getByText('History: sunk, not valued')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.locator('#epe-pdf-capture-profile').screenshot({ path: 'test-results/epe-t1-profile.png' });
});

test('T1-005: the waterfall opens on the first valued year under its own framework', async ({ page }) => {
  await page.getByRole('button', { name: 'Waterfall' }).click();
  await expect(page.getByText('Cash Flow Waterfall: Year 2026 (NTA 2025)')).toBeVisible();
});

test('T1-006: the PDF report is produced from any tab and the tab is restored', async ({ page }) => {
  test.setTimeout(120000);
  await page.getByRole('button', { name: 'Year-by-Year Detail' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.getByRole('button', { name: /PDF report/ }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
  const pdf = await dl.path();
  const fs = await import('fs');
  const pages = (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  expect(pages).toBeGreaterThanOrEqual(5); // tables plus four chart pages
  await expect(page.getByText('Year-by-Year Detail (PIA 2021 to 2025, NTA 2025 from 2026)')).toBeVisible();
});
