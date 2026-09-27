// Project Management Pro senior test T1 on /dev/studio/project-management.
// Harness project: BAC $10MM, EV $3.5MM, AC $3.7MM (CPI 0.95); planned
// value grows with the clock, so SPI is 0.71 on 2026-09-27 and only falls
// after. The portfolio used to read SPI 1.00, CPI 1.00, 0 critical risks
// and 0/0/0 health, with four hard-coded trend chips.
import { test, expect } from '@playwright/test';

test('T1: portfolio figures come from the tasks; tracker, stages and Gantt read true', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/project-management', { timeout: 120000 });
  await expect(page.getByTestId('pm-portfolio-cpi')).toHaveText('0.95', { timeout: 60000 });
  const spi = Number(await page.getByTestId('pm-portfolio-spi').textContent());
  expect(spi).toBeLessThan(0.9);
  expect(spi).toBeGreaterThan(0.3);
  await expect(page.getByTestId('pm-portfolio-risks')).toHaveText('1');
  await expect(page.getByText(/^\d+(\.\d)?%$/)).toHaveCount(1); // the one card progress figure; no trend chips

  await page.getByRole('tab', { name: 'Analytics' }).click();
  await expect(page.getByTestId('pm-analytics-schedule-health')).toHaveText('0%');

  await page.locator('select').first().selectOption({ label: 'Harness Field Development' });
  await expect(page.getByText('Detailed Design').first()).toBeVisible({ timeout: 30000 });
  const current = page.locator('span.text-lime-400', { hasText: 'Detailed Design' });
  await expect(current).toHaveCount(1);
  const row = page.getByRole('row', { name: /Detailed Design/ });
  await expect(row).toContainText('Active');

  await page.getByRole('tab', { name: 'Schedule' }).click();
  const cell = page.getByText('Procurement', { exact: true }).first();
  await expect(cell).toBeVisible();
  const color = await cell.evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe('rgb(255, 255, 255)');
});
