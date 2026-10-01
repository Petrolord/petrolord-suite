// ReservoirCalc Pro upgrade U1 (practitioner lens, 2026-09-30) on the
// /dev harness: every saved release opens and recomputes (PL5), the
// registry door refuses a TWT row and reads a depth row in metres (PL9),
// an open closure is said (PL4), the Monte Carlo run reads its own units,
// hands recoverable volumes on and reprints its reviewer block in the PDF
// (PL1, PL7), and the page holds at three viewports in both themes (PL6).

import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';

async function importDome(page) {
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
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15000 });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
});

test('PL5: every saved release opens and recomputes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/reservoircalc-pro?saved=1');
  await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
  const names = ['Aug single reservoir', 'Aug two reservoirs', 'Aug Monte Carlo', 'Sep registry hybrid', 'T1 structural MC'];
  for (const name of names) {
    await page.getByRole('button', { name: /Projects/ }).first().click();
    await page.getByText(name, { exact: true }).first().click();
    await page.getByRole('button', { name: 'Load Project' }).click();
    await expect(page.getByTestId('rcp-project-name')).toHaveText(name, { timeout: 15000 });
    // the deterministic view recomputes on the loaded case
    if (await page.getByTestId('rcp-stooip').isVisible().catch(() => false)) {
      await expect.poll(async () => Number(await page.getByTestId('rcp-stooip').getAttribute('data-value')), { timeout: 30000 }).toBeGreaterThan(0);
    }
  }
  expect(errors).toEqual([]);
});

test('PL9: the registry door refuses a TWT row and an open closure is said', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/reservoircalc-pro');
  await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('rcp-tab-surfaces').click();
  await page.getByTestId('rcp-import-open').click();
  await expect(page.getByTestId('rcp-registry-domain-Dome TWT')).toContainText(/time surface/);
  await page.getByTestId('rcp-registry-use-Dome TWT').click();
  await expect(page.getByText(/cannot be used for volumetrics/)).toBeVisible();
  await expect(page.getByText(/time surface \(TWT\).*Depth-convert/)).toBeVisible();
  await page.getByTestId('rcp-import-cancel').click();

  await importDome(page);
  await page.getByTestId('rcp-tab-geometry').click();
  await page.locator('label[for="im-hybrid"]').click();
  // the harness dome crest is -1500 m; -2000 m is below every edge of the map
  await page.getByTestId('rcp-contact-unit').selectOption('m');
  await page.locator('#owc-input').fill('-2000');
  await page.locator('#owc-input').blur();
  await expect.poll(async () => Number(await page.getByTestId('rcp-stooip').getAttribute('data-value')), { timeout: 30000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: /View Full Results/ }).click();
  await page.getByRole('button', { name: /^Detailed$/ }).click();
  await expect(page.getByText(/Open closure/).first()).toBeVisible({ timeout: 15000 });
  // RCP U2-005: a registry surface integrates on its own nodes
  await expect(page.getByTestId('rcp-gridding')).toContainText(/cells of|nodes of/);
  expect(errors).toEqual([]);
});

test('PL1 and PL7: a Monte Carlo run reads its own units, hands recoverable volumes on and prints the reviewer block', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/reservoircalc-pro');
  await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
  await page.getByTestId('rcp-report-field').fill('Keta');
  await page.getByTestId('rcp-report-analyst').fill('E2E Analyst');
  await page.getByText('Deterministic', { exact: true }).first().click();
  await page.getByRole('option', { name: /Probabilistic/ }).click();
  await expect(page.getByTestId('rcp-mc-dists')).toContainText('Net-to-Gross');
  await expect(page.getByTestId('rcp-mc-dists')).toContainText('Oil Recovery Factor');
  for (let i = 0; i < 4 && !(await page.getByTestId('rcp-mc-run').isVisible()); i++) await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByTestId('rcp-mc-run').click();
  await expect(page.getByText(/P90 \(Low estimate\)/i).first()).toBeVisible({ timeout: 30000 });

  // Prospect Risking gets the recoverable volume
  await page.getByRole('button', { name: /Tools/ }).click();
  await page.getByText(/Prospect Risking/i).first().click();
  await expect(page.getByTestId('vol-basis')).toHaveValue('recoverable');
  await expect(page.getByText(/Unrisked recoverable volume/)).toBeVisible();
  await page.keyboard.press('Escape');

  // the full results view: summary units, exceedance curve, PDF readback
  await page.getByRole('button', { name: /View Full Analysis/ }).click();
  await page.getByRole('button', { name: /^Detailed$/ }).click();
  await expect(page.getByTestId('rcp-mc-row-stooip')).toContainText('MMSTB');
  await expect(page.getByTestId('rcp-mc-row-recOil')).toContainText('Recoverable oil');
  await expect(page.getByText(/probability of exceeding/).first()).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /Export PDF/ }).click()]);
  const text = execFileSync('pdftotext', ['-layout', await download.path(), '-'], { encoding: 'utf8' });
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/rcp-u1-mc-report.txt', text);
  expect(text).toMatch(/Field: Keta \| Analyst: E2E Analyst/);
  expect(text).toMatch(/Monte Carlo: 10,000 realizations/);
  expect(text).toMatch(/MMSTB/);
  expect(errors).toEqual([]);
});

for (const vp of [{ w: 1366, h: 768 }, { w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  for (const theme of ['light', 'dark']) {
    test(`PL6: ${vp.w}x${vp.h} ${theme}: no page errors, no sideways page scroll, the results render`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/dev/reservoircalc-pro');
      await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
      await expect.poll(async () => Number(await page.getByTestId('rcp-stooip').first().getAttribute('data-value')), { timeout: 30000 }).toBeGreaterThan(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/rcp-u1-${vp.w}-${theme}.png` });
      expect(errors).toEqual([]);
    });
  }
}

test('PL11: a contact typed key by key with a leading minus, and a porosity cleared and typed key by key', async ({ page }) => {
  await page.goto('/dev/reservoircalc-pro');
  await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
  await page.locator('label[for="im-hybrid"]').click();
  const owc = page.locator('#owc-input');
  await owc.fill('');
  await owc.pressSequentially('-1550', { delay: 40 });
  await expect(owc).toHaveValue('-1550');
  await owc.blur();
  await expect(owc).toHaveValue('-1550');
  await page.locator('label[for="im-simple"]').click();
  const phi = page.locator('label:has-text("Porosity") + input, label:has-text("Porosity") ~ input').first();
  await phi.fill('');
  // a number input reports "0." as "0" while typing; what matters is that
  // the dot survives and the next digits land after it
  await phi.pressSequentially('0.25', { delay: 40 });
  await expect(phi).toHaveValue('0.25');
  await phi.blur();
  await expect(phi).toHaveValue('0.25');
});
