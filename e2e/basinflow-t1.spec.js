// Basin & Charge Modeling senior test T1 on the /dev harness: the time
// axis runs oldest to present left to right on every plot, the burial
// history carries %Ro isolines and isotherms, the maturity windows are
// labelled, the events chart has its elements and the critical moment,
// and the transformation ratio sits with generation and expulsion.

import { test, expect } from '@playwright/test';

async function run(page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/basinflow-genesis');
  await expect(page.getByTestId('bf-harness')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('bf-mode-expert').click();
  await page.getByTestId('bf-simulate').click();
  await expect(page.getByTestId('bf-sim-status')).toHaveText('Complete', { timeout: 60000 });
  await page.getByTestId('bf-sim-view').click();
}

// x pixel of a tick label on the visible chart
async function tickX(page, text) {
  const t = page.locator('.recharts-cartesian-axis-tick-value', { hasText: new RegExp(`^${text}$`) }).first();
  const b = await t.boundingBox();
  return b.x + b.width / 2;
}

test('T1-001/E1: burial history reads oldest to present with isolines and isotherms', async ({ page }) => {
  await run(page);
  await page.getByTestId('bf-results-tab-burial').click();
  await expect(page.getByText('0.55 %Ro').first()).toBeVisible();
  expect(await tickX(page, '140')).toBeLessThan(await tickX(page, '0'));
  // even spacing: 0-20 and 20-40 are the same width
  const [x0, x20, x40] = [await tickX(page, '0'), await tickX(page, '20'), await tickX(page, '40')];
  expect(Math.abs((x0 - x20) - (x20 - x40))).toBeLessThan(3);
  await page.getByTestId('bf-burial-overlay').selectOption('temp');
  await expect(page.getByText('100 °C').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/bf-t1-burial.png' });
});

test('T1-002/003/E2: maturity windows labelled, events chart with the critical moment, transformation ratio', async ({ page }) => {
  await run(page);
  await page.getByTestId('bf-results-tab-maturity').click();
  await expect(page.getByTestId('bf-maturity-windows')).toContainText('Oil window 0.55 to 1.3 %Ro');
  expect(await tickX(page, '140')).toBeLessThan(await tickX(page, '0'));
  await page.getByTestId('bf-results-tab-generation').click();
  await expect(page.getByText('Transformation Ratio (source layers)')).toBeVisible();
  await page.getByTestId('bf-results-tab-timing').click();
  await expect(page.getByTestId('bf-events-row-source')).toBeVisible();
  await expect(page.getByTestId('bf-events-row-seal')).toBeVisible();
  await expect(page.getByTestId('bf-critical-moment')).toContainText(/Critical moment \d+ Ma/);
  await page.screenshot({ path: 'test-results/bf-t1-events.png' });
  await page.getByTestId('bf-results-tab-summary').click();
  await expect(page.getByText(/1 source layer passed 10% transformation/)).toBeVisible();
});
