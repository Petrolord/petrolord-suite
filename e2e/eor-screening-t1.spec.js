// EOR Screening senior test T1 on /dev/studio/eor. Defaults (32 API, 2 cp,
// 45 % So, 40 ft, 25 md, 5,200 ft, 105 F, carbonate) against Taber, Martin
// & Seright (1997): CO2 5/5, hydrocarbon 5/5, immiscible 4/4 qualify; ASP
// 6/7 (carbonate), combustion 5/8 (So, formation, permeability; the paper
// sets only a lower gravity limit for thermal methods), polymer 4/7, steam
// 4/7 (formation, permeability, depth), nitrogen 2/5.
import { test, expect } from '@playwright/test';

test('T1: Taber 1997 counts and a sample button that fits', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/eor', { timeout: 120000 });
  await expect(page.getByText('3 of 8 methods qualify')).toBeVisible({ timeout: 60000 });
  for (const t of ['5/5 screened', '4/4 screened', '6/7 screened', '5/8 screened', '2/5 screened']) {
    await expect(page.getByText(new RegExp(t)).first()).toBeVisible();
  }
  const b = page.getByRole('button', { name: 'Load a sample CO2 candidate' });
  const h = await b.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(h).toBeLessThanOrEqual(0);
});
