// Flow Assurance Studio senior test T1 on /dev/production/flow-assurance.
// By hand: choke cooling 0.04 F/psi x 500 psi = 20 F; U on the 6 in bore
// with 0.5 in steel and 1.5 in syntactic foam (k 0.09) and 200 films =
// 1 / (0.005 + 0.0015 + 0.991 + 0.003) = 1.000 Btu/hr-ft2-F; NTU 26,400 /
// 8,290 = 3.18; methanol 24,055 lb/d at 6.6 lb/gal = 86.8 bbl/d.
import { test, expect } from '@playwright/test';

test('T1: phase plot reads whole temperatures; U carries its unit; no-touch explains itself', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/production/flow-assurance', { timeout: 120000 });
  await expect(page.getByText('-20.0 F')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('Btu/hr-ft2-F, NTU 3.18')).toBeVisible();
  await expect(page.getByText('86.8 bbl/d')).toBeVisible();
  await expect(page.getByText('cooldown is off; turn it on in the Thermal tab')).toBeVisible();
  await expect(page.getByText(/\d+\.\d{6,}/)).toHaveCount(0);
  await expect(page.getByText('Ignoring it is conservative (it over-states')).toBeVisible();
});
