// ReservoirCalc Pro upgrade U2 (Step 2 batches, 2026-10-01) on the /dev
// harness. One test per built item that a browser can see.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
});

async function openProbabilistic(page) {
  await page.goto('/dev/reservoircalc-pro');
  await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
  await page.getByText('Deterministic', { exact: true }).first().click();
  await page.getByRole('option', { name: /Probabilistic/ }).click();
  await expect(page.getByTestId('rcp-mc-dists')).toBeVisible();
}

test('U2-006: the Monte Carlo runs in a background worker with progress and Cancel', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openProbabilistic(page);
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByRole('button', { name: '250k' }).click();
  await page.getByTestId('rcp-mc-seed').fill('123');
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByTestId('rcp-mc-run').click();
  // the page stays live: progress moves and Cancel is there
  await expect(page.getByTestId('rcp-mc-progress')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('rcp-mc-cancel')).toBeVisible();
  await page.getByTestId('rcp-mc-cancel').click();
  await expect(page.getByText('Run cancelled').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('rcp-mc-run')).toBeEnabled();

  // a full 10k run in the worker, its seed recorded
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: '10k' }).click();
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByTestId('rcp-mc-run').click();
  await expect(page.getByTestId('rcp-mc-last-seed')).toContainText('seed 123, background worker', { timeout: 60000 });
  expect(errors).toEqual([]);
});

test('U2-001: an area/depth table is read, cut by the contact, and exported', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/reservoircalc-pro');
  await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
  await page.locator('label[for="im-areadepth"]').click();
  // a hostile table first: the area shrinks with depth
  await page.getByTestId('rcp-ad-text').fill('-7000,0\n-7100,500\n-7200,300');
  await page.getByTestId('rcp-ad-read').click();
  await expect(page.getByTestId('rcp-ad-msg')).toContainText('falls from 500 to 300');
  await page.getByTestId('rcp-ad-text').fill('depth, area_top\n-7000, 0\n-7100, 400\n-7200, 1200\n-7300, 2400\n-7400, 4000');
  await page.getByTestId('rcp-ad-read').click();
  await expect(page.getByTestId('rcp-ad-table')).toContainText('-7,200');
  // the OWC cuts the table; the STOIIP is a number
  await page.locator('#owc-input').fill('-7300');
  await page.locator('#owc-input').blur();
  await expect.poll(async () => Number(await page.getByTestId('rcp-stooip').getAttribute('data-value')), { timeout: 30000 }).toBeGreaterThan(0);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rcp-ad-export').click()]);
  const fs = await import('fs');
  const csv = fs.readFileSync(await download.path(), 'utf8');
  expect(csv).toMatch(/^depth_tvdss_ft,area_top_acres,area_base_acres/);
  expect(csv).toMatch(/-7300,2400,/);
  expect(errors).toEqual([]);
});
