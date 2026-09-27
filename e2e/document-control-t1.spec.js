// Document Control senior test T1 on /dev/assurance/document-control. A
// draft registers as DOC-2026-001 Rev 01 (the numbering RPC stood in), the
// reviewer picker offers the other member and is wide enough to read, and
// the report counts it by department and category.
import { test, expect } from '@playwright/test';

test('T1: register a controlled document; readable reviewer picker; reports count it', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dev/assurance/document-control', { timeout: 120000 });
  await page.getByRole('button', { name: 'Register a document' }).click();
  await page.getByPlaceholder('Emergency Response Plan').fill('Harness ERP');
  await page.locator('#department').selectOption('HSE');
  await page.getByPlaceholder('Policy, SOP, Drawing...').fill('Procedure');
  const rv = page.locator('select[id$="-reviewer-0"]');
  const w = await rv.evaluate((el) => el.getBoundingClientRect().width);
  expect(w).toBeGreaterThan(150);
  await rv.selectOption({ label: 'Harness Reviewer (reviewer@petrolord.dev)' });
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page.getByText('DOC-2026-001')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Rev 01')).toBeVisible();
  await page.getByRole('link', { name: 'Reports' }).or(page.getByRole('tab', { name: 'Reports' })).first().click();
  await expect(page.getByText(/1 controlled document, 0 published, 0 overdue for review/)).toBeVisible();
  expect(errors).toEqual([]);
});
