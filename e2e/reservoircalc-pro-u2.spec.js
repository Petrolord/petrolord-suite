// ReservoirCalc Pro upgrade U2 (Step 2 batches, 2026-10-01) on the /dev
// harness. One test per built item that a browser can see.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
});

/** The deterministic STOIIP once it stops changing (and differs from `not`). */
async function settledStooip(page, not = null) {
  let last = NaN; let same = 0;
  for (let i = 0; i < 60; i++) {
    const v = Number(await page.getByTestId('rcp-stooip').getAttribute('data-value').catch(() => NaN));
    if (Number.isFinite(v) && v > 0 && v !== not && v === last) { same += 1; if (same >= 3) return v; } else same = 0;
    last = v;
    await page.waitForTimeout(500);
  }
  return last;
}

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

test('U2-008: Trap only fills to the spill point and says so; off, the old open-closure count returns', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/reservoircalc-pro');
  await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('rcp-tab-surfaces').click();
  await page.getByTestId('rcp-import-open').click();
  await page.getByTestId('rcp-registry-use-Harness Dome').click();
  await expect(page.getByTestId('rcp-import-ready')).toContainText(/depth m, elevation/);
  await page.getByTestId('rcp-import-confirm').click();
  const anyway = page.getByTestId('rcp-import-anyway');
  await Promise.race([
    anyway.waitFor({ state: 'visible', timeout: 15000 }).then(() => anyway.click()).catch(() => {}),
    page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {}),
  ]);
  await page.getByTestId('rcp-tab-geometry').click();
  await page.locator('label[for="im-hybrid"]').click();
  await expect(page.getByTestId('rcp-fill-to-spill').locator('input')).toBeChecked();
  await page.getByTestId('rcp-contact-unit').selectOption('m');
  await page.locator('#owc-input').fill('-2000');
  await page.locator('#owc-input').blur();
  const trapped = await settledStooip(page);
  await page.getByRole('button', { name: /View Full Results/ }).click();
  await page.getByRole('button', { name: /^Detailed$/ }).click();
  await expect(page.getByText(/Filled to spill|the trap spills at the edge/).first()).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Escape');
  // off: every cell above the contact counts again
  await page.getByTestId('rcp-fill-to-spill').locator('input').uncheck();
  const frame = await settledStooip(page, trapped);
  expect(frame).toBeGreaterThan(trapped * 1.01);
  expect(errors).toEqual([]);
});

test('U2-002: the correlation editor refuses a set that cannot hold and runs a valid one', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openProbabilistic(page);
  await page.getByRole('button', { name: /^Next/ }).click();
  await expect(page.getByTestId('rcp-corr-row-0')).toBeVisible();
  // porosity-Sw -0.8 is there; add Sw-NTG 0.9 and porosity-NTG 0.9: cannot hold
  for (const [a, b, rho] of [['sw', 'ntg', '0.9'], ['porosity', 'ntg', '0.9']]) {
    await page.getByTestId('rcp-corr-add').click();
    const row = page.locator('[data-testid^="rcp-corr-row-"]').last();
    await row.locator('select').nth(0).selectOption(a);
    await row.locator('select').nth(1).selectOption(b);
    const rhoField = row.locator('input');
    await rhoField.fill(rho);
    await rhoField.blur();
  }
  await expect(page.getByTestId('rcp-corr-problem')).toContainText('cannot hold together');
  await page.getByRole('button', { name: /^Next/ }).click();
  await expect(page.getByTestId('rcp-mc-run')).toBeDisabled();
  await expect(page.getByTestId('rcp-corr-block')).toBeVisible();
  // weaken the last pair: the set holds and the run goes
  await page.getByRole('button', { name: /Back/ }).click();
  const last = page.locator('[data-testid^="rcp-corr-row-"]').last().locator('input');
  await last.fill('-0.5');
  await last.blur();
  await expect(page.getByTestId('rcp-corr-problem')).toHaveCount(0);
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByTestId('rcp-mc-run').click();
  await expect(page.getByTestId('rcp-mc-last-seed')).toBeVisible({ timeout: 60000 });
  expect(errors).toEqual([]);
});

test('U2-007: solution gas from Rs and Sw from a SCAL saturation-height project', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/reservoircalc-pro');
  await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
  await page.locator('label[for="im-areadepth"]').click();
  await page.getByTestId('rcp-ad-text').fill('-6000,0\n-6100,300\n-6200,1200\n-6300,2700\n-6400,4800\n-6500,7500\n-6600,10800');
  await page.getByTestId('rcp-ad-read').click();
  await page.locator('#owc-input').fill('-6550');
  await page.locator('#owc-input').blur();
  const typed = await settledStooip(page);
  // Sw from the sample SCAL project (FWL -6,758.53 ft from the project)
  await page.getByTestId('rcp-sw-source').selectOption('shm');
  await page.getByTestId('rcp-shm-project').selectOption('scal-sample');
  await expect(page.getByTestId('rcp-shm-result')).toContainText(/Sw used: oil leg 0\.\d+/, { timeout: 30000 });
  const fromShm = await settledStooip(page, typed);
  expect(fromShm).not.toBe(typed);
  // Rs on the Fluid tab: solution gas in the full results
  await page.getByRole('tab', { name: 'Fluid' }).click();
  await page.getByTestId('rcp-rs').fill('550');
  await page.getByTestId('rcp-rs').blur();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /View Full Results/ }).click();
  await page.getByRole('button', { name: /^Detailed$/ }).click();
  await expect(page.getByTestId('rcp-solution-gas')).toContainText(/Solution gas in place: .* Bscf \(Rs 550\)/, { timeout: 15000 });
  await expect(page.getByTestId('rcp-shm-used')).toContainText('Sw from saturation height');
  expect(errors).toEqual([]);
});

test('U2-009: the 2D view is the shared map kit: ink, a scale in metres, and AOIs drawn by clicking', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/reservoircalc-pro');
  await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('rcp-tab-surfaces').click();
  await page.getByTestId('rcp-import-open').click();
  await page.getByTestId('rcp-registry-use-Harness Dome').click();
  await page.getByTestId('rcp-import-confirm').click();
  const anyway = page.getByTestId('rcp-import-anyway');
  await Promise.race([
    anyway.waitFor({ state: 'visible', timeout: 15000 }).then(() => anyway.click()).catch(() => {}),
    page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {}),
  ]);
  await page.getByRole('button', { name: '2D map view' }).click();
  const canvas = page.getByTestId('rcp-map-canvas');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  const ink = await canvas.evaluate((c) => {
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const [r0, g0, b0] = data;
    let n = 0;
    for (let i = 0; i < data.length; i += 16) if (Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) > 30) n += 1;
    return n / (data.length / 16);
  });
  expect(ink).toBeGreaterThan(0.2);
  // draw an AOI with three clicks on the kit
  await page.getByTestId('rcp-tab-aoi').click();
  await page.getByRole('button', { name: /Draw New Polygon/ }).click();
  const box = await canvas.boundingBox();
  for (const [fx, fy] of [[0.4, 0.4], [0.6, 0.4], [0.5, 0.6]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  }
  await expect(page.getByText(/Click the 2D map to add points \(3\)/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('U2-011: the one-page prospect summary PDF reads back with its reviewer header', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/prospect-risking');
  await expect(page.getByTestId('prospect-risking')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('prospect-name').fill('Keta East');
  if (!(await page.getByTestId('vol-mean').inputValue())) {
    await page.getByTestId('vol-mean').fill('42.5');
    await page.getByTestId('vol-p90').fill('18.2');
    await page.getByTestId('vol-p50').fill('37.9');
    await page.getByTestId('vol-p10').fill('71.4');
  }
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId('prospect-pdf').click()]);
  const { execFileSync } = await import('child_process');
  const file = await download.path();
  expect(execFileSync('pdfinfo', [file], { encoding: 'utf8' })).toMatch(/Pages:\s+1\b/);
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  expect(text).toMatch(/Prospect summary: Keta East/);
  expect(text).toMatch(/Field: .* \| Analyst: .* \| Date: \d{4}-\d{2}-\d{2}/);
  expect(text).toMatch(/Pg \(product\)/);
  expect(text).toMatch(/risked percentiles are not quoted/);
  expect(errors).toEqual([]);
});

test('U2-012: success-case economics from the screening NPV, saved with the prospect', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/prospect-risking');
  await expect(page.getByTestId('prospect-risking')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('vol-unit').selectOption('MMbbl');
  await page.getByTestId('vol-mean').fill('42.5');
  await page.getByTestId('prospect-econ-on').check();
  await expect(page.getByTestId('econ-npv')).toContainText('$MM');
  const npv1 = await page.getByTestId('econ-npv').innerText();
  // a higher price raises the NPV
  await page.getByTestId('econ-price').fill('90');
  await expect(page.getByTestId('econ-npv')).not.toHaveText(npv1);
  await page.getByTestId('prospect-name').fill('Keta Econ');
  await page.getByTestId('prospect-add').click();
  await expect(page.getByTestId('prospect-status')).toContainText('Added Keta Econ');
  expect(errors).toEqual([]);
});
