// Control Valve & Choke Sizing senior test T1 on /dev/facilities/control-valve.
// By hand (liquid): Cv = 500 x sqrt(0.85 / 50) = 65.19; F_F = 0.96 - 0.28
// sqrt(5/3200) = 0.949, allowable 0.81 x (200 - 4.74) = 158.2 psi; sigma
// 195 / 50 = 3.90. The default rated Cv is now 150 on a 6 in outlet:
// equal-percentage travel 1 + ln(65.19/150) / ln 50 = 78.7 % at normal,
// velocity 8.3 ft/s against 100 / sqrt(53) = 13.7. Gas: Y = 1 - 0.25 / (3 x
// 0.686) = 0.878, Cv = 500,000 / (1,360 x 200 x 0.878 x 0.0269) = 77.8.
import { test, expect } from '@playwright/test';

test('T1: a default valve that fits its duty; gas mode reads as gas', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/facilities/control-valve', { timeout: 120000 });
  await expect(page.getByText('65.19').first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('158.2').first()).toBeVisible();
  await expect(page.getByText('78.7 %')).toBeVisible();
  await expect(page.getByText('workable', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Control & Noise' }).click();
  // Engine text starts lowercase; the note capitalises its first letter.
  const note = page.getByText(/^authority between 0\.25 and 0\.5/);
  await expect(note).toBeVisible();
  const tt = await note.evaluate((el) => getComputedStyle(el, '::first-letter').textTransform);
  expect(tt).toBe('uppercase');
  await page.getByRole('tab', { name: 'Sizing' }).click();
  await page.getByRole('combobox').filter({ hasText: 'Liquid' }).click();
  await page.getByText('Gas or vapour', { exact: true }).click();
  await expect(page.getByText('77.80').first()).toBeVisible();
  await expect(page.getByText(/For gas the boundary is the terminal pressure-drop ratio/)).toBeVisible();
  await expect(page.getByText(/lighter crude/)).toHaveCount(0);
});
