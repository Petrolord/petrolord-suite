// Regulatory Compliance senior test T1 on /dev/assurance/regulatory. The
// live status preview reads Due soon at 10 days (inside the 30-day lead),
// Overdue at -5 and On track at 90; a filing on an Annual obligation rolls
// the next due date forward one year; a single-status donut is a whole ring.
import { test, expect } from '@playwright/test';

const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const rolled = () => { const d = new Date(Date.now() + 10 * 86400000); d.setFullYear(d.getFullYear() + 1); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

test('T1: status preview, filing roll-forward, whole donut', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dev/assurance/regulatory', { timeout: 120000 });
  await page.getByRole('button', { name: 'Add the first obligation' }).click();
  await page.locator('#title').fill('Annual produced water discharge return');
  await page.locator('#regime').selectOption({ index: 1 });
  await page.locator('#obligation_type').selectOption({ index: 1 });
  const preview = page.getByText('Saved now, this reads').locator('xpath=..');
  for (const [d, s] of [[10, 'Due soon'], [-5, 'Overdue'], [90, 'On track'], [10, 'Due soon']]) {
    await page.locator('#due_date').fill(iso(d));
    await expect(preview).toContainText(s);
  }
  await page.getByRole('button', { name: 'Create obligation' }).click();
  await expect(page.getByText('OBL-2026-001').first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Record a filing' }).click();
  await page.getByPlaceholder('The receipt or reference the regulator gave you').fill('NUPRC-RX-114');
  await page.getByRole('button', { name: 'Record filing' }).last().click();
  await expect(page.getByText('NEXT DUE', { exact: false }).first().locator('xpath=..')).toContainText(rolled());
  await page.getByRole('link', { name: 'Dashboard', exact: true }).or(page.getByRole('tab', { name: 'Dashboard', exact: true })).first().click();
  const pad = await page.locator('.recharts-pie-sector path').first().getAttribute('d');
  expect(pad).toBeTruthy();
  const sectors = await page.locator('.recharts-pie-sector').count();
  expect(sectors).toBe(1);
  expect(errors).toEqual([]);
});
