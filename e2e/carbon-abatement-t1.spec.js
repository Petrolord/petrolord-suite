// Carbon Footprint & Abatement senior test T1 on the /dev harness. Default
// case: combustion 620,000 kmol x 1.12 C x 44.01 = 30,560 tCO2e, which the
// emissions chart must actually draw (it read a misspelt key and drew
// nothing). The MAC curve draws each measure as wide as its tonnes: flare
// gas recovery (9,000 of 15,300 t) is the widest block. Costs by hand at
// 10%: heaters (20,000 x CRF5 - 150,000) / 900 = -160.8 $/t.
import { test, expect } from '@playwright/test';

test('T1: emissions bar drawn; variable-width MAC curve', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/carbon-footprint-abatement', { timeout: 120000 });
  await expect(page.getByText(/Computed but NOT reportable: 30,560 tCO2e/)).toBeVisible({ timeout: 60000 });
  const bars = page.locator('svg.recharts-surface').first().locator('.recharts-bar-rectangle');
  await expect(bars).toHaveCount(1);

  await page.getByRole('tab', { name: 'Abatement & path' }).click();
  await expect(page.getByText('-160.8')).toBeVisible();
  await expect(page.getByText('60.3')).toBeVisible();
  const widths = await page.evaluate(() => {
    const svg = [...document.querySelectorAll('svg.recharts-surface')]
      .find((s) => s.textContent.includes('Cumulative abatement'));
    return [...svg.querySelectorAll('.recharts-reference-area-rect')].map((r) => r.getBBox().width);
  });
  expect(widths).toHaveLength(4);
  // widths in proportion to 900 : 1,400 : 4,000 : 9,000
  expect(widths[3] / widths[0]).toBeGreaterThan(9);
  expect(widths[3] / widths[0]).toBeLessThan(11);
});
