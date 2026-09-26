// ReservoirCalc Pro senior test T1 on the /dev harness: hybrid thickness
// in workspace units on a metre surface, the volume-against-contact curve,
// the Monte Carlo run reaching Prospect Risking in MMSTB with the path to
// Risked Reserves Valuation, and the PRMS low/best/high labels.

import { test, expect } from '@playwright/test';

async function importDome(page) {
  await page.getByTestId('rcp-tab-surfaces').click();
  await page.getByTestId('rcp-import-open').click();
  await page.getByTestId('rcp-registry-use-Harness Dome').click();
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
  await page.goto('/dev/reservoircalc-pro');
  await expect(page.getByTestId('rcp-harness')).toBeVisible({ timeout: 60000 });
});

test('T1-001 and E1: 50 ft gross on a metre dome is 50 ft of rock, and the volume-against-contact curve shows', async ({ page }) => {
  await importDome(page);
  await page.getByTestId('rcp-tab-geometry').click();
  await page.locator('label[for="im-hybrid"]').click();
  await page.locator('#owc-input').fill('-5600');
  await page.locator('#owc-input').blur();
  const stooip = page.getByTestId('rcp-stooip');
  await expect.poll(async () => Number(await stooip.getAttribute('data-value')), { timeout: 20000 }).toBeGreaterThan(0);
  const text = await page.locator('body').innerText();
  const bulk = Number(/Bulk Vol:\s*([\d,]+)/.exec(text)[1].replace(/,/g, ''));
  const area = Number(/HC Area:\s*([\d,]+)/.exec(text)[1].replace(/,/g, ''));
  // never more than area x 50 ft (it was 3.28 times that)
  expect(bulk).toBeLessThanOrEqual(area * 50 * 1.01);
  expect(bulk).toBeGreaterThan(area * 50 * 0.8);
  // T1-011: the contact is read in feet on this metre dome (crest -1501 m = -4925 ft):
  // an OWC at -4900 ft sits above the crest and leaves no oil
  await page.locator('#owc-input').fill('-4900');
  await page.locator('#owc-input').blur();
  await expect.poll(async () => Number(await stooip.getAttribute('data-value')), { timeout: 20000 }).toBe(0);
  await page.locator('#owc-input').fill('-5600');
  await page.locator('#owc-input').blur();
  await expect.poll(async () => Number(await stooip.getAttribute('data-value')), { timeout: 20000 }).toBeGreaterThan(0);
  await page.getByText('View Full Results').click();
  await page.getByRole('button', { name: /Detailed/ }).click();
  await page.getByTestId('rcp-contact-sweep').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('rcp-contact-sweep')).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: 'test-results/rcp-t1-sweep.png' });
});

test('T1-002/003/004/005: the Monte Carlo run reaches Prospect Risking in MMSTB, labels are Min / Most likely / Max and low / best / high', async ({ page }) => {
  await page.getByText('Deterministic', { exact: true }).first().click();
  await page.getByRole('option', { name: /Probabilistic/ }).click();
  await expect(page.getByText('Most likely').first()).toBeVisible();
  await expect(page.getByText('P90 (Min)')).toHaveCount(0);
  for (let i = 0; i < 4 && !(await page.getByTestId('rcp-mc-run').isVisible()); i++) await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByTestId('rcp-mc-run').click();
  await expect(page.getByText(/P90 \(Low estimate\)/i).first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Proven/i)).toHaveCount(0);
  await page.getByRole('button', { name: /Tools/ }).click();
  await page.getByText(/Prospect Risking/i).first().click();
  await expect(page.getByText(/from the last Monte Carlo run/)).toBeVisible();
  await expect(page.getByTestId('vol-unit')).toHaveValue('MMbbl');
  await expect.poll(async () => Number(await page.getByTestId('vol-mean').inputValue())).toBeGreaterThan(100);
  expect(Number(await page.getByTestId('vol-mean').inputValue())).toBeLessThan(1000);
  await page.getByTestId('prospect-name').fill('T1 Dome');
  await page.getByTestId('prospect-add').click();
  await expect(page.getByTestId('prospect-status')).toContainText('Added T1 Dome');
  await expect(page.getByTestId('prospect-value-link')).toHaveAttribute('href', /risked-reserves-valuation/);
});
