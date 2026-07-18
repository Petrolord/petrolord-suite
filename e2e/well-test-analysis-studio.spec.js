// Well Test Analysis Studio WT5 acceptance: the five-tab workstation drives
// on the /dev harness without auth. The deterministic sample buildup is the
// WT1 oracle fixture (truth k = 85 md, skin = 6.5, C = 0.015 bbl/psi,
// tp = 36 hr), so the Horner answer over a radial-flow window is asserted
// against the generating truth, not a hardcoded UI literal. The gas mode
// check flips the fluid and expects the pseudo-pressure deliverability
// surface to appear.

import { test, expect } from '@playwright/test';

const TRUTH = { k: 85, skin: 6.5 };

async function openWithSample(page) {
  await page.goto('/dev/well-test-analysis-studio');
  await expect(page.getByText('Well Test Analysis Studio').first()).toBeVisible();
  await page.getByRole('button', { name: /Sample/i }).click();
  await expect(page.getByText(/Points used/i)).toBeVisible();
}

const kpiValue = (page, title) =>
  page.locator('div', { hasText: new RegExp(`^${title}$`, 'i') })
    .locator('xpath=following-sibling::div[1]');

test('sample buildup walks all five tabs with live results', async ({ page }) => {
  await openWithSample(page);

  // Diagnostics: log-log plot and at least one detected regime chip
  await page.getByRole('tab', { name: 'Diagnostics' }).click();
  await expect(page.getByText(/Log-log diagnostic plot/i)).toBeVisible();
  await expect(page.getByText(/decades\)/).first()).toBeVisible();

  // Match: catalog select and the regression trigger enabled
  await page.getByRole('tab', { name: 'Match' }).click();
  await expect(page.getByRole('button', { name: /Auto-fit model/i })).toBeEnabled();
  await expect(page.getByText(/Log-log match/i).first()).toBeVisible();

  // Specialized: Horner over a radial window recovers the generating truth
  await page.getByRole('tab', { name: 'Specialized' }).click();
  await expect(page.getByText(/Horner plot/i).first()).toBeVisible();
  // storage dies out near t ~ 1 hr for the sample; 8 hr is safely radial.
  // The semilog From bound is the first "auto" window input in the rail.
  await page.getByPlaceholder('auto').first().fill('8');
  const kText = await kpiValue(page, 'Permeability k').first().innerText();
  const k = parseFloat(kText);
  expect(k).toBeGreaterThan(TRUTH.k * 0.94);
  expect(k).toBeLessThan(TRUTH.k * 1.06);
  const skinText = await kpiValue(page, 'Skin').first().innerText();
  const skin = parseFloat(skinText);
  expect(Math.abs(skin - TRUTH.skin)).toBeLessThan(1.0);

  // Report: consolidated summary, PDF export enabled, handoffs present
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByText(/Straight-line analyses/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Export PDF report/i })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Reservoir Balance/i })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Waterflood Design Studio/i })).toBeEnabled();
});

test('PDF report downloads from the sample interpretation', async ({ page }) => {
  await openWithSample(page);
  await page.getByRole('tab', { name: 'Report' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export PDF report/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^WTA_Report_.*\.pdf$/);
});

test('gas mode exposes pseudo-pressure analysis and deliverability', async ({ page }) => {
  await openWithSample(page);
  await page.getByText('Oil (slightly compressible)').click();
  await page.getByRole('option', { name: /Gas \(pseudo-pressure\)/i }).click();
  await expect(page.getByText(/Gas gravity/i)).toBeVisible();

  await page.getByRole('tab', { name: 'Specialized' }).click();
  await expect(page.getByText(/Gas deliverability/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Add test point/i })).toBeVisible();
});

// The result handoffs navigate into /dashboard routes, which sit behind auth
// that the /dev harness pattern deliberately avoids; the sender payload and
// both receiver intakes share the wellTestData contract in this PR and the
// Report-tab buttons' enablement is asserted above.
