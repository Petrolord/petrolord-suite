// Crude Assay & Blending Studio senior test T1 on /dev/studio/crude-assay.
// Defaults: 60/40 of 35.4 and 24.0 API. Blend SG 0.87268 gives API 30.65,
// mass split 58.3/41.7, sulfur 1.005 wt%, Refutas viscosity 10.6 cSt,
// Watson K 11.75 at the blend's T50 of about 617 F. With SARA 60/25/12/3
// and 45/30/18/7, the mass-blended CII is 58.41 / 41.59 = 1.40 (unstable).
import { test, expect } from '@playwright/test';

const ticks = (page, sel) => page.locator(`${sel} .recharts-cartesian-axis-tick-value`).allTextContents();

test('T1: blend figures, round axes, CII, labelled fields, placeholder crude said so', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/crude-assay', { timeout: 120000 });
  await expect(page.getByText('30.65')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('1.005 wt%')).toBeVisible();
  await expect(page.getByText('10.6 cSt')).toBeVisible();
  await expect(page.getByText('11.75')).toBeVisible();
  const x = await ticks(page, '.recharts-xAxis');
  expect(x).toEqual(expect.arrayContaining(['0', '500', '1000', '1500']));
  expect(x).not.toContain('480');

  const sums = page.locator('summary', { hasText: 'SARA analysis' });
  await sums.nth(0).click();
  await sums.nth(1).click();
  const vals = [[60, 25, 12, 3], [45, 30, 18, 7]];
  for (let c = 0; c < 2; c += 1) {
    await page.getByLabel('Saturates (wt%)').nth(c).fill(String(vals[c][0]));
    await page.getByLabel('Aromatics (wt%)').nth(c).fill(String(vals[c][1]));
    await page.getByLabel('Resins (wt%)').nth(c).fill(String(vals[c][2]));
    await page.getByLabel('Asphaltenes (wt%)').nth(c).fill(String(vals[c][3]));
  }
  await expect(page.getByText('Asphaltene stability screen, CII 1.40')).toBeVisible();

  await page.getByRole('tab', { name: 'Yields & netback' }).click();
  const y = await ticks(page, '.recharts-yAxis');
  expect(y).toEqual(['0', '10', '20', '30']);
  await expect(page.locator('.recharts-legend-wrapper')).toHaveCount(0);
  await expect(page.getByText('$69.73')).toBeVisible();

  await page.getByRole('button', { name: 'Add crude' }).click();
  await expect(page.getByTestId('crude-placeholder-note')).toContainText('copy of the first example crude');
});
