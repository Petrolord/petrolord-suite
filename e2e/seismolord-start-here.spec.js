// Discoverability (Start here, first-run tour, Detect faults) on the
// auth-free /dev/seismolord-workspace harness: ?tour runs the first-visit
// flow (the dock opens on Start here and the tour walks every anchor);
// a plain visit shows neither, and Start here opens from its button.

import { test, expect } from '@playwright/test';

test('first visit: Start here opens and the tour walks every anchor, then stays dismissed', async ({ page }) => {
  await page.goto('/dev/seismolord-workspace?tour');
  await expect(page.getByTestId('sl-tour')).toBeVisible();
  await expect(page.getByTestId('sl-start-here')).toBeVisible();
  await expect(page.getByTestId('sl-start-step-import')).toBeVisible();
  const titles = [];
  for (let i = 0; i < 6; i += 1) {
    titles.push(await page.getByTestId('sl-tour-title').textContent());
    await page.getByTestId('sl-tour-next').click();
  }
  expect(titles).toEqual(['Your data', 'Home', 'Interpretation', 'Start here', 'Toolbox and copilot', 'Help']);
  await expect(page.getByTestId('sl-tour')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-testid="viewer-windows"]')).toBeVisible();
  await expect(page.getByTestId('sl-tour')).toHaveCount(0);
  // Take the tour again from Start here
  await page.getByTestId('sl-start-toggle').click();
  await page.getByTestId('sl-start-tour').click();
  await expect(page.getByTestId('sl-tour-title')).toHaveText('Your data');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sl-tour')).toHaveCount(0);
});

test('plain visit: no tour; Start here and Detect faults are one click away', async ({ page }) => {
  await page.goto('/dev/seismolord-workspace');
  await expect(page.locator('[data-testid="viewer-windows"]')).toBeVisible();
  await expect(page.getByTestId('sl-tour')).toHaveCount(0);
  await page.getByTestId('sl-start-toggle').click();
  await expect(page.getByTestId('sl-start-here')).toContainText('Open or import a volume to begin.');
  await page.getByTestId('sl-start-go-import').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('sl-ribbon-tab-interpretation').click();
  // no volume in the harness: present, disabled until one opens
  await expect(page.getByTestId('sl-detect-faults-btn')).toBeDisabled();
});
