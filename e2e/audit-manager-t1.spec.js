// Audit & Findings Manager senior test T1 on /dev/assurance/audit. The
// dashboard's "Build a checklist" opens the form; a checklist with one
// Critical question, activated, runs an audit (AUD-2026-001); answering it
// Nonconformant needs evidence, and then the item "Needs one" finding and
// the audit cannot report until it has one; the Answer column is on screen.
import { test, expect } from '@playwright/test';

test('T1: checklist to audit to a critical nonconformance', async ({ page }) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dev/assurance/audit', { timeout: 120000 });
  await page.getByRole('button', { name: 'Build a checklist' }).click();
  await page.locator('#tp-code').fill('CHK-01');
  await page.locator('#tp-title').fill('Pressure vessel inspection');
  await page.locator('#tp-status').selectOption('Active');
  await page.locator('form button[type="submit"]').first().click();
  await page.getByRole('button', { name: 'Add a question' }).first().click();
  await page.locator('#it-no').fill('1.1');
  await page.locator('#it-q').fill('Is the relief valve certificate in date?');
  await page.locator('#it-crit').selectOption('Critical');
  await page.getByRole('button', { name: 'Add question', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText(/1 question/).first()).toBeVisible();
  await page.getByRole('link', { name: 'Audits', exact: true }).click();
  await page.getByRole('button', { name: 'Plan an audit' }).first().click();
  await page.locator('#au-title').fill('HP separator inspection');
  await page.locator('#au-template').selectOption({ index: 1 });
  await page.locator('#au-lead').selectOption({ index: 1 });
  await page.locator('form button[type="submit"]').first().click();
  await page.getByText('HP separator inspection').first().click();
  await expect(page.getByText('AUD-2026-001: HP separator inspection')).toBeVisible({ timeout: 20000 });
  const answer = page.getByRole('button', { name: 'Answer' }).first();
  const box = await answer.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(1366);
  await answer.click();
  await page.locator('#an-result').selectOption('Nonconformant');
  await page.getByRole('button', { name: 'Record answer' }).click();
  await expect(page.getByText(/A nonconformity is an assertion/)).toBeVisible();
  await page.locator('#an-evidence').fill('PSV-101 certificate, expired 2026-08-14');
  await page.getByRole('button', { name: 'Record answer' }).click();
  await expect(page.getByText('Needs one')).toBeVisible();
  await expect(page.getByText('1 critical nonconformance with no finding:')).toBeVisible();
  expect(errors).toEqual([]);
});
