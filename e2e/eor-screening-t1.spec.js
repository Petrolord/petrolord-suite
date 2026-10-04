// EOR Screening senior test T1 on /dev/studio/eor. Defaults (32 API, 2 cp,
// 45 % So, 40 ft, 25 md, 5,200 ft, 105 F, carbonate) against Taber, Martin
// & Seright (1997): CO2 5/5, hydrocarbon 5/5, immiscible 4/4 qualify.
// EOR-U1 (docs/upgrade/EorScreening-UPGRADE.md) moved three counts on
// purpose: micellar/ASP is marginal (6/7 met, carbonate where sandstone is
// preferred, Part 2 Table 4); combustion 6/9 and steam 5/8 now carry the
// transmissibility notes c and d (kh/mu 500 md-ft/cp passes both); polymer
// 4/7 with a marginal formation; nitrogen 2/5.
import { test, expect } from '@playwright/test';

test('T1: Taber 1997 counts and sample buttons that fit', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/eor', { timeout: 120000 });
  await expect(page.getByText('3 of 8 methods qualify')).toBeVisible({ timeout: 60000 });
  for (const [id, t] of [['co2', '5/5 screened'], ['immiscible', '4/4 screened'], ['chemical', '6/7 screened criteria met, 1 marginal'], ['combustion', '6/9 screened'], ['steam', '5/8 screened'], ['nitrogen', '2/5 screened']]) {
    await expect(page.getByTestId(`eor-method-${id}`)).toContainText(t);
  }
  const b = page.getByRole('button', { name: 'Load sample' });
  const h = await b.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(h).toBeLessThanOrEqual(0);
});
