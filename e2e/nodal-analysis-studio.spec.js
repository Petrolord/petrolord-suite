// Nodal Analysis Studio NA4 acceptance: the studio drives on the /dev
// harness without auth, the default well solves to a flowing operating
// point, and the rate agrees with the committed oracle golden for the
// same case (goldens.operatingPoint oil whp 250: the default inputs ARE
// that validation case).

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldens = JSON.parse(
  fs.readFileSync(path.join(here, '..', 'src', 'utils', 'nodal', '__tests__', 'goldens.json'), 'utf8')
);
const oracleCase = goldens.operatingPoint.oil.find((c) => c.vlp.whp === 250);

test('default well flows and the operating point matches the oracle case', async ({ page }) => {
  await page.goto('/dev/nodal-analysis-studio');

  await expect(page.getByText('Nodal Analysis Studio').first()).toBeVisible();

  const status = page.getByTestId('nodal-system-status');
  await expect(status).toHaveAttribute('data-status', 'flowing', { timeout: 30000 });

  // UI solve (Heun, nGrid 25) vs oracle bisection+RK4 golden: within 2%
  const opRate = page.getByTestId('nodal-op-rate');
  await expect(opRate).toBeVisible();
  const q = parseFloat(await opRate.getAttribute('data-q'));
  expect(Math.abs(q - oracleCase.op.q) / oracleCase.op.q).toBeLessThan(0.02);
});

test('tabs render their views', async ({ page }) => {
  await page.goto('/dev/nodal-analysis-studio');

  await page.getByRole('tab', { name: 'Inflow' }).click();
  await expect(page.getByText('Inflow performance')).toBeVisible();

  await page.getByRole('tab', { name: 'Outflow' }).click();
  await expect(page.getByText('Tubing performance (outflow) curve')).toBeVisible();
  await expect(page.getByText('Pressure traverse at the viewed rate')).toBeVisible();

  await page.getByRole('tab', { name: 'Chokes' }).click();
  await expect(page.getByText('All correlations at these conditions')).toBeVisible();

  await page.getByRole('tab', { name: 'Gas lift' }).click();
  await expect(page.getByText('Run the screening', { exact: false })).toBeVisible();
});
