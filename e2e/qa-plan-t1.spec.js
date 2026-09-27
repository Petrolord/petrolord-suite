// QA Plan senior test T1 on /dev/assurance/qa-plan. Submitting empty takes
// focus to the title; a plan with a scope and one ITP item creates as
// QAP-2026-001 and says so in a toast (this page's toast store, a second
// copy of the shadcn one, had no Toaster); the ITP table shows every column
// at 1366 without scrolling its row actions away.
import { test, expect } from '@playwright/test';

test('T1: create a quality plan; focus, toast, full-width ITP', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dev/assurance/qa-plan', { timeout: 120000 });
  await page.getByRole('button', { name: 'Create a plan' }).click();
  await page.getByRole('button', { name: 'Create plan' }).last().click();
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('plan-title');
  await page.locator('#plan-title').fill('Subsea tie-back quality plan');
  await page.locator('#plan-scope').fill('Fabrication and testing of the tie-back spools.');
  await page.locator('#title-0').fill('Hydrotest of spool 1');
  await page.getByRole('button', { name: 'Create plan' }).last().click();
  await expect(page.getByText('QAP-2026-001 created')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('QAP-2026-001: Subsea tie-back quality plan')).toBeVisible();
  const table = page.getByText('Hydrotest of spool 1').locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")][1]');
  expect(await table.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
