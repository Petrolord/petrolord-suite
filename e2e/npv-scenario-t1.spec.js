// NPV Scenario Builder senior test T1 on /dev/studio/npv. By hand: year 1
// revenue 5,000 x 365 x 75 = 137 $MM; the cash flow is positive from year 1
// (NCF +17 $MM with 75 of the 150 $MM capex), so there is no exposure, no
// IRR and no payback; lifetime revenue about 137 / 0.15 = 880 $MM. The
// engine works in $MM; the charts used to divide by 1e6 again ($0.0MM ticks).
import { test, expect } from '@playwright/test';

test('T1: exposure consistent with the cash flow; $MM units; readable inputs and axes', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const warnings = [];
  page.on('console', (m) => { if (/uncontrolled input to be controlled/.test(m.text())) warnings.push(m.text()); });
  await page.goto('/dev/studio/npv', { timeout: 120000 });
  const capex = page.locator('input[type="number"]').nth(3);
  await expect(capex).toHaveValue('150', { timeout: 60000 });
  const box = await capex.boundingBox();
  expect(box.width).toBeGreaterThan(120);
  await page.getByRole('button', { name: /Calculate Economics/ }).click();
  const body = page.locator('body');
  await expect(body).toContainText(/Net present value\s*\$188\s*\$MM/i);
  await expect(body).toContainText(/Max exposure\s*\$0\s*\$MM/i);
  expect(await page.getByText('$0.0MM').count()).toBeLessThanOrEqual(2); // the zero tick only, not every tick
  await expect(page.getByText('$750.0MM')).toBeVisible();
  await page.getByRole('tab', { name: 'Risk' }).click();
  await expect(page.getByTestId('npv-risk-case').first()).toContainText('$MM');
  expect(warnings).toHaveLength(0);
});
