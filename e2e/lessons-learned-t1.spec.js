// Lessons Learned senior test T1 on /dev/assurance/lessons. A captured
// lesson is LL-2026-001, Draft, and says it cannot be validated until it
// has why and what to do; Search with no words explains that the
// published-only filter hides the draft (it said "Try fewer words").
import { test, expect } from '@playwright/test';

test('T1: capture a lesson; search explains an empty result', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dev/assurance/lessons', { timeout: 120000 });
  await page.getByRole('button', { name: 'Capture the first one' }).click();
  await page.locator('#ll-title').fill('Export pump failed during the startup sequence');
  await page.locator('#ll-desc').fill('Seal flush was not lined up before start.');
  await page.getByRole('button', { name: 'Capture lesson' }).click();
  await expect(page.getByText('LL-2026-001: Export pump failed during the startup sequence')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('It cannot be validated until it has all three.')).toBeVisible();
  await page.getByRole('link', { name: 'Search', exact: true }).or(page.getByRole('button', { name: 'Search', exact: true })).first().click();
  await expect(page.getByText(/the one lesson in the register is not published yet/)).toBeVisible();
  await expect(page.getByText('Try fewer words')).toHaveCount(0);
  await page.getByLabel('Published lessons only').uncheck();
  await expect(page.getByText('1 of 1 lesson.')).toBeVisible();
  expect(errors).toEqual([]);
});
