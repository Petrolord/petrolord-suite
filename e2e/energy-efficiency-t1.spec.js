// Energy & Utilities Efficiency Studio senior test T1 on
// /dev/studio/energy-efficiency. Hand checks: 0.9 CH4 / 0.08 C2H6 needs
// 2.08 kmol O2 and 9.93 kmol air; 6 % stack O2 is 36 % excess air and 3 %
// is 15 %. A choked trap (Cd 0.7, 3 mm, 11 bar a) passes 28.1 kg/h. The
// cascade gives 107.5 kW hot and 40 kW cold utility, pinch 90/70 C.
import { test, expect } from '@playwright/test';

const ticks = (page, i, axis) => page.locator('.recharts-wrapper').nth(i)
  .locator(`.recharts-${axis} .recharts-cartesian-axis-tick-value`).allTextContents();

test('T1: combustion, traps, register basis and straight composites', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/energy-efficiency', { timeout: 120000 });
  await expect(page.getByText('2.080 kmol')).toBeVisible({ timeout: 60000 });
  await page.getByLabel('Radiation loss (%)').fill('2');
  await page.getByLabel('Minimum safe O2 (%)').fill('1.5');
  await expect(page.getByText('at 36% excess air')).toBeVisible();
  await expect(page.getByText('at 15% excess air')).toBeVisible();

  await page.getByLabel('Discharge coeff').fill('0.7');
  await page.getByRole('tab', { name: 'Steam, intensity & register' }).click();
  await expect(page.getByText('28.1 kg/h')).toBeVisible();
  await expect(page.getByText('at your steam cost per tonne', { exact: true })).toBeVisible();
  await expect(page.getByText(/valued as fuel at the ledger price/)).toBeVisible();

  await page.getByRole('tab', { name: 'Heat integration' }).click();
  await expect(page.getByText('107.5 kW')).toBeVisible();
  await expect(page.getByText('90 / 70 C')).toBeVisible();
  const d = await page.locator('.recharts-line-curve').first().getAttribute('d');
  expect(d).not.toMatch(/C/); // straight segments, no Bezier smoothing
  expect(await ticks(page, 1, 'yAxis')).toEqual(['25', '50', '75', '100', '125', '150']);
});
