// Risk Register senior test T1 on /dev/assurance/risk-register (Assurance
// harness: nested MemoryRouter at the real paths, schema DEFAULTs and the
// generated risk_score / residual_score columns mirrored). A risk at
// likelihood 4 x impact 4 is 16, Critical; residual 2 x 3 = 6, Medium,
// within a target of 6, controls accounting for 10 of the 16 points.
import { test, expect } from '@playwright/test';

test('T1: record a risk; scores, bands and appetite; heatmap fits its card', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dev/assurance/risk-register', { timeout: 120000 });
  await page.getByRole('button', { name: 'Record New Risk' }).click();
  await page.getByPlaceholder('e.g. Wellbore Instability in Section 3').fill('Compressor long-lead slip');
  const pick = async (label, name) => {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name }).first().click();
  };
  await pick('Category', /./);
  await pick('Likelihood', /^4/);
  await pick('Impact', /^4/);
  await pick('Residual likelihood', /^2/);
  await pick('Residual impact', /^3/);
  await page.getByPlaceholder('e.g. 6').fill('6');
  await page.getByRole('button', { name: 'Create Risk' }).click();
  await expect(page.getByText('16 - Critical').first()).toBeVisible({ timeout: 20000 });
  const card = page.getByText('Inherent Risk Profile').locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
  const overflow = await card.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByText('Compressor long-lead slip').first().click();
  await expect(page.getByText('6 - Medium').first()).toBeVisible();
  await expect(page.getByText('Within appetite (target 6)')).toBeVisible();
  await expect(page.getByText('Controls account for 10 of the 16 points.')).toBeVisible();
  expect(errors).toEqual([]);
});
