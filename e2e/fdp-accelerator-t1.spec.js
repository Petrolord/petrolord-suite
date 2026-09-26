// FDP Accelerator senior test T1 on the /dev harness (in-memory Supabase).
// The worked example plus a 25 kbpd FPSO concept and a $70 scenario: the
// rail NPV reads in $MM like the Economics tab, the tab states that the
// profile books more oil than the P50, and the Schedule Gantt stays inside
// its column.
import { test, expect } from '@playwright/test';

test('T1: NPV in $MM on the rail, reserves warning, schedule inside its column', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/fdp-accelerator', { timeout: 120000 });
  await page.getByText('Field Overview', { exact: true }).first().waitFor({ timeout: 60000 });
  const nav = (t) => page.getByText(t, { exact: true }).first().click();
  for (const it of ['Field Overview', 'Subsurface', 'Wells & Drilling', 'Facilities', 'Schedule', 'Economics']) {
    await nav(it);
    await page.getByRole('button', { name: /Load example/i }).first().click();
  }
  await expect(page.getByText('Define a development concept on the Concepts tab.')).toBeVisible();
  await expect(page.getByText('Add an economic scenario on the Scenarios tab.')).toBeVisible();

  const fld = (label) => page.locator('div.space-y-2', { has: page.locator('label', { hasText: new RegExp(`^${label}`) }) }).locator('input').first();
  await nav('Concepts');
  await page.getByRole('button', { name: /New Concept/ }).click();
  await page.locator('form input').first().fill('FPSO base');
  await fld('Well Count').fill('3');
  await fld('Peak Production').fill('25');
  await page.getByRole('button', { name: /Save Concept/ }).click();
  await nav('Scenarios');
  await page.getByRole('button', { name: /New Scenario/ }).click();
  await page.locator('form input').first().fill('Base 70');
  await page.getByRole('button', { name: /Save Scenario/ }).click();

  await nav('Economics');
  const warn = page.getByTestId('econ-reserves-warning');
  await expect(warn).toContainText('95.8 MMbbl over 20 years');
  await expect(warn).toContainText('85.0 MMbbl');
  // the rail and the tab agree, in $MM
  const railNpv = page.locator('aside').getByText(/^\$[\d,]+MM$/).first();
  await expect(railNpv).toBeVisible();
  const tabNpv = page.getByText(/^\$[\d,]+MM$/).first();
  expect(await railNpv.innerText()).toBe(await tabNpv.innerText());

  await nav('Schedule');
  const add = page.getByRole('button', { name: /Add Activity/ });
  await expect(add).toBeVisible();
  const box = await add.boundingBox();
  expect(box.x + box.width).toBeLessThan(1366 - 320); // left of the 320 px Plan status rail
});
