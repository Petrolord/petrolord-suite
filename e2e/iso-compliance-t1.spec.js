// ISO Compliance senior test T1 on /dev/assurance/iso. "Add a standard" on
// the dashboard opens the form directly (it used to land on a list asking
// again); a standard with no clauses carries a blocker; adding a clause
// counts it; no empty state recounts the app's own history.
import { test, expect } from '@playwright/test';

test('T1: add a standard and a clause; direct form; plain empty states', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dev/assurance/iso', { timeout: 120000 });
  await page.getByRole('button', { name: 'Add a standard' }).click();
  await expect(page.getByPlaceholder('ISO 9001:2015')).toBeVisible();
  await page.getByPlaceholder('ISO 9001:2015').fill('ISO 9001:2015');
  await page.getByPlaceholder('Quality management systems').fill('Quality management systems');
  await page.getByRole('button', { name: 'Add standard' }).click();
  await expect(page.getByText('1 blocker')).toBeVisible({ timeout: 20000 });
  await page.getByRole('link', { name: 'Clauses', exact: true }).or(page.getByRole('button', { name: 'Clauses', exact: true })).first().click();
  await expect(page.getByText('The clause register is empty')).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/used to show|invented/);
  await page.getByRole('button', { name: 'Add a clause' }).click();
  await page.locator('#cl-standard').selectOption({ index: 1 });
  await page.locator('#cl-ref').fill('7.5');
  await page.locator('#cl-title').fill('Documented information');
  await page.getByRole('button', { name: /^Add clause|^Save clause|^Add$/ }).last().click();
  await expect(page.getByText('Documented information').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('1 of 1 clause', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
