// Stimulation Designer senior test T1 on /dev/stimulation. By hand:
// E' = 25 / (1 - 0.28^2) = 27.13 GPa; PKN p_net = E' w_max / (2 hf) =
// 27.13e9 x 6.39e-3 / 60 = 2.89 MPa; pad fraction (1 - 0.173) / (1 + 0.173)
// = 0.705; proppant 800 x 61.6 m3 / 1.705 = 28.9 t; FOI 7.93 / ln(300 /
// 21.9) = 3.03; Hawkins 4 ln(0.9 / 0.108) = 8.48. The 30 m frac covers 39%
// of the interval's 77 m vertical thickness, which the design tab now says.
import { test, expect } from '@playwright/test';

test('T1: frac height against the interval; schedule axis reads whole minutes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/stimulation', { timeout: 120000 });
  await expect(page.getByTestId('st-height-coverage')).toContainText(
    "The frac height of 30 m covers 39% of the interval's 77 m vertical thickness", { timeout: 60000 },
  );
  await page.getByTestId('st-tab-schedule').click();
  const chart = page.getByTestId('st-schedule-chart');
  await expect(chart.getByText('end-of-job concentration')).toBeVisible();
  await expect(chart.getByText('70', { exact: true })).toBeVisible();
  await expect(chart.getByText(/65\.7\d{3,}/)).toHaveCount(0);
  await page.getByTestId('st-tab-productivity').click();
  await expect(page.getByText('3.03x')).toBeVisible();
});
