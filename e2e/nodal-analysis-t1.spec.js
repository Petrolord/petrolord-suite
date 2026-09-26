// Nodal Analysis Studio senior test T1 on the /dev harness (in-memory
// Supabase). Default oil well: composite IPR (Pr 3200, Pb 2400, J 1.2) gives
// qmax = 960 + 1.2 x 2400 / 1.8 = 2560 STB/D and, at the operating pwf of
// 2205 psia, q = 1186 STB/D. The system plot must show the whole IPR (to
// the AOF, from Pr) rather than an axis box around the operating point.
import { test, expect } from '@playwright/test';

test('T1: system plot spans the IPR; economic gas lift point reads cleanly', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/nodal-analysis-studio', { timeout: 120000 });
  await expect(page.getByTestId('nodal-system-status')).toHaveAttribute('data-status', 'flowing', { timeout: 60000 });
  await expect(page.getByTestId('nodal-op-rate')).toHaveAttribute('data-q', '1186');

  const plot = page.locator('div', { has: page.getByText('Nodal system plot') }).locator('svg.recharts-surface').first();
  const ticks = await plot.locator('.recharts-cartesian-axis-tick-value').allTextContents();
  const nums = ticks.map((t) => Number(t.replace(/,/g, ''))).filter(Number.isFinite);
  expect(Math.max(...nums)).toBeGreaterThanOrEqual(3000); // x to the AOF (2560) and y above Pr (3200)
  expect(ticks).toContain('2250');

  await page.getByRole('tab', { name: 'Gas lift' }).click();
  await page.getByRole('button', { name: 'Run screening' }).click();
  await expect(page.getByText(/^giving [\d,]+ STB\/D$/)).toBeVisible({ timeout: 60000 });
});
