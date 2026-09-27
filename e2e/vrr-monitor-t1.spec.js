// VRR Monitor senior test T1 on /dev/studio/vrr with the sample wells.
// Produced voidage: oil x 1.25 + water x 1.02, no free gas (Rs x oil exceeds
// produced gas every month) = 21,810 + 20,955 + 20,100 = 62,865 RB.
// Injected 53,000 bbl x 1.02 + 6,000 Mscf x 0.9 = 59,460 RB; cumulative VRR
// 0.946. That is below the 1.00 to 1.20 target band the status used to
// call "Balanced".
import { test, expect } from '@playwright/test';

test('T1: voidage checks and a status that answers against the target band', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/dev/studio/vrr', { timeout: 120000 });
  await page.getByRole('button', { name: 'Sample wells' }).click();
  await expect(page.getByText('62,865')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('59,460')).toBeVisible();
  await expect(page.getByTestId('vrr-status')).toContainText('Below your target band (1.00 to 1.20)');
  await page.getByLabel('Target VRR min').fill('0.9');
  await expect(page.getByTestId('vrr-status')).toContainText('Within your target band (0.90 to 1.20)');
  expect(await page.locator('body').innerText()).not.toMatch(/—/);
});
