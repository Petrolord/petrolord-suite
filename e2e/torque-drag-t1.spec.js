// Torque & Drag Studio senior test T1 on /dev/torque-drag (the oracle
// golden horizontal well). The golden case's slack-off and slide-drill
// surface loads are negative (-17.3 and -157.6 kN): the pipe would have to
// be pushed. The app now says so per operation, and every warning names its
// operation.
import { test, expect } from '@playwright/test';

test('T1: lockup stated per operation; warnings name their operation', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/torque-drag', { timeout: 120000 });
  await page.getByTestId('td-tab-analysis').click({ timeout: 60000 });
  await page.getByTestId('td-run').click();
  await expect(page.getByTestId('td-hookload')).toContainText('633.5');
  await expect(page.getByText(/Slide drill: the surface load is -157\.6 kN\..*cannot reach its planned weight on bit/)).toBeVisible();
  await expect(page.getByText(/Slack off \(trip in\): the surface load is -17\.3 kN\..*will not run in under its own weight/)).toBeVisible();
  await expect(page.getByText(/Rotate on bottom: Compression exceeds the sinusoidal buckling limit \(buckled interval starts at 880 m MD\)/)).toBeVisible();
  await expect(page.getByText(/Buckling onset \(/)).toBeVisible();
  await page.getByTestId('td-tab-wear').click();
  await expect(page.getByTestId('td-collapse-note')).toContainText('Casing & Tubing Studio');
});
