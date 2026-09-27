// Peer Review Manager senior test T1 on /dev/assurance/peer-review. A
// missing project sends focus to that field (the message used to sit out
// of view above the buttons); the team row aligns; the review raises as
// PR-2026-001, In Review, with author and lead reviewer on the team.
import { test, expect } from '@playwright/test';

test('T1: raise a review; invalid field focused; aligned team row', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dev/assurance/peer-review', { timeout: 120000 });
  await page.getByRole('button', { name: 'Raise a review' }).click();
  await page.locator('#title').fill('FDP review, Harness Field phase 2');
  await page.locator('#review_type').selectOption({ index: 1 });
  await page.getByPlaceholder('Who wrote the work').fill('A. Author');
  await page.locator('#name-0').selectOption({ index: 1 });
  await page.locator('#due_date').fill('2026-11-30');
  const tops = await page.evaluate(() => ['name-0', 'role-0', 'disc-0'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await page.getByRole('button', { name: 'Raise and start the review' }).click();
  await expect(page.getByText('Name the project or asset being reviewed.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('project_asset');
  await page.locator('#project_asset').fill('Harness Field');
  await page.getByRole('button', { name: 'Raise and start the review' }).click();
  await expect(page.getByText('PR-2026-001')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('In Review').first()).toBeVisible();
  await expect(page.getByText('Team (2)')).toBeVisible();
  expect(errors).toEqual([]);
});
