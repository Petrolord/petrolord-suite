// Management of Change senior test T1 on /dev/assurance/moc. A change
// raised and submitted reads MOC-2026-001, Screening, Permanent, Medium.
// Typed text in the textareas must be readable: the shared Textarea was
// white with the page's light text inherited.
import { test, expect } from '@playwright/test';

test('T1: raise a change; readable textareas; placeholder fits', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dev/assurance/moc', { timeout: 120000 });
  const search = page.getByLabel('Search the change register');
  expect(await search.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Raise a change' }).click();
  await page.locator('#title').fill('Replace HP separator relief valve');
  await page.locator('#type').selectOption({ index: 1 });
  await page.locator('#category').selectOption({ index: 1 });
  await page.locator('#asset_id').fill('Harness CPF');
  await page.locator('#risk_level').selectOption({ index: 2 });
  await page.locator('#description').fill('Swap PSV-101 for a larger orifice.');
  await page.locator('#justification').fill('Relief case revised.');
  const colours = await page.locator('#justification').evaluate((el) => {
    const cs = getComputedStyle(el);
    return [cs.backgroundColor, cs.color];
  });
  expect(colours[0]).not.toBe('rgb(255, 255, 255)');
  expect(colours[1]).not.toBe(colours[0]);
  await page.locator('#target_implementation_date').fill('2026-11-15');
  await page.getByRole('button', { name: 'Submit for screening' }).click();
  await expect(page.getByText('MOC-2026-001').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Screening').first()).toBeVisible();
  expect(errors).toEqual([]);
});
