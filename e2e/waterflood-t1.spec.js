// Waterflood Design Studio senior test T1 on /dev/studio/waterflood.
// Buckley-Leverett: M = (0.4/0.5)/(1/5) = 4; Welge tangent at Swf 0.468,
// fw 0.723, fw' 2.70, 0.37 PV, 46.4 % at BT, ED 75 %. Dykstra-Parsons by
// probability-plot regression: sigma 1.135, V 0.679, median k 122 md.
// Five-spot: OOIP 1,092.3 Mstb, Craig EAbt 53.9 %, WiBT 341.2 Mbbl, so
// breakthrough at 341,200 / 800 = 426.5 d = 1.17 yr (the card read 1.3, the
// first monthly step past it).
import { test, expect } from '@playwright/test';

const tab = (page, name) => page.getByRole('tab', { name }).or(page.getByRole('button', { name })).first();

test('T1: BL, Dykstra-Parsons and pattern checks; exact breakthrough; clean axes', async ({ page }) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/waterflood', { timeout: 120000 });
  await expect(page.getByText('0.468').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('46.4%').first()).toBeVisible();
  await tab(page, 'Layered Sweep').click();
  await expect(page.getByText('0.679').first()).toBeVisible();
  const wor = await page.locator('.recharts-wrapper').first().locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').allTextContents();
  expect(wor.join(' ')).not.toMatch(/\./);
  await tab(page, 'Pattern Forecast').click();
  await expect(page.getByText(/^1\.17\s*yr/)).toBeVisible();
  await expect(page.getByText('1092.3')).toBeVisible();
  const yrs = await page.locator('.recharts-wrapper').first().locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').allTextContents();
  expect(yrs.join(' ')).not.toMatch(/\./);
  await tab(page, 'Uncertainty').click();
  await page.getByRole('switch').nth(4).click();
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByText('Breakthrough P50')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/^1\.1\d/).first()).toBeVisible({ timeout: 30000 });
  expect(await page.locator('body').innerText()).not.toMatch(/—/);
});
