// Forecast Scenario Hub senior test T1 on the /dev harness (in-memory
// Supabase). The shipped sample runs 20 years with a 30 bbl/d limit that no
// case reaches in the horizon: EUR follows the decline to the limit (Low,
// b 0.3, reaches it at 25.9 yr) or stops at the 50 year maximum life (Base,
// High), and the horizon cumulative is its own column. Saving under an
// existing name updates the set; delete asks for a second click.
import { test, expect } from '@playwright/test';

test('T1: EUR to the economic limit, years axis, save updates by name', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/forecast-scenario-hub', { timeout: 120000 });
  await page.getByText('Case comparison').waitFor({ timeout: 60000 });

  // Low: qi 1000, 24 %/yr, b 0.3, limit 30 -> t = ((1000/30)^0.3 - 1)/(0.3*0.24) = 25.9 yr
  await expect(page.getByTestId('fsh-ttl-low')).toContainText('25.9');
  await expect(page.getByTestId('fsh-ttl-low')).toContainText('past horizon');
  await expect(page.getByTestId('fsh-cumh-low')).toHaveText('1.90');
  await expect(page.getByTestId('fsh-eur-low')).toHaveText('1.99');
  // Base reaches 30 bbl/d at ~59 yr: capped at the 50 year life, above the 3.13 horizon cumulative
  await expect(page.getByTestId('fsh-ttl-base')).toHaveText('> 50');
  await expect(page.getByTestId('fsh-cumh-base')).toHaveText('3.13');
  await expect(page.getByTestId('fsh-eur-base')).toContainText('3.98');
  await expect(page.getByTestId('fsh-eur-base')).toContainText('50 yr max life');

  // years axis, not a 30 day sample index
  await expect(page.getByText('Years from forecast start')).toBeVisible();

  const save = async () => {
    await page.getByPlaceholder(/Save scenario set/).fill('Set A');
    await page.locator('button:has(svg.lucide-save)').click();
    await page.waitForTimeout(400);
  };
  await save();
  await save();
  await page.getByRole('button', { name: /^Load$/ }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByText('Set A')).toHaveCount(1);
  await dlg.getByTitle('Delete saved set').click();
  await expect(dlg.getByText('Set A')).toHaveCount(1);
  await dlg.getByRole('button', { name: 'Delete?' }).click();
  await expect(dlg.getByText('No saved scenario sets yet.')).toBeVisible();
});
