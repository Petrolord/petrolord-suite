// Terminal & Depot Studio senior test T1 on /dev/studio/terminal-depot.
// Stock 2,975 + 1,248 = 4,223 against a book of 4,068 + 800 - 640 - 2 =
// 4,226: -3.0 m3, -0.21 % of 1,440, inside 7.2. Rack: Erlang C, c = 2,
// a = 1.833: 92 % busy, 88 % wait, Wq 115.7 min. Margin 1,440 x 6 - 30,000 =
// -21,360. T-01's placeholder strapping is 5,000 m3 over 12,000 mm, so its
// 7,200 mm dip is 3,000 m3; a supplied table changes the stock.
import { test, expect } from '@playwright/test';

test('T1: reconciliation checks, strapping visible and replaceable, loss in red', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/terminal-depot', { timeout: 120000 });
  await expect(page.getByText('Unaccounted: -3.0 m3 (loss)')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('115.7 min')).toBeVisible();
  const margin = page.getByText('-$21,360');
  await expect(margin).toBeVisible();
  expect(await margin.evaluate((el) => el.className)).toMatch(/text-red/);
  await expect(page.getByText('$-21,360')).toHaveCount(0);
  await expect(page.getByLabel('Day 1 unaccounted (m3)')).toHaveValue('-3');

  await page.locator('summary', { hasText: 'Strapping table' }).first().click();
  await expect(page.getByTestId('strapping-placeholder').first()).toBeVisible();
  const area = page.getByLabel('Strapping table for T-01 (PMS)');
  // 7,200 mm: 2,600 + 0.6 x 800 = 3,080 m3; 60 mm of water is 26 m3.
  await area.fill('0 0\n6000 2600\n8000 3400\n12000 5000');
  await area.blur();
  await expect(page.getByText(/Gross 3054\.0 m3/)).toBeVisible();
  await expect(page.getByText('(4 rows supplied)')).toBeVisible();
});
