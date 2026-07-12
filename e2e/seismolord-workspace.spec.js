// Workspace shell smoke (auth-free /dev/seismolord-workspace harness):
// the Petrel-style layout renders — ribbon tabs switch, the explorer
// tree lists its sections, the status bar is present, the page never
// scrolls, and toggling the AI dock does not remount the section
// canvas (WebGL state must survive dock/layout changes).

import { test, expect } from '@playwright/test';

test('workspace shell: ribbon, explorer, status bar, dock', async ({ page }) => {
  await page.goto('/dev/seismolord-workspace');
  await expect(page.locator('[data-testid="viewer-windows"]')).toBeVisible();

  // full-viewport: no page scroll in either axis
  const fits = await page.evaluate(() => (
    document.body.scrollHeight <= window.innerHeight + 1
    && document.body.scrollWidth <= window.innerWidth + 1
  ));
  expect(fits).toBe(true);

  // explorer tree sections
  for (const section of ['Volumes', 'Horizons', 'Faults', 'Wells', 'Traverses']) {
    await expect(
      page.locator('#explorer').getByRole('button', { name: section, exact: true }),
    ).toBeVisible();
  }

  // ribbon tabs switch and show their groups
  await page.getByRole('button', { name: 'Interpretation', exact: true }).click();
  await expect(page.getByText('Seed & track')).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByText('Active volume')).toBeVisible();

  // status bar
  await expect(page.locator('[data-testid="status-cursor"]')).toBeAttached();
  await expect(page.getByRole('button', { name: 'engine' })).toBeVisible();

  // AI dock toggles open/closed without remounting the section canvas
  await page.evaluate(() => {
    document.querySelector('[data-testid="window-section"] canvas').dataset.marker = 'alive';
  });
  await page.getByTitle('Toggle the interpretation copilot dock').click();
  await expect(page.getByText('asks before it acts on your data')).toBeVisible();
  await page.getByTitle('Close dock').click();
  await expect(page.getByText('asks before it acts on your data')).not.toBeVisible();
  const marker = await page.evaluate(() => (
    document.querySelector('[data-testid="window-section"] canvas').dataset.marker
  ));
  expect(marker).toBe('alive');
});
